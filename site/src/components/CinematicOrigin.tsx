import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import Reveal from './Reveal';

/**
 * THE ORIGIN — a scroll-driven sequence.
 *
 * The founding question arrives one line at a time and holds; then the real
 * prose lands and the question yields the stage. Every value derives from the
 * wrapper's own rect, so nothing here runs on a wall clock — scroll back and
 * the sequence plays backwards exactly.
 *
 * Reduced motion renders the same copy as a plain editorial stack: no sticky
 * pinning, no rail, nothing hidden. IntersectionObserver only decides *when*
 * to listen, so browsers without it still get the full sequence.
 */

/** The founding question, broken by hand — the line breaks are the design. */
const OPENING_LINES = ['WE STARTED', 'WITH A QUESTION.'] as const;
const QUESTION_LINES = [
  'WHAT HAPPENS WHEN STUDENTS',
  'STOP WAITING FOR THE FUTURE',
  'AND START BUILDING IT?',
] as const;

/** Read as one coherent sentence; the broken lines around it are decorative. */
const QUESTION_SENTENCE =
  'We started with a question. What happens when students stop waiting for the future and start building it?';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Scroll smoothing, matching the pointer follower's feel. */
const LERP = 0.12;
/** Entrance lift in px, matching Reveal's 18px. */
const LIFT = 18;

type Band = readonly [start: number, end: number];

/** Arrival windows, as [start, end] of wrapper scroll progress (0 → 1). */
const OPENING_BANDS: readonly Band[] = [
  [0.02, 0.19],
  [0.14, 0.32],
];
/** The gap after the opening is deliberate: hold the statement, then ask. */
const QUESTION_BANDS: readonly Band[] = [
  [0.39, 0.54],
  [0.47, 0.62],
  [0.55, 0.7],
];

/** The question recedes — never leaves — as the prose claims the stage. */
const RECEDE_BAND: Band = [0.71, 0.87];
const RECEDE_FLOOR = 0.3;

const PROSE_AT = 0.79;
const PROSE_SPAN = 0.17;

/** Pre-paint state so nothing flashes fully visible before the first frame. */
const HIDDEN: CSSProperties = {
  opacity: 0,
  transform: `translate3d(0, ${LIFT}px, 0)`,
  willChange: 'transform, opacity',
};
const RAIL_EMPTY: CSSProperties = { transform: 'scaleY(0)', willChange: 'transform' };

const LINE_CLASS =
  'block font-display text-[clamp(2.5rem,9vw,5rem)] font-bold uppercase leading-[0.92] tracking-tight text-paper';
const LINE_CLASS_SECOND =
  'mt-1 block font-display text-[clamp(1.75rem,6.5vw,3.5rem)] font-bold uppercase leading-[0.96] tracking-tight text-paper/90';
const QUESTION_CLASS =
  'mt-3 block font-display text-[clamp(1.125rem,3.4vw,1.85rem)] font-medium uppercase leading-[1.25] tracking-tight text-paper/60';

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

/** Eased 0 → 1 as progress crosses a band; clamps to 0/1 outside it. */
function band(progress: number, range: Band): number {
  return easeOut(clamp01((progress - range[0]) / (range[1] - range[0])));
}

