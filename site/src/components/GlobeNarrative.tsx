import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NarrativeGlobe } from '../lib/narrative-globe';

/**
 * GlobeNarrative — scroll-linked globe storytelling section.
 *
 * A ~170vh tall wrapper with a sticky stage: scroll position drives the globe
 * timeline (assemble → Bengaluru marker → network → dissolve) while the three
 * copy stages enter from the margins. The section paints no ground of its own
 * and the canvas clears to transparent, so the globe sits ink-on-paper behind
 * the text instead of on a dark slab.
 *
 * Stage 01 enters from the left, 02 from the right, 03 from the left again;
 * both transform and opacity are written straight to the stage nodes on the
 * same rAF that feeds the globe, so React never re-renders per scroll frame.
 *
 * No props, no second h1: the orchestrator renders `<GlobeStory />` (which
 * lazy-loads this module) and the stage titles stay paragraphs.
 */

type Stage = {
  index: string;
  title: string;
  body: string;
  /** Asymmetric placement within the sticky stage. Never centred. */
  placement: string;
  /** Right-aligned variant; its body and coordinate mark sit to the right. */
  right?: boolean;
  /** Coordinates render as a seal mark, once, under stage 02. */
  coordinates?: boolean;
};

const STAGES: Stage[] = [
  {
    index: '01 / A CHAPTER IN BENGALURU',
    title: 'Rooted at Amrita, Bengaluru.',
    body: 'A student data community — meetups, builds and research from campus.',
    placement: 'left-[var(--gutter)] top-[16%] max-w-[min(22rem,calc(100%_-_3rem))]',
  },
  {
    index: '02 / STUDENTS, CONNECTED',
    title: 'Members, mentors, projects — one network.',
    body: 'Every node is a person doing the work, linked to the people beside them.',
    placement:
      'left-[var(--gutter)] top-[38%] max-w-[min(22rem,calc(100%_-_3rem))] md:left-auto md:right-[var(--gutter)]',
    right: true,
    coordinates: true,
  },
  {
    index: '03 / WHAT WE BUILD TOGETHER',
    title: 'Events, projects and research, in the open.',
    body: 'Scroll on — the globe dissolves and the rest of the site takes over.',
    placement: 'bottom-[10%] left-[var(--gutter)] max-w-[min(20rem,calc(100%_-_3rem))]',
  },
];

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** A paper plate under the copy: opaque enough to hide the points beneath. */
const PAPER_PLATE: CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--color-paper) 94%, transparent)',
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

function stageForProgress(p: number, narrow: boolean): number {
  if (p < 0.34) return 0;
  if (p < (narrow ? 0.68 : 0.67)) return 1;
  return 2;
}

/**
 * Opacity and horizontal offset for one stage at scroll progress `p`.
 * 01 and 03 come in from the left, 02 from the right. Windows overlap at the
 * seams so a crossfade never leaves an empty stage.
 *
 * Below 768px the cards share the same vertical band, so 02 finishes at 0.66
 * and 03 does not start until 0.70 — the copy never prints on top of itself.
 * 03 holds at full opacity through p=1, so the panel never unpins on a frame
 * with all three stages invisible.
 */
function motionForStage(
  p: number,
  i: number,
  narrow: boolean,
): { opacity: number; x: number } {
  const last = i === STAGES.length - 1;
  const start = i === 0 ? 0 : i === 1 ? 0.3 : narrow ? 0.7 : 0.64;
  const end = i === 0 ? 0.36 : i === 1 ? (narrow ? 0.66 : 0.7) : 1;
  const u = clamp01((p - start) / (end - start));
  // The first stage is already painted when the page loads; it still slides
  // in from the left over the first few pixels of scroll.
  const enter = i === 0 ? 1 : clamp01(u / 0.18);
  const slide = i === 0 ? clamp01(u / 0.08) : enter;
  const exit = last ? 1 : clamp01((1 - u) / 0.16);
  const opacity = i === 0 ? exit : last ? enter : Math.min(enter, exit);
  const from = i === 1 ? 1 : -1;
  const x = from * (28 * (1 - slide) + 16 * (1 - exit));
  return { opacity, x };
}

