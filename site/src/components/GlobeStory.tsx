import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/**
 * GlobeStory — the entry point for the landing globe.
 *
 * The three.js engine (~the bulk of `three`) lives behind a dynamic import, so
 * it never enters the entry bundle: `<GlobeNarrative>` is only rendered after
 * an IntersectionObserver says the section is ~200px away, and `React.lazy`
 * does not call the import factory before that.
 *
 * `PaperStory` is the paper-compatible section used in three cases:
 *   - while the chunk loads (one stage, no frame — the live globe is also
 *     invisible at progress 0, so nothing flashes),
 *   - permanently under `prefers-reduced-motion` (all three stages, static),
 *   - as the WebGL failure fallback handed to `GlobeNarrative` (all three).
 * It matches the live section's 170vh geometry so nothing shifts on swap.
 */

const GlobeNarrative = lazy(() => import('./GlobeNarrative'));

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

type Stage = {
  index: string;
  title: string;
  body: string;
  /** Coordinates render as a seal mark, once, under stage 02. */
  coordinates?: boolean;
};

/** Verbatim copy from the retired globe sequence. */
const STAGES: Stage[] = [
  {
    index: '01 / A CHAPTER IN BENGALURU',
    title: 'Rooted at Amrita, Bengaluru.',
    body: 'A student data community — meetups, builds and research from campus.',
  },
  {
    index: '02 / STUDENTS, CONNECTED',
    title: 'Members, mentors, projects — one network.',
    body: 'Every node is a person doing the work, linked to the people beside them.',
    coordinates: true,
  },
  {
    index: '03 / WHAT WE BUILD TOGETHER',
    title: 'Events, projects and research, in the open.',
    body: 'Scroll on — the globe dissolves and the rest of the site takes over.',
  },
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** A still, hand-drawn globe: ink hairlines with a single seal marker. */
function StillGlobe() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 360"
      fill="none"
      className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[84vw] max-w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-30 md:left-[70%] md:opacity-40"
    >
      <g stroke="#111110" strokeOpacity="0.32" strokeWidth="0.75">
        <circle cx="180" cy="180" r="128" />
        <ellipse cx="180" cy="180" rx="86" ry="128" />
        <ellipse cx="180" cy="180" rx="44" ry="128" />
        <path d="M180 52v256" />
        <ellipse cx="180" cy="180" rx="128" ry="34" />
        <ellipse cx="180" cy="180" rx="128" ry="76" />
        <path d="M52 180h256" />
      </g>
      <circle cx="250" cy="154" r="4" fill="#b33c1b" />
      <circle cx="250" cy="154" r="12" stroke="#b33c1b" strokeOpacity="0.7" strokeWidth="0.75" />
    </svg>
  );
}

function Coordinates({ align }: { align?: boolean }) {
  return (
    <div className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 ${align ? 'justify-end' : ''}`}>
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
      <p className="mono text-seal">12.894702° N, 77.675574° E</p>
      <p className="mono text-faint">BENGALURU</p>
    </div>
  );
}

function StoryHeader({ counter }: { counter?: string }) {
  return (
    <div className="absolute inset-x-0 top-0 z-20">
      <div className="wrap flex items-baseline justify-between gap-6 py-6">
        <p className="mono flex items-center gap-2.5 text-quiet">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
          Our story
        </p>
        <div className="flex items-baseline gap-5">
          {counter ? <p className="mono hidden text-faint sm:block">Scroll — {counter} / 03</p> : null}
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
  );
}

/**
 * The static section. `all` renders every stage as a compact dossier; without
 * it only stage 01 is shown, which is enough to hold the frame while the
 * three.js chunk is in flight.
 */
function PaperStory({ all }: { all: boolean }) {
  return (
    <section aria-label="Our story" className="relative h-[170vh]">
      <div className="sticky top-16 h-[calc(100svh_-_4rem)] overflow-hidden md:top-[88px] md:h-[calc(100svh_-_88px)]">
        {/* The loading frame is text-only: the live globe is invisible at
            progress 0, so drawing a still globe here would flash and vanish. */}
        {all ? <StillGlobe /> : null}
        <StoryHeader counter={all ? undefined : '01'} />

        <div
          className={`relative z-10 flex h-full ${
            all ? 'items-start pt-20' : 'items-center pt-16'
          }`}
        >
          <div className="wrap">
            {all ? (
              <div className="max-w-[38rem] space-y-4 sm:space-y-5">
                {STAGES.map((s) => (
                  <div key={s.index} className="border-t hairline pt-4">
                    <p className="mono text-seal">{s.index}</p>
                    <p className="mt-2 font-display text-[clamp(1.15rem,2.4vw,1.75rem)] leading-[1.1] tracking-tight text-ink">
                      {s.title}
                    </p>
                    <p className="mt-2 max-w-[46ch] text-[14px] leading-[1.5] text-ink/80 sm:text-[15px]">
                      {s.body}
                    </p>
                    {s.coordinates ? <Coordinates /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-w-[22rem]">
                <p className="mono text-seal">{STAGES[0].index}</p>
                <p className="statement-sm mt-3 text-ink">{STAGES[0].title}</p>
                <p className="mt-3 max-w-[34ch] text-[17px] leading-[1.65] text-ink/80">
                  {STAGES[0].body}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function GlobeStory() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Static from the first render: a mid-session change is handled below, but
  // the initial decision must not fetch `three` on a reduced-motion visit.
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_QUERY);
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const node = wrapRef.current;
    if (!node) return;
    if (typeof IntersectionObserver !== 'function') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNear(true);
            io.disconnect();
          }
        }
      },
      // Start fetching about one viewport before the section is reached.
      { rootMargin: '200px 0px 200px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  const ready = near && !reduced;

  return (
    <div ref={wrapRef}>
      {ready ? (
        <Suspense fallback={<PaperStory all={false} />}>
          <GlobeNarrative fallback={<PaperStory all />} />
        </Suspense>
      ) : (
        <PaperStory all={reduced} />
      )}
    </div>
  );
}
