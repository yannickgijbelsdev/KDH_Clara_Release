"""Stream Proxy Router - Proxies audio streams for CORS-free access in the browser."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)

stream_proxy_router = APIRouter(prefix="/streams", tags=["Stream Proxy"])

# Stream configurations - using /stream path for proper streaming
STREAMS = {
    "mfy": "http://mfy.level27.be/stream",
    "grk": "http://grk.level27.be/stream",
    "grk2": "http://grk2.level27.be/stream"
}


async def stream_audio(url: str):
    """Generator that streams audio data from the source."""
    timeout = httpx.Timeout(10.0, read=None)  # No read timeout for streaming
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("GET", url, follow_redirects=True) as response:
                if response.status_code != 200:
                    logger.error(f"Stream returned status {response.status_code}: {url}")
                    return
                
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk
                    
        except httpx.ReadTimeout:
            logger.warning(f"Stream read timeout: {url}")
        except httpx.ConnectError as e:
            logger.error(f"Stream connect error: {url} - {e}")
        except Exception as e:
            logger.error(f"Stream error: {url} - {e}")


@stream_proxy_router.get("/{stream_id}")
async def proxy_stream(stream_id: str):
    """Proxy an audio stream to bypass CORS restrictions.
    
    This allows the frontend to use Web Audio API for real-time
    audio analysis (VU meters, spectrum analyzers, etc.)
    """
    if stream_id not in STREAMS:
        raise HTTPException(
            status_code=404, 
            detail=f"Unknown stream. Available: {', '.join(STREAMS.keys())}"
        )
    
    stream_url = STREAMS[stream_id]
    
    return StreamingResponse(
        stream_audio(stream_url),
        media_type="audio/mpeg",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@stream_proxy_router.get("/{stream_id}/status")
async def check_stream_status(stream_id: str):
    """Check if a stream is available and responding."""
    if stream_id not in STREAMS:
        raise HTTPException(status_code=404, detail="Unknown stream")
    
    stream_url = STREAMS[stream_id]
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.head(stream_url, follow_redirects=True)
            return {
                "stream_id": stream_id,
                "url": stream_url,
                "status": "online" if response.status_code == 200 else "offline",
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type", "unknown")
            }
    except Exception as e:
        return {
            "stream_id": stream_id,
            "url": stream_url,
            "status": "error",
            "error": str(e)
        }