function initialMotion(i: number, reduced: boolean): CSSProperties {
  if (reduced) return { opacity: 1, transform: 'none' };
  return {
    opacity: i === 0 ? 1 : 0,
    transform: `translate3d(${i === 1 ? 28 : -28}px, 0, 0)`,
  };
}

interface GlobeNarrativeProps {
  /** Rendered in place of the section when WebGL is unavailable. */
  fallback?: ReactNode;
}

export default function GlobeNarrative({ fallback = null }: GlobeNarrativeProps) {
  const wrapRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [stage, setStage] = useState(0);
  const reducedRef = useRef(reduced);
  const engineRef = useRef<NarrativeGlobe | null>(null);

  // Honour a mid-session motion-preference change without a reload.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_QUERY);
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  // Build the engine once. A preference flip updates it in place below, so
  // the reduced-motion switch never tears down and rebuilds WebGL.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let engine: NarrativeGlobe | null = null;
    try {
      engine = new NarrativeGlobe(canvas);
    } catch {
      setFailed(true);
      return;
    }
    engineRef.current = engine;

    let raf = 0;
    let lastStage = -1;

    const paint = (): void => {
      raf = 0;
      const total = wrap.offsetHeight - window.innerHeight;
      const rect = wrap.getBoundingClientRect();
      const p = clamp01(total > 0 ? -rect.top / total : 0);
      const narrow = window.innerWidth < 768;

      engine?.setProgress(p);

      for (let i = 0; i < STAGES.length; i++) {
        const node = stageRefs.current[i];
        if (!node) continue;
        if (reducedRef.current) {
          node.style.opacity = '1';
          node.style.transform = 'none';
          continue;
        }
        const { opacity, x } = motionForStage(p, i, narrow);
        node.style.opacity = opacity.toFixed(3);
        node.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      }

      const next = stageForProgress(p, narrow);
      if (next !== lastStage) {
        lastStage = next;
        setStage(next);
      }
    };

    const onScroll = (): void => {
      if (raf === 0) raf = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      engine?.dispose();
      engine = null;
      engineRef.current = null;
    };
  }, []);

  // Preference flips: keep the engine, update its motion mode in place.
  useEffect(() => {
    if (reducedRef.current === reduced) return;
    reducedRef.current = reduced;
    engineRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  // A failed engine hands the whole section to the paper fallback supplied by
  // GlobeStory (same height, still frame, all three stages readable).
  if (failed) return <>{fallback}</>;

  const counter = String(stage + 1).padStart(2, '0');

  return (
    <section ref={wrapRef} aria-label="Our story" className="relative h-[170vh]">
      <div className="sticky top-16 h-[calc(100svh_-_4rem)] overflow-hidden md:top-[88px] md:h-[calc(100svh_-_88px)]">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />

        <div className="absolute inset-x-0 top-0 z-20">
          <div className="wrap flex items-baseline justify-between gap-6 py-6">
            <p className="mono flex items-center gap-2.5 text-quiet">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
              Our story
            </p>
            <div className="flex items-baseline gap-5">
              <p className="mono hidden text-faint sm:block">Scroll — {counter} / 03</p>
              <a
                href="#about"
                aria-label="Scroll to about section"
                className="mono text-quiet underline decoration-faint/40 underline-offset-4 transition-colors duration-200 hover:text-seal"
              >
                Scroll to about ↓
              </a>
            </div>
          </div>
        </div>

        {STAGES.map((s, i) => (
          <div
            key={s.index}
            ref={(node) => {
              stageRefs.current[i] = node;
            }}
            className={`absolute z-10 border hairline p-4 sm:p-6 ${
              s.right ? 'text-left md:text-right' : 'text-left'
            } ${s.placement}`}
            style={{ ...PAPER_PLATE, ...initialMotion(i, reduced) }}
          >
            <p className="mono text-seal">{s.index}</p>

            <p className="statement-sm mt-3 text-ink">{s.title}</p>

            <p
              className={`mt-3 max-w-[34ch] text-[17px] leading-[1.65] text-ink ${
                s.right ? 'md:ml-auto' : ''
              }`}
            >
              {s.body}
            </p>

            {s.coordinates ? (
              <div
                className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 ${
                  s.right ? 'md:justify-end' : ''
                }`}
              >
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
                <p className="mono text-seal">12.894702° N, 77.675574° E</p>
                <p className="mono text-faint">BENGALURU</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
