import { toast } from 'sonner';
import { Copy, BarChart3 } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';

const copy = async (text, what) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed');
  }
};

const CopyRow = ({ label, value, testId }) => (
  <div className="space-y-1">
    <Label className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</Label>
    <div className="flex items-center gap-1.5">
      <Input readOnly value={value} onFocus={(e) => e.target.select()} className="h-8 font-mono text-[11px]" data-testid={`${testId}-input`} />
      <button type="button" onClick={() => copy(value, label)} className="shrink-0 rounded-md border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50" data-testid={`${testId}-copy`}>
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);

export const QrTrackingPanel = ({ text, isLink, info }) => {
  if (!isLink) {
    return <p className="text-xs text-amber-700" data-testid="qr-tracking-not-link">Tracking only works for links (http:// or https://). Plain text is encoded as is.</p>;
  }
  if (!info) {
    return <p className="text-xs text-zinc-500" data-testid="qr-tracking-pending">The QR code will point to a short tracking link that redirects to {text || 'your link'}. The API link for Clara Campaigns appears here once you insert or download the code.</p>;
  }
  return (
    <div className="space-y-2.5" data-testid="qr-tracking-info">
      <div className="flex items-center gap-2 text-xs text-zinc-700">
        <BarChart3 className="h-3.5 w-3.5 text-[#7380b6]" />
        <span data-testid="qr-scan-count"><b>{info.scan_count || 0}</b> scans · <b>{info.unique_scan_count || 0}</b> unique</span>
      </div>
      <CopyRow label="API link (Clara Campaigns)" value={info.api_url} testId="qr-api-url" />
      <CopyRow label="Tracking link" value={info.tracking_url} testId="qr-tracking-url" />
    </div>
  );
};
