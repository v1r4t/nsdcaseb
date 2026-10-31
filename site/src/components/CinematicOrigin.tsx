import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../../design/hooks/useMediaQuery';

/**
 * THE FOUNDING QUESTION — the About section's scroll/slide sequence.
 *
 * Restored from the retired dark-ground `CinematicOrigin` (see commit 0b3d310)
 * and retypeset on paper: no ink ground, no pinned stage, no prose lane. The
 * lead-in sits in mono; the question is the page's only `h1`.
 *
 * The line breaks are typographic, so the heading carries one `sr-only`
 * sentence for assistive tech while the visible lines stay `aria-hidden` and
 * animate. Each line slides and fades as it rises through the viewport, and
 * because every value comes from the line's own rect, scrolling back plays the
 * sequence backwards.
 *
 * Reduced motion renders the same copy as a static stack. JS never hides
 * content on a failed frame: the markup is readable by default and only
 * receives inline styles while the routine is running.
 */

/** The lead-in, read as plain text above the heading. */
const LEAD_IN = 'We started with a question.';

/** The question, broken by hand — the line breaks are the design. */
const QUESTION_LINES = [
  'WHAT HAPPENS WHEN STUDENTS',
  'STOP WAITING FOR THE FUTURE',
  'AND START BUILDING IT?',
] as const;

/**
 * The same sentence as a deliberate four-line setting below 380px. At 320
 * the three-line setting is wider than the column and orphans a word, so the
 * break is re-cut rather than left to the browser. Both sets are decorative;
 * the sr-only sentence is the heading.
 */
const QUESTION_LINES_NARROW = [
  'WHAT HAPPENS WHEN',
  'STUDENTS STOP WAITING',
  'FOR THE FUTURE',
  'AND START BUILDING IT?',
] as const;

/** Below this the four-line setting is used; above it, the three-line one. */
const WIDE_QUESTION = '(min-width: 380px)';

/** Read as one coherent sentence; the broken lines around it are decorative. */
const QUESTION_SENTENCE =
  'What happens when students stop waiting for the future and start building it?';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Entrance lift in px, matching the kit's Reveal. */
const LIFT = 18;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Ease-out, so a line decelerates into place instead of snapping. */
function easeOut(t: number): number {
  const rest = 1 - t;
  return 1 - rest * rest * rest;
}

interface CinematicOriginProps {
  /** Extra class on the stage (spacing overrides, ...). */
  className?: string;
}

export default function CinematicOrigin({ className }: CinematicOriginProps) {
  const [staticMode, setStaticMode] = useState(prefersReducedMotion);
  const stageRef = useRef<HTMLDivElement>(null);
  // Hand-set breaks are width-specific: 3 lines normally, 4 at 320.
  const wide = useMediaQuery(WIDE_QUESTION);
  const questionLines = wide ? QUESTION_LINES : QUESTION_LINES_NARROW;

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
    const root = stageRef.current;
    if (staticMode || !root) return;

    const bands = Array.from(root.querySelectorAll<HTMLElement>('[data-band]'));
    if (bands.length === 0) return;

    let alive = true;
    let attached = false;
    let raf = 0;

    /**
     * 0 → 1 as a line rises from 88% of the viewport toward ~55% of it. Later
     * lines travel a slightly longer window, so the block arrives as a
     * sequence. A line already at or above the top of the viewport clamps to 1,
     * so landing on `#about` (or refreshing mid-section) never leaves copy
     * hidden.
     */
    const paint = (): void => {
      raf = 0;
      if (!alive) return;
      const vh = window.innerHeight || 1;
      for (let i = 0; i < bands.length; i += 1) {
        const el = bands[i];
        const top = el.getBoundingClientRect().top;
        const span = vh * (0.26 + i * 0.03);
        const progress = easeOut(clamp01((vh * 0.88 - top) / span));
        el.style.opacity = progress.toFixed(3);
        el.style.transform =
          progress >= 1 ? '' : `translate3d(0, ${((1 - progress) * LIFT).toFixed(2)}px, 0)`;
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
        { rootMargin: '320px 0px 320px 0px' },
      );
      observer.observe(root);
    } else {
      // No observer support: run the sequence unconditionally rather than
      // stranding the copy at opacity 0.
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
    <div ref={stageRef} className={['wrap py-16 sm:py-20', className ?? ''].join(' ')}>
      <div className="grid grid-cols-12 gap-x-6">
        <div className="col-span-12 md:col-span-11 md:col-start-2">
          <p data-band className="mono flex items-center gap-2.5 text-quiet">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
            {LEAD_IN}
          </p>

          <h1 className="mt-8 font-display text-[clamp(1.25rem,4.8vw,3.5rem)] leading-[1.02] tracking-tight text-ink">
            {/* One heading for assistive tech; the broken lines are visual. */}
            <span className="sr-only">{QUESTION_SENTENCE}</span>
            <span aria-hidden="true" className="block">
              {questionLines.map((line, i) => (
                <span
                  key={line}
                  data-band
                  className={`block whitespace-nowrap ${
                    i === questionLines.length - 1 ? 'text-ink/80' : ''
                  }`}
                >
                  {line}
                </span>
              ))}
            </span>
          </h1>
        </div>
      </div>
    </div>
  );
}
