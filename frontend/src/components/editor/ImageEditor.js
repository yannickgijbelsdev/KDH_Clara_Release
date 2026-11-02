import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Crop, FlipHorizontal, FlipVertical, Loader2, RotateCcw, RotateCw, Type, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { sourceUrl, EDITOR_API } from './mediaEditorApi';
import { SaveModeDialog } from './SaveModeDialog';

const RATIOS = { Free: null, '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3, '9:16': 9 / 16 };
const DEF_ADJ = { brightness: 100, contrast: 100, saturation: 100 };

function rotated(img, rot, flipH, flipV) {
  const c = document.createElement('canvas');
  const odd = rot % 2 === 1;
  c.width = odd ? img.naturalHeight : img.naturalWidth;
  c.height = odd ? img.naturalWidth : img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return c;
}

// Draws the edited image into `canvas` at `outW` pixels wide.
function draw(canvas, base, { crop, adj, texts }, outW, ignoreCrop = false) {
  const r = !ignoreCrop && crop ? crop : { x: 0, y: 0, w: 1, h: 1 };
  const sx = r.x * base.width; const sy = r.y * base.height; const sw = r.w * base.width; const sh = r.h * base.height;
  canvas.width = Math.round(outW);
  canvas.height = Math.round((outW * sh) / sw);
  const ctx = canvas.getContext('2d');
  ctx.filter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`;
  ctx.drawImage(base, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  if (ignoreCrop) return;
  texts.forEach((t) => {
    ctx.font = `${t.bold ? 700 : 500} ${(t.size * canvas.width) / 100}px Outfit, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = t.shadow ? 'rgba(0,0,0,.45)' : 'transparent';
    ctx.shadowBlur = t.shadow ? canvas.width / 150 : 0;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x * canvas.width, t.y * canvas.height);
  });
}

const AdjSlider = ({ label, value, onChange, id }) => (
  <div>
    <p className="mb-1 flex justify-between text-xs text-zinc-500"><span>{label}</span><span>{value}%</span></p>
    <Slider min={0} max={200} step={1} value={[value]} onValueChange={([v]) => onChange(v)} data-testid={`img-${id}-slider`} />
  </div>
);

