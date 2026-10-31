import QRCodeStyling from 'qr-code-styling';

export const DEFAULT_QR = {
  text: '',
  fg: '#111111',
  bg: '#ffffff',
  size: 300,
  transparentEnabled: false,
  roundedEnabled: false,
  logoEnabled: false,
  logoKey: '',
  captionEnabled: false,
  caption: 'Scan mij',
  trackingEnabled: true,
  qrId: '',
  trackingUrl: '',
};

export const isUrl = (t) => /^https?:\/\/\S+$/i.test((t || '').trim());
// What actually goes into the QR: the tracking short link when tracking is active.
export const encodedText = (cfg) => (cfg.trackingEnabled && isUrl(cfg.text) && cfg.trackingUrl ? cfg.trackingUrl : cfg.text);

const CAPTION_FONT = "600 {px}px Outfit, 'Helvetica Neue', Arial, sans-serif";
const captionHeight = (px) => Math.round(px * 0.16);

const buildQr = (cfg, px, type, logoDataUrl) => {
  const rounded = cfg.roundedEnabled;
  const useLogo = cfg.logoEnabled && !!logoDataUrl;
  return new QRCodeStyling({
    width: px,
    height: px,
    type,
    data: encodedText(cfg) || ' ',
    margin: Math.round(px * 0.04),
    qrOptions: { errorCorrectionLevel: useLogo ? 'H' : 'M' },
    dotsOptions: { color: cfg.fg, type: rounded ? 'rounded' : 'square' },
    cornersSquareOptions: { color: cfg.fg, type: rounded ? 'extra-rounded' : 'square' },
    cornersDotOptions: { color: cfg.fg, type: rounded ? 'dot' : 'square' },
    backgroundOptions: { color: cfg.transparentEnabled ? 'rgba(0,0,0,0)' : cfg.bg },
    image: useLogo ? logoDataUrl : undefined,
    imageOptions: { hideBackgroundDots: true, imageSize: 0.3, margin: Math.round(px * 0.01) },
  });
};

const loadImage = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = reject;
  img.src = url;
});

// PNG with optional caption below the code.
export async function renderQrPng(cfg, px, logoDataUrl) {
  const qrBlob = await buildQr(cfg, px, 'canvas', logoDataUrl).getRawData('png');
  if (!cfg.captionEnabled || !cfg.caption.trim()) return qrBlob;
  const capH = captionHeight(px);
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px + capH;
  const ctx = canvas.getContext('2d');
  if (!cfg.transparentEnabled) { ctx.fillStyle = cfg.bg; ctx.fillRect(0, 0, px, px + capH); }
  ctx.drawImage(await loadImage(qrBlob), 0, 0, px, px);
  ctx.fillStyle = cfg.fg;
  ctx.font = CAPTION_FONT.replace('{px}', Math.round(capH * 0.55));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.caption.trim(), px / 2, px + capH * 0.42, px * 0.92);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

// Vector SVG with optional caption below the code.
export async function renderQrSvg(cfg, px, logoDataUrl) {
  const svg = await (await buildQr(cfg, px, 'svg', logoDataUrl).getRawData('svg')).text();
  if (!cfg.captionEnabled || !cfg.caption.trim()) return svg;
  const capH = captionHeight(px);
  const inner = svg.replace(/^<\?xml[^>]*>\s*/, '');
  const bg = cfg.transparentEnabled ? '' : `<rect width="${px}" height="${px + capH}" fill="${cfg.bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${px}" height="${px + capH}" viewBox="0 0 ${px} ${px + capH}">${bg}${inner}`
    + `<text x="${px / 2}" y="${px + capH * 0.42}" fill="${cfg.fg}" font-family="Outfit, Helvetica, Arial, sans-serif" font-weight="600" font-size="${Math.round(capH * 0.55)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(cfg.caption.trim())}</text></svg>`;
}

export const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(blob);
});

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
