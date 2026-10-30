import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Reveal from '../components/Reveal';
import { ApiError, listProjects } from '../lib/projects';
import type { Project, ProjectStatus } from '../lib/projects';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useDocumentMeta } from '../lib/useDocumentMeta';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active build',
  shipped: 'Shipped',
  archived: 'Archived',
};

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
    <div className="wrap py-10 md:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Link
          to="/projects"
          className="mono text-quiet transition-colors duration-200 hover:text-ink"
        >
          ← Projects
        </Link>
        <p aria-hidden="true" className="mono text-faint">
          Case sheet
        </p>
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-8 border-t hairline pt-5 text-sm text-seal"
        >
          {error}
        </p>
      )}
      {!error && !loaded && (
        <p aria-live="polite" className="mono mt-8 border-t hairline pt-5 text-quiet">
          Loading project…
        </p>
      )}
      {!error && loaded && !project && (
        <div className="mt-10 border-y hairline py-10">
          <p className="font-display text-3xl leading-tight text-ink sm:text-4xl">
            This project does not exist.
          </p>
          <Link
            to="/projects"
            className="mono mt-6 inline-block text-seal underline decoration-seal/40 underline-offset-4 transition-colors hover:decoration-seal"
          >
            Back to projects →
          </Link>
        </div>
      )}
      {!error && project && (
        <article className="mt-10">
          <Reveal>
            <header className="grid gap-8 md:grid-cols-12 md:gap-8">
              <div className="md:col-span-8 lg:col-span-9">
                <p className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-quiet">
                  <span>Project</span>
                  {project.featured && (
                    <span className="inline-flex items-center gap-2 text-seal">
                      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-seal" />
                      Featured
                    </span>
                  )}
                </p>
                <h1 className="mt-4 max-w-4xl text-balance font-display text-[clamp(2.75rem,7vw,5.5rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
                  {project.title}
                </h1>
              </div>
              <div className="md:col-span-4 md:col-start-9 md:self-end md:text-right lg:col-span-3 lg:col-start-10">
                <p className="mono text-faint">Status</p>
                <p className="mt-1 text-sm text-ink">{STATUS_LABEL[project.status]}</p>
              </div>
            </header>
          </Reveal>

          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y hairline py-5 md:grid-cols-4">
            {project.author && (
              <div>
                <dt className="mono text-faint">Credit</dt>
                <dd className="mt-1 text-sm text-ink">{project.author}</dd>
              </div>
            )}
            <div>
              <dt className="mono text-faint">Stack</dt>
              <dd className="mt-1 text-sm text-ink">
                {project.stack.length > 0
                  ? `${String(project.stack.length).padStart(2, '0')} tools`
                  : 'Not listed'}
              </dd>
            </div>
            <div>
              <dt className="mono text-faint">Record</dt>
              <dd className="mono-sm mt-1 break-all text-ink">{project.id}</dd>
            </div>
            <div>
              <dt className="mono text-faint">Filed</dt>
              <dd className="mt-1 text-sm text-ink">Projects / 26—27</dd>
            </div>
          </dl>

          <div className="mt-10 grid gap-10 md:grid-cols-12 md:gap-8">
            <div className="md:col-span-8 md:col-start-5 lg:col-span-7 lg:col-start-6">
              <Reveal>
                {project.cover_url && (
                  <figure>
                    <img
                      src={project.cover_url}
                      alt={`${project.title} project cover`}
                      loading="lazy"
                      decoding="async"
                      width={1200}
                      height={675}
                      className="aspect-video w-full border hairline object-cover"
                    />
                  </figure>
                )}
                {project.summary && (
                  <p
                    className={[
                      'max-w-2xl text-xl leading-[1.5] text-ink md:text-2xl md:leading-[1.4]',
                      project.cover_url ? 'mt-8' : '',
                    ].join(' ')}
                  >
                    {project.summary}
                  </p>
                )}
                {project.description && project.description !== project.summary && (
                  <p className="mt-5 max-w-2xl whitespace-pre-wrap text-[17px] leading-[1.7] text-ink/80">
                    {project.description}
                  </p>
                )}
              </Reveal>

              <p className="mono mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t hairline pt-5">
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Visit ${project.title} (opens in a new tab)`}
                    className="text-seal underline decoration-seal/40 underline-offset-4 transition-colors duration-200 hover:decoration-seal"
                  >
                    Visit →
                  </a>
                )}
                {event && (
                  <Link
                    to={`/registrations/${encodeURIComponent(event.id)}`}
                    aria-label={`From: ${event.title}`}
                    className="text-quiet transition-colors duration-200 hover:text-ink"
                  >
                    From: {event.title} →
                  </Link>
                )}
              </p>
            </div>

            <aside className="md:col-span-4 md:col-start-1 md:row-start-1 lg:col-span-3">
              <div className="border-t hairline pt-4">
                <h2 className="mono text-faint">Tech stack</h2>
                {project.stack.length > 0 ? (
                  <ul aria-label="Tech stack" className="mt-3 flex flex-wrap gap-2">
                    {project.stack.map((s) => (
                      <li key={s} className="border hairline px-2.5 py-1 mono text-quiet">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-quiet">No stack listed for this build.</p>
                )}
              </div>
            </aside>
          </div>
        </article>
      )}
    </div>
  );
}
