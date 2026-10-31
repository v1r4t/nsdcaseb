import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import IndexStage from './IndexStage';
import type { IndexStageItem } from './IndexStage';
import { ApiError, listProjects } from '../lib/projects';
import type { Project, ProjectStatus } from '../lib/projects';

const pad = (n: number): string => String(n).padStart(2, '0');

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  shipped: 'Shipped',
  archived: 'Archived',
};

function StackTokens({ stack }: { stack: string[] }) {
  if (stack.length === 0) return null;
  return (
    <ul aria-label="Tech stack" className="mt-4 flex flex-wrap gap-2">
      {stack.map((token) => (
        <li
          key={token}
          className="mono border border-[color:var(--hairline)] px-2 py-1 text-quiet"
        >
          {token}
        </li>
      ))}
    </ul>
  );
}

/**
 * PROJECTS — landing index + stage.
 *
 * Index: ordinal, title, stack. Stage: the real cover (when one exists), the
 * summary, the stack, and links to the project page and the live build. Covers
 * are served as stored — this API exposes no cover derivatives, so no variant
 * URLs are invented. Empty and failed loads keep the strip's honest lines.
 */
export default function LandingProjects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
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
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="border-t hairline pt-6">
        <p role="alert" aria-live="assertive" className="text-sm text-seal">
          {error}
        </p>
        <p className="mt-8 border-t hairline pt-4">
          <Link
            to="/projects"
            className="mono text-quiet transition-colors duration-200 hover:text-ink"
          >
            All projects →
          </Link>
        </p>
      </div>
    );
  }

  if (projects === null) return null;

  if (projects.length === 0) {
    return (
      <div className="border-t hairline pt-6">
        <p className="mono text-seal">Next</p>
        <p className="mt-3 font-display text-2xl leading-tight tracking-tight text-ink sm:text-3xl">
          Projects coming soon.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-quiet">
          The project index opens here — work from project nights and small teams, listed as it
          ships.
        </p>
      </div>
    );
  }

  const shown = projects.slice(0, 3);

  const items: IndexStageItem[] = shown.map((project, ordinal) => ({
    id: project.id,
    index: pad(ordinal + 1),
    title: project.title,
    meta: project.stack.length > 0 ? project.stack.join(' · ') : STATUS_LABEL[project.status],
    href: `/projects/${encodeURIComponent(project.id)}`,
  }));

  const projectsById = new Map(shown.map((project) => [project.id, project]));

  const stage = (item: IndexStageItem): ReactNode => {
    const project = projectsById.get(item.id);
    if (!project) return null;
    const detailHref = `/projects/${encodeURIComponent(project.id)}`;
    const cover = project.cover_url;
    return (
      <div>
        {cover && (
          <Link
            to={detailHref}
            className="block border hairline"
          >
            <img
              src={cover}
              alt={`${project.title} project cover`}
              loading="lazy"
              decoding="async"
              width={800}
              height={450}
              className="aspect-video w-full object-cover"
            />
          </Link>
        )}

        <p className="mono mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-faint">
          <span className="text-quiet">{STATUS_LABEL[project.status]}</span>
          {project.author && (
            <>
              <span aria-hidden="true">/</span>
              <span>{project.author}</span>
            </>
          )}
        </p>

        {project.summary && (
          <p className="mt-3 max-w-[58ch] text-[17px] leading-[1.65] text-quiet">
            {project.summary}
          </p>
        )}

        <StackTokens stack={project.stack} />

        <p className="mono mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Link
            to={detailHref}
            aria-label={`Open project — ${project.title}`}
            className="text-ink transition-colors duration-200 hover:text-seal"
          >
            Open project →
          </Link>
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${project.title} (opens in a new tab)`}
              className="text-seal underline decoration-seal/40 underline-offset-4 transition-colors hover:decoration-seal"
            >
              Visit ↗
            </a>
          )}
        </p>
      </div>
    );
  };

  return (
    <div>
      <IndexStage items={items} renderStage={stage} label="Projects" />
      <p className="mt-8 border-t hairline pt-4">
        <Link
          to="/projects"
          className="mono text-quiet transition-colors duration-200 hover:text-ink"
        >
          All projects →
        </Link>
      </p>
    </div>
  );
}
