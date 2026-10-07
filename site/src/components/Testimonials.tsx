import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTestimonials } from '../lib/site';
import type { Testimonial } from '../lib/site';

/** Opacity-only cross-fade. Keep in step with the CSS transition below. */
const CROSSFADE_MS = 420;
const ROTATE_MS = 8000;

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Tracked live, so switching the OS setting mid-visit takes effect at once. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    // Safari < 14 and friends.
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);
  return reduced;
}

interface TestimonialsProps {
  /**
   * Already-fetched quotes. Omit (`undefined`) and the rotation fetches them
   * itself. Pass `[]` or `null` to render nothing without fetching.
   */
  testimonials?: Testimonial[] | null;
  /** Auto-advance period in milliseconds. */
  intervalMs?: number;
  /** Extra classes on the figure, for placement. */
  className?: string;
}

/**
 * TESTIMONIALS — a quiet rotation of short member quotes. One at a time, large
 * display type for the quote, mono for the attribution, and the whole block
 * deliberately pushed off the centre line. Renders nothing when there is
 * nothing to say — no heading, no empty state, no placeholder quote.
 *
 * Auto-advance stops on hover and on keyboard focus, and does not run at all
 * under prefers-reduced-motion: the first quote simply waits to be stepped.
 */
export default function Testimonials({
  testimonials,
  intervalMs = ROTATE_MS,
  className,
}: TestimonialsProps) {
  const reduced = useReducedMotion();
  const [fetched, setFetched] = useState<Testimonial[] | null>(testimonials ?? null);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const swap = useRef<number | null>(null);

  useEffect(() => {
    if (testimonials !== undefined) return;
    let live = true;
    void loadTestimonials().then((rows) => {
      if (live) setFetched(rows);
    });
    return () => {
      live = false;
    };
  }, [testimonials]);

  const items = fetched ?? [];
  const count = items.length;
  const safeIndex = count === 0 ? 0 : index % count;

  useEffect(() => {
    return () => {
      if (swap.current !== null) window.clearTimeout(swap.current);
    };
  }, []);

  /** Cross-fade to an absolute index. Instant under reduced motion. */
  const moveTo = useCallback(
    (next: number) => {
      if (count <= 1) return;
      if (swap.current !== null) {
        window.clearTimeout(swap.current);
        swap.current = null;
      }
      if (reduced) {
        setIndex(next);
        return;
      }
      setFading(true);
      swap.current = window.setTimeout(() => {
        setIndex(next);
        setFading(false);
        swap.current = null;
      }, CROSSFADE_MS);
    },
    [count, reduced],
  );

  const step = useCallback(
    (delta: number) => moveTo((safeIndex + delta + count) % count),
    [moveTo, safeIndex, count],
  );

  const running = count > 1 && !reduced && !paused;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => step(1), intervalMs);
    return () => window.clearInterval(id);
  }, [running, intervalMs, step]);

  if (count === 0) return null;

  const current = items[safeIndex];
  const attribution = current.role ? `${current.name}, ${current.role}` : current.name;
  const single = count === 1;

  return (
    <figure
      className={`md:ml-[8.333%] lg:ml-[16.666%] ${className ?? ''}`.trim()}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Live region: the quote and its attribution only, so a rotation is
          announced without the controls being read out. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          opacity: fading ? 0 : 1,
          transition: reduced ? 'none' : `opacity ${CROSSFADE_MS}ms ease`,
        }}
      >
        <blockquote className="font-display text-2xl font-bold leading-snug tracking-tight text-paper sm:text-3xl">
          <span aria-hidden="true" className="text-signal">
            “
          </span>
          {current.quote}
          <span aria-hidden="true" className="text-signal">
            ”
          </span>
        </blockquote>
        <figcaption className="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted">
          — {attribution}
        </figcaption>
      </div>

      {single ? null : (
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous quote"
              className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:border-paper/40 hover:text-paper"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next quote"
              className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:border-paper/40 hover:text-paper"
            >
              Next →
            </button>
          </div>
          <ol className="flex items-center gap-3">
            {items.map((item, dot) => {
              const active = dot === safeIndex;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (dot !== safeIndex) moveTo(dot);
                    }}
                    aria-label={`Quote ${dot + 1} of ${count}`}
                    aria-current={active ? 'true' : undefined}
                    className="flex h-4 w-4 items-center justify-center"
                  >
                    {/* Current dot is accent *and* wider — never colour alone. */}
                    <span
                      aria-hidden="true"
                      className={`block h-1.5 rounded-full transition-all duration-200 ${
                        active ? 'w-5 bg-signal' : 'w-1.5 bg-muted'
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="font-mono text-[11px] tracking-wide text-muted">
            {String(safeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </p>
        </div>
      )}
    </figure>
  );
}