import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';
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
    <ul aria-label="Tech stack" className="mt-4 flex flex-wrap gap-2">
      {stack.map((s) => (
        <li
          key={s}
          className="border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-muted"
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
      className="text-muted transition-colors duration-200 hover:text-paper"
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
  const textCols = even ? 'md:col-span-7 md:col-start-6' : 'md:col-span-7';
  const imageCols = even ? 'md:col-span-5 md:col-start-1 md:row-start-1' : 'md:col-span-5';
  const cover = project.cover_url ? coverSources(project.cover_url) : null;
  return (
    <li className="grid gap-6 border-t border-line py-10 md:grid-cols-12 md:gap-8">
      <div className={textCols}>
        <p aria-hidden="true" className="font-mono text-[11px] tracking-wide text-muted">
          {pad(index + 1)}
          <span className="ml-3 text-signal">Featured</span>
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold uppercase leading-tight tracking-tight text-paper sm:text-3xl">
          <Link
            to={`/projects/${encodeURIComponent(project.id)}`}
            className="transition-colors duration-200 hover:text-signal"
          >
            {project.title}
          </Link>
        </h2>
        {project.summary && (
          <p className="mt-3 max-w-xl text-base leading-relaxed text-paper/70">{project.summary}</p>
        )}
        <StackTokens stack={project.stack} />
        {project.author && (
          <p className="mt-4 font-mono text-[11px] tracking-wide text-muted">{project.author}</p>
        )}
        <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-wide">
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener"
              aria-label={`Visit ${project.title} (opens in a new tab)`}
              className="text-signal underline decoration-signal/40 underline-offset-4 transition-colors hover:decoration-signal"
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
              className="aspect-video w-full border border-line object-cover"
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
    <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-line py-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-4">
          <span aria-hidden="true" className="font-mono text-[11px] tracking-wide text-muted">
            {pad(index + 1)}
          </span>
          <Link
            to={`/projects/${encodeURIComponent(project.id)}`}
            className="font-display text-lg font-medium text-paper transition-colors duration-200 hover:text-signal"
          >
            {project.title}
          </Link>
        </p>
        {project.stack.length > 0 && (
          <p className="mt-1 pl-8 font-mono text-[11px] uppercase tracking-wide text-muted">
            {project.stack.join(' · ')}
          </p>
        )}
      </div>
      <p className="flex flex-wrap gap-x-6 gap-y-2 pl-8 font-mono text-[11px] uppercase tracking-wide">
        {project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noopener"
            aria-label={`Visit ${project.title} (opens in a new tab)`}
            className="text-signal underline decoration-signal/40 underline-offset-4 transition-colors hover:decoration-signal"
          >
            Visit →
          </a>
        )}
        <EventLink event={event} />
      </p>
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
    <div className="shell py-12 md:py-16">
      <Reveal>
        <p className="label">Projects / 26—27</p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight text-paper sm:text-6xl">
          PROJECTS
        </h1>
        {projects !== null && (
          <p aria-live="polite" className="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted">
            Active {pad(counts.active)}
            <span aria-hidden="true" className="mx-3">
              /
            </span>
            Shipped {pad(counts.shipped)}
          </p>
        )}
      </Reveal>

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-8 text-sm">
          {error}
        </p>
      )}
      {!error && projects === null && (
        <p aria-live="polite" className="mt-8 font-mono text-xs uppercase tracking-wide text-muted">
          Loading projects…
        </p>
      )}
      {!error && projects !== null && projects.length === 0 && (
        <p className="mt-10 border-t border-line py-8 text-sm text-muted">
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
                className={`border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                  activeStack === null
                    ? 'border-paper text-paper'
                    : 'border-line text-muted hover:text-paper'
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
                  className={`border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                    activeStack === s
                      ? 'border-paper text-paper'
                      : 'border-line text-muted hover:text-paper'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="mt-10 border-t border-line py-8 text-sm text-muted">
              No projects use this stack yet.
            </p>
          ) : (
            <>
              <ol className="mt-6" aria-label="Featured projects">
                {featured.map((project, i) => (
                  <Reveal key={project.id} delay={Math.min(i, 4) * 60}>
                    <FeaturedCard project={project} index={i} event={eventFor(project)} />
                  </Reveal>
                ))}
                {/* Closing hairline for the last featured card */}
                <li aria-hidden="true" className="border-t border-line" />
              </ol>
              {remainder.length > 0 && (
                <>
                  <p className="label mt-12">More work</p>
                  <ol className="mt-2" aria-label="More projects">
                    {remainder.map((project, i) => (
                      <Reveal key={project.id} delay={Math.min(i, 4) * 60}>
                        <TextRow
                          project={project}
                          index={featured.length + i}
                          event={eventFor(project)}
                        />
                      </Reveal>
                    ))}
                    {/* Closing hairline for the last row */}
                    <li aria-hidden="true" className="border-t border-line" />
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
