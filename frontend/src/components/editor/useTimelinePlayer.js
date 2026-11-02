import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioCtx } from './mediaEditorApi';

const clipDur = (c) => c.out - c.in;

// Plays the timeline: every clip's audio through Web Audio (volume + fades), the video track via a muted <video>.
export function useTimelinePlayer(clips, sources, videoRef) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const run = useRef(null);
  const total = clips.reduce((m, c) => Math.max(m, c.start + clipDur(c)), 0);

  const stopNodes = () => {
    if (!run.current) return;
    run.current.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    cancelAnimationFrame(run.current.raf);
    run.current = null;
  };

  const syncVideo = useCallback((t) => {
    const v = videoRef?.current;
    if (!v) return;
    // Last matching clip wins, like the render (later clips are overlaid on top).
    const c = [...clips].reverse().find((x) => x.track === 0 && sources[x.asset_id]?.kind === 'video' && t >= x.start && t < x.start + clipDur(x));
    if (!c) { v.style.opacity = 0; if (!v.paused) v.pause(); return; }
    const src = sources[c.asset_id].url;
    if (v.dataset.src !== src) { v.dataset.src = src; v.src = src; }
    v.style.opacity = 1;
    const want = c.in + (t - c.start);
    if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
    if (run.current && v.paused) v.play().catch(() => {});
    if (!run.current && !v.paused) v.pause();
  }, [clips, sources, videoRef]);

  const play = useCallback(async () => {
    stopNodes();
    const ctx = getAudioCtx();
    await ctx.resume();
    const t0 = timeRef.current >= total ? 0 : timeRef.current;
    const at = ctx.currentTime + 0.05;
    const nodes = [];
    clips.forEach((c) => {
      const buf = sources[c.asset_id]?.buffer;
      const dur = clipDur(c);
      if (!buf || c.muted || c.start + dur <= t0) return;
      const off = Math.max(0, t0 - c.start);
      const when = at + Math.max(0, c.start - t0);
      const node = ctx.createBufferSource();
      node.buffer = buf;
      const g = ctx.createGain();
      const vol = c.volume;
      g.gain.setValueAtTime(c.fade_in > off ? vol * (off / c.fade_in) : vol, when);
      if (c.fade_in > off) g.gain.linearRampToValueAtTime(vol, when + (c.fade_in - off));
      if (c.fade_out > 0) {
        const fs = Math.max(off, dur - c.fade_out);
        g.gain.setValueAtTime(vol, when + (fs - off));
        g.gain.linearRampToValueAtTime(0, when + (dur - off));
      }
      node.connect(g).connect(ctx.destination);
      node.start(when, c.in + off, dur - off);
      nodes.push(node);
    });
    run.current = { nodes, raf: 0 };
    setPlaying(true);
    const tick = () => {
      if (!run.current) return;
      const t = t0 + Math.max(0, ctx.currentTime - at);
      timeRef.current = t;
      setTime(t);
      syncVideo(t);
      if (t >= total) { stopNodes(); setPlaying(false); syncVideo(t); return; }
      run.current.raf = requestAnimationFrame(tick);
    };
    run.current.raf = requestAnimationFrame(tick);
  }, [clips, sources, total, syncVideo]);

  const pause = useCallback(() => { stopNodes(); setPlaying(false); syncVideo(timeRef.current); }, [syncVideo]);

  const seek = useCallback((t) => {
    const wasPlaying = !!run.current;
    stopNodes();
    timeRef.current = Math.max(0, t);
    setTime(timeRef.current);
    syncVideo(timeRef.current);
    if (wasPlaying) play(); else setPlaying(false);
  }, [play, syncVideo]);

  useEffect(() => () => stopNodes(), []);
  useEffect(() => { if (!run.current) syncVideo(timeRef.current); }, [clips, syncVideo]);

  return { playing, time, total, play, pause, seek };
}
