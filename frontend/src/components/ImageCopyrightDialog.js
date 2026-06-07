/* eslint-disable */
/**
 * ImageCopyrightDialog
 * --------------------
 * Add or edit photo credit / copyright / source URL / photographer / license
 * for a featured image. Used both for per-site WP featured images and the
 * content-level image.
 *
 * Endpoint:
 *   PUT /api/content/:contentId/featured-images/:siteId/attribution   (per-site)
 *   PUT /api/content/:contentId/featured-image/attribution            (content-level)
 *
 * Props:
 *   open, onOpenChange
 *   initial = { photo_credit, photo_copyright, photo_source_url, photo_photographer, photo_license }
 *   onSave (data) → caller decides which endpoint to call
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Copyright, User, LinkIcon, Camera, FileText } from 'lucide-react';

export default function ImageCopyrightDialog({ open, onOpenChange, initial = {}, onSave }) {
  const [credit, setCredit] = useState('');
  const [copyright, setCopyright] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [photographer, setPhotographer] = useState('');
  const [license, setLicense] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCredit(initial.photo_credit || '');
      setCopyright(initial.photo_copyright || '');
      setSourceUrl(initial.photo_source_url || '');
      setPhotographer(initial.photo_photographer || '');
      setLicense(initial.photo_license || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        photo_credit: credit.trim() || null,
        photo_copyright: copyright.trim() || null,
        photo_source_url: sourceUrl.trim() || null,
        photo_photographer: photographer.trim() || null,
        photo_license: license.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white text-zinc-800 max-w-md border-zinc-200 max-h-[90vh] overflow-y-auto"
        data-testid="image-copyright-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-zinc-900 flex items-center gap-2">
            <Copyright className="w-4 h-4 text-zinc-500" /> Photo attribution
          </DialogTitle>
          <p className="text-xs text-zinc-500 mt-1">
            Travels with the image when it's pushed to WordPress (caption / alt text) and the Clara News API
            (<code className="bg-zinc-100 px-1 rounded">image_attribution</code> field + <code className="bg-zinc-100 px-1 rounded">&lt;figcaption&gt;</code>).
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Copyright className="w-3 h-3" /> Source / agency *
            </Label>
            <Input
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              placeholder="Belga, Reuters, Own work…"
              data-testid="copyright-credit-input"
              className="mt-1.5 bg-white border-zinc-300 text-zinc-900"
            />
            <p className="text-[11px] text-zinc-400 mt-1">Required. Appears as "© …" in the caption.</p>
          </div>

          <div>
            <Label className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Camera className="w-3 h-3" /> Photographer
            </Label>
            <Input
              value={photographer}
              onChange={(e) => setPhotographer(e.target.value)}
              placeholder="Jane Doe"
              data-testid="copyright-photographer-input"
              className="mt-1.5 bg-white border-zinc-300 text-zinc-900"
            />
            <p className="text-[11px] text-zinc-400 mt-1">Appears as "Photo: …" in the caption.</p>
          </div>

          <div>
            <Label className="text-xs text-zinc-500 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> License
            </Label>
            <Input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="CC-BY-4.0, Purchased, Own work…"
              data-testid="copyright-license-input"
              className="mt-1.5 bg-white border-zinc-300 text-zinc-900"
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-500 flex items-center gap-1.5">
              <User className="w-3 h-3" /> Copyright holder (optional)
            </Label>
            <Input
              value={copyright}
              onChange={(e) => setCopyright(e.target.value)}
              placeholder="Belga, Reuters, Getty, …"
              data-testid="copyright-holder-input"
              className="mt-1.5 bg-white border-zinc-300 text-zinc-900"
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-500 flex items-center gap-1.5">
              <LinkIcon className="w-3 h-3" /> Source URL (optional)
            </Label>
            <Input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/photo"
              data-testid="copyright-source-input"
              className="mt-1.5 bg-white border-zinc-300 text-zinc-900"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="copyright-cancel-btn"
            className="text-zinc-500 hover:text-zinc-800"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            data-testid="copyright-save-btn"
            className="bg-zinc-900 text-white hover:bg-zinc-800"
          >
            {saving ? 'Saving…' : 'Save attribution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
