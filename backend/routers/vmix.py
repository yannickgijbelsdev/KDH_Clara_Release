"""vMix Overlay Router — Manage overlay configurations, ticker messages, and serve HTML overlays for vMix."""
import uuid
import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header
from services.s3_storage import upload_file_to_s3, is_s3_configured, get_s3_url
import logging

logger = logging.getLogger(__name__)

vmix_router = APIRouter(prefix="/vmix", tags=["vmix"])

UPLOADS_DIR = os.environ.get("UPLOADS_DIR", "/app/backend/uploads")
VMIX_LOGOS_DIR = os.path.join(UPLOADS_DIR, "vmix_logos")
os.makedirs(VMIX_LOGOS_DIR, exist_ok=True)


# ── Models ──

class OverlayElement(BaseModel):
    id: str
    type: str  # "logo", "clock", "ticker", "now_playing_show", "now_playing_track"
    enabled: bool = True
    x: float = 0  # % from left
    y: float = 0  # % from top
    width: float = 20  # % of canvas
    height: float = 10  # % of canvas
    style: dict = {}  # Custom CSS properties


class VmixConfigUpdate(BaseModel):
    elements: List[OverlayElement]
    canvas_bg: str = "#000000"
    overlay_base_url: str = "https://clara.koodh.com"  # Production URL for vMix overlay links
    ticker_separator: str = "bullet"  # "bullet", "dash", "pipe", "star", "custom"
    ticker_custom_separator: str = ""
    ticker_scroll: bool = True
    ticker_speed: int = 50  # pixels per second
    ticker_bg_type: str = "solid"  # "transparent", "solid", "gradient", "image"
    ticker_bg_color: str = "#000000cc"
    ticker_bg_gradient_start: str = "#000000"
    ticker_bg_gradient_end: str = "#333333"
    ticker_bg_gradient_angle: int = 90
    ticker_bg_image_url: Optional[str] = None
    ticker_text_color: str = "#ffffff"
    ticker_font_size: int = 24
    clock_format: str = "HH:mm:ss"
    clock_text_color: str = "#ffffff"
    clock_bg_type: str = "transparent"
    clock_bg_color: str = "transparent"
    clock_bg_gradient_start: str = "#000000"
    clock_bg_gradient_end: str = "#333333"
    clock_bg_gradient_angle: int = 90
    clock_bg_image_url: Optional[str] = None
    clock_font_size: int = 48
    now_playing_xml_server_id: Optional[str] = None  # linked server site main_site_id
    now_playing_show_bg_type: str = "solid"
    now_playing_show_bg: str = "#000000cc"
    now_playing_show_bg_gradient_start: str = "#000000"
    now_playing_show_bg_gradient_end: str = "#333333"
    now_playing_show_bg_gradient_angle: int = 90
    now_playing_show_bg_image_url: Optional[str] = None
    now_playing_show_text_color: str = "#ffffff"
    now_playing_track_bg_type: str = "solid"
    now_playing_track_bg: str = "#000000cc"
    now_playing_track_bg_gradient_start: str = "#000000"
    now_playing_track_bg_gradient_end: str = "#333333"
    now_playing_track_bg_gradient_angle: int = 90
    now_playing_track_bg_image_url: Optional[str] = None
    now_playing_track_text_color: str = "#ffffff"
    now_playing_show_photo: bool = True


class TickerMessageCreate(BaseModel):
    text: str
    order: int = 0
    active: bool = True


class TickerMessageUpdate(BaseModel):
    text: Optional[str] = None
    order: Optional[int] = None
    active: Optional[bool] = None


# ── Overlay Config CRUD ──

