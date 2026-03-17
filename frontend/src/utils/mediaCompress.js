import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const MAX_MEDIA_SIZE = 5 * 1024 * 1024; // 5MB threshold for compression prompt

let ffmpegInstance = null;
let ffmpegLoading = false;
let ffmpegLoaded = false;

/**
 * Get or create singleton FFmpeg instance
 */
async function getFFmpeg(onProgress) {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) {
    // Wait for ongoing load
    while (ffmpegLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return ffmpegInstance;
  }

  ffmpegLoading = true;
  try {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      // Parse duration/time for progress
      console.debug('[ffmpeg]', message);
    });
    ffmpeg.on('progress', ({ progress }) => {
      if (onProgress) {
        const pct = Math.min(Math.round(progress * 100), 99);
        onProgress(pct);
      }
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    ffmpegLoaded = true;
    return ffmpeg;
  } finally {
    ffmpegLoading = false;
  }
}

/**
 * Compress an audio file using FFmpeg.wasm
 * @param {File} file - Input audio file
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{file: File, originalSize: number, newSize: number}>}
 */
export async function compressAudio(file, onProgress) {
  const ffmpeg = await getFFmpeg(onProgress);

  const ext = file.name.split('.').pop().toLowerCase();
  const inputName = `input.${ext}`;
  const outputName = 'output.mp3';

  // Write input file
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Compress: 128kbps MP3, mono for speech, stereo for music
  // Use 128k as a good balance between quality and size
  await ffmpeg.exec([
    '-i', inputName,
    '-b:a', '128k',
    '-ac', '2', // stereo
    '-ar', '44100', // 44.1kHz sample rate
    '-map', '0:a', // audio only
    outputName
  ]);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: 'audio/mpeg' });
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const compressedFile = new File([blob], `${baseName}_compressed.mp3`, {
    type: 'audio/mpeg',
    lastModified: Date.now(),
  });

  // Cleanup
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch (e) { /* ignore cleanup errors */ }

  onProgress?.(100);

  return {
    file: compressedFile,
    originalSize: file.size,
    newSize: compressedFile.size,
  };
}

/**
 * Compress a video file using FFmpeg.wasm
 * @param {File} file - Input video file
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{file: File, originalSize: number, newSize: number}>}
 */
export async function compressVideo(file, onProgress) {
  const ffmpeg = await getFFmpeg(onProgress);

  const ext = file.name.split('.').pop().toLowerCase();
  const inputName = `input.${ext}`;
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Compress: scale down to max 720p, CRF 28 for good compression
  await ffmpeg.exec([
    '-i', inputName,
    '-vf', 'scale=-2:min(720\\,ih)', // max 720p height, keep aspect ratio
    '-c:v', 'libx264',
    '-crf', '28',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputName
  ]);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const compressedFile = new File([blob], `${baseName}_compressed.mp4`, {
    type: 'video/mp4',
    lastModified: Date.now(),
  });

  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch (e) { /* ignore */ }

  onProgress?.(100);

  return {
    file: compressedFile,
    originalSize: file.size,
    newSize: compressedFile.size,
  };
}

export function isAudioFile(file) {
  return file?.type?.startsWith('audio/') ||
    /\.(mp3|wav|m4a|ogg|aac|flac|wma)$/i.test(file?.name || '');
}

export function isVideoFile(file) {
  return file?.type?.startsWith('video/') ||
    /\.(mp4|mov|webm|avi|mkv|wmv)$/i.test(file?.name || '');
}

export function isMediaOversized(file) {
  return file?.size > MAX_MEDIA_SIZE;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { MAX_MEDIA_SIZE };
