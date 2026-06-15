/* eslint-disable */
/**
 * VideoEndpointsPage
 * ------------------
 * Manages the reusable library of video endpoints. Each endpoint is either:
 *   - an embed (YouTube, Vimeo, Twitch, Dailymotion, raw iframe)  OR
 *   - an uploaded file (mp4 / webm / mov) pushed to S3
 *
 * Editors create, preview, and copy embed snippets here; shows in the
 * Calendar can link to one of these endpoints to expose video info via the
 * public API (`GET /api/videos`, `GET /api/videos/public/{id}`).
 */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useMainSite } from '../context/MainSiteContext';
import { useAuth } from '../context/AuthContext';
import {
  Plus, Search, Trash2, Edit3, ExternalLink, Copy, Upload, Video as VideoIcon,
  Youtube, Film, Megaphone, Image as ImageIcon, Loader2, X, Play, Code as CodeIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import usePageTitle from '../hooks/usePageTitle';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TYPES = [
  { value: 'show', label: 'Show', icon: VideoIcon },
  { value: 'ad', label: 'Advertisement', icon: Megaphone },
  { value: 'promo', label: 'Promo', icon: Film },
  { value: 'other', label: 'Other', icon: VideoIcon },
];

const PLATFORM_BADGES = {
  youtube: { label: 'YouTube', class: 'bg-red-100 text-red-700 border-red-200' },
  vimeo: { label: 'Vimeo', class: 'bg-sky-100 text-sky-700 border-sky-200' },
  twitch: { label: 'Twitch', class: 'bg-violet-100 text-violet-700 border-violet-200' },
  dailymotion: { label: 'Dailymotion', class: 'bg-orange-100 text-orange-700 border-orange-200' },
  iframe: { label: 'Custom iframe', class: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  upload: { label: 'Uploaded', class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const empty = { name: '', description: '', type: 'show', embed_code: '', uploaded_url: '', uploaded_key: '', poster_url: '', tags: [] };

export default function VideoEndpointsPage() {
  usePageTitle('Video Endpoints');
  const { mainSite } = useMainSite();
  const { } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [editing, setEditing] = useState(null); // null or item
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);

  const headers = useMemo(() => {
    const h = {};
    if (mainSite?.id) h['X-Main-Site-ID'] = mainSite.id;
    return h;
  }, [mainSite?.id]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/videos`, { headers });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load video endpoints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [mainSite?.id]);

  const openCreate = () => {
    setEditing(null);
    setDraft(empty);
    setDialogOpen(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setDraft({
      name: item.name || '',
      description: item.description || '',
      type: item.type || 'show',
      embed_code: item.embed_code || '',
      uploaded_url: item.uploaded_url || '',
      uploaded_key: item.uploaded_key || '',
      poster_url: item.poster_url || '',
      tags: item.tags || [],
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) { toast.error('Name is required'); return; }
    if (!draft.embed_code && !draft.uploaded_url) {
      toast.error('Provide an embed URL/code or upload a file');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API}/videos/${editing.id}`, draft, { headers });
        toast.success('Video endpoint updated');
      } else {
        await axios.post(`${API}/videos`, draft, { headers });
        toast.success('Video endpoint created');
      }
      setDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/videos/${item.id}`, { headers });
      toast.success('Deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const onUploadFile = async (file) => {
    if (!file) return;
    const okTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];
    if (!okTypes.includes(file.type)) {
      toast.error(`Unsupported video type: ${file.type}`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API}/videos/upload`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setDraft((d) => ({ ...d, uploaded_url: res.data.url, uploaded_key: res.data.key, embed_code: '' }));
      toast.success('Upload complete');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const filtered = items.filter((it) => {
    if (typeFilter !== 'all' && it.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (it.name || '').toLowerCase().includes(s) || (it.description || '').toLowerCase().includes(s);
  });

  const copyEmbed = async (html) => {
    try {
      await navigator.clipboard.writeText(html || '');
      toast.success('Embed code copied to clipboard');
    } catch { toast.error('Copy failed'); }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="video-endpoints-page">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 flex items-center gap-3">
            <VideoIcon className="w-7 h-7 text-rose-500" /> Video Endpoints
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Reusable library of video embeds and uploaded ads. Link these to shows in the Calendar
            to surface video info via the public <code className="bg-zinc-100 px-1 rounded">/api/videos</code> endpoint.
          </p>
        </div>
        <Button
          onClick={openCreate}
          data-testid="new-video-endpoint-btn"
          className="bg-rose-500 hover:bg-rose-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" /> New endpoint
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or description"
            className="pl-9 bg-white"
            data-testid="video-search-input"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 bg-white" data-testid="video-type-filter">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-zinc-200 rounded-lg bg-zinc-50/50">
          <VideoIcon className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
          <p className="text-zinc-500 text-sm">No video endpoints yet. Click "New endpoint" to add one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => {
            const badge = PLATFORM_BADGES[item.platform] || PLATFORM_BADGES.iframe;
            const TypeIcon = (TYPES.find((t) => t.value === item.type)?.icon) || VideoIcon;
            return (
              <div
                key={item.id}
                className="group bg-white border border-zinc-200 rounded-xl overflow-hidden hover:shadow-md transition"
                data-testid={`video-card-${item.id}`}
              >
                <div className="aspect-video bg-zinc-900 relative overflow-hidden">
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}
                  <button
                    onClick={() => setPreviewItem(item)}
                    data-testid={`video-preview-${item.id}`}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Play className="w-12 h-12 text-white" />
                  </button>
                  <div className="absolute top-2 left-2 flex gap-2">
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${badge.class}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-zinc-900 line-clamp-1">{item.name}</h3>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                      <TypeIcon className="w-3 h-3" /> {item.type}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2">{item.description}</p>
                  )}
                  <div className="text-[10px] font-mono text-zinc-400 truncate" title={item.id}>
                    {item.id}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyEmbed(item.embed_html)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 transition"
                        title="Copy embed HTML"
                        data-testid={`copy-embed-${item.id}`}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPreviewItem(item)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 transition"
                        title="Preview"
                      >
                        <CodeIcon className="w-4 h-4" />
                      </button>
                      <a
                        href={item.embed_code || item.uploaded_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 transition"
                        title="Open source"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 transition"
                        title="Edit"
                        data-testid={`edit-video-${item.id}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(item)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 transition"
                        title="Delete"
                        data-testid={`delete-video-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white text-zinc-900 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit video endpoint' : 'New video endpoint'}</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Paste a YouTube/Vimeo/Twitch URL or an &lt;iframe&gt; snippet — the platform is auto-detected.
              For ad files, use the upload button below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Monday livestream"
                  data-testid="video-name-input"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="video-type-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Internal note — what is this video for?"
                rows={2}
                data-testid="video-description-input"
                className="mt-1.5"
              />
            </div>

            <div className="border border-zinc-200 rounded-lg p-3 bg-zinc-50/50">
              <Label className="text-xs font-semibold text-zinc-700">Source — embed code OR upload</Label>
              <div className="mt-2 space-y-2">
                <Input
                  value={draft.embed_code}
                  onChange={(e) => setDraft({ ...draft, embed_code: e.target.value, uploaded_url: '', uploaded_key: '' })}
                  placeholder="https://www.youtube.com/watch?v=…  or  <iframe …></iframe>"
                  data-testid="video-embed-input"
                  className="font-mono text-sm bg-white"
                />
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <div className="flex-1 h-px bg-zinc-200" />
                  <span>or</span>
                  <div className="flex-1 h-px bg-zinc-200" />
                </div>
                {draft.uploaded_url ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                    <span className="text-xs text-emerald-700 truncate" data-testid="uploaded-url-display">
                      Uploaded: {draft.uploaded_url}
                    </span>
                    <button
                      onClick={() => setDraft({ ...draft, uploaded_url: '', uploaded_key: '' })}
                      className="text-emerald-700 hover:text-emerald-900 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-zinc-300 hover:border-zinc-400 rounded-md py-4 cursor-pointer bg-white">
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Upload video file (mp4/webm/mov, max 500 MB)</>
                    )}
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
                      className="hidden"
                      onChange={(e) => onUploadFile(e.target.files?.[0])}
                      disabled={uploading}
                      data-testid="video-upload-input"
                    />
                  </label>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs">Custom poster / thumbnail URL (optional)</Label>
              <Input
                value={draft.poster_url}
                onChange={(e) => setDraft({ ...draft, poster_url: e.target.value })}
                placeholder="https://… (auto-detected for YouTube)"
                data-testid="video-poster-input"
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="text-zinc-500"
              data-testid="video-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-zinc-900 text-white hover:bg-zinc-800"
              data-testid="video-save-btn"
            >
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create endpoint')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="bg-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.name}</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {PLATFORM_BADGES[previewItem?.platform]?.label || 'Embed'} preview
            </DialogDescription>
          </DialogHeader>
          {previewItem?.embed_html && (
            <div
              className="aspect-video w-full"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: previewItem.embed_html }}
            />
          )}
          <div className="mt-2">
            <Label className="text-[11px] text-zinc-400">Embed HTML</Label>
            <Textarea
              readOnly
              rows={3}
              value={previewItem?.embed_html || ''}
              className="font-mono text-xs mt-1"
              data-testid="preview-embed-textarea"
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyEmbed(previewItem?.embed_html)}
              >
                <Copy className="w-3 h-3 mr-1" /> Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