@vmix_router.get("/config")
async def get_vmix_config(
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Get vMix overlay configuration for a main site."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    if not config:
        # Return default config
        config = _default_config(main_site_id)
        await db.vmix_configs.insert_one(config)
    return config


@vmix_router.put("/config")
async def update_vmix_config(
    body: VmixConfigUpdate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Update vMix overlay configuration."""
    update_data = body.dict()
    update_data["elements"] = [el.dict() for el in body.elements]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await db.vmix_configs.find_one({"main_site_id": main_site_id})
    if result:
        await db.vmix_configs.update_one(
            {"main_site_id": main_site_id}, {"$set": update_data}
        )
    else:
        update_data["main_site_id"] = main_site_id
        update_data["id"] = str(uuid.uuid4())
        update_data["created_at"] = datetime.now(timezone.utc).isoformat()
        update_data["logo_url"] = None
        await db.vmix_configs.insert_one(update_data)

    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    return config


# ── Logo Upload ──

@vmix_router.post("/logo/upload")
async def upload_logo(
    file: UploadFile = File(...),
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Upload a logo image for the vMix overlay."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    filename = f"vmix_logo_{main_site_id}.{ext}"

    if is_s3_configured():
        s3_key = f"vmix_logos/{filename}"
        upload_file_to_s3(content, s3_key, file.content_type)
        logo_url = get_s3_url(s3_key)
    else:
        filepath = os.path.join(VMIX_LOGOS_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        logo_url = f"/api/uploads/vmix_logos/{filename}"

    await db.vmix_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": {"logo_url": logo_url, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    return {"logo_url": logo_url}


# ── Background Image Upload ──

VMIX_BG_DIR = os.path.join(UPLOADS_DIR, "vmix_backgrounds")
os.makedirs(VMIX_BG_DIR, exist_ok=True)


@vmix_router.post("/background/upload")
async def upload_background(
    file: UploadFile = File(...),
    element: str = Form(...),  # "ticker", "clock", "now_playing_show", "now_playing_track"
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Upload a background image for an overlay element."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    filename = f"vmix_bg_{element}_{main_site_id}.{ext}"

    if is_s3_configured():
        s3_key = f"vmix_backgrounds/{filename}"
        upload_file_to_s3(content, s3_key, file.content_type)
        bg_url = get_s3_url(s3_key)
    else:
        filepath = os.path.join(VMIX_BG_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        bg_url = f"/api/uploads/vmix_backgrounds/{filename}"

    field_name = f"{element}_bg_image_url"
    await db.vmix_configs.update_one(
        {"main_site_id": main_site_id},
        {"$set": {field_name: bg_url, f"{element}_bg_type": "image", "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    return {"bg_url": bg_url, "element": element}


# ── Ticker Messages CRUD ──

@vmix_router.get("/ticker-messages")
async def get_ticker_messages(
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Get all ticker messages for a main site."""
    messages = await db.vmix_ticker_messages.find(
        {"main_site_id": main_site_id}, {"_id": 0}
    ).sort("order", 1).to_list(500)
    return messages


@vmix_router.post("/ticker-messages")
async def create_ticker_message(
    body: TickerMessageCreate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Create a new ticker message."""
    msg = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "text": body.text,
        "order": body.order,
        "active": body.active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vmix_ticker_messages.insert_one(msg)
    msg.pop("_id", None)
    return msg


@vmix_router.put("/ticker-messages/{message_id}")
async def update_ticker_message(
    message_id: str,
    body: TickerMessageUpdate,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Update a ticker message."""
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.vmix_ticker_messages.update_one(
        {"id": message_id, "main_site_id": main_site_id}, {"$set": update}
    )
    msg = await db.vmix_ticker_messages.find_one({"id": message_id}, {"_id": 0})
    return msg


@vmix_router.delete("/ticker-messages/{message_id}")
async def delete_ticker_message(
    message_id: str,
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """Delete a ticker message."""
    await db.vmix_ticker_messages.delete_one({"id": message_id, "main_site_id": main_site_id})
    return {"status": "deleted"}


# ── Now Playing Data (from linked XML Server) ──

@vmix_router.get("/now-playing/{main_site_id}")
async def get_now_playing_data(main_site_id: str):
    """Get current now-playing data from linked XML server. Public endpoint for overlays."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    if not config or not config.get("now_playing_xml_server_id"):
        return {"show": None, "track": None}

    server_site_id = config["now_playing_xml_server_id"]

    # Get the latest successful XML import from the linked server
    latest_import = await db.xml_imports.find_one(
        {"main_site_id": server_site_id, "status": "success"},
        {"_id": 0},
        sort=[("upload_date", -1)],
    )

    if not latest_import:
        return {"show": None, "track": None}

    # Extract now playing info from XML metadata
    metadata = latest_import.get("metadata", {})
    now = datetime.now(timezone.utc)

    # Build show info from the XML data
    show_data = {
        "title": metadata.get("project_name", "Unknown Show"),
        "source_file": latest_import.get("file_name", ""),
        "upload_date": latest_import.get("upload_date", ""),
        "presenter": metadata.get("presenter", None),
        "presenter_photo": metadata.get("presenter_photo", None),
    }

    track_data = {
        "artist": metadata.get("artist", metadata.get("current_artist", "")),
        "title": metadata.get("track_title", metadata.get("current_track", metadata.get("project_name", ""))),
        "album": metadata.get("album", ""),
    }

    return {"show": show_data, "track": track_data, "last_updated": now.isoformat()}


# ── Public HTML Overlay Endpoints (for vMix Web Browser Input) ──

def _get_base_url():
    """Get the base URL for assets."""
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def _build_bg_css(config: dict, prefix: str) -> str:
    """Build CSS background property from config fields for a given element prefix."""
    bg_type = config.get(f"{prefix}_bg_type", "solid")
    if bg_type == "transparent":
        return "transparent"
    elif bg_type == "gradient":
        start = config.get(f"{prefix}_bg_gradient_start", "#000000")
        end = config.get(f"{prefix}_bg_gradient_end", "#333333")
        angle = config.get(f"{prefix}_bg_gradient_angle", 90)
        return f"linear-gradient({angle}deg, {start}, {end})"
    elif bg_type == "image":
        url = config.get(f"{prefix}_bg_image_url", "")
        base = _get_base_url()
        if url and not url.startswith("http"):
            url = f"{base}{url}"
        if url:
            return f"url('{url}') center/cover no-repeat"
        return config.get(f"{prefix}_bg_color", "#000000cc")
    else:
        return config.get(f"{prefix}_bg_color", "#000000cc")


@vmix_router.get("/overlay/{main_site_id}/logo", response_class=HTMLResponse)
async def overlay_logo(main_site_id: str):
    """Serve HTML overlay for logo — vMix loads this as Web Browser Input."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    logo_url = config.get("logo_url", "") if config else ""
    base = _get_base_url()
    if logo_url and not logo_url.startswith("http"):
        logo_url = f"{base}{logo_url}"

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; }}
  body {{ background: transparent; overflow: hidden; width: 100vw; height: 100vh; display:flex; align-items:center; justify-content:center; }}
  img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
</style>
<script>
  setInterval(() => location.reload(), 30000);
</script>
</head>
<body>
  {f'<img src="{logo_url}" alt="Logo" />' if logo_url else ''}
</body></html>"""


@vmix_router.get("/overlay/{main_site_id}/clock", response_class=HTMLResponse)
async def overlay_clock(main_site_id: str):
    """Serve HTML overlay for clock."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    fmt = config.get("clock_format", "HH:mm:ss") if config else "HH:mm:ss"
    text_color = config.get("clock_text_color", "#ffffff") if config else "#ffffff"
    bg = _build_bg_css(config, "clock") if config else "transparent"
    font_size = config.get("clock_font_size", 48) if config else 48

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; }}
  body {{ background: {bg}; overflow:hidden; width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; }}
  #clock {{ font-family: 'Segoe UI', Arial, sans-serif; font-size:{font_size}px; font-weight:700; color:{text_color}; letter-spacing:2px; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }}
