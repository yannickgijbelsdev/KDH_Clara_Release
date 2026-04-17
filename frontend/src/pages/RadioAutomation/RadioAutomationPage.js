import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, SkipForward, Square, Volume2, VolumeX,
  Clock, Disc3, Music2, ListMusic, GripVertical,
  Plus, Trash2, Search, Upload, Settings, Radio,
  ChevronDown, ChevronUp, RotateCcw, Shuffle,
  Repeat, ArrowRightLeft, Loader2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import { useMainSite } from '../../context/MainSiteContext';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/* ═══════════════════════════════════════════════
   WAVEFORM COMPONENT — Canvas-based visualization
   ═══════════════════════════════════════════════ */
const Waveform = ({ deck, isPlaying, progress = 0, cuePoints = {}, color, onSeek }) => {
  const canvasRef = useRef(null);
  const barsRef = useRef([]);

  useEffect(() => {
    // Generate random waveform bars once
    if (barsRef.current.length === 0) {
      const bars = [];
      for (let i = 0; i < 200; i++) {
        const base = Math.random() * 0.5 + 0.2;
        const peak = Math.sin(i * 0.05) * 0.3 + base;
        bars.push(Math.min(1, peak));
      }
      barsRef.current = bars;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = barsRef.current;
    const barW = w / bars.length;
    const playedIdx = Math.floor(progress * bars.length);

    // Draw waveform bars
    bars.forEach((amp, i) => {
      const barH = amp * h * 0.85;
      const x = i * barW;
      const y = (h - barH) / 2;

      if (i < playedIdx) {
        ctx.fillStyle = color || '#dd0c51';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
      }
      ctx.fillRect(x, y, barW - 1, barH);
    });

    // Draw cue markers
    const drawCue = (pos, label, clr) => {
      if (pos == null) return;
      const x = pos * w;
      ctx.strokeStyle = clr;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = clr;
      ctx.font = '10px monospace';
      ctx.fillText(label, x + 3, 12);
    };

    drawCue(cuePoints.intro, 'INTRO', '#22d3ee');
    drawCue(cuePoints.outro, 'OUTRO', '#f43f5e');
    drawCue(cuePoints.fadeIn, 'FADE IN', '#a3e635');
    drawCue(cuePoints.fadeOut, 'FADE OUT', '#f05d8b');

    // Playhead
    const phX = progress * w;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(phX, 0);
    ctx.lineTo(phX, h);
    ctx.stroke();
    // Playhead triangle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(phX - 5, 0);
    ctx.lineTo(phX + 5, 0);
    ctx.lineTo(phX, 8);
    ctx.closePath();
    ctx.fill();
  }, [progress, color, cuePoints]);

  const handleClick = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, x)));
  };

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={80}
      className="w-full h-[80px] cursor-crosshair rounded-lg"
      onClick={handleClick}
    />
  );
};

/* ═══════════════════════════════════════════════
   TIME DISPLAY — Broadcast-style countdown
   ═══════════════════════════════════════════════ */
