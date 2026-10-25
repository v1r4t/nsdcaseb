import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ArchiveSlide } from '../lib/media';

/**
 * ARCHIVE — manual carousel of photos from the media archive, capped at six
 * images per event by `archiveSlides()`. No autoplay: the site's motion is
 * scroll-led, and a self-advancing gallery competes with that. Keyboard
 * arrows, swipe, and explicit prev/next controls. Links to the full grid.
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
      <div>
        <p className="text-sm text-muted">The archive is empty for now.</p>
        <p className="mt-8">
          <Link to="/archive" className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-signal">
            Open the archive →
          </Link>
        </p>
      </div>
    );
  }

  const current = slides[index];

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
        className="group relative touch-pan-y border border-line outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-ink">
          <img
            key={current.url}
            src={current.url}
            alt={current.caption || current.title || 'NSDC archive photo'}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full select-none object-cover transition-opacity duration-500 motion-reduce:transition-none"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wide text-paper/70">{current.albumTitle}</p>
              {current.caption ? (
                <p className="mt-1 line-clamp-2 max-w-xl text-sm text-paper sm:line-clamp-1">{current.caption}</p>
              ) : null}
            </div>
            <p aria-live="polite" className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-paper/70">
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm border border-line bg-ink/70 text-paper/80 backdrop-blur transition-colors duration-200 hover:border-paper/40 hover:text-paper sm:left-4"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm border border-line bg-ink/70 text-paper/80 backdrop-blur transition-colors duration-200 hover:border-paper/40 hover:text-paper sm:right-4"
        >
          ›
        </button>
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
                  className={`block h-1.5 w-full transition-colors duration-200 ${i === index ? 'bg-signal' : 'bg-line hover:bg-paper/40'}`}
                />
              </button>
            ))}
          </div>
        ) : (
          <span aria-hidden="true" />
        )}
        <Link to="/archive" className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-signal">
          Open the archive →
        </Link>
      </div>
    </div>
  );
}