</style></head>
<body>
<div id="clock"></div>
<script>
function pad(n) {{ return n.toString().padStart(2,'0'); }}
function tick() {{
  const d = new Date();
  let f = "{fmt}";
  f = f.replace("HH", pad(d.getHours()));
  f = f.replace("mm", pad(d.getMinutes()));
  f = f.replace("ss", pad(d.getSeconds()));
  document.getElementById("clock").textContent = f;
}}
tick(); setInterval(tick, 1000);
</script></body></html>"""


@vmix_router.get("/overlay/{main_site_id}/ticker", response_class=HTMLResponse)
async def overlay_ticker(main_site_id: str):
    """Serve HTML overlay for scrolling/static ticker."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    messages = await db.vmix_ticker_messages.find(
        {"main_site_id": main_site_id, "active": True}, {"_id": 0}
    ).sort("order", 1).to_list(500)

    scroll = config.get("ticker_scroll", True) if config else True
    speed = config.get("ticker_speed", 50) if config else 50
    bg = _build_bg_css(config, "ticker") if config else "#000000cc"
    text_color = config.get("ticker_text_color", "#ffffff") if config else "#ffffff"
    font_size = config.get("ticker_font_size", 24) if config else 24
    sep_type = config.get("ticker_separator", "bullet") if config else "bullet"
    custom_sep = config.get("ticker_custom_separator", "") if config else ""

    sep_map = {"bullet": " \\2022 ", "dash": " \\2014 ", "pipe": " | ", "star": " \\2605 ", "custom": f" {custom_sep} "}
    separator = sep_map.get(sep_type, " \\2022 ")

    texts = [m["text"] for m in messages if m.get("text")]
    if not texts:
        texts = ["No messages configured"]

    joined = separator.join(texts)

    if scroll:
        return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; }}
  body {{ background:{bg}; overflow:hidden; width:100vw; height:100vh; display:flex; align-items:center; }}
  .ticker-wrap {{ width:100%; overflow:hidden; }}
  .ticker {{ display:inline-block; white-space:nowrap; animation: scroll linear infinite; font-family:'Segoe UI',Arial,sans-serif; font-size:{font_size}px; color:{text_color}; font-weight:500; padding: 8px 0; }}
  @keyframes scroll {{ 0% {{ transform: translateX(100vw); }} 100% {{ transform: translateX(-100%); }} }}
