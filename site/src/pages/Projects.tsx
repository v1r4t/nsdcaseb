import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';
import { SectionIndex } from '../../../design/primitives/SectionIndex';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { ApiError, listProjects } from '../lib/projects';
import type { Project } from '../lib/projects';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// TODO(cover-variants): cover_url is a full-size original with no resized
// derivatives. When a variant pipeline lands, the expected convention is a
// width-suffixed derivative (e.g. `?width=800` / `-800w` key) with 480w / 800w
// candidates. Until then return the original as the only source — never invent
// variant URLs that would 404.
function coverSources(url: string): { src: string; srcSet: string | undefined } {
  return { src: url, srcSet: undefined };
}

// Cover spans full width below md, ~5/12 of the row above it.
const COVER_SIZES = '(max-width: 768px) 100vw, 42vw';

function StackTokens({ stack }: { stack: string[] }) {
  if (stack.length === 0) return null;
  return (
    <ul aria-label="Tech stack" className="mt-5 flex flex-wrap gap-2">
      {stack.map((s) => (
        <li
          key={s}
          className="mono border border-[color:var(--hairline)] px-2 py-1 text-quiet"
        >
          {s}
        </li>
      ))}
    </ul>
  );
}

function EventLink({ event }: { event: EventSummary | undefined }) {
  if (!event) return null;
  return (
    <Link
      to={`/registrations/${encodeURIComponent(event.id)}`}
      aria-label={`From: ${event.title}`}
      className="text-quiet transition-colors duration-200 hover:text-ink"
    >
      From: {event.title} →
    </Link>
  );
}

/** Standout layout: large type + cover. Used for flagged projects only. */
function FeaturedCard({
  project,
  index,
  event,
}: {
  project: Project;
  index: number;
  event: EventSummary | undefined;
}) {
  const even = index % 2 === 1;
  const textCols = even ? 'md:col-span-6 md:col-start-7' : 'md:col-span-6';
  const imageCols = even
    ? 'md:col-span-5 md:col-start-1 md:row-start-1'
    : 'md:col-span-5 md:col-start-8';
  const cover = project.cover_url ? coverSources(project.cover_url) : null;
  return (
    <li className="grid gap-8 border-t hairline py-10 md:grid-cols-12 md:gap-8 md:py-14">
      <div className={textCols}>
        <p aria-hidden="true" className="mono flex flex-wrap items-baseline gap-x-4 gap-y-2 text-faint">
          <span>{pad(index + 1)}</span>
          <span className="inline-flex items-baseline gap-2 text-seal">
            <span className="h-px w-5 translate-y-[-0.2em] bg-seal" />
            Featured
          </span>
        </p>
        <h2 className="mt-4 font-display text-[clamp(1.9rem,3.4vw,3rem)] leading-[1.02] tracking-tight text-ink">
          <Link
            to={`/projects/${encodeURIComponent(project.id)}`}
            className="transition-colors duration-200 hover:text-seal"
          >
            {project.title}
          </Link>
        </h2>
        {project.summary && (
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-quiet">{project.summary}</p>
        )}
        <StackTokens stack={project.stack} />
        {project.author && (
          <p className="mono mt-4 text-quiet">{project.author}</p>
        )}
        <p className="mono mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener"
              aria-label={`Visit ${project.title} (opens in a new tab)`}
              className="text-seal underline decoration-seal/40 underline-offset-4 transition-colors hover:decoration-seal"
            >
              Visit →
            </a>
          )}
          <EventLink event={event} />
        </p>
      </div>
      {cover && (
        <div className={imageCols}>
          <Link to={`/projects/${encodeURIComponent(project.id)}`} aria-label={`${project.title} — details`}>
            <img
              src={cover.src}
              srcSet={cover.srcSet}
              sizes={COVER_SIZES}
              alt={`${project.title} project cover`}
              loading="lazy"
              decoding="async"
              width={800}
              height={450}
              className="aspect-video w-full border border-[color:var(--hairline)] object-cover"
            />
          </Link>
        </div>
      )}
    </li>
  );
}

