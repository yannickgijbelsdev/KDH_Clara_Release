/* eslint-disable */
/**
 * ImageRightsModal
 * ----------------
 * Force editors to attach copyright / attribution data to every image in
 * an article: the featured image AND every inline <img> embedded in the
 * TinyMCE body.
 *
 * Per image we collect:
 *   - Source / agency          (credit) — required
 *   - Photographer             (photographer)
 *   - License                  (license)
 *   - Source URL               (source_url)
 *
 * Behaviour:
 *   - Opens automatically when the article loads and ≥1 image is missing
 *     its credit (controlled by parent via `open` prop).
 *   - "Fill in later" closes the dialog without saving — but the parent
 *     keeps publish disabled until all credits are filled.
 *   - "Save rights" persists everything via PUT /content/:id/image-rights
 *     (and /content/:id/featured-image/attribution for the featured image).
 *
 * Props:
 *   open                : bool
 *   onOpenChange        : (bool) → void
 *   contentId           : string
 *   featured            : { url, credit, photographer, license, source_url, copyright, has_credit } | null
 *   images              : [{ url, credit, photographer, license, source_url, has_credit }]
 *   onSaved             : (rightsStatus) → void   // parent refreshes content + rights
 *   API                 : string                  // axios base ("…/api")
 */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { AlertTriangle, CheckCircle2, Copyright, Camera, FileText, Link as LinkIcon, ImageIcon } from 'lucide-react';

const emptyEntry = { credit: '', photographer: '', license: '', source_url: '' };

export default function ImageRightsModal({
  open,
  onOpenChange,
  contentId,
  featured,
  images,
  onSaved,
  API,
}) {
  // Local draft state — keyed by image url ("__featured" for the featured one)
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  // Build the list of rows once whenever the parent props change
  const rows = useMemo(() => {
    const list = [];
    if (featured) {
      list.push({
        key: '__featured',
        label: 'Featured image',
        url: featured.url,
        isFeatured: true,
        initial: {
          credit: featured.credit || '',
          photographer: featured.photographer || '',
          license: featured.license || '',
          source_url: featured.source_url || '',
        },
      });
    }
    (images || []).forEach((img, i) => {
      list.push({
        key: img.url,
        label: `Inline image ${i + 1}`,
        url: img.url,
        isFeatured: false,
        initial: {
          credit: img.credit || '',
          photographer: img.photographer || '',
          license: img.license || '',
          source_url: img.source_url || '',
        },
      });
    });
    return list;
  }, [featured, images]);

  // Reset draft when dialog opens or rows change
  useEffect(() => {
    if (!open) return;
    const next = {};
    rows.forEach((row) => {
      next[row.key] = { ...emptyEntry, ...row.initial };
    });
    setDraft(next);
  }, [open, rows]);

  const setField = (key, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || emptyEntry), [field]: value },
    }));
  };

  const missingCount = rows.reduce((n, row) => {
    const entry = draft[row.key] || row.initial;
    return n + ((entry.credit || '').trim() ? 0 : 1);
  }, 0);

  const allFilled = missingCount === 0 && rows.length > 0;

  const save = async () => {
    setSaving(true);
    try {
      // 1) Save featured image attribution
      const featuredRow = rows.find((r) => r.isFeatured);
      if (featuredRow) {
        const f = draft[featuredRow.key] || emptyEntry;
        await axios.put(`${API}/content/${contentId}/featured-image/attribution`, {
          photo_credit: (f.credit || '').trim() || null,
          photo_copyright: (f.credit || '').trim() || null, // keep copyright in sync with credit by default
          photo_photographer: (f.photographer || '').trim() || null,
          photo_license: (f.license || '').trim() || null,
          photo_source_url: (f.source_url || '').trim() || null,
        });
      }

      // 2) Save inline image attributions
      const attributions = {};
      rows.filter((r) => !r.isFeatured).forEach((r) => {
        const e = draft[r.key] || emptyEntry;
        attributions[r.url] = {
          credit: (e.credit || '').trim(),
          photographer: (e.photographer || '').trim(),
          license: (e.license || '').trim(),
          source_url: (e.source_url || '').trim(),
        };
      });
      const res = await axios.put(`${API}/content/${contentId}/image-rights`, { attributions });

      toast.success(
        allFilled
          ? 'Image rights saved — article can now be published.'
          : 'Image rights saved.'
      );
      onSaved && onSaved(res.data);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save image rights');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white text-zinc-900 max-w-3xl border-zinc-200 max-h-[90vh] overflow-y-auto"
        data-testid="image-rights-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-zinc-900 flex items-center gap-2">
            <Copyright className="w-5 h-5 text-amber-500" />
            Manage image rights
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            Fill in at least a <strong>source</strong> for every image. Publishing to the News API
            is disabled while any image rights are missing. The caption will be shown automatically
            under each photo on the public website.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 text-sm">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
            This article doesn't contain any images yet.
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            {rows.map((row, idx) => {
              const entry = draft[row.key] || emptyEntry;
              const hasCredit = !!(entry.credit || '').trim();
              return (
                <div
                  key={row.key}
                  className={`border rounded-lg p-4 ${hasCredit ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'}`}
                  data-testid={`image-rights-row-${idx}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 flex-shrink-0 rounded overflow-hidden bg-zinc-100 border border-zinc-200">
                      {row.url ? (
                        <img
                          src={row.url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-medium uppercase tracking-wider text-zinc-600">
                          {row.label}
                        </div>
                        {hasCredit ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Source filled in
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Source missing
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <Copyright className="w-3 h-3" /> Source / agency *
                          </Label>
                          <Input
                            value={entry.credit}
                            onChange={(e) => setField(row.key, 'credit', e.target.value)}
                            placeholder="Belga, Reuters, Own work…"
                            data-testid={`rights-credit-${idx}`}
                            className="mt-1 bg-white border-zinc-300 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <Camera className="w-3 h-3" /> Photographer
                          </Label>
                          <Input
                            value={entry.photographer}
                            onChange={(e) => setField(row.key, 'photographer', e.target.value)}
                            placeholder="Jane Doe"
                            data-testid={`rights-photographer-${idx}`}
                            className="mt-1 bg-white border-zinc-300 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> License
                          </Label>
                          <Input
                            value={entry.license}
                            onChange={(e) => setField(row.key, 'license', e.target.value)}
                            placeholder="CC-BY-4.0, Purchased, Own work…"
                            data-testid={`rights-license-${idx}`}
                            className="mt-1 bg-white border-zinc-300 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" /> Source URL
                          </Label>
                          <Input
                            value={entry.source_url}
                            onChange={(e) => setField(row.key, 'source_url', e.target.value)}
                            placeholder="https://example.com/photo"
                            data-testid={`rights-source-url-${idx}`}
                            className="mt-1 bg-white border-zinc-300 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div
              className={`text-sm px-3 py-2 rounded-md border ${
                allFilled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
              data-testid="image-rights-status"
            >
              {allFilled ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> All images have rights — you can publish.</span>
              ) : (
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {missingCount} of {rows.length} image{rows.length !== 1 ? 's' : ''} still need a source. Publishing remains disabled.</span>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            data-testid="image-rights-later-btn"
            className="text-zinc-500 hover:text-zinc-800"
          >
            Fill in later
          </Button>
          <Button
            onClick={save}
            disabled={saving || rows.length === 0}
            data-testid="image-rights-save-btn"
            className="bg-zinc-900 text-white hover:bg-zinc-800"
          >
            {saving ? 'Saving…' : 'Save rights'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
