import { useEffect, useRef, useState } from 'react';
import { NarrativeGlobe } from '../lib/narrative-globe';

/**
 * GlobeNarrative — scroll-linked globe storytelling section.
 *
 * A ~250vh tall wrapper with a sticky 100vh stage: scroll position drives
 * the globe timeline (assemble → Bengaluru marker → network → dissolve)
 * while asymmetric copy overlays cross-fade. No props — the orchestrator
 * renders `<GlobeNarrative />` wherever it belongs in the page order.
 */

type Stage = {
  index: string;
  title: string;
  body: string;
  /** Asymmetric placement within the sticky stage. Never centred. */
  placement: string;
};

const STAGES: Stage[] = [
  {
    index: '01 / A CHAPTER IN BENGALURU',
    title: 'Rooted at Amrita, Bengaluru.',
    body: 'A student data community — meetups, builds and research from campus.',
    placement: 'left-6 top-[16%] max-w-sm text-left md:left-12 lg:left-20',
  },
  {
    index: '02 / STUDENTS, CONNECTED',
    title: 'Members, mentors, projects — one network.',
    body: 'Every node is a person doing the work, linked to the people beside them.',
    placement: 'right-6 top-[36%] max-w-sm text-right md:right-12 lg:right-20',
  },
  {
    index: '03 / WHAT WE BUILD TOGETHER',
    title: 'Events, projects and research, in the open.',
    body: 'Scroll on — the globe dissolves and the rest of the site takes over.',
    placement: 'left-6 bottom-[14%] max-w-sm text-left md:left-12 lg:left-32',
  },
];

function stageForProgress(p: number): number {
  if (p < 0.42) return 0;
  if (p < 0.7) return 1;
  return 2;
}

export default function GlobeNarrative() {
  const wrapRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState(0);
  const [markerOn, setMarkerOn] = useState(false);
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
  );

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
    if (reduced) engine.setReducedMotion(true);

    let raf = 0;
    let lastStage = -1;
    let lastMarker = false;
    const update = () => {
      raf = 0;
      if (!wrap) return;
      const total = wrap.offsetHeight - window.innerHeight;
      const rect = wrap.getBoundingClientRect();
      const raw = total > 0 ? -rect.top / total : 0;
      const p = Math.min(1, Math.max(0, raw));
      engine?.setProgress(p);
      if (!reduced) {
        const s = stageForProgress(p);
        if (s !== lastStage) {
          lastStage = s;
          setStage(s);
        }
        const m = p >= 0.3 && p < 0.72;
        if (m !== lastMarker) {
          lastMarker = m;
          setMarkerOn(m);
        }
      }
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      engine?.dispose();
      engine = null;
    };
  }, [reduced]);

  const showAll = reduced || failed;

  return (
    <section ref={wrapRef} aria-label="Our story" className="relative h-[250vh] bg-ink">
      <div className="sticky top-0 h-screen overflow-hidden">
        {failed ? (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(245,245,242,0.08), transparent 70%), radial-gradient(ellipse 30% 25% at 62% 40%, rgba(255,90,54,0.10), transparent 70%), #080808',
            }}
          />
        ) : (
          <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
        )}

        <div className="pointer-events-none absolute inset-0">
          <p className="label absolute left-6 top-6 md:left-12">OUR STORY</p>
          <p className="absolute right-6 top-6 font-mono text-[11px] uppercase tracking-wide text-muted md:right-12">
            SCROLL — 0{(showAll ? 3 : stage + 1)} / 03
          </p>

          {STAGES.map((s, i) => {
            const on = showAll || i === stage;
            return (
              <div
                key={s.index}
                aria-hidden={!on}
                className={`absolute ${s.placement} transition-opacity duration-500 ${
                  on ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                <p className="label">{s.index}</p>
                <p className="mt-3 font-display text-2xl leading-tight tracking-tight text-paper md:text-4xl">
                  {s.title}
                </p>
                <p className="mt-3 max-w-xs text-base text-paper/70">{s.body}</p>
              </div>
            );
          })}

          <div
            className={`absolute bottom-[30%] left-6 transition-opacity duration-500 md:left-12 lg:left-20 ${
              showAll || markerOn ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <p className="font-mono text-[11px] uppercase tracking-wide text-signal">
              12.9716° N, 77.5946° E
            </p>
            <p className="label mt-1">BENGALURU</p>
          </div>
        </div>
      </div>
    </section>
  );
}
