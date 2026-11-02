import { useEffect, useRef } from 'react';

export const TRACK_H = 64;

const Wave = ({ peaks, inS, outS, width, color }) => {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = Math.max(1, Math.min(4000, Math.round(width)));
    cv.width = w;
    cv.height = TRACK_H - 18;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, cv.height);
    if (!peaks) return;
    ctx.fillStyle = color;
    const mid = cv.height / 2;
    for (let x = 0; x < w; x += 1) {
      const t = inS + ((outS - inS) * x) / w;
      const p = peaks.data[Math.min(peaks.data.length - 1, Math.floor(t * peaks.perSec))] || 0;
      const h = Math.max(1, p * mid);
      ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }, [peaks, inS, outS, width, color]);
  return <canvas ref={ref} className="absolute left-0 bottom-0 h-[calc(100%-18px)] w-full pointer-events-none" />;
};

// One clip on the timeline: drag the body to move (also across tracks), drag the edges to trim.
export const TimelineClip = ({ clip, source, pps, selected, onSelect, onDrag }) => {
  const width = (clip.out - clip.in) * pps;
  const isVideo = source?.kind === 'video';
  const startDrag = (e, mode) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(clip.id);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const orig = { ...clip };
    const move = (ev) => onDrag(clip.id, mode, (ev.clientX - x0) / pps, Math.round((ev.clientY - y0) / TRACK_H), orig);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      className={`absolute top-1 rounded-md overflow-hidden select-none cursor-grab active:cursor-grabbing border ${selected ? 'border-[#1f2547] ring-2 ring-[#7380b6]/60' : 'border-transparent'} ${isVideo ? 'bg-amber-200/90' : 'bg-[#7380b6]/80'} ${clip.muted ? 'opacity-50' : ''}`}
      style={{ left: clip.start * pps, width: Math.max(6, width), height: TRACK_H - 8, top: clip.track * TRACK_H + 4 }}
      onPointerDown={(e) => startDrag(e, 'move')}
      data-testid={`timeline-clip-${clip.id}`}
    >
      <div className="relative z-10 truncate px-2 pt-0.5 text-[11px] font-medium text-white mix-blend-normal" style={{ color: isVideo ? '#5b3a00' : '#fff' }}>
        {source?.title || 'Clip'}
      </div>
      <Wave peaks={source?.peaks} inS={clip.in} outS={clip.out} width={width} color={isVideo ? 'rgba(91,58,0,.55)' : 'rgba(255,255,255,.85)'} />
      {clip.fade_in > 0 && <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-black/30 to-transparent pointer-events-none" style={{ width: clip.fade_in * pps }} />}
      {clip.fade_out > 0 && <div className="absolute right-0 top-0 h-full bg-gradient-to-l from-black/30 to-transparent pointer-events-none" style={{ width: clip.fade_out * pps }} />}
      <div className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize bg-black/10 hover:bg-black/30" onPointerDown={(e) => startDrag(e, 'trim-start')} data-testid={`clip-trim-start-${clip.id}`} />
      <div className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize bg-black/10 hover:bg-black/30" onPointerDown={(e) => startDrag(e, 'trim-end')} data-testid={`clip-trim-end-${clip.id}`} />
    </div>
  );
};
