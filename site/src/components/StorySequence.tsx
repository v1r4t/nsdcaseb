import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * THE ORIGIN — the CMS `origin` prose as an editorial sequence over the room.
 *
 * The founding question now belongs to the About section (`CinematicOrigin`),
 * so this section carries only the filing mark and the real `origin` prose in
 * Switzer. Nothing is pinned and the section paints no ground of its own: the
 * room stays visible behind it.
 *
 * The entrance is a scroll-linked opacity band per block, driven from each
 * block's own distance to the viewport — scroll back and it plays backwards.
 * JS never hides content on a failed frame: the copy is readable by default and
 * only receives inline styles once the routine is running. Reduced motion
 * renders the same copy as a static stack.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Entrance lift in px, matching the kit's Reveal. */
const LIFT = 18;

/** Plain-text paragraphs: D1 copy is never HTML, so markup cannot leak in. */
function paragraphs(body: string): string[] {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\\r\\n|\\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

interface StorySequenceProps {
  /** Sub-label for the prose stage, e.g. "How we started". */
  title?: string;
  /** The `origin` body from `fetchContent()` — plain text, blank-line separated. */
  body: string;
}

export default function StorySequence({ title, body }: StorySequenceProps) {
  const blocks = useMemo(() => paragraphs(body), [body]);
  const [staticMode, setStaticMode] = useState(prefersReducedMotion);
  const trackRef = useRef<HTMLDivElement>(null);

  // Honour a mid-session change to the motion preference.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (): void => setStaticMode(query.matches);
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
    else if (typeof query.addListener === 'function') query.addListener(onChange);
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', onChange);
      else if (typeof query.removeListener === 'function') query.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    const root = trackRef.current;
    if (staticMode || !root) return;

    const bands = Array.from(root.querySelectorAll<HTMLElement>('[data-band]'));
    if (bands.length === 0) return;

    let alive = true;
    let attached = false;
    let raf = 0;

    /**
     * 0 → 1 as a block's top travels from 90% of the viewport to 58% of it.
     * Blocks already scrolled past clamp to 1, so a refresh mid-section never
     * leaves copy hidden.
     */
    const paint = (): void => {
      raf = 0;
      if (!alive) return;
      const vh = window.innerHeight || 1;
      for (const el of bands) {
        const top = el.getBoundingClientRect().top;
        const p = clamp01((vh * 0.9 - top) / (vh * 0.32));
        el.style.opacity = p.toFixed(3);
        el.style.transform = p >= 1 ? '' : `translate3d(0, ${((1 - p) * LIFT).toFixed(2)}px, 0)`;
      }
    };

    const kick = (): void => {
      if (raf === 0) raf = requestAnimationFrame(paint);
    };

    const clear = (): void => {
      for (const el of bands) {
        el.style.opacity = '';
        el.style.transform = '';
      }
    };

    const attach = (): void => {
      if (attached) return;
      attached = true;
      window.addEventListener('scroll', kick, { passive: true });
      window.addEventListener('resize', kick);
    };

    const detach = (): void => {
      if (!attached) return;
      attached = false;
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Correct first paint before any listener exists.
    paint();

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              detach();
              continue;
            }
            paint();
            attach();
          }
        },
        { rootMargin: '240px 0px 240px 0px' },
      );
      observer.observe(root);
    } else {
      attach();
    }

    return () => {
      alive = false;
      detach();
      observer?.disconnect();
      clear();
    };
  }, [staticMode]);

  return (
    <div className="wrap py-20 sm:py-28">
      <div className="grid grid-cols-12 gap-x-6 gap-y-10">
        {/* Dossier margin: the filing mark and the CMS stage title. */}
        <div className="col-span-12 md:col-span-4">
          <h2 className="mono flex items-center gap-2.5 text-quiet">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
            02 / THE ORIGIN
          </h2>
          {title ? <p className="mono mt-3 pl-[18px] text-faint">{title}</p> : null}
        </div>

        <div ref={trackRef} className="col-span-12 md:col-span-8 md:col-start-5">
          <div data-band className="max-w-[58ch] border-t hairline pt-8">
            {blocks.length === 0 ? (
              <p className="text-[17px] leading-[1.65] text-quiet">
                This section has not been written yet.
              </p>
            ) : (
              <div className="space-y-5">
                {blocks.map((block, i) => (
                  <p
                    key={`${i}-${block.slice(0, 32)}`}
                    className="text-[17px] leading-[1.65] text-ink/80"
                  >
                    {block}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
