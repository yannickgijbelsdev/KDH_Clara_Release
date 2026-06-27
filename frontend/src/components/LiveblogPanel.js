/* eslint-disable */
/**
 * LiveblogPanel
 * -------------
 * Per-article timeline editor. Shown below the main TinyMCE body when
 * ``is_liveblog`` is enabled.
 *
 * - Reverse-chronological list of entries (newest first), matches VRT NWS UX
 * - Inline "Add new entry" button at the top
 * - Real-time updates via WebSocket: ``/ws/liveblog/{content_id}``
 *   (entry_created / entry_updated / entry_deleted / entry_published /
 *   entry_unpublished are broadcast to every editor)
 * - Each entry has: title + TinyMCE body + timestamp + images + videos +
 *   draft/publish toggle (each image carries full copyright fields — req'd
 *   for publish per UX spec).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Editor } from '@tinymce/tinymce-react';
import { format, parseISO } from 'date-fns';
import {
  Plus, Pencil, Trash2, Send, Eye, EyeOff, Loader2, X,
  Image as ImageIcon, Upload, Video as VideoIcon, Link as LinkIcon,
  Clock, RefreshCcw, Wifi, WifiOff, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const WS_BASE = process.env.REACT_APP_BACKEND_URL?.replace(/^https/, 'wss').replace(/^http/, 'ws');

const emptyImage = { url: '', key: '', credit: '', photographer: '', license: '', source_url: '' };
const emptyVideo = { url: '', key: '', embed_code: '' };

const LiveblogPanel = ({ contentId, mainSiteId, token, canEdit, ended = false, endedAt = null }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // entry being edited (or 'new')
  const [wsConnected, setWsConnected] = useState(false);
  const [wsFailed, setWsFailed] = useState(false);
  const [presence, setPresence] = useState([]);
  const wsRef = useRef(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'X-Main-Site-ID': mainSiteId || '',
  }), [token, mainSiteId]);

  // Initial load
  const fetchEntries = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/content/${contentId}/liveblog/entries`, { headers });
      setEntries(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      // Silent on background polls
    } finally {
      setLoading(false);
    }
  }, [contentId, headers]);
  useEffect(() => { if (contentId) fetchEntries(); }, [contentId, fetchEntries]);

  // Polling fallback (15s) — keeps the panel fresh even when the WebSocket
  // upgrade is blocked by the production reverse proxy. WS still upgrades
  // the UX to real-time when available, but we no longer depend on it.
  useEffect(() => {
    if (!contentId) return;
    const t = setInterval(fetchEntries, 15000);
    return () => clearInterval(t);
  }, [contentId, fetchEntries]);

  // ── WebSocket: real-time fan-out across editors ──────────────────────
  useEffect(() => {
    if (!contentId || !token || !WS_BASE) return;
    const url = `${WS_BASE}/ws/liveblog/${contentId}?token=${encodeURIComponent(token)}`;
    let ws;
    let pingTimer;
    let reconnectTimer;
    let attempts = 0;
    const open = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsConnected(true);
        setWsFailed(false);
        attempts = 0;
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 30000);
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'presence') setPresence(m.users || []);
          else if (m.type === 'entry_created') setEntries((prev) => [m.entry, ...prev.filter(x => x.id !== m.entry.id)].sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || '')));
          else if (m.type === 'entry_updated' || m.type === 'entry_published' || m.type === 'entry_unpublished') setEntries((prev) => prev.map(x => x.id === m.entry.id ? m.entry : x));
          else if (m.type === 'entry_deleted') setEntries((prev) => prev.filter(x => x.id !== m.entry_id));
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(pingTimer);
        attempts += 1;
        // Stop trying after 3 attempts — production proxy probably blocks
        // WebSocket upgrades. The polling fallback keeps the panel fresh.
        if (attempts >= 3) {
          setWsFailed(true);
          return;
        }
        reconnectTimer = setTimeout(open, 3000);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };
    open();
    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      try { ws && ws.close(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [contentId, token]);

  const startNew = () => setEditing({ id: '__new__', title: '', body: '', timestamp: new Date().toISOString(), images: [], videos: [], published: false });
  const startEdit = (entry) => setEditing({ ...entry });
  const cancelEdit = () => setEditing(null);

  const saveEntry = async (draft) => {
    setCreating(true);
    try {
      const rightsMissing = (draft.images || []).some((i) => !(i.credit || '').trim());
      const payload = {
        title: (draft.title || '').trim(),
        body: draft.body || '',
        timestamp: draft.timestamp || new Date().toISOString(),
        images: draft.images || [],
        videos: draft.videos || [],
        publish: !rightsMissing,  // auto-publish unless image rights still missing
      };
      let res;
      if (draft.id === '__new__') {
        res = await axios.post(`${API}/content/${contentId}/liveblog/entries`, payload, { headers });
      } else {
        res = await axios.put(`${API}/content/${contentId}/liveblog/entries/${draft.id}`, payload, { headers });
        // PUT doesn't change publish state — if rights are now filled and the
        // entry was still draft, flip it live so editors don't have to click
        // the separate publish button.
        if (!rightsMissing && !res.data.published) {
          try {
            const pub = await axios.post(`${API}/content/${contentId}/liveblog/entries/${res.data.id}/publish`, {}, { headers });
            res = pub;
          } catch { /* leave as draft if rights endpoint rejects */ }
        }
      }
      // WS will also push, but apply locally for instant feedback
      setEntries((prev) => {
        const exists = prev.some((x) => x.id === res.data.id);
        const next = exists ? prev.map((x) => x.id === res.data.id ? res.data : x) : [res.data, ...prev];
        return next.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      });
      setEditing(null);
      if (res.data.published) {
        toast.success('Entry is live on the public site');
      } else {
        toast.success('Saved as draft — vul image-rechten in om live te zetten');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setCreating(false);
    }
  };

  const publishAllDrafts = async () => {
    try {
      const r = await axios.post(`${API}/content/${contentId}/liveblog/publish-drafts`, {}, { headers });
      const { published, skipped_missing_rights } = r.data || {};
      if (published > 0) {
        toast.success(`${published} entry${published === 1 ? '' : 's'} live gezet`);
      } else if (skipped_missing_rights > 0) {
        toast.error(`${skipped_missing_rights} entries hebben nog geen image-rechten — vul die eerst in`);
      } else {
        toast.info('Geen drafts om te publiceren');
      }
      fetchEntries();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Publish-all failed');
    }
  };

  const togglePublish = async (entry) => {
    try {
      const path = entry.published ? 'unpublish' : 'publish';
      const r = await axios.post(`${API}/content/${contentId}/liveblog/entries/${entry.id}/${path}`, {}, { headers });
      setEntries((prev) => prev.map((x) => x.id === r.data.id ? r.data : x));
      toast.success(entry.published ? 'Unpublished' : 'Entry is now live');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Publish toggle failed');
    }
  };

  const removeEntry = async (entry) => {
    if (!window.confirm(`Delete this entry "${entry.title || 'untitled'}"?`)) return;
    try {
      await axios.delete(`${API}/content/${contentId}/liveblog/entries/${entry.id}`, { headers });
      setEntries((prev) => prev.filter((x) => x.id !== entry.id));
      toast.success('Entry deleted');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-6" data-testid="liveblog-panel">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            {ended ? (
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            {ended ? 'Liveblog timeline (ended)' : 'Liveblog timeline'}
            <span className="text-xs font-normal text-zinc-400">({entries.length})</span>
          </h2>
          <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
            {ended ? (
              <><RefreshCcw className="w-3 h-3 text-zinc-400" /> Archived{endedAt ? ` · ended ${(() => { try { return format(parseISO(endedAt), 'd MMM yyyy · HH:mm'); } catch { return endedAt; } })()}` : ''}</>
            ) : wsConnected ? (
              <><Wifi className="w-3 h-3 text-emerald-500" /> Real-time collaboration on</>
            ) : wsFailed ? (
              <><RefreshCcw className="w-3 h-3 text-zinc-400" /> Live polling (every 15s)</>
            ) : (
              <><WifiOff className="w-3 h-3 text-amber-500" /> Connecting…</>
            )}
            {presence.length > 0 && <span>· {presence.length} editor{presence.length === 1 ? '' : 's'} viewing</span>}
          </div>
        </div>
        {canEdit && !ended && (
          <div className="flex items-center gap-2">
            {entries.some((e) => !e.published) && (
              <Button
                onClick={publishAllDrafts}
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                data-testid="liveblog-publish-all-drafts-btn"
              >
                <Send className="w-4 h-4 mr-1.5" /> Publiceer alle drafts
              </Button>
            )}
            <Button onClick={startNew} className="bg-red-500 hover:bg-red-600 text-white" data-testid="liveblog-new-entry-btn">
              <Plus className="w-4 h-4 mr-1.5" /> Add timeline entry
            </Button>
          </div>
        )}
      </div>

      {editing && editing.id === '__new__' && (
        <EntryEditor
          draft={editing}
          setDraft={setEditing}
          onSave={saveEntry}
          onCancel={cancelEdit}
          contentId={contentId}
          headers={headers}
          saving={creating}
        />
      )}

      {loading ? (
        <div className="text-center py-8 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-zinc-200 rounded-lg bg-zinc-50/50 text-sm text-zinc-400">
          No timeline entries yet. Click "Add timeline entry" to write the first update.
        </div>
      ) : (
        <div className="space-y-3" data-testid="liveblog-entries-list">
          {entries.map((e) => editing && editing.id === e.id ? (
            <EntryEditor
              key={e.id}
              draft={editing}
              setDraft={setEditing}
              onSave={saveEntry}
              onCancel={cancelEdit}
              contentId={contentId}
              headers={headers}
              saving={creating}
            />
          ) : (
            <EntryCard
              key={e.id}
              entry={e}
              canEdit={canEdit}
              onEdit={() => startEdit(e)}
              onDelete={() => removeEntry(e)}
              onTogglePublish={() => togglePublish(e)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Read-only entry card ───────────────────────────────────────────────
const EntryCard = ({ entry, canEdit, onEdit, onDelete, onTogglePublish }) => {
  const t = entry.timestamp ? (() => { try { return format(parseISO(entry.timestamp), 'd MMM yyyy · HH:mm'); } catch { return entry.timestamp; } })() : '';
  const missingRights = (entry.images || []).some((i) => !(i.credit || '').trim());
  return (
    <div
      className={`border-l-4 ${entry.published ? 'border-red-500' : 'border-zinc-300'} bg-zinc-50/60 rounded-r-lg p-4`}
      data-testid={`liveblog-entry-${entry.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-mono text-zinc-500" data-testid={`liveblog-timestamp-${entry.id}`}>{t}</span>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
            entry.published
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-zinc-200 text-zinc-600'
          }`}>
            {entry.published ? 'LIVE' : 'DRAFT'}
          </span>
          {missingRights && (
            <span className="text-[10px] inline-flex items-center gap-1 text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> Image rights missing
            </span>
          )}
          {entry.created_by_name && (
            <span className="text-[10px] text-zinc-400">by {entry.created_by_name}</span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button onClick={onTogglePublish} title={entry.published ? 'Unpublish' : 'Publish'} data-testid={`liveblog-publish-${entry.id}`} className={`p-1.5 rounded transition ${entry.published ? 'text-zinc-500 hover:text-zinc-800' : 'text-red-500 hover:text-red-700'}`}>
              {entry.published ? <EyeOff className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
            <button onClick={onEdit} className="p-1.5 text-zinc-400 hover:text-zinc-800" data-testid={`liveblog-edit-${entry.id}`} title="Edit"><Pencil className="w-4 h-4" /></button>
            <button onClick={onDelete} className="p-1.5 text-zinc-400 hover:text-red-600" data-testid={`liveblog-delete-${entry.id}`} title="Delete"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      {entry.title && <h3 className="font-semibold text-zinc-900 mb-1">{entry.title}</h3>}
      {entry.body && <div className="text-sm text-zinc-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: entry.body }} />}
      {(entry.images || []).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
          {entry.images.map((img, i) => (
            <figure key={i} className="rounded overflow-hidden border border-zinc-200 bg-white">
              <img src={img.url} alt={img.alt_text || ''} className="w-full h-32 object-cover" />
              {img.credit && (
                <figcaption className="text-[10px] text-zinc-500 px-1.5 py-1 truncate">
                  © {img.credit}{img.photographer ? ` · ${img.photographer}` : ''}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {(entry.videos || []).length > 0 && (
        <div className="space-y-2 mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entry.videos.map((v, i) => (
            v.embed_html ? (
              <div
                key={i}
                className="aspect-video w-full max-w-md rounded overflow-hidden bg-black [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:block"
                dangerouslySetInnerHTML={{ __html: v.embed_html }}
              />
            ) : v.url ? (
              <video key={i} src={v.url} controls className="w-full max-w-md rounded aspect-video bg-black" />
            ) : null
          ))}
        </div>
      )}
    </div>
  );
};

// ── Inline entry editor (used for both new + edit) ─────────────────────
const EntryEditor = ({ draft, setDraft, onSave, onCancel, contentId, headers, saving }) => {
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVid, setUploadingVid] = useState(false);

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const addImage = (img) => setDraft((d) => ({ ...d, images: [...(d.images || []), img] }));
  const updateImage = (idx, patch) => setDraft((d) => ({ ...d, images: d.images.map((im, i) => i === idx ? { ...im, ...patch } : im) }));
  const removeImage = (idx) => setDraft((d) => ({ ...d, images: d.images.filter((_, i) => i !== idx) }));
  const addVideo = (v) => setDraft((d) => ({ ...d, videos: [...(d.videos || []), v] }));
  const removeVideo = (idx) => setDraft((d) => ({ ...d, videos: d.videos.filter((_, i) => i !== idx) }));

  const uploadImage = async (file) => {
    if (!file) return;
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post(`${API}/content/${contentId}/liveblog/upload-image`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      addImage({ ...emptyImage, url: r.data.url, key: r.data.key });
      toast.success('Photo uploaded');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally { setUploadingImg(false); }
  };
  const uploadVideo = async (file) => {
    if (!file) return;
    setUploadingVid(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post(`${API}/content/${contentId}/liveblog/upload-video`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      addVideo({ ...emptyVideo, url: r.data.url, key: r.data.key });
      toast.success('Video uploaded');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally { setUploadingVid(false); }
  };
  const addEmbed = () => {
    const code = window.prompt('Paste a YouTube/Vimeo URL or <iframe> snippet:');
    if (!code?.trim()) return;
    addVideo({ ...emptyVideo, embed_code: code.trim() });
  };

  return (
    <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50/30" data-testid="liveblog-entry-editor">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="md:col-span-2">
          <Label className="text-xs">Title</Label>
          <Input
            value={draft.title || ''}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="Optional headline for this update"
            data-testid="liveblog-title-input"
            className="mt-1 bg-white"
          />
        </div>
        <div>
          <Label className="text-xs">Timestamp</Label>
          <Input
            type="datetime-local"
            value={(draft.timestamp || '').slice(0, 16)}
            onChange={(e) => setField('timestamp', e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString())}
            data-testid="liveblog-timestamp-input"
            className="mt-1 bg-white"
          />
        </div>
      </div>

      <Label className="text-xs">Body</Label>
      <div className="mt-1 mb-3 bg-white rounded-md overflow-hidden border border-zinc-200">
        <Editor
          tinymceScriptSrc="https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js"
          value={draft.body || ''}
          onEditorChange={(v) => setField('body', v)}
          init={{
            height: 200,
            menubar: false,
            plugins: 'link lists autolink quickbars',
            toolbar: 'bold italic underline | bullist numlist | link | removeformat',
            branding: false,
            statusbar: false,
            license_key: 'gpl',
          }}
        />
      </div>

      {/* Images */}
      {(draft.images || []).length > 0 && (
        <div className="mb-3 space-y-2">
          <Label className="text-xs">Photos with rights *</Label>
          {draft.images.map((img, i) => (
            <div key={i} className="border border-zinc-200 rounded-md p-2 flex flex-col sm:flex-row gap-3 bg-white" data-testid={`liveblog-img-row-${i}`}>
              <div className="flex items-start gap-2">
                <img src={img.url} alt="" className="w-20 h-20 object-cover rounded flex-shrink-0" />
                <button onClick={() => removeImage(i)} className="sm:hidden text-zinc-400 hover:text-red-600 p-1" aria-label="Remove image"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                <Input placeholder="Source / agency *" value={img.credit} onChange={(e) => updateImage(i, { credit: e.target.value })} className="text-xs" data-testid={`liveblog-img-credit-${i}`} />
                <Input placeholder="Photographer" value={img.photographer} onChange={(e) => updateImage(i, { photographer: e.target.value })} className="text-xs" data-testid={`liveblog-img-photographer-${i}`} />
                <Input placeholder="License" value={img.license} onChange={(e) => updateImage(i, { license: e.target.value })} className="text-xs" data-testid={`liveblog-img-license-${i}`} />
                <Input placeholder="Source URL" value={img.source_url} onChange={(e) => updateImage(i, { source_url: e.target.value })} className="text-xs" data-testid={`liveblog-img-source-${i}`} />
              </div>
              <button onClick={() => removeImage(i)} className="hidden sm:block text-zinc-400 hover:text-red-600 p-1 self-start"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Videos */}
      {(draft.videos || []).length > 0 && (
        <div className="mb-3 space-y-2">
          <Label className="text-xs">Videos</Label>
          {draft.videos.map((v, i) => (
            <div key={i} className="flex items-center gap-2 border border-zinc-200 rounded-md p-2 bg-white text-xs">
              <VideoIcon className="w-4 h-4 text-zinc-400" />
              <span className="flex-1 truncate font-mono text-zinc-500">
                {v.url || v.embed_code}
              </span>
              <button onClick={() => removeVideo(i)} className="text-zinc-400 hover:text-red-600 p-1"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50">
          {uploadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} Add photo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} data-testid="liveblog-upload-img" />
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50">
          {uploadingVid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload video
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => uploadVideo(e.target.files?.[0])} data-testid="liveblog-upload-vid" />
        </label>
        <button onClick={addEmbed} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50" data-testid="liveblog-add-embed">
          <LinkIcon className="w-3.5 h-3.5" /> Embed (YouTube/Vimeo)
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving} className="text-zinc-500" data-testid="liveblog-cancel-btn">Cancel</Button>
          <Button onClick={() => onSave(draft)} disabled={saving} className="bg-red-500 text-white hover:bg-red-600" data-testid="liveblog-save-btn">
            {saving ? 'Saving…' : ((draft.images || []).some((i) => !(i.credit || '').trim()) ? 'Save as draft' : 'Save & publish')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LiveblogPanel;
