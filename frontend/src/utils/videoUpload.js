import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/video-uploads`;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|avi)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aif|aiff|wma)$/i;
export const isAudio = (file) => !!file && ((file.type || '').startsWith('audio/') || AUDIO_EXT.test(file.name || ''));
export const isVideo = (file) => !!file && !isAudio(file) && ((file.type || '').startsWith('video/') || VIDEO_EXT.test(file.name || ''));
export const LARGE_AUDIO_BYTES = 5 * 1024 * 1024;
// Video always, and audio above 5 MB, go through the chunked upload + server-side compression.
export const needsServerCompression = (file) => isVideo(file) || (isAudio(file) && file.size > LARGE_AUDIO_BYTES);

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

const MAX_WAIT_MS = 3 * 60 * 60 * 1000;

async function waitForCompression(id, headers, onProgress) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let failures = 0;
  while (Date.now() < deadline) {
    await sleep(2000);
    let data;
    try {
      ({ data } = await axios.get(`${API}/${id}`, { headers, timeout: 30000 }));
      failures = 0;
    } catch (e) {
      failures += 1;
      if (failures >= 10) throw e;
      continue;
    }
    if (data.status === 'done') return data;
    if (data.status === 'error' || data.status === 'cancelled') throw new Error(data.error || 'Compression failed');
    onProgress?.({ phase: data.status === 'queued' ? 'queued' : 'compressing', percent: data.progress || 0, kind: data.kind });
  }
  throw new Error('Compression is taking too long, please try again later');
}

// Chunked upload (max 2 GB) -> server-side compression to max 1080p MP4. Resolves { url, key, size, original_size }.
export async function uploadLargeVideo(file, { target, contentId, folderId, title, headers = {}, onProgress } = {}) {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('File is too large (max 2 GB)');
  try {
    const { data: init } = await axios.post(`${API}/init`, {
      filename: file.name, size: file.size, content_type: file.type || null, target, content_id: contentId || null,
      folder_id: folderId || null, title: title || null,
    }, { headers });
    let done = 0;
    for (let i = 0; i < init.total_chunks; i += 1) {
      const blob = file.slice(i * init.chunk_size, (i + 1) * init.chunk_size);
      await putChunk(`${API}/${init.upload_id}/chunks/${i}`, blob, headers, (loaded) => {
        onProgress?.({ phase: 'uploading', kind: init.kind, percent: Math.min(100, Math.round(((done + loaded) / file.size) * 100)) });
      });
      done += blob.size;
    }
    onProgress?.({ phase: 'queued', percent: 0, kind: init.kind });
    await axios.post(`${API}/${init.upload_id}/complete`, null, { headers });
    return await waitForCompression(init.upload_id, headers, onProgress);
  } catch (e) {
    throw new Error(errMsg(e));
  }
}

const PHASE_LABELS = { uploading: 'Uploading', queued: 'Queued for compression', compressing: 'Compressing' };
export const phaseLabel = (p) => PHASE_LABELS[p?.phase] || 'Uploading';
