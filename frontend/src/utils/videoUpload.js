import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/video-uploads`;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv|avi)$/i;
export const isVideo = (file) => !!file && ((file.type || '').startsWith('video/') || VIDEO_EXT.test(file.name || ''));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e) => e?.response?.data?.detail || e?.message || 'Upload failed';

async function putChunk(url, blob, headers, onBytes) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await axios.put(url, blob, {
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        timeout: 300000,
        onUploadProgress: (e) => onBytes(e.loaded || 0),
      });
      return;
    } catch (e) {
      if (attempt >= 3 || (e.response && e.response.status < 500)) throw new Error(errMsg(e));
      await sleep(1500 * attempt);
    }
  }
}

async function waitForCompression(id, headers, onProgress) {
  for (;;) {
    await sleep(2000);
    const { data } = await axios.get(`${API}/${id}`, { headers });
    if (data.status === 'done') return data;
    if (data.status === 'error') throw new Error(data.error || 'Compression failed');
    onProgress?.({ phase: 'compressing', percent: data.progress || 0 });
  }
}

// Chunked upload (max 2 GB) -> server-side compression to max 1080p MP4. Resolves { url, key, size, original_size }.
export async function uploadLargeVideo(file, { target, contentId, headers = {}, onProgress } = {}) {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('Video is too large (max 2 GB)');
  try {
    const { data: init } = await axios.post(`${API}/init`, {
      filename: file.name, size: file.size, content_type: file.type || null, target, content_id: contentId || null,
    }, { headers });
    let done = 0;
    for (let i = 0; i < init.total_chunks; i += 1) {
      const blob = file.slice(i * init.chunk_size, (i + 1) * init.chunk_size);
      await putChunk(`${API}/${init.upload_id}/chunks/${i}`, blob, headers, (loaded) => {
        onProgress?.({ phase: 'uploading', percent: Math.min(100, Math.round(((done + loaded) / file.size) * 100)) });
      });
      done += blob.size;
    }
    onProgress?.({ phase: 'compressing', percent: 0 });
    await axios.post(`${API}/${init.upload_id}/complete`, null, { headers });
    return await waitForCompression(init.upload_id, headers, onProgress);
  } catch (e) {
    throw new Error(errMsg(e));
  }
}

export const phaseLabel = (p) => (p?.phase === 'compressing' ? 'Compressing' : 'Uploading');