</style></head>
<body>
<div class="ticker-wrap"><div class="ticker" style="animation-duration:{max(10, len(joined)//2)}s">{joined}</div></div>
<script>setInterval(() => location.reload(), 60000);</script>
</body></html>"""
    else:
        items_html = "".join(f'<span class="msg">{t}</span>' for t in texts)
        return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; }}
  body {{ background:{bg}; overflow:hidden; width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; }}
  .ticker {{ font-family:'Segoe UI',Arial,sans-serif; font-size:{font_size}px; color:{text_color}; font-weight:500; text-align:center; padding: 8px 16px; }}
  .msg + .msg::before {{ content: "{separator}"; opacity: 0.6; }}
</style></head>
<body>
<div class="ticker">{items_html}</div>
<script>setInterval(() => location.reload(), 30000);</script>
</body></html>"""


@vmix_router.get("/overlay/{main_site_id}/now-playing-show", response_class=HTMLResponse)
async def overlay_now_playing_show(main_site_id: str):
    """Serve HTML overlay for current show with optional presenter photo."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    base = _get_base_url()
    bg = _build_bg_css(config, "now_playing_show") if config else "#000000cc"
    text_color = config.get("now_playing_show_text_color", "#ffffff") if config else "#ffffff"
    show_photo = config.get("now_playing_show_photo", True) if config else True

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; }}
  body {{ background:{bg}; overflow:hidden; width:100vw; height:100vh; display:flex; align-items:center; padding:16px; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }}
  .container {{ display:flex; align-items:center; gap:16px; width:100%; }}
  .photo {{ width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,0.2); }}
  .info {{ flex:1; }}
  .label {{ font-size:12px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px; }}
  .title {{ font-size:24px; font-weight:700; color:{text_color}; margin-top:4px; }}
  .presenter {{ font-size:16px; color:rgba(255,255,255,0.7); margin-top:2px; }}
  .hidden {{ display:none; }}
</style></head>
<body>
<div class="container">
  <img id="photo" class="photo hidden" />
  <div class="info">
    <div class="label">Now Playing</div>
    <div class="title" id="title">Loading...</div>
    <div class="presenter" id="presenter"></div>
  </div>
</div>
<script>
async function update() {{
  try {{
    const r = await fetch("{base}/api/vmix/now-playing/{main_site_id}");
    const d = await r.json();
    if (d.show) {{
      document.getElementById("title").textContent = d.show.title || "Unknown Show";
      document.getElementById("presenter").textContent = d.show.presenter || "";
      const photo = document.getElementById("photo");
      if ({'true' if show_photo else 'false'} && d.show.presenter_photo) {{
        photo.src = d.show.presenter_photo;
        photo.classList.remove("hidden");
      }}
    }}
  }} catch(e) {{ console.error(e); }}
}}
update(); setInterval(update, 10000);
</script></body></html>"""


