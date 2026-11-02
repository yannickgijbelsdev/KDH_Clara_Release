import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BASE = process.env.REACT_APP_BACKEND_URL;

export const sourceUrl = async (assetId) => {
  const { data } = await axios.get(`${API}/media-editor/source-url/${assetId}`);
  return `${BASE}${data.url}`;
};

let audioCtx;
export const getAudioCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
};

// Decoded audio + downsampled peaks for drawing waveforms.
export async function loadSource(asset) {
  const url = await sourceUrl(asset.id);
  const out = { id: asset.id, url, kind: asset.kind, title: asset.title, duration: asset.duration_seconds || 0, buffer: null, peaks: null };
  try {
    const res = await fetch(url);
    const buf = await getAudioCtx().decodeAudioData(await res.arrayBuffer());
    out.buffer = buf;
    out.duration = buf.duration;
    const ch = buf.getChannelData(0);
    const perSec = 50;
    const n = Math.ceil(buf.duration * perSec);
    const step = Math.max(1, Math.floor(ch.length / n));
    const peaks = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      let m = 0;
      for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 4) m = Math.max(m, Math.abs(ch[j]));
      peaks[i] = m;
    }
    out.peaks = { data: peaks, perSec };
  } catch {
    if (asset.kind === 'video' && !out.duration) {
      out.duration = await new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve(v.duration || 10);
        v.onerror = () => resolve(10);
        v.src = url;
      });
    }
  }
  return out;
}

export async function pollRender(jobId, onProgress) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await axios.get(`${API}/media-editor/jobs/${jobId}`);
    if (data.status === 'done') return data;
    if (data.status === 'error') throw new Error(data.error || 'Render failed');
    onProgress?.(data.progress || 0, data.status);
  }
}

export const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

export const EDITOR_API = API;
