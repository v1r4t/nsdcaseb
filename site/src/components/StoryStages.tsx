import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMediaQuery } from '../../../design/hooks/useMediaQuery';
import Swoop from './Swoop';

/**
 * StoryStages — the three-chapter story.
 *
 * Desktop pins a 100vh stage for three viewports of scroll: the active chapter
 * enters from the left (01), the right (02) and the left again (03) with a
 * short fade, slide and scale. The section releases exactly when stage 03 is
 * settled, so About follows with no extra pinned scroll.
 *
 * Below 768px — and whenever motion is reduced — the same copy renders as a
 * static stack with lighter directional swoops.
 *
 * The centre of the stage is intentionally empty for now: a new centrepiece is
 * still to be designed.
 */

type Stage = {
  index: string;
  title: string;
  body: string;
  /** Asymmetric placement inside the pinned desktop stage. Never centred. */
  placement: string;
  /** Stage 02 sits on the right and aligns its copy to that edge. */
  right?: boolean;
  /** Coordinates render as a seal mark, once, under stage 02. */
  coordinates?: boolean;
};

const STAGES: Stage[] = [
  {
    index: '01 / A CHAPTER IN BENGALURU',
    title: 'Rooted at Amrita, Bengaluru.',
    body: 'A student data community — meetups, builds and research from campus.',
    placement: 'top-[10%]',
  },
  {
    index: '02 / STUDENTS, CONNECTED',
    title: 'Members, mentors, projects — one network.',
    body: 'Every node is a person doing the work, linked to the people beside them.',
    placement: 'top-[32%]',
    right: true,
    coordinates: true,
  },
  {
    index: '03 / WHAT WE BUILD TOGETHER',
    title: 'Events, projects and research, in the open.',
    body: 'Scroll on — the room opens into the rest of the site.',
    placement: 'top-[46%]',
  },
];

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const DESKTOP_QUERY = '(min-width: 768px)';

/** 64–96px of travel; the same amount returns a stage to its margin. */
const ENTER_SHIFT = 84;
const DURATION = 900;
const EASE_INK = 'var(--ease-ink)';

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** Tracks the motion preference, including changes made mid-session. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_QUERY);
    const onChange = (): void => setReduced(query.matches);
    onChange();
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
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
    <div className="wrap flex shrink-0 items-baseline justify-between gap-6 border-b hairline py-5">
      <h2 className="mono flex items-center gap-2.5 text-quiet">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
        Our story
      </h2>
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
  );
}

/**
 * The pinned desktop stage. Progress is read from the section's geometry on
 * scroll, and React only re-renders when the active chapter changes; the
 * movement itself is a CSS transition on opacity and transform.
 */
function PinnedStory() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [entered, setEntered] = useState(false);

  // Let the first frame paint at the margin so 01 can slide in on arrival.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    let raf = 0;

    const paint = (): void => {
      raf = 0;
      const total = Math.max(1, section.offsetHeight - stage.offsetHeight);
      const rect = section.getBoundingClientRect();
      const progress = clamp01(-rect.top / total);
      const next = progress < 1 / 3 ? 0 : progress < 2 / 3 ? 1 : 2;
      setActive((current) => (current === next ? current : next));
    };

    const schedule = (): void => {
      if (raf === 0) raf = window.requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (raf !== 0) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const counter = String(active + 1).padStart(2, '0');

  return (
    <section ref={sectionRef} aria-label="Our story" className="relative h-[220svh]">
      <div ref={stageRef} className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="flex h-full flex-col pt-16 md:pt-[88px]">
          <StoryHeader counter={counter} />

          <div className="relative flex-1">
            {STAGES.map((stage, i) => {
              const shown = entered && i === active;
              const fromLeft = i !== 1;
              const style: CSSProperties = {
                opacity: shown ? 1 : 0,
                transform: shown
                  ? 'none'
                  : `translate3d(${fromLeft ? -ENTER_SHIFT : ENTER_SHIFT}px, 0, 0) scale(0.985)`,
                transition: `opacity ${DURATION}ms ${EASE_INK}, transform ${DURATION}ms ${EASE_INK}`,
                willChange: 'transform, opacity',
              };

              return (
                <article
                  key={stage.index}
                  className={`absolute inset-x-0 px-[var(--gutter)] ${stage.placement}`}
                  style={style}
                >
                  <div
                    className={`max-w-[34rem] border-t hairline pt-5 ${
                      stage.right ? 'ml-auto text-right' : ''
                    }`}
                  >
                    <p className="mono text-seal">{stage.index}</p>
                    <h3 className="statement-sm mt-3 text-ink">{stage.title}</h3>
                    <p
                      className={`mt-4 max-w-[36ch] text-[17px] leading-[1.65] text-ink/80 ${
                        stage.right ? 'ml-auto' : ''
                      }`}
                    >
                      {stage.body}
                    </p>
                    {stage.coordinates ? <Coordinates align={stage.right} /> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The flow layout: phones, and any viewport where motion is reduced. Swoop
 * settles immediately under `prefers-reduced-motion`, so this doubles as the
 * static stack.
 */
function StaticStory() {
  return (
    <section aria-label="Our story" className="relative">
      <div className="wrap pb-12 pt-6 md:pb-20 md:pt-10">
        <StoryHeader />

        <div className="mt-8 space-y-10 sm:space-y-12">
          {STAGES.map((stage, i) => (
            <Swoop
              key={stage.index}
              from={i === 1 ? 'right' : 'left'}
              className="border-t hairline pt-5"
            >
              <p className="mono text-seal">{stage.index}</p>
              <h3 className="statement-sm mt-3 text-ink">{stage.title}</h3>
              <p className="mt-3 max-w-[46ch] text-[17px] leading-[1.65] text-ink/80">
                {stage.body}
              </p>
              {stage.coordinates ? <Coordinates /> : null}
            </Swoop>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function StoryStages() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const reduced = usePrefersReducedMotion();

  if (!desktop || reduced) return <StaticStory />;
  return <PinnedStory />;
}