@vmix_router.get("/overlay/{main_site_id}/now-playing-track", response_class=HTMLResponse)
async def overlay_now_playing_track(main_site_id: str):
    """Serve HTML overlay for current track."""
    config = await db.vmix_configs.find_one({"main_site_id": main_site_id}, {"_id": 0})
    base = _get_base_url()
    bg = _build_bg_css(config, "now_playing_track") if config else "#000000cc"
    text_color = config.get("now_playing_track_text_color", "#ffffff") if config else "#ffffff"

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; }}
  body {{ background:{bg}; overflow:hidden; width:100vw; height:100vh; display:flex; align-items:center; padding:16px; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }}
  .info {{ flex:1; }}
  .label {{ font-size:12px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px; }}
  .artist {{ font-size:20px; font-weight:700; color:{text_color}; margin-top:4px; }}
  .track {{ font-size:16px; color:rgba(255,255,255,0.7); margin-top:2px; }}
</style></head>
<body>
<div class="info">
  <div class="label">Now Playing</div>
  <div class="artist" id="artist">Loading...</div>
  <div class="track" id="track"></div>
</div>
<script>
async function update() {{
  try {{
    const r = await fetch("{base}/api/vmix/now-playing/{main_site_id}");
    const d = await r.json();
    if (d.track) {{
      document.getElementById("artist").textContent = d.track.artist || "Unknown";
      document.getElementById("track").textContent = d.track.title || "";
    }}
  }} catch(e) {{ console.error(e); }}
}}
update(); setInterval(update, 10000);
</script></body></html>"""


# ── Available XML Servers (for linking) ──

@vmix_router.get("/xml-servers")
async def list_xml_servers(
    main_site_id: str = Depends(get_main_site_id_from_header),
    current_user: dict = Depends(get_current_user),
):
    """List all server-type sites that can be linked for now-playing data."""
    # Get the linked main site (parent) of this server site
    current_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not current_site:
        raise HTTPException(status_code=404, detail="Site not found")

    # Find all server sites (potential XML data sources)
    servers = await db.main_sites.find(
        {"site_type": "server"}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "linked_main_site_id": 1}
    ).to_list(100)

    return servers


# ── Helper ──

def _default_config(main_site_id: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "elements": [
            {"id": "logo", "type": "logo", "enabled": True, "x": 2, "y": 2, "width": 12, "height": 8, "style": {}},
            {"id": "clock", "type": "clock", "enabled": True, "x": 82, "y": 2, "width": 16, "height": 6, "style": {}},
            {"id": "ticker", "type": "ticker", "enabled": True, "x": 0, "y": 92, "width": 100, "height": 8, "style": {}},
            {"id": "now_playing_show", "type": "now_playing_show", "enabled": True, "x": 2, "y": 75, "width": 35, "height": 15, "style": {}},
            {"id": "now_playing_track", "type": "now_playing_track", "enabled": True, "x": 60, "y": 75, "width": 35, "height": 15, "style": {}},
        ],
        "canvas_bg": "#000000",
        "overlay_base_url": "https://clara.koodh.com",
        "logo_url": None,
        "ticker_separator": "bullet",
        "ticker_custom_separator": "",
        "ticker_scroll": True,
        "ticker_speed": 50,
        "ticker_bg_type": "solid",
        "ticker_bg_color": "#000000cc",
        "ticker_bg_gradient_start": "#000000",
        "ticker_bg_gradient_end": "#333333",
        "ticker_bg_gradient_angle": 90,
        "ticker_bg_image_url": None,
        "ticker_text_color": "#ffffff",
        "ticker_font_size": 24,
        "clock_format": "HH:mm:ss",
        "clock_text_color": "#ffffff",
        "clock_bg_type": "transparent",
        "clock_bg_color": "transparent",
        "clock_bg_gradient_start": "#000000",
        "clock_bg_gradient_end": "#333333",
        "clock_bg_gradient_angle": 90,
        "clock_bg_image_url": None,
        "clock_font_size": 48,
        "now_playing_xml_server_id": None,
        "now_playing_show_bg_type": "solid",
        "now_playing_show_bg": "#000000cc",
        "now_playing_show_bg_gradient_start": "#000000",
        "now_playing_show_bg_gradient_end": "#333333",
        "now_playing_show_bg_gradient_angle": 90,
        "now_playing_show_bg_image_url": None,
        "now_playing_show_text_color": "#ffffff",
        "now_playing_track_bg_type": "solid",
        "now_playing_track_bg": "#000000cc",
        "now_playing_track_bg_gradient_start": "#000000",
        "now_playing_track_bg_gradient_end": "#333333",
        "now_playing_track_bg_gradient_angle": 90,
        "now_playing_track_bg_image_url": None,
        "now_playing_track_text_color": "#ffffff",
        "now_playing_show_photo": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
