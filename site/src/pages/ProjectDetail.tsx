import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, listProjects } from '../lib/projects';
import type { Project } from '../lib/projects';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useDocumentMeta } from '../lib/useDocumentMeta';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: project ? `${project.title} — NSDC Projects` : 'Project — NSDC',
    description: project
      ? project.summary || 'A student-built project from the NSDC community.'
      : 'Project details from the NSDC community.',
  });

  useEffect(() => {
    if (!id) return;
    let active = true;
    listProjects()
      .then((res) => {
        if (!active) return;
        const found = res.projects.find((p) => p.id === id) ?? null;
        setProject(found);
        setLoaded(true);
        if (found?.event_id) {
          listEvents()
            .then((ev) => {
              if (active) setEvent(ev.events.find((e) => e.id === found.event_id) ?? null);
            })
            .catch(() => {
              // A missing event means no cross-link — not an error surface.
              if (active) setEvent(null);
            });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoaded(true);
        setError(
          err instanceof ApiError && err.error === 'network_error'
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Could not load this project. Please try again.',
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="shell py-12 md:py-16">
      <p>
        <Link
          to="/projects"
          className="font-mono text-[11px] uppercase tracking-wide text-muted transition-colors hover:text-paper"
        >
          ← Projects
        </Link>
      </p>

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-8 text-sm">
          {error}
        </p>
      )}
      {!error && !loaded && (
        <p aria-live="polite" className="mt-8 font-mono text-xs uppercase tracking-wide text-muted">
          Loading project…
        </p>
      )}
      {!error && loaded && !project && (
        <p className="mt-10 border-t border-line py-8 text-sm text-muted">
          This project does not exist.
        </p>
      )}
      {!error && project && (
        <article className="mt-8">
          <p className="label">Project{project.featured ? ' / Featured' : ''}</p>
          <h1 className="mt-3 font-display text-5xl font-semibold uppercase tracking-tight text-paper sm:text-6xl">
            {project.title}
          </h1>
          {project.author && (
            <p className="mt-4 font-mono text-[11px] tracking-wide text-muted">
              {project.author}
            </p>
          )}
          {project.cover_url && (
            <img
              src={project.cover_url}
              alt={`${project.title} project cover`}
              loading="lazy"
              decoding="async"
              width={1200}
              height={675}
              className="mt-8 aspect-video w-full max-w-3xl border border-line object-cover"
            />
          )}
          {project.summary && (
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-paper/85">
              {project.summary}
            </p>
          )}
          {project.description && project.description !== project.summary && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-base leading-relaxed text-paper/70">
              {project.description}
            </p>
          )}
          {project.stack.length > 0 && (
            <ul aria-label="Tech stack" className="mt-6 flex flex-wrap gap-2">
              {project.stack.map((s) => (
                <li
                  key={s}
                  className="border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-muted"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 font-mono text-[11px] uppercase tracking-wide">
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
                aria-label={`From: ${event.title}`}
                className="text-muted transition-colors duration-200 hover:text-paper"
              >
                From: {event.title} →
              </Link>
            )}
          </p>
        </article>
      )}
    </div>
  );
}
