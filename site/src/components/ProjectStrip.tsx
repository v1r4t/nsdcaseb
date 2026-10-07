import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { listProjects } from '../lib/projects';
import type { Project } from '../lib/projects';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function CompactRow({ project, index }: { project: Project; index: number }) {
  return (
    <li className="flex items-baseline gap-4 border-t border-line py-4">
      <span aria-hidden="true" className="shrink-0 font-mono text-[11px] text-muted">
        {pad(index + 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-medium text-paper">{project.title}</p>
        {project.stack.length > 0 && (
          <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-wide text-muted">
            {project.stack.join(' · ')}
          </p>
        )}
      </div>
      {project.url && (
        <a
          href={project.url}
          target="_blank"
          rel="noopener"
          aria-label={`Visit ${project.title} (opens in a new tab)`}
          className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:text-signal"
        >
          Visit →
        </a>
      )}
    </li>
  );
}

/**
 * PROJECTS — compact editorial strip for the homepage. Shows the first 3
 * published projects and links through to the full index. When nothing is
 * published yet, an honest single line with a NEXT tag. No invented entries.
 */
export default function ProjectStrip() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    let active = true;
    listProjects()
      .then((res) => {
        if (active) setProjects(res.projects);
      })
      .catch(() => {
        if (active) setProjects([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (projects === null) return null;

  if (projects.length === 0) {
    return (
      <Reveal className="md:ml-[25%] md:max-w-[50%]">
        <div className="border-t border-line pt-6">
          <p className="font-mono text-xs text-signal">NEXT</p>
          <p className="mt-3 font-display text-xl font-bold tracking-tight text-paper sm:text-2xl">
            Projects coming soon.
          </p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-paper/70">
            The project index opens here — work from project nights and small teams, listed as
            it ships.
          </p>
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <div className="border-t border-line pt-6">
        <div className="flex items-baseline justify-between">
          <p className="label">Projects</p>
          <Link
            to="/projects"
            className="font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:text-signal"
          >
            All projects →
          </Link>
        </div>
        <ul className="mt-2">
          {projects.slice(0, 3).map((project, i) => (
            <CompactRow key={project.id} project={project} index={i} />
          ))}
          {/* Closing hairline for the last row */}
          <li aria-hidden="true" className="border-t border-line" />
        </ul>
      </div>
    </Reveal>
  );
}
