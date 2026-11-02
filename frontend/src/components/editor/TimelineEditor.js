import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Film, Loader2, Music, Pause, Play, Plus, Scissors, Trash2, VolumeX, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { TimelineClip, TRACK_H } from './TimelineClip';
import { useTimelinePlayer } from './useTimelinePlayer';
import { loadSource, pollRender, fmtTime, EDITOR_API } from './mediaEditorApi';
import { SaveModeDialog } from './SaveModeDialog';

const newId = () => Math.random().toString(36).slice(2, 10);
const round = (v) => Math.round(v * 100) / 100;

const Inspector = ({ clip, onChange }) => (
  <div className="flex flex-wrap items-end gap-5 rounded-lg border border-zinc-200 bg-white px-4 py-3" data-testid="clip-inspector">
    <div className="w-44">
      <p className="mb-1.5 text-xs text-zinc-500">Volume <span data-testid="clip-volume-value">{Math.round(clip.volume * 100)}%</span></p>
      <Slider min={0} max={200} step={5} value={[Math.round(clip.volume * 100)]} onValueChange={([v]) => onChange({ volume: v / 100 })} data-testid="clip-volume-slider" />
    </div>
    {['fade_in', 'fade_out'].map((k) => (
      <label key={k} className="text-xs text-zinc-500">
        {k === 'fade_in' ? 'Fade in (s)' : 'Fade out (s)'}
        <Input type="number" min={0} step={0.5} value={clip[k]} onChange={(e) => onChange({ [k]: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 h-8 w-24" data-testid={`clip-${k.replace('_', '-')}-input`} />
      </label>
    ))}
    <Button variant={clip.muted ? 'default' : 'outline'} size="sm" onClick={() => onChange({ muted: !clip.muted })} data-testid="clip-mute-btn">
      <VolumeX className="mr-1.5 h-3.5 w-3.5" />{clip.muted ? 'Muted' : 'Mute'}
    </Button>
    <p className="text-xs text-zinc-400">In {fmtTime(clip.in)} · Out {fmtTime(clip.out)} · at {fmtTime(clip.start)}</p>
  </div>
);

export default function TimelineEditor({ asset, onClose, onSaved }) {
  const kind = asset.kind;
  const [sources, setSources] = useState({});
  const [clips, setClips] = useState([]);
  const [tracks, setTracks] = useState(kind === 'video' ? 3 : 3);
  const [selected, setSelected] = useState(null);
  const [pps, setPps] = useState(40);
  const [title, setTitle] = useState(`${asset.title} (edit)`);
  const [library, setLibrary] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [rendering, setRendering] = useState(null);
  const videoRef = useRef(null);
  const { playing, time, total, play, pause, seek } = useTimelinePlayer(clips, sources, videoRef);

  useEffect(() => {
    loadSource(asset).then((s) => {
      setSources({ [asset.id]: s });
      const id = newId();
      setClips([{ id, asset_id: asset.id, track: 0, start: 0, in: 0, out: round(s.duration || 10), volume: 1, fade_in: 0, fade_out: 0, muted: false }]);
      setSelected(id);
    }).catch(() => toast.error('Could not load the file'));
    Promise.all((kind === 'video' ? ['video', 'audio'] : ['audio']).map((k) => axios.get(`${EDITOR_API}/media`, { params: { kind: k } })))
      .then((rs) => setLibrary(rs.flatMap((r) => r.data))).catch(() => {});
  }, [asset, kind]);

  const update = (id, patch) => setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const sel = clips.find((c) => c.id === selected);

  const onDrag = useCallback((id, mode, dt, dTrack, o) => {
    const dur = sources[o.asset_id]?.duration || o.out;
    if (mode === 'move') update(id, { start: round(Math.max(0, o.start + dt)), track: Math.min(tracks - 1, Math.max(0, o.track + dTrack)) });
    if (mode === 'trim-start') {
      const nin = Math.min(o.out - 0.1, Math.max(0, o.in + dt, o.in - o.start));
      update(id, { in: round(nin), start: round(o.start + (nin - o.in)) });
    }
    if (mode === 'trim-end') update(id, { out: round(Math.max(o.in + 0.1, Math.min(dur, o.out + dt))) });
  }, [sources, tracks]);

  const split = useCallback(() => {
    const c = sel && time > sel.start && time < sel.start + sel.out - sel.in ? sel
      : clips.find((x) => time > x.start && time < x.start + x.out - x.in);
    if (!c) { toast.info('Place the playhead over a clip to cut it'); return; }
    const cut = round(c.in + (time - c.start));
    const b = { ...c, id: newId(), in: cut, start: round(time), fade_in: 0 };
    setClips((cs) => cs.flatMap((x) => (x.id === c.id ? [{ ...x, out: cut, fade_out: 0 }, b] : [x])));
    setSelected(b.id);
  }, [sel, clips, time]);

  const remove = useCallback(() => {
    if (!sel) return;
    setClips((cs) => cs.filter((c) => c.id !== sel.id));
    setSelected(null);
  }, [sel]);

  const addFromLibrary = async (id) => {
    const a = library.find((x) => x.id === id);
    if (!a) return;
    const s = sources[id] || await loadSource(a);
    setSources((ss) => ({ ...ss, [id]: s }));
    const track = a.kind === 'video' ? 0 : Math.max(1, sel?.track || 1);
    const c = { id: newId(), asset_id: id, track: Math.min(track, tracks - 1), start: round(time), in: 0, out: round(s.duration || 10), volume: 1, fade_in: 0, fade_out: 0, muted: false };
    setClips((cs) => [...cs, c]);
    setSelected(c.id);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      if (e.key === 's' || e.key === 'S') split();
      if (e.key === 'Delete' || e.key === 'Backspace') remove();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, play, pause, split, remove]);

  const save = async (mode) => {
    setSaveOpen(false);
    pause();
    setRendering({ progress: 0 });
    try {
      const { data } = await axios.post(`${EDITOR_API}/media-editor/render`, {
        kind, title: title.trim() || asset.title, mode, original_asset_id: asset.id,
        clips: clips.map(({ id, ...c }) => c),
      });
      await pollRender(data.id, (p) => setRendering({ progress: p }));
      toast.success(mode === 'new' ? 'Saved as a new file' : 'Original updated');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || 'Render failed');
    } finally {
      setRendering(null);
    }
  };

  const width = Math.max(800, (total + 10) * pps);
  const ticks = useMemo(() => {
    const step = pps >= 80 ? 1 : pps >= 30 ? 5 : pps >= 10 ? 10 : 30;
    return Array.from({ length: Math.ceil(width / pps / step) }, (_, i) => i * step);
  }, [pps, width]);
  const loading = !clips.length;

  return (
    <div className="flex h-full flex-col gap-3" data-testid="timeline-editor">
      <div className="flex items-center gap-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-md" data-testid="editor-title-input" />
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="editor-close-btn"><X className="mr-1 h-4 w-4" />Close</Button>
          <Button onClick={() => setSaveOpen(true)} disabled={loading || !!rendering || !clips.length} className="bg-[#7380b6] hover:bg-[#5f6ba3]" data-testid="editor-save-btn">
            {rendering ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Rendering {rendering.progress}%</> : 'Save'}
          </Button>
        </div>
      </div>
      {kind === 'video' && (
        <div className="mx-auto aspect-video w-full max-w-2xl overflow-hidden rounded-lg bg-black" data-testid="editor-video-preview">
          <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={playing ? pause : play} disabled={loading} data-testid="editor-play-btn">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="w-32 font-mono text-sm tabular-nums text-zinc-700" data-testid="editor-time">{fmtTime(time)} / {fmtTime(total)}</span>
        <Button size="sm" variant="outline" onClick={split} data-testid="editor-split-btn"><Scissors className="mr-1.5 h-3.5 w-3.5" />Cut (S)</Button>
        <Button size="sm" variant="outline" onClick={remove} disabled={!sel} data-testid="editor-delete-clip-btn"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete clip</Button>
        <Button size="sm" variant="outline" onClick={() => setTracks((t) => Math.min(8, t + 1))} data-testid="editor-add-track-btn"><Plus className="mr-1.5 h-3.5 w-3.5" />Track</Button>
        <Select onValueChange={addFromLibrary}>
          <SelectTrigger className="h-8 w-56" data-testid="editor-add-from-library"><SelectValue placeholder="Add file at playhead…" /></SelectTrigger>
          <SelectContent className="z-[1400] max-h-72">
            {library.map((a) => <SelectItem key={a.id} value={a.id}><span className="inline-flex items-center gap-1.5">{a.kind === 'video' ? <Film className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}{a.title}</span></SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex w-40 items-center gap-2 text-xs text-zinc-500">Zoom
          <Slider min={5} max={200} step={5} value={[pps]} onValueChange={([v]) => setPps(v)} data-testid="editor-zoom-slider" />
        </div>
      </div>
      <div className="relative flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50" data-testid="editor-timeline">
        {loading && <div className="flex h-40 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading audio…</div>}
        <div className="relative" style={{ width, height: 24 + tracks * TRACK_H }}>
          <div className="sticky top-0 z-30 h-6 cursor-pointer border-b border-zinc-200 bg-white"
            onPointerDown={(e) => seek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)} data-testid="editor-ruler">
            {ticks.map((t) => <span key={t} className="absolute top-0 h-full border-l border-zinc-300 pl-1 text-[10px] text-zinc-400" style={{ left: t * pps }}>{fmtTime(t).replace(/\.\d$/, '')}</span>)}
          </div>
          <div className="relative" style={{ height: tracks * TRACK_H }} onPointerDown={() => setSelected(null)}>
            {Array.from({ length: tracks }, (_, i) => (
              <div key={i} className={`absolute left-0 right-0 border-b border-zinc-200 ${i % 2 ? 'bg-white' : 'bg-zinc-50'}`} style={{ top: i * TRACK_H, height: TRACK_H }}>
                <span className="sticky left-1 text-[10px] uppercase tracking-wide text-zinc-400">{kind === 'video' && i === 0 ? 'Video' : `Audio ${kind === 'video' ? i : i + 1}`}</span>
              </div>
            ))}
            {clips.map((c) => (
              <TimelineClip key={c.id} clip={c} source={sources[c.asset_id]} pps={pps} selected={c.id === selected} onSelect={setSelected} onDrag={onDrag} />
            ))}
          </div>
          <div className="pointer-events-none absolute top-0 z-40 w-px bg-red-500" style={{ left: time * pps, height: 24 + tracks * TRACK_H }} data-testid="editor-playhead" />
        </div>
      </div>
      {sel && <Inspector clip={sel} onChange={(p) => update(sel.id, p)} />}
      <SaveModeDialog open={saveOpen} asset={asset} onClose={() => setSaveOpen(false)} onPick={save} />
    </div>
  );
}
