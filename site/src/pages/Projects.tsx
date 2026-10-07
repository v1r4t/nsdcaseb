import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';
import { ApiError, listProjects } from '../lib/projects';
import type { Project } from '../lib/projects';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

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

function Row({
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
  return (
    <li className="grid gap-6 border-t border-line py-10 md:grid-cols-12 md:gap-8">
      <div className={textCols}>
        <p aria-hidden="true" className="font-mono text-[11px] tracking-wide text-muted">
          {pad(index + 1)}
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold uppercase leading-tight tracking-tight text-paper sm:text-3xl">
          {project.title}
        </h2>
        {project.summary && (
          <p className="mt-3 max-w-xl text-base leading-relaxed text-paper/70">{project.summary}</p>
        )}
        <StackTokens stack={project.stack} />
        {project.author && (
          <p className="mt-4 font-mono text-[11px] tracking-wide text-muted/70">{project.author}</p>
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
          {event && (
            <Link
              to={`/registrations/${encodeURIComponent(event.id)}`}
              aria-label={`From event: ${event.title}`}
              className="text-muted transition-colors duration-200 hover:text-paper"
            >
              From: {event.title} →
            </Link>
          )}
        </p>
      </div>
      {project.cover_url && (
        <div className={imageCols}>
          <img
            src={project.cover_url}
            alt={project.title}
            loading="lazy"
            decoding="async"
            className="w-full border border-line object-cover"
          />
        </div>
      )}
    </li>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [eventsById, setEventsById] = useState<Map<string, EventSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const counts = useMemo(() => {
    const list = projects ?? [];
    return {
      active: list.filter((p) => p.status === 'active').length,
      shipped: list.filter((p) => p.status === 'shipped').length,
    };
  }, [projects]);

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
        <ol className="mt-6">
          {projects.map((project, i) => (
            <Reveal key={project.id} delay={Math.min(i, 4) * 60}>
              <Row
                project={project}
                index={i}
                event={
                  project.event_id && eventsById ? eventsById.get(project.event_id) : undefined
                }
              />
            </Reveal>
          ))}
          {/* Closing hairline for the last row */}
          <li aria-hidden="true" className="border-t border-line" />
        </ol>
      )}
    </div>
  );
}
