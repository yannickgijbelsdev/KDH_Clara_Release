/* eslint-disable */
/**
 * Renders the presenter avatars as a single overlapping-circles composite,
 * matching the backend `/api/rds/{station}/presenter-composite.png` output.
 *
 * Resolution order (per the Clara product rule — presenters' Team-Settings
 * avatars always take priority over a legacy manually-uploaded title image):
 *   1. If `presenters` is non-empty, render the overlapping-avatar composite
 *      (each presenter resolved via `getAvatarUrl`, which falls back to the
 *      Koodh bear for presenters without an uploaded photo).
 *   2. Else if `fallbackSrc` is provided (legacy manually-uploaded title
 *      image), render it so historic shows don't lose their image.
 *   3. Otherwise render the transparent `/show-placeholder.png`.
 *
 * This matches the user instruction: "kijk wie de presenters zijn en neem
 * dan de avatar/images van die personen in team settings".
 */
import { getAvatarUrl } from '../utils/avatar';

export default function PresenterComposite({
  presenters,            // array of { id, name, avatar_url?, avatar? }
  fallbackSrc,           // string — legacy title image if the user uploaded one
  size = 48,             // px, final rendered diameter
  overlap = 0.35,        // 0..1 — how much of each avatar overlaps the previous one
  className = '',
  alt = 'presenters',
}) {
  const list = Array.isArray(presenters) ? presenters.filter(Boolean) : [];

  // 1. Presenter composite always wins when at least one presenter is set.
  if (list.length > 0) {
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

  // 2. Legacy manually-uploaded title image (only when no presenters are set).
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

  // 3. No presenters, no legacy image → transparent placeholder.
  return (
    <div
      className={`rounded-full bg-transparent overflow-hidden flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <img src="/show-placeholder.png" alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}
