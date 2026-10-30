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
    <li className="flex items-baseline gap-4 border-b hairline py-4">
      <span aria-hidden="true" className="mono shrink-0 text-faint">
        {pad(index + 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-tight text-ink">{project.title}</p>
        {project.stack.length > 0 && (
          <p className="mono mt-1 truncate text-quiet">{project.stack.join(' · ')}</p>
        )}
      </div>
      {project.url && (
        <a
          href={project.url}
          target="_blank"
          rel="noopener"
          aria-label={`Visit ${project.title} (opens in a new tab)`}
          className="mono shrink-0 text-quiet transition-colors duration-200 hover:text-seal"
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
      <Reveal className="md:ml-[33.333%] md:max-w-[50%]">
        <div className="border-t hairline pt-6">
          <p className="mono text-seal">Next</p>
          <p className="mt-3 font-display text-2xl leading-tight tracking-tight text-ink sm:text-3xl">
            Projects coming soon.
          </p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-quiet">
            The project index opens here — work from project nights and small teams, listed as
            it ships.
          </p>
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <div className="border-t hairline pt-6">
        <div className="flex items-baseline justify-between gap-6">
          <p className="mono text-quiet">Projects</p>
          <Link
            to="/projects"
            className="mono text-quiet transition-colors duration-200 hover:text-ink"
          >
            All projects →
          </Link>
        </div>
        <ul className="mt-3">
          {projects.slice(0, 3).map((project, i) => (
            <CompactRow key={project.id} project={project} index={i} />
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