const TimeDisplay = ({ elapsed, remaining, total }) => {
  const fmt = (s) => {
    if (!s && s !== 0) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 font-mono text-xs">
      <div className="text-center">
        <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Elapsed</div>
        <div className="text-emerald-400 text-lg font-bold tabular-nums">{fmt(elapsed)}</div>
      </div>
      <div className="text-center">
        <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Remaining</div>
        <div className="text-red-400 text-lg font-bold tabular-nums">-{fmt(remaining)}</div>
      </div>
      <div className="text-center">
        <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Duration</div>
        <div className="text-zinc-400 text-sm tabular-nums">{fmt(total)}</div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   PLAYER DECK — A or B player
   ═══════════════════════════════════════════════ */
const PlayerDeck = ({ deck, track, isPlaying, progress, onPlay, onPause, onStop, onSeek, onLoadNext, color }) => {
  const elapsed = track ? progress * (track.duration || 0) : 0;
  const remaining = track ? (track.duration || 0) - elapsed : 0;

  return (
    <div className="flex-1 min-w-0" data-testid={`player-deck-${deck}`}>
      <div className="bg-[#1a1a2e] rounded-2xl border border-white/[0.06] overflow-hidden">
        {/* Deck header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]" style={{ background: `linear-gradient(90deg, ${color}15 0%, transparent 100%)` }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: color, color: '#000' }}>
              {deck}
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold text-sm truncate max-w-[300px]">
                {track?.title || 'No track loaded'}
              </div>
              <div className="text-zinc-400 text-xs truncate max-w-[250px]">
                {track?.artist || '---'}
              </div>
            </div>
          </div>
          <TimeDisplay elapsed={elapsed} remaining={remaining} total={track?.duration} />
        </div>

        {/* Waveform */}
        <div className="px-4 py-3">
          <Waveform
            deck={deck}
            isPlaying={isPlaying}
            progress={progress}
            cuePoints={track?.cue_points || {}}
            color={color}
            onSeek={onSeek}
          />
        </div>

        {/* Transport controls */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={isPlaying ? onPause : onPlay}
              disabled={!track}
              className="h-9 w-9 p-0 hover:bg-white/10 text-white disabled:opacity-30"
              data-testid={`deck-${deck}-play`}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onStop}
              disabled={!track}
              className="h-9 w-9 p-0 hover:bg-white/10 text-white disabled:opacity-30"
              data-testid={`deck-${deck}-stop`}
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onLoadNext}
              className="h-9 w-9 p-0 hover:bg-white/10 text-white"
              data-testid={`deck-${deck}-next`}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          {/* VU-meter style indicator */}
          <div className="flex items-end gap-[2px] h-6">
            {Array.from({ length: 16 }).map((_, i) => {
              const level = isPlaying ? Math.random() * 0.7 + (i < 10 ? 0.3 : 0) : 0.05;
              return (
                <div
                  key={i}
                  className="w-[3px] rounded-full transition-all duration-75"
                  style={{
                    height: `${level * 24}px`,
                    background: i < 10 ? '#22c55e' : i < 13 ? '#eab308' : '#ef4444',
                    opacity: isPlaying ? 1 : 0.2,
                  }}
                />
              );
            })}
          </div>

          {/* Crossfade indicator */}
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500" />
            <div className="text-[10px] text-zinc-500 font-mono uppercase">Auto-mix</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   PLAYLIST ITEM — Draggable track in rundown
   ═══════════════════════════════════════════════ */
const PlaylistItem = ({ track, index, isActive, isNext, onLoadToDeck, onRemove }) => {
  const fmt = (s) => {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`group flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
        isActive
          ? 'bg-orange-500/20 border border-orange-500/30'
          : isNext
          ? 'bg-cyan-500/10 border border-cyan-500/20'
          : 'hover:bg-white/[0.04] border border-transparent'
      }`}
      data-testid={`playlist-item-${index}`}
    >
      <GripVertical className="w-3.5 h-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
      <div className="w-6 text-center">
        {isActive ? (
          <div className="flex items-center justify-center gap-[2px]">
            {[1, 2, 3].map(i => (
              <motion.div
                key={i}
                className="w-[2px] bg-orange-400 rounded-full"
                animate={{ height: [4, 12, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs text-zinc-600 font-mono">{index + 1}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isActive ? 'text-orange-300' : 'text-zinc-200'}`}>
          {track.title}
        </div>
        <div className="text-xs text-zinc-500 truncate">{track.artist}</div>
      </div>
      <div className="text-xs text-zinc-500 font-mono tabular-nums">{fmt(track.duration)}</div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onLoadToDeck('A'); }}
          className="h-6 px-1.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
        >
          A
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onLoadToDeck('B'); }}
          className="h-6 px-1.5 text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
        >
          B
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="h-6 w-6 p-0 text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════
   LIBRARY TRACK — Track in the database browser
   ═══════════════════════════════════════════════ */
const LibraryTrack = ({ track, onAddToPlaylist }) => {
  const fmt = (s) => {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all cursor-pointer"
      onClick={() => onAddToPlaylist(track)}
      data-testid={`library-track-${track.id}`}
    >
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        <Music2 className="w-3.5 h-3.5 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200 truncate">{track.title}</div>
        <div className="text-xs text-zinc-500 truncate">{track.artist}</div>
      </div>
      <div className="text-xs text-zinc-600 font-mono">{fmt(track.duration)}</div>
      <Plus className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 group-hover:text-orange-400 transition-all" />
    </div>
  );
};

/* ═══════════════════════════════════════════════
   CUE POINT EDITOR — Inline editor for markers
   ═══════════════════════════════════════════════ */
const CuePointEditor = ({ track, onSave }) => {
  const [cues, setCues] = useState(track?.cue_points || {});
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    onSave(cues);
    setOpen(false);
    toast.success('Cue points saved');
  };

  const fmtSec = (val) => {
    if (val == null) return '';
    return (val * (track?.duration || 0)).toFixed(1);
  };

  const parseSec = (val) => {
    const s = parseFloat(val);
    if (isNaN(s) || !track?.duration) return null;
    return Math.max(0, Math.min(1, s / track.duration));
  };

  if (!track) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        data-testid="cue-point-toggle"
      >
        <Settings className="w-3 h-3" />
        Cue Points
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { key: 'intro', label: 'Intro', color: 'text-cyan-400' },
                { key: 'outro', label: 'Outro', color: 'text-rose-400' },
                { key: 'fadeIn', label: 'Fade In', color: 'text-lime-400' },
                { key: 'fadeOut', label: 'Fade Out', color: 'text-orange-400' },
              ].map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`text-[10px] w-14 ${color}`}>{label}</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="sec"
                    value={fmtSec(cues[key])}
                    onChange={(e) => setCues({ ...cues, [key]: parseSec(e.target.value) })}
                    className="w-16 h-6 bg-white/[0.06] border border-white/10 rounded text-xs text-zinc-300 px-1.5 text-center placeholder:text-zinc-700 focus:border-orange-500/50 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-600">s</span>
                </div>
              ))}
            </div>
            <Button size="sm" onClick={handleSave} className="mt-2 h-6 text-xs bg-orange-500 hover:bg-orange-600 text-black">
              Save Cues
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   MAIN: RADIO AUTOMATION PAGE
   ═══════════════════════════════════════════════ */
export default function RadioAutomationPage() {
  const { token } = useAuth();
  const { mainSite } = useMainSite();
  const headers = { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite?.id };

  // Player state
  const [deckA, setDeckA] = useState({ track: null, playing: false, progress: 0 });
  const [deckB, setDeckB] = useState({ track: null, playing: false, progress: 0 });
  const [playlist, setPlaylist] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [library, setLibrary] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoMix, setAutoMix] = useState(true);

  // Playback simulation timers
  const timerA = useRef(null);
  const timerB = useRef(null);

  const fetchLibrary = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/radio-automation/tracks`, { headers });
      const tracks = data.tracks || [];
      setLibrary(tracks.length > 0 ? tracks : getDemoTracks());
    } catch {
      setLibrary(getDemoTracks());
    }
    setLoading(false);
  }, [mainSite?.id, token]);

  const fetchPlaylist = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/radio-automation/playlist/active`, { headers });
      if (data.tracks?.length) setPlaylist(data.tracks);
    } catch {}
  }, [mainSite?.id, token]);

  // Fetch library on mount
  useEffect(() => {
    fetchLibrary();
    fetchPlaylist();
  }, [fetchLibrary, fetchPlaylist]);

  // Demo tracks for first-time experience
  const getDemoTracks = () => [
    { id: 'demo-1', title: 'Morning Vibes', artist: 'Radio Grooves', duration: 214, genre: 'Pop', cue_points: { intro: 0.02, outro: 0.95 } },
    { id: 'demo-2', title: 'Sunset Boulevard', artist: 'The Mixers', duration: 187, genre: 'Dance', cue_points: { intro: 0.01, fadeOut: 0.92 } },
    { id: 'demo-3', title: 'Electric Dreams', artist: 'DJ Clara', duration: 243, genre: 'Electronic', cue_points: { intro: 0.03, outro: 0.97 } },
    { id: 'demo-4', title: 'Smooth Operator', artist: 'Night Shift', duration: 198, genre: 'Soul', cue_points: {} },
    { id: 'demo-5', title: 'Bass Drop', artist: 'Sound System', duration: 176, genre: 'EDM', cue_points: { fadeIn: 0.01, fadeOut: 0.9 } },
    { id: 'demo-6', title: 'Acoustic Session', artist: 'The Strings', duration: 265, genre: 'Acoustic', cue_points: { intro: 0.02 } },
    { id: 'demo-7', title: 'City Lights', artist: 'Urban Mix', duration: 221, genre: 'R&B', cue_points: {} },
    { id: 'demo-8', title: 'Tropical Heat', artist: 'Summer Vibes', duration: 193, genre: 'Reggaeton', cue_points: { intro: 0.01, outro: 0.94 } },
  ];

  // Simulate playback
  const startPlayback = useCallback((deck) => {
    const timerRef = deck === 'A' ? timerA : timerB;
    const setDeck = deck === 'A' ? setDeckA : setDeckB;

    if (timerRef.current) clearInterval(timerRef.current);

    setDeck(prev => ({ ...prev, playing: true }));

    timerRef.current = setInterval(() => {
      setDeck(prev => {
        if (!prev.track) return prev;
        const newProgress = prev.progress + (0.1 / (prev.track.duration || 180));
        if (newProgress >= 1) {
          clearInterval(timerRef.current);
          return { ...prev, playing: false, progress: 0 };
        }
        return { ...prev, progress: newProgress };
      });
    }, 100);
  }, []);

  const pausePlayback = (deck) => {
    const timerRef = deck === 'A' ? timerA : timerB;
    const setDeck = deck === 'A' ? setDeckA : setDeckB;
    if (timerRef.current) clearInterval(timerRef.current);
    setDeck(prev => ({ ...prev, playing: false }));
  };

  const stopPlayback = (deck) => {
    const timerRef = deck === 'A' ? timerA : timerB;
    const setDeck = deck === 'A' ? setDeckA : setDeckB;
    if (timerRef.current) clearInterval(timerRef.current);
    setDeck(prev => ({ ...prev, playing: false, progress: 0 }));
  };

  const seekDeck = (deck, pos) => {
    const setDeck = deck === 'A' ? setDeckA : setDeckB;
    setDeck(prev => ({ ...prev, progress: pos }));
  };

  const loadToDeck = (deck, track) => {
    const setDeck = deck === 'A' ? setDeckA : setDeckB;
    stopPlayback(deck);
    setDeck({ track, playing: false, progress: 0 });
    toast.success(`Loaded "${track.title}" to Deck ${deck}`);
  };

  const addToPlaylist = (track) => {
    setPlaylist(prev => [...prev, { ...track, playlistId: `pl-${Date.now()}-${Math.random()}` }]);
  };

  const removeFromPlaylist = (idx) => {
    setPlaylist(prev => prev.filter((_, i) => i !== idx));
  };

  const loadNext = (deck) => {
    const nextIdx = currentIdx + 1;
    if (nextIdx < playlist.length) {
      loadToDeck(deck, playlist[nextIdx]);
      setCurrentIdx(nextIdx);
    }
  };

  const filteredLibrary = library.filter(t =>
    !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Current time
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0d0d1a] text-white overflow-hidden" data-testid="radio-automation-page">
      {/* ══ TOP BAR ══ */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#12122a]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">Radio Automation</h1>
            <p className="text-[11px] text-zinc-500">Cloud Playout System</p>
          </div>
        </div>

        {/* Clock */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-4 py-2 border border-white/[0.06]">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span className="text-xl font-mono font-bold text-white tabular-nums">
              {now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Auto-Mix toggle */}
          <button
            onClick={() => setAutoMix(!autoMix)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              autoMix
                ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                : 'bg-white/[0.04] border-white/[0.06] text-zinc-500'
            }`}
            data-testid="auto-mix-toggle"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Auto-Mix
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-all">
            <Repeat className="w-3.5 h-3.5" />
            Loop
          </button>
        </div>
      </div>

      {/* ══ MAIN CONTENT ══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── LEFT: DECKS + PLAYLIST ─── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* A/B DECKS */}
          <div className="flex gap-3 p-4 pb-2">
            <PlayerDeck
              deck="A"
              track={deckA.track}
              isPlaying={deckA.playing}
              progress={deckA.progress}
              color="#22c55e"
              onPlay={() => startPlayback('A')}
              onPause={() => pausePlayback('A')}
              onStop={() => stopPlayback('A')}
              onSeek={(p) => seekDeck('A', p)}
              onLoadNext={() => loadNext('A')}
            />
            <PlayerDeck
              deck="B"
              track={deckB.track}
              isPlaying={deckB.playing}
              progress={deckB.progress}
              color="#3b82f6"
              onPlay={() => startPlayback('B')}
              onPause={() => pausePlayback('B')}
              onStop={() => stopPlayback('B')}
              onSeek={(p) => seekDeck('B', p)}
              onLoadNext={() => loadNext('B')}
            />
          </div>

          {/* CROSSFADER */}
          <div className="px-4 py-2">
            <div className="flex items-center gap-3 bg-[#1a1a2e] rounded-xl px-4 py-2 border border-white/[0.06]">
              <span className="text-xs font-bold text-emerald-400 w-4">A</span>
              <input
                type="range"
                min="0"
                max="100"
                defaultValue="50"
                className="flex-1 h-1.5 rounded-full appearance-none bg-gradient-to-r from-emerald-500 via-zinc-600 to-blue-500 cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
                data-testid="crossfader"
              />
              <span className="text-xs font-bold text-blue-400 w-4">B</span>
            </div>
          </div>

          {/* PLAYLIST */}
          <div className="flex-1 overflow-hidden px-4 pb-4">
            <div className="h-full bg-[#12122a] rounded-2xl border border-white/[0.06] flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <ListMusic className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-semibold text-zinc-200">Playlist</span>
                  <span className="text-xs text-zinc-600 ml-1">{playlist.length} tracks</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-500 hover:text-zinc-300 gap-1">
                    <RotateCcw className="w-3 h-3" /> Clear
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5" data-testid="playlist-container">
                <AnimatePresence>
                  {playlist.map((track, idx) => (
                    <PlaylistItem
                      key={track.playlistId || track.id}
                      track={track}
                      index={idx}
                      isActive={deckA.track?.id === track.id || deckB.track?.id === track.id}
                      isNext={idx === currentIdx + 1}
                      onLoadToDeck={(deck) => { loadToDeck(deck, track); setCurrentIdx(idx); }}
                      onRemove={() => removeFromPlaylist(idx)}
                    />
                  ))}
                </AnimatePresence>
                {playlist.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                    <ListMusic className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">Playlist is empty</p>
                    <p className="text-xs mt-1">Add tracks from the library</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: LIBRARY ─── */}
        <div className="w-[340px] border-l border-white/[0.06] flex flex-col bg-[#0f0f24]" data-testid="track-library-panel">
          <div className="p-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <Disc3 className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-zinc-200">Track Library</span>
              <span className="text-xs text-zinc-600 ml-auto">{filteredLibrary.length}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
              <input
                type="text"
                placeholder="Search tracks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 bg-white/[0.04] border border-white/[0.06] rounded-lg pl-8 pr-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-orange-500/40 focus:outline-none"
                data-testid="library-search"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : filteredLibrary.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                <Music2 className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No tracks found</p>
              </div>
            ) : (
              filteredLibrary.map((track) => (
                <LibraryTrack key={track.id} track={track} onAddToPlaylist={addToPlaylist} />
              ))
            )}
          </div>

          {/* Upload button */}
          <div className="p-3 border-t border-white/[0.06]">
            <Button
              className="w-full h-9 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 gap-2 text-xs"
              data-testid="upload-tracks-btn"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Tracks
            </Button>
          </div>
        </div>
      </div>

      {/* ══ CUE POINT EDITOR (floating bottom panel for selected deck) ══ */}
      {(deckA.track || deckB.track) && (
        <div className="border-t border-white/[0.06] bg-[#12122a] px-5 py-2 flex items-start gap-6">
          {deckA.track && (
            <div className="flex-1">
              <div className="text-[10px] text-emerald-400 font-bold uppercase mb-0.5">Deck A: {deckA.track.title}</div>
              <CuePointEditor
                track={deckA.track}
                onSave={(cues) => setDeckA(prev => ({ ...prev, track: { ...prev.track, cue_points: cues } }))}
              />
            </div>
          )}
          {deckB.track && (
            <div className="flex-1">
              <div className="text-[10px] text-blue-400 font-bold uppercase mb-0.5">Deck B: {deckB.track.title}</div>
              <CuePointEditor
                track={deckB.track}
                onSave={(cues) => setDeckB(prev => ({ ...prev, track: { ...prev.track, cue_points: cues } }))}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
