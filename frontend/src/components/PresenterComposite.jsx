/* eslint-disable */
/**
 * Renders the presenter avatars as a single overlapping-circles composite,
 * matching the backend `/api/rds/{station}/presenter-composite.png` output.
 *
 * Falls back to the transparent `/show-placeholder.png` when:
 *   - no presenters are provided, or
 *   - a `fallbackSrc` (e.g. a custom-uploaded title image) is passed in.
 *
 * This component is intentionally small and self-contained so every page that
 * currently shows a show-title avatar (Show Management, Calendar sidebar,
 * Show Detail header) can swap its single `<img>` for `<PresenterComposite>`
 * without touching the surrounding layout.
 */
import { getAvatarUrl } from '../utils/avatar';

export default function PresenterComposite({
  presenters,            // array of { id, name, avatar_url?, avatar? }
  fallbackSrc,           // string — explicit title image if the user uploaded one
  size = 48,             // px, final rendered diameter
  overlap = 0.35,        // 0..1 — how much of each avatar overlaps the previous one
  className = '',
  alt = 'presenters',
}) {
  // Explicit title image always wins — radio shows that still have a custom
  // uploaded title image keep rendering it exactly as before.
  if (fallbackSrc) {
    return (
      <div
        className={`rounded-full bg-transparent overflow-hidden flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <img src={fallbackSrc} alt={alt} className="w-full h-full object-cover" />
      </div>
    );
  }

  const list = Array.isArray(presenters) ? presenters.filter(Boolean) : [];
  if (list.length === 0) {
    return (
      <div
        className={`rounded-full bg-transparent overflow-hidden flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <img src="/show-placeholder.png" alt={alt} className="w-full h-full object-cover" />
      </div>
    );
  }

  const step = size * (1 - overlap);           // horizontal distance between circle centers
  const compositeWidth = size + step * (list.length - 1);

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: compositeWidth, height: size }}
      aria-label={alt}
    >
      {list.map((p, i) => (
        <img
          key={p?.id || p?.name || i}
          src={getAvatarUrl(p)}
          alt={p?.name || alt}
          title={p?.name || ''}
          className="absolute top-0 rounded-full object-cover ring-2 ring-white bg-zinc-100"
          style={{
            left: i * step,
            width: size,
            height: size,
            zIndex: list.length - i,
          }}
        />
      ))}
    </div>
  );
}
