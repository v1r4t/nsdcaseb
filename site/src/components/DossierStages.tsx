import { Reveal } from '../../../design/motion/Reveal';

/**
 * THE NETWORK — a three-part dossier over the room.
 *
 * The globe narrative retypeset as filed notes: a mono index, a serif
 * statement, body copy in Switzer. Stages alternate left / right / indented
 * left, separated by hairlines rather than boxes. Nothing is sticky and there
 * is no scroll-jack; each statement enters with the kit's line-mask `Reveal`.
 *
 * The copy is preserved verbatim from the retired globe sequence, including the
 * Bengaluru coordinate line — now a seal mark under stage 02, used once.
 */

interface Stage {
  index: string;
  title: string;
  body: string;
  /** Cell placement in the 12-column dossier grid. */
  placement: string;
  /** Right-aligned variant: the statement block is pushed to the page's right margin. */
  right?: boolean;
  /** Coordinates render as a seal mark, once, under stage 02. */
  coordinates?: boolean;
}

const STAGES: Stage[] = [
  {
    index: '01 / A CHAPTER IN BENGALURU',
    title: 'Rooted at Amrita, Bengaluru.',
    body: 'A student data community — meetups, builds and research from campus.',
    placement: 'md:col-span-6 md:col-start-1',
  },
  {
    index: '02 / STUDENTS, CONNECTED',
    title: 'Members, mentors, projects — one network.',
    body: 'Every node is a person doing the work, linked to the people beside them.',
    placement: 'md:col-span-6 md:col-start-7',
    right: true,
    coordinates: true,
  },
  {
    index: '03 / WHAT WE BUILD TOGETHER',
    title: 'Events, projects and research, in the open.',
    body: 'Scroll on — the globe dissolves and the rest of the site takes over.',
    placement: 'md:col-span-7 md:col-start-2',
  },
];

export default function DossierStages() {
  return (
    <section aria-label="Our story" className="wrap pt-14 pb-20 sm:pt-16 sm:pb-28">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="mono flex items-center gap-2.5 text-quiet">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
          Our story
        </p>
        <a
          href="#about"
          aria-label="Scroll to about section"
          className="mono text-quiet underline decoration-faint/40 underline-offset-4 transition-colors duration-200 hover:text-seal"
        >
          Scroll to about ↓
        </a>
      </div>

      <div className="mt-12 space-y-14 sm:mt-16 sm:space-y-20">
        {STAGES.map((stage, i) => (
          <div
            key={stage.index}
            className={`grid grid-cols-12 gap-x-6 gap-y-4 border-t hairline pt-6 ${
              stage.right ? 'md:text-right' : ''
            }`}
          >
            <div className={`col-span-12 ${stage.placement}`}>
              <p className="mono text-seal">{stage.index}</p>

              <Reveal className="mt-4" delay={Math.min(i, 2) * 0.08}>
                <p className="statement-sm text-ink">{stage.title}</p>
              </Reveal>

              <p
                className={`mt-4 max-w-[42ch] text-[17px] leading-[1.65] text-ink/80 ${
                  stage.right ? 'md:ml-auto' : ''
                }`}
              >
                {stage.body}
              </p>

              {stage.coordinates ? (
                <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end">
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
                  <p className="mono text-seal">12.894702° N, 77.675574° E</p>
                  <p className="mono text-faint">BENGALURU</p>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
