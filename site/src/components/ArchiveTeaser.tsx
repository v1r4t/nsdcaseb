import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ArchiveSlide } from '../lib/media';
import { galleryFullSources } from '../lib/image-variants';

// The carousel spans the wrap (max 1440px minus its horizontal padding).
const TEASER_SIZES = '(max-width: 768px) 100vw, 1344px';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * ARCHIVE — manual carousel of photos from the media archive, capped at six
 * images per event by `archiveSlides()`. No autoplay: the site's motion is
 * scroll-led, and a self-advancing gallery competes with that. Keyboard
 * arrows, swipe, and explicit prev/next controls. Links to the full grid.
 *
 * Composed as a contact sheet: a mono rail above the plate carries the album
 * and the frame count, the caption sits under a hairline instead of on a
 * gradient, and the arrows are inked slabs over the photo.
 */
export default function ArchiveTeaser({ slides }: { slides: ArchiveSlide[] }) {
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const total = slides.length;

  const step = useCallback(
    (delta: number) => {
      if (total === 0) return;
      setIndex((prev) => (prev + delta + total) % total);
    },
    [total],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeStart.current = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeStart.current === null) return;
    const delta = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(delta) > 40) step(delta < 0 ? 1 : -1);
  };

  if (total === 0) {
    return (
      <div className="border-t hairline pt-6">
        <p className="max-w-md text-[15px] leading-[1.7] text-quiet">The archive is empty for now.</p>
        <p className="mt-6">
          <Link to="/archive" className="mono text-ink transition-colors duration-200 hover:text-seal">
            Open the archive →
          </Link>
        </p>
      </div>
    );
  }

  const current = slides[index];
  const sources = galleryFullSources(current.url, current.variants);

  return (
    <div>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Archive photos"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="group relative touch-pan-y focus-visible:outline-offset-8"
      >
        <div className="flex items-baseline justify-between gap-4 border-b hairline pb-3">
          <span className="mono min-w-0 truncate text-quiet">{current.albumTitle}</span>
          <p aria-live="polite" className="mono shrink-0 text-ink">
            {pad(index + 1)} / {pad(total)}
          </p>
        </div>

        <div className="relative mt-4 overflow-hidden border hairline bg-ink/5">
          <img
            key={current.url}
            src={sources.src}
            srcSet={sources.srcSet}
            sizes={TEASER_SIZES}
            alt={current.caption || current.title || 'NSDC archive photo'}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="aspect-[16/10] w-full select-none object-cover"
          />

          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[2px] border border-paper/30 bg-ink/70 font-mono text-lg text-paper transition-colors duration-200 hover:border-paper/60 hover:bg-ink sm:left-4"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[2px] border border-paper/30 bg-ink/70 font-mono text-lg text-paper transition-colors duration-200 hover:border-paper/60 hover:bg-ink sm:right-4"
          >
            ›
          </button>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-4 border-b hairline pb-3">
          <p className="mono-sm line-clamp-2 max-w-2xl text-pretty text-quiet">{current.caption || current.title}</p>
          <span aria-hidden="true" className="mono shrink-0 text-faint">
            Plate {pad(index + 1)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        {/* Dots only when they fit one row on the narrowest phone; beyond that
            the numbered counter remains the position indicator. */}
        {total <= 8 ? (
          <div className="flex gap-1" role="group" aria-label="Choose archive photo">
            {slides.map((slide, i) => (
              <button
                key={slide.url}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Photo ${i + 1}: ${slide.title}`}
                onClick={() => setIndex(i)}
                className="flex h-8 w-6 items-center justify-center"
              >
                <span
                  className={`block h-1.5 w-full transition-colors duration-200 ${i === index ? 'bg-seal' : 'bg-ink/20 hover:bg-ink/45'}`}
                />
              </button>
            ))}
          </div>
        ) : (
          <span aria-hidden="true" />
        )}
        <Link to="/archive" className="mono text-ink transition-colors duration-200 hover:text-seal">
          Open the archive →
        </Link>
      </div>
    </div>
  );
}