/** Minimalist text row for the non-featured remainder. */
function TextRow({
  project,
  index,
  event,
}: {
  project: Project;
  index: number;
  event: EventSummary | undefined;
}) {
  return (
    <li className="border-b hairline">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 py-5 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-baseline md:gap-x-6">
        <span aria-hidden="true" className="mono pt-1 text-faint">
          {pad(index + 1)}
        </span>
        <div className="min-w-0">
          <Link
            to={`/projects/${encodeURIComponent(project.id)}`}
            className="font-display text-xl leading-tight text-ink transition-colors duration-200 hover:text-seal md:text-2xl"
          >
            {project.title}
          </Link>
          {project.stack.length > 0 && (
            <p className="mono mt-2 text-quiet">{project.stack.join(' · ')}</p>
          )}
        </div>
        <p className="mono col-start-2 flex flex-wrap gap-x-6 gap-y-2 md:col-start-3 md:justify-end">
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener"
              aria-label={`Visit ${project.title} (opens in a new tab)`}
              className="text-seal underline decoration-seal/40 underline-offset-4 transition-colors hover:decoration-seal"
            >
              Visit →
            </a>
          )}
          <EventLink event={event} />
        </p>
      </div>
    </li>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [eventsById, setEventsById] = useState<Map<string, EventSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStack, setActiveStack] = useState<string | null>(null);

  useDocumentMeta({
    title: 'Projects — NSDC',
    description:
      'Student-built projects from the NSDC community at Amrita Bengaluru — active builds and shipped work across data, AI and emerging technology.',
  });

  useEffect(() => {
    let active = true;
    listProjects()
      .then((res) => {
        if (active) setProjects(res.projects);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.error === 'network_error'
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Could not load projects. Please try again.',
        );
      });
    // One events fetch for the FROM: cross-links; a missing event means no link.
    listEvents()
      .then((res) => {
        if (active) setEventsById(new Map(res.events.map((e) => [e.id, e])));
      })
      .catch(() => {
        if (active) setEventsById(new Map());
      });
    return () => {
      active = false;
    };
  }, []);

  const stacks = useMemo(() => {
    const seen = new Set<string>();
    for (const p of projects ?? []) {
      for (const s of p.stack) seen.add(s);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const counts = useMemo(() => {
    const list = projects ?? [];
    return {
      active: list.filter((p) => p.status === 'active').length,
      shipped: list.filter((p) => p.status === 'shipped').length,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const list = projects ?? [];
    if (!activeStack) return list;
    return list.filter((p) => p.stack.includes(activeStack));
  }, [projects, activeStack]);

  // Flagged items lead. With no flags, the first two by existing sort stand in —
  // flipping a flag later swaps the block with no code change.
  const featured = useMemo(() => {
    const flagged = filtered.filter((p) => p.featured);
    return flagged.length > 0 ? flagged : filtered.slice(0, 2);
  }, [filtered]);

  const remainder = useMemo(() => {
    const ids = new Set(featured.map((p) => p.id));
    return filtered.filter((p) => !ids.has(p.id));
  }, [filtered, featured]);

  const eventFor = (p: Project): EventSummary | undefined =>
    p.event_id && eventsById ? eventsById.get(p.event_id) : undefined;

  return (
    <div className="wrap py-12 md:py-16">
      <Reveal>
        <header className="border-b hairline pb-8 md:pb-10">
          <div className="grid gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <p className="mono text-quiet">Projects / 26—27</p>
              <h1 className="mt-4 font-display text-[clamp(3.25rem,9vw,7rem)] leading-[0.9] tracking-tight text-ink">
                Projects
              </h1>
            </div>
            <div className="md:col-span-3 md:col-start-10 md:justify-self-end">
              <SectionIndex value="03" className="hidden md:block" />
            </div>
          </div>
          {projects !== null && (
            <p aria-live="polite" className="mono mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-quiet">
              <span>
                Active <span className="text-ink">{pad(counts.active)}</span>
              </span>
              <span aria-hidden="true">/</span>
              <span>
                Shipped <span className="text-ink">{pad(counts.shipped)}</span>
              </span>
            </p>
          )}
        </header>
      </Reveal>

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-8 text-sm">
          {error}
        </p>
      )}
      {!error && projects === null && (
        <p aria-live="polite" className="mono mt-8 text-quiet">
          Loading projects…
        </p>
      )}
      {!error && projects !== null && projects.length === 0 && (
        <p className="mt-10 border-t hairline py-8 text-sm text-quiet">
          No projects published yet.
        </p>
      )}
      {!error && projects !== null && projects.length > 0 && (
        <>
          {stacks.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by stack">
              <button
                type="button"
                aria-pressed={activeStack === null}
                onClick={() => setActiveStack(null)}
                className={`mono rounded-[2px] border px-3 py-1.5 transition-colors duration-200 ${
                  activeStack === null
                    ? 'border-ink text-ink'
                    : 'border-[color:var(--hairline)] text-quiet hover:border-ink/40 hover:text-ink'
                }`}
              >
                All
              </button>
              {stacks.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={activeStack === s}
                  onClick={() => setActiveStack((cur) => (cur === s ? null : s))}
                  className={`mono rounded-[2px] border px-3 py-1.5 transition-colors duration-200 ${
                    activeStack === s
                      ? 'border-ink text-ink'
                      : 'border-[color:var(--hairline)] text-quiet hover:border-ink/40 hover:text-ink'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="mt-10 border-t hairline py-8 text-sm text-quiet">
              No projects use this stack yet.
            </p>
          ) : (
            <>
              <ol className="mt-10" aria-label="Featured projects">
                {featured.map((project, i) => (
                  <Reveal key={project.id} delay={Math.min(i, 4) * 60}>
                    <FeaturedCard project={project} index={i} event={eventFor(project)} />
                  </Reveal>
                ))}
                {/* Closing hairline for the last featured card */}
                <li aria-hidden="true" className="border-t hairline" />
              </ol>
              {remainder.length > 0 && (
                <>
                  <p className="mono mt-14 text-quiet">More work</p>
                  <ol className="mt-4" aria-label="More projects">
                    {remainder.map((project, i) => (
                      <Reveal key={project.id} delay={Math.min(i, 4) * 60}>
                        <TextRow
                          project={project}
                          index={featured.length + i}
                          event={eventFor(project)}
                        />
                      </Reveal>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