export default function ImageEditor({ asset, onClose, onSaved }) {
  const [img, setImg] = useState(null);
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState(null);
  const [cropMode, setCropMode] = useState(false);
  const [ratio, setRatio] = useState('Free');
  const [adj, setAdj] = useState(DEF_ADJ);
  const [texts, setTexts] = useState([]);
  const [selText, setSelText] = useState(null);
  const [outW, setOutW] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const base = useMemo(() => (img ? rotated(img, rot, flipH, flipV) : null), [img, rot, flipH, flipV]);
  const cropW = base ? Math.round((crop?.w || 1) * base.width) : 0;

  useEffect(() => {
    sourceUrl(asset.id).then((url) => {
      const i = new Image();
      i.onload = () => { setImg(i); setOutW(i.naturalWidth); };
      i.onerror = () => toast.error('Could not load the image');
      i.src = url;
    });
  }, [asset]);
  useEffect(() => { if (cropW) setOutW(cropW); }, [cropW]);

  useEffect(() => {
    if (!base || !canvasRef.current) return;
    // Preview resolution is independent of the output width (the output size only matters on save).
    const w = Math.min(cropMode ? base.width : (crop?.w || 1) * base.width, 1100);
    draw(canvasRef.current, base, { crop, adj, texts }, w, cropMode);
  });

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), r };
  };
  const onDown = (e) => {
    const p = point(e);
    if (cropMode) { dragRef.current = { mode: 'crop', x0: p.x, y0: p.y, aspect: p.r.width / p.r.height }; return; }
    const hit = texts.find((t) => Math.abs(t.x - p.x) < 0.12 && Math.abs(t.y - p.y) < (t.size / 100) * 1.2);
    setSelText(hit?.id || null);
    if (hit) dragRef.current = { mode: 'text', id: hit.id };
  };
  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || !canvasRef.current) return;
    const p = point(e);
    if (d.mode === 'text') setTexts((ts) => ts.map((t) => (t.id === d.id ? { ...t, x: p.x, y: p.y } : t)));
    if (d.mode === 'crop') {
      let w = Math.abs(p.x - d.x0); let h = Math.abs(p.y - d.y0);
      const rt = RATIOS[ratio];
      if (rt) h = Math.min(1, (w * d.aspect) / rt);
      if (w > 0.02 && h > 0.02) setCrop({ x: Math.min(d.x0, p.x), y: Math.min(d.y0, rt ? d.y0 : p.y), w, h: Math.min(h, 1 - Math.min(d.y0, rt ? d.y0 : p.y)) });
    }
  }, [ratio]);
  const onUp = () => { dragRef.current = null; };

  const addText = () => {
    const t = { id: Math.random().toString(36).slice(2), text: 'Your text', x: 0.5, y: 0.85, size: 6, color: '#ffffff', bold: true, shadow: true };
    setTexts((ts) => [...ts, t]);
    setSelText(t.id);
  };
  const st = texts.find((t) => t.id === selText);
  const setT = (patch) => setTexts((ts) => ts.map((t) => (t.id === selText ? { ...t, ...patch } : t)));
  const reset = () => { setRot(0); setFlipH(false); setFlipV(false); setCrop(null); setAdj(DEF_ADJ); setTexts([]); };

  const save = async (mode) => {
    setSaveOpen(false);
    setBusy(true);
    try {
      const mime = /jpe?g$/i.test(asset.file_storage_key || asset.original_filename || '') ? 'image/jpeg'
        : /webp$/i.test(asset.file_storage_key || '') ? 'image/webp' : 'image/png';
      const c = document.createElement('canvas');
      draw(c, base, { crop, adj, texts }, outW);
      const blob = await new Promise((r) => c.toBlob(r, mime, 0.92));
      const fd = new FormData();
      fd.append('file', blob, `edit.${mime.split('/')[1]}`);
      fd.append('title', `${asset.title} (edit)`);
      fd.append('mode', mode);
      fd.append('original_asset_id', asset.id);
      await axios.post(`${EDITOR_API}/media-editor/image`, fd);
      toast.success(mode === 'new' ? 'Saved as a new image' : 'Original updated');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save the image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 lg:flex-row" data-testid="image-editor">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3"
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        {!img && <Loader2 className="h-6 w-6 animate-spin text-[#7380b6]" />}
        <div className="relative">
          <canvas ref={canvasRef} onPointerDown={onDown} className={`max-h-[70vh] max-w-full w-auto ${cropMode ? 'cursor-crosshair' : 'cursor-default'}`} data-testid="image-editor-canvas" />
          {cropMode && crop && (
            <div className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.45)]" data-testid="image-crop-rect"
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
          )}
        </div>
      </div>
      <div className="w-full shrink-0 space-y-4 overflow-y-auto lg:w-72">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="editor-close-btn"><X className="mr-1 h-4 w-4" />Close</Button>
          <Button className="flex-1 bg-[#7380b6] hover:bg-[#5f6ba3]" disabled={!img || busy} onClick={() => setSaveOpen(true)} data-testid="editor-save-btn">
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => { setRot((r) => (r + 3) % 4); setCrop(null); }} data-testid="img-rotate-left"><RotateCcw className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => { setRot((r) => (r + 1) % 4); setCrop(null); }} data-testid="img-rotate-right"><RotateCw className="h-4 w-4" /></Button>
          <Button size="sm" variant={flipH ? 'default' : 'outline'} onClick={() => setFlipH((v) => !v)} data-testid="img-flip-h"><FlipHorizontal className="h-4 w-4" /></Button>
          <Button size="sm" variant={flipV ? 'default' : 'outline'} onClick={() => setFlipV((v) => !v)} data-testid="img-flip-v"><FlipVertical className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-zinc-800"><Crop className="h-4 w-4" />Crop (drag on the image)</span>
            <Switch checked={cropMode} onCheckedChange={setCropMode} data-testid="img-crop-toggle" />
          </div>
          {cropMode && (
            <div className="flex flex-wrap gap-1">
              {Object.keys(RATIOS).map((k) => (
                <button key={k} onClick={() => setRatio(k)} className={`rounded-full px-2 py-0.5 text-xs ${ratio === k ? 'bg-[#7380b6] text-white' : 'bg-zinc-100 text-zinc-600'}`} data-testid={`img-ratio-${k.replace(':', 'x')}`}>{k}</button>
              ))}
              <button onClick={() => setCrop(null)} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600" data-testid="img-crop-reset">Reset</button>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500">Width (px) — height follows</p>
          <Input type="number" min={16} max={8000} value={outW} onChange={(e) => setOutW(Math.max(16, Math.min(8000, Number(e.target.value) || 16)))} data-testid="img-width-input" />
          {base && <p className="text-[11px] text-zinc-400" data-testid="img-output-size">{outW} × {Math.round(outW * ((crop?.h || 1) * base.height) / ((crop?.w || 1) * base.width))} px</p>}
        </div>
        <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
          <AdjSlider label="Brightness" id="brightness" value={adj.brightness} onChange={(v) => setAdj((a) => ({ ...a, brightness: v }))} />
          <AdjSlider label="Contrast" id="contrast" value={adj.contrast} onChange={(v) => setAdj((a) => ({ ...a, contrast: v }))} />
          <AdjSlider label="Saturation" id="saturation" value={adj.saturation} onChange={(v) => setAdj((a) => ({ ...a, saturation: v }))} />
        </div>
        <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
          <Button size="sm" variant="outline" className="w-full" onClick={addText} data-testid="img-add-text"><Type className="mr-1.5 h-4 w-4" />Add text</Button>
          {st && (
            <div className="space-y-2" data-testid="img-text-panel">
              <Input value={st.text} onChange={(e) => setT({ text: e.target.value })} data-testid="img-text-input" />
              <div className="flex items-center gap-2">
                <input type="color" value={st.color} onChange={(e) => setT({ color: e.target.value })} className="h-8 w-10 rounded border border-zinc-200" data-testid="img-text-color" />
                <Slider min={2} max={20} step={0.5} value={[st.size]} onValueChange={([v]) => setT({ size: v })} data-testid="img-text-size" />
                <Button size="sm" variant="ghost" onClick={() => { setTexts((ts) => ts.filter((t) => t.id !== st.id)); setSelText(null); }} data-testid="img-text-delete"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="flex gap-4 text-xs text-zinc-600">
                <label className="flex items-center gap-1.5"><Switch checked={st.bold} onCheckedChange={(v) => setT({ bold: v })} />Bold</label>
                <label className="flex items-center gap-1.5"><Switch checked={st.shadow} onCheckedChange={(v) => setT({ shadow: v })} />Shadow</label>
              </div>
              <p className="text-[11px] text-zinc-400">Drag the text on the image to move it.</p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="w-full" onClick={reset} data-testid="img-reset-all">Reset all changes</Button>
      </div>
      <SaveModeDialog open={saveOpen} asset={asset} onClose={() => setSaveOpen(false)} onPick={save} />
    </div>
  );
}