/** Plain-text paragraphs: D1 copy is never HTML, so markup cannot leak in. */
function paragraphs(body: string): string[] {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\\r\\n|\\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Stagger the paragraphs inside the prose window, compressing the gaps when
 * there are many so the last one always lands before progress reaches 1.
 */
function proseBands(count: number): Band[] {
  if (count <= 1) return [[PROSE_AT, PROSE_AT + PROSE_SPAN]];
  const room = Math.max(0, 0.98 - PROSE_AT - PROSE_SPAN);
  const stagger = Math.min(0.055, room / (count - 1));
  return Array.from({ length: count }, (_, i) => {
    const start = PROSE_AT + i * stagger;
    return [start, start + PROSE_SPAN] as Band;
  });
}

/**
 * The question, broken across lines. Purely typographic — the accessible
 * sentence lives in the `sr-only` paragraph the parent renders alongside it,
 * so assistive tech never has to reassemble the break.
 */
function BrokenQuestion({
  nodes,
  hidden,
}: {
  nodes: MutableRefObject<Array<HTMLSpanElement | null>>;
  hidden: boolean;
}) {
  return (
    <>
      {OPENING_LINES.map((line, i) => (
        <span
          key={line}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          style={hidden ? HIDDEN : undefined}
          className={i === 0 ? LINE_CLASS : LINE_CLASS_SECOND}
        >
          {line}
        </span>
      ))}
      {QUESTION_LINES.map((line, i) => (
        <span
          key={line}
          ref={(el) => {
            nodes.current[OPENING_LINES.length + i] = el;
          }}
          style={hidden ? HIDDEN : undefined}
          className={QUESTION_CLASS}
        >
          {line}
        </span>
      ))}
    </>
  );
}

/** The real `origin` prose — real `<p>` elements, comfortable measure. */
function Prose({
  title,
  blocks,
  nodes,
  hidden,
}: {
  title?: string;
  blocks: string[];
  nodes: MutableRefObject<Array<HTMLParagraphElement | null>>;
  hidden: boolean;
}) {
  return (
    <div className="mt-10 md:mt-14 md:pl-[16.666%]">
      {title ? <p className="label">{title}</p> : null}
      <div className="mt-5 space-y-5">
        {blocks.length === 0 ? (
          <p className="max-w-[60ch] text-sm text-muted">This section has not been written yet.</p>
        ) : (
          blocks.map((block, i) => (
            <p
              key={`${i}-${block.slice(0, 32)}`}
              ref={(el) => {
                nodes.current[i] = el;
              }}
              style={hidden ? HIDDEN : undefined}
              className="max-w-[60ch] text-base leading-relaxed text-paper/80"
            >
              {block}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

interface CinematicOriginProps {
  /** Sub-label for the prose stage, e.g. "How we started". */
  title?: string;
  /** The `origin` body from `fetchContent()` — plain text, blank-line separated. */
  body: string;
}

export default function CinematicOrigin({ title, body }: CinematicOriginProps) {
  const blocks = useMemo(() => paragraphs(body), [body]);
  const bands = useMemo(() => proseBands(blocks.length), [blocks.length]);
  const [staticMode, setStaticMode] = useState(prefersReducedMotion);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const lineNodes = useRef<Array<HTMLSpanElement | null>>([]);
  const proseNodes = useRef<Array<HTMLParagraphElement | null>>([]);

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
    const node = wrapperRef.current;
    if (staticMode || !node) return;

    let alive = true;
    let raf = 0;
    let attached = false;
    /** Pin travel available to the stage, cached so frames only read `.top`. */
    let range = 1;
    let target = 0;
    let current = 0;

    const reveal = (el: HTMLElement, value: number): void => {
      el.style.opacity = value.toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - value) * LIFT).toFixed(2)}px, 0)`;
    };

    const paint = (progress: number): void => {
      const recede = 1 - (1 - RECEDE_FLOOR) * band(progress, RECEDE_BAND);

      for (let i = 0; i < OPENING_LINES.length; i += 1) {
        const el = lineNodes.current[i];
        if (el) reveal(el, band(progress, OPENING_BANDS[i]) * recede);
      }
      for (let i = 0; i < QUESTION_LINES.length; i += 1) {
        const el = lineNodes.current[OPENING_LINES.length + i];
        if (el) reveal(el, band(progress, QUESTION_BANDS[i]) * recede);
      }
      for (let i = 0; i < proseNodes.current.length; i += 1) {
        const el = proseNodes.current[i];
        if (el) reveal(el, band(progress, bands[i]));
      }
      if (railRef.current) railRef.current.style.transform = `scaleY(${progress.toFixed(4)})`;
    };

    const measure = (): void => {
      range = Math.max(1, node.offsetHeight - window.innerHeight);
    };

    /** The single layout read per frame; everything else is a cached number. */
    const read = (): void => {
      target = clamp01(-node.getBoundingClientRect().top / range);
    };

    const tick = (): void => {
      raf = 0;
      if (!alive) return;
      current += (target - current) * LERP;
      if (Math.abs(target - current) < 0.0004) current = target;
      paint(current);
      // Settle: no rAF parked at 60fps once the scroll has stopped.
      if (current !== target) raf = requestAnimationFrame(tick);
    };

    const kick = (): void => {
      read();
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const onResize = (): void => {
      measure();
      kick();
    };

    const attach = (): void => {
      if (attached) return;
      attached = true;
      window.addEventListener('scroll', kick, { passive: true });
      window.addEventListener('resize', onResize);
    };

    const detach = (): void => {
      if (!attached) return;
      attached = false;
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Correct first paint before any listener exists, so a deep link or a
    // refresh mid-section never flashes the whole sequence at once.
    measure();
    current = clamp01(-node.getBoundingClientRect().top / range);
    paint(current);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      // Only listen while the section is anywhere near the viewport.
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              detach();
              continue;
            }
            measure();
            attach();
            kick();
          }
        },
        { rootMargin: '240px 0px 240px 0px' },
      );
      observer.observe(node);
    } else {
      // No observer support: run the sequence unconditionally rather than
      // stranding the copy at opacity 0.
      attach();
      kick();
    }

    return () => {
      alive = false;
      detach();
      observer?.disconnect();
    };
  }, [staticMode, bands]);

  const heading = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 className="label">02 / The origin</h2>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted/70">12.9716° N, 77.5946° E</p>
    </div>
  );

  if (staticMode) {
    return (
      <div>
        {heading}
        <Reveal className="md:pl-[8.333%]">
          <div className="mt-10 md:mt-14">
            <p className="sr-only">{QUESTION_SENTENCE}</p>
            <div aria-hidden="true">
              <BrokenQuestion nodes={lineNodes} hidden={false} />
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <Prose title={title} blocks={blocks} nodes={proseNodes} hidden={false} />
        </Reveal>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative h-[190vh] md:h-[200vh]">
      <div className="sticky top-0 min-h-screen">
        {/* Spine: hairline track, accent fill. No glow. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-px bg-line">
          <span ref={railRef} style={RAIL_EMPTY} className="block h-full w-full origin-top bg-signal" />
        </div>

        <div className="shell flex min-h-screen flex-col justify-center py-20 md:py-28">
          {heading}
          <div className="md:pl-[8.333%]">
            <p className="sr-only">{QUESTION_SENTENCE}</p>
            <div aria-hidden="true" className="mt-10 md:mt-14">
              <BrokenQuestion nodes={lineNodes} hidden />
            </div>
          </div>
          <Prose title={title} blocks={blocks} nodes={proseNodes} hidden />
        </div>
      </div>
    </div>
  );
}