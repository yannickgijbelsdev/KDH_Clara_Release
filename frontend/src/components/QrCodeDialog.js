import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, Loader2, QrCode, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { DEFAULT_QR, renderQrPng, renderQrSvg, blobToDataUrl, downloadBlob, isUrl } from '../utils/qrRender';
import { QrTrackingPanel } from './QrTrackingPanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const keyFromUrl = (url) => (url.match(/(editor\/[^?#]+)$/) || [])[1] || '';

const ColorField = ({ label, value, onChange, disabled, testId }) => (
  <div className={`space-y-1.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
    <Label className="text-xs text-zinc-600">{label}</Label>
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-zinc-200 bg-white p-0.5" data-testid={`${testId}-picker`} />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 font-mono text-xs" data-testid={`${testId}-input`} />
    </div>
  </div>
);

const OptionToggle = ({ label, checked, onChange, testId, children }) => (
  <div className="rounded-md border border-zinc-200 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-zinc-800">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
    {checked && children && <div className="mt-2.5">{children}</div>}
  </div>
);

const LogoPicker = ({ logoDataUrl, uploading, onPick }) => (
  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-zinc-300 px-3 py-2 hover:border-zinc-400" data-testid="qr-logo-picker">
    {logoDataUrl ? <img src={logoDataUrl} alt="Logo" className="h-8 w-8 rounded object-contain" /> : <Upload className="h-4 w-4 text-zinc-500" />}
    <span className="text-xs text-zinc-600">{uploading ? 'Uploading logo…' : logoDataUrl ? 'Change logo' : 'Upload logo (PNG/JPG/SVG)'}</span>
    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
      onChange={(e) => onPick(e.target.files?.[0])} data-testid="qr-logo-input" />
  </label>
);

export const QrCodeDialog = ({ open, initialConfig, contentId, onClose, onInsert }) => {
  const [cfg, setCfg] = useState(DEFAULT_QR);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(null);
  const previewUrl = useRef('');
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  useEffect(() => {
    if (!open) return;
    const next = { ...DEFAULT_QR, ...(initialConfig || {}) };
    setCfg(next);
    setLogoDataUrl('');
    setTracking(null);
    if (next.qrId) {
      axios.get(`${API}/qr-codes/${next.qrId}`).then((r) => setTracking(r.data)).catch(() => {});
    }
    if (next.logoKey) {
      axios.get(`${API}/uploads/editor-files/raw/${next.logoKey}`, { responseType: 'blob' })
        .then((r) => blobToDataUrl(r.data)).then(setLogoDataUrl)
        .catch(() => toast.error('Could not load the saved logo'));
    }
  }, [open, initialConfig]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(async () => {
      try {
        const blob = await renderQrPng(cfg, 512, logoDataUrl);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(blob);
        setPreview(previewUrl.current);
      } catch {
        setPreview('');
      }
    }, 150);
    return () => clearTimeout(t);
  }, [cfg, logoDataUrl, open]);

  const pickLogo = async (file) => {
    if (!file) return;
    setLogoDataUrl(await blobToDataUrl(file));
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/uploads/editor-files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      set({ logoKey: keyFromUrl(data.url), logoEnabled: true });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  // Create/update the tracking record so the QR encodes the short link; returns the config to render.
  const ensureTracking = async () => {
    const link = isUrl(cfg.text);
    if (!link || !cfg.trackingEnabled) {
      if (cfg.qrId && tracking?.tracking_enabled) {
        const { data } = await axios.patch(`${API}/qr-codes/${cfg.qrId}`, { tracking_enabled: false });
        setTracking(data);
      }
      return cfg;
    }
    const label = (cfg.captionEnabled && cfg.caption.trim()) || cfg.text.trim();
    const { data } = cfg.qrId
      ? await axios.patch(`${API}/qr-codes/${cfg.qrId}`, { target_url: cfg.text.trim(), tracking_enabled: true })
      : await axios.post(`${API}/qr-codes`, { target_url: cfg.text.trim(), label, content_id: contentId || null, tracking_enabled: true });
    setTracking(data);
    const next = { ...cfg, qrId: data.id, trackingUrl: data.tracking_url };
    setCfg(next);
    return next;
  };

  const fileBase = () => `qr-${(cfg.text || 'code').replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`;
  const withTracking = (fn) => async () => {
    try {
      await fn(await ensureTracking());
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not create the tracking link');
    }
  };
  const downloadPng = withTracking(async (c) => downloadBlob(await renderQrPng(c, 2048, logoDataUrl), `${fileBase()}.png`));
  const downloadSvg = withTracking(async (c) => downloadBlob(new Blob([await renderQrSvg(c, 1024, logoDataUrl)], { type: 'image/svg+xml' }), `${fileBase()}.svg`));

  const insert = async () => {
    setBusy(true);
    try {
      const finalCfg = await ensureTracking();
      const blob = await renderQrPng(finalCfg, Math.min(2048, finalCfg.size * 2), logoDataUrl);
      const fd = new FormData();
      fd.append('file', blob, `${fileBase()}.png`);
      const { data } = await axios.post(`${API}/uploads/editor-files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onInsert(data.url, finalCfg);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save the QR code');
    } finally {
      setBusy(false);
    }
  };

  const canUse = !!cfg.text.trim() && !logoUploading && !(cfg.logoEnabled && !logoDataUrl);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto z-[1300]" data-testid="qr-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-[#7380b6]" />{initialConfig ? 'Edit QR code' : 'Insert QR code'}</DialogTitle>
          <DialogDescription>Generate a QR code for a link or text, style it and place it in the article.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="space-y-4 min-w-0">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Link or text</Label>
              <Input autoFocus value={cfg.text} onChange={(e) => set({ text: e.target.value })} placeholder="https://…" data-testid="qr-text-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="QR colour" value={cfg.fg} onChange={(fg) => set({ fg })} testId="qr-fg" />
              <ColorField label="Background colour" value={cfg.bg} onChange={(bg) => set({ bg })} disabled={cfg.transparentEnabled} testId="qr-bg" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-600"><Label className="text-xs">Size in article</Label><span data-testid="qr-size-value">{cfg.size}px</span></div>
              <Slider min={120} max={800} step={10} value={[cfg.size]} onValueChange={([size]) => set({ size })} data-testid="qr-size-slider" />
            </div>
            <div className="space-y-2">
              <OptionToggle label="Track scans (Clara Campaigns API)" checked={cfg.trackingEnabled} onChange={(v) => set({ trackingEnabled: v })} testId="qr-toggle-tracking">
                <QrTrackingPanel text={cfg.text.trim()} isLink={isUrl(cfg.text)} info={tracking?.tracking_enabled ? tracking : null} />
              </OptionToggle>
              <OptionToggle label="Transparent background" checked={cfg.transparentEnabled} onChange={(v) => set({ transparentEnabled: v })} testId="qr-toggle-transparent" />
              <OptionToggle label="Rounded dots" checked={cfg.roundedEnabled} onChange={(v) => set({ roundedEnabled: v })} testId="qr-toggle-rounded" />
              <OptionToggle label="Logo in the middle" checked={cfg.logoEnabled} onChange={(v) => set({ logoEnabled: v })} testId="qr-toggle-logo">
                <LogoPicker logoDataUrl={logoDataUrl} uploading={logoUploading} onPick={pickLogo} />
              </OptionToggle>
              <OptionToggle label="Caption below the code" checked={cfg.captionEnabled} onChange={(v) => set({ captionEnabled: v })} testId="qr-toggle-caption">
                <Input value={cfg.caption} onChange={(e) => set({ caption: e.target.value })} maxLength={40} placeholder="Scan mij" data-testid="qr-caption-input" />
              </OptionToggle>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex aspect-square items-center justify-center rounded-lg border border-zinc-200 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3" data-testid="qr-preview">
              {cfg.text.trim() && preview
                ? <img src={preview} alt="QR preview" className="max-h-full max-w-full object-contain" data-testid="qr-preview-image" />
                : <span className="px-4 text-center text-xs text-zinc-400">Enter a link or text to see the preview</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled={!canUse} onClick={downloadPng} data-testid="qr-download-png"><Download className="mr-1.5 h-3.5 w-3.5" />PNG</Button>
              <Button variant="outline" size="sm" disabled={!canUse} onClick={downloadSvg} data-testid="qr-download-svg"><Download className="mr-1.5 h-3.5 w-3.5" />SVG</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="qr-cancel-btn">Cancel</Button>
          <Button onClick={insert} disabled={!canUse || busy} className="bg-[#7380b6] hover:bg-[#5f6ba3]" data-testid="qr-insert-btn">
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{initialConfig ? 'Update QR code' : 'Insert QR code'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
