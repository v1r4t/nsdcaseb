import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Reveal from '../components/Reveal';
import { ApiError, listProjects } from '../lib/projects';
import type { Project, ProjectStatus } from '../lib/projects';
import { formatEventDate, listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useDocumentMeta } from '../lib/useDocumentMeta';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active build',
  shipped: 'Shipped',
  archived: 'Archived',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Small solid marker; the three tones are the whole kit. */
function statusDot(status: ProjectStatus): string {
  if (status === 'active') return 'bg-seal';
  if (status === 'shipped') return 'bg-ink';
  return 'bg-faint';
}

const CASE_MARKER = /^\s*(problem|build|result)\s*:\s*(.*)$/i;
const CASE_HEADING = /^\s*(problem|build|result)\s*$/i;

interface CaseSection {
  label: string;
  body: string;
}

/**
 * Some write-ups arrive as "Problem: … / Build: … / Result: …" lines. Render
 * those as the case structure; anything else stays one prose block, so no
 * section is invented for copy that is not actually structured.
 */
function parseCaseSections(
  description: string,
): { intro: string; sections: CaseSection[] } | null {
  const lines = description.split(/\r?\n/);
  const intro: string[] = [];
  const sections: CaseSection[] = [];
  let current: CaseSection | null = null;

  for (const line of lines) {
    const match = line.match(CASE_MARKER) ?? line.match(CASE_HEADING);
    if (match) {
      if (current) sections.push(current);
      const raw = match[1] ?? '';
      current = {
        label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
        body: (match[2] ?? '').trim(),
      };
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    } else {
      intro.push(line);
    }
  }
  if (current) sections.push(current);

  const filled = sections.filter((section) => section.body.trim().length > 0);
  if (filled.length < 2) return null;
  return { intro: intro.join('\n').trim(), sections: filled };
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [caseInfo, setCaseInfo] = useState<{ index: number; total: number } | null>(null);
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
    setProject(null);
    setEvent(null);
    setCaseInfo(null);
    setLoaded(false);
    setError(null);

    listProjects()
      .then((res) => {
        if (!active) return;
        const index = res.projects.findIndex((p) => p.id === id);
        const found = index === -1 ? null : res.projects[index];
        setProject(found);
        setCaseInfo(found ? { index: index + 1, total: res.projects.length } : null);
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

  const description = project?.description.trim() ?? '';
  const summary = project?.summary.trim() ?? '';
  const hasDistinctDescription = description.length > 0 && description !== summary;
  const caseStructure = hasDistinctDescription ? parseCaseSections(description) : null;

  return (
    <div className="wrap py-8 md:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Link
          to="/projects"
          className="mono text-quiet transition-colors duration-200 hover:text-ink"
        >
          ← Projects
        </Link>
        <p aria-hidden="true" className="mono text-faint">
          {caseInfo ? `Case ${pad(caseInfo.index)} / ${pad(caseInfo.total)}` : 'Case sheet'}
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
        <article className="mt-6 md:mt-10">
          <Reveal>
            <header className="border-t hairline pt-6 md:pt-8">
              <p className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-quiet">
                <span className="inline-flex items-center gap-2 text-seal">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-1.5 w-1.5 shrink-0 ${statusDot(project.status)}`}
                  />
                  {STATUS_LABEL[project.status]}
                </span>
                {project.featured && (
                  <>
                    <span aria-hidden="true" className="text-faint">/</span>
                    <span className="text-seal">Featured</span>
                  </>
                )}
                <span aria-hidden="true" className="text-faint">/</span>
                <span className="text-faint">
                  {caseInfo
                    ? `Case ${pad(caseInfo.index)} / ${pad(caseInfo.total)}`
                    : 'Case sheet'}
                </span>
              </p>

              <h1 className="mt-4 max-w-4xl text-balance break-words font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.98] tracking-[-0.02em] text-ink md:mt-5">
                {project.title}
              </h1>

              {summary && (
                <p className="mt-5 max-w-2xl text-pretty break-words text-[clamp(1.1rem,2vw,1.4rem)] leading-[1.5] text-quiet md:mt-6">
                  {summary}
                </p>
              )}

              {(project.url || event) && (
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 md:mt-8">
                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Visit live build — ${project.title} (opens in a new tab)`}
                      className="btn-primary"
                    >
                      Visit live build ↗
                    </a>
                  )}
                  {event && (
                    <Link
                      to={`/registrations/${encodeURIComponent(event.id)}`}
                      aria-label={`From event: ${event.title}`}
                      className="mono min-w-0 break-words text-quiet transition-colors duration-200 hover:text-ink"
                    >
                      From: {event.title} · {formatEventDate(event.starts_at)} →
                    </Link>
                  )}
                </div>
              )}
            </header>
          </Reveal>

          <Reveal delay={60}>
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y hairline py-5 md:mt-10 md:grid-cols-4 md:gap-y-6">
              <div className="min-w-0">
                <dt className="mono text-faint">Status</dt>
                <dd className="mt-1 flex items-start gap-2 text-sm text-ink">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 ${statusDot(project.status)}`}
                  />
                  {STATUS_LABEL[project.status]}
                </dd>
              </div>
              {project.author && (
                <div className="min-w-0">
                  <dt className="mono text-faint">Credit</dt>
                  <dd className="mt-1 break-words text-sm text-ink">{project.author}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="mono text-faint">Stack</dt>
                <dd className="mt-1 text-sm text-ink">
                  {project.stack.length > 0
                    ? `${pad(project.stack.length)} tools`
                    : 'Not listed'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="mono text-faint">Filed</dt>
                <dd className="mt-1 text-sm text-ink">Projects / 26—27</dd>
              </div>
            </dl>
          </Reveal>

          {project.cover_url && (
            <Reveal delay={90}>
              <figure className="mt-8 md:mt-10">
                <img
                  src={project.cover_url}
                  alt={`${project.title} project cover`}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  width={1600}
                  height={900}
                  className="aspect-video w-full border hairline object-cover"
                />
                <figcaption className="mono mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-faint">
                  <span className="min-w-0 break-words">Cover / {project.title}</span>
                  <span>{STATUS_LABEL[project.status]}</span>
                </figcaption>
              </figure>
            </Reveal>
          )}

          <div className="mt-8 grid gap-8 md:mt-12 md:grid-cols-12 md:gap-10">
            <div className="min-w-0 md:col-span-8 md:col-start-5 md:row-start-1 lg:col-span-7 lg:col-start-6">
              <Reveal>
                <section aria-labelledby="case-overview">
                  <h2 id="case-overview" className="mono text-quiet">
                    Overview
                  </h2>

                  {!hasDistinctDescription ? (
                    <p className="mt-4 max-w-xl text-[15px] leading-[1.7] text-quiet">
                      No extended write-up on file for this build.
                    </p>
                  ) : caseStructure ? (
                    <div className="mt-5">
                      {caseStructure.intro && (
                        <p className="max-w-2xl whitespace-pre-wrap break-words text-[17px] leading-[1.7] text-ink/85">
                          {caseStructure.intro}
                        </p>
                      )}
                      <div className="mt-6 space-y-7">
                        {caseStructure.sections.map((section, i) => (
                          <section key={`${section.label}-${i}`} className="border-t hairline pt-5">
                            <div className="grid gap-3 md:grid-cols-12 md:gap-6">
                              <h3 className="mono text-seal md:col-span-3">
                                {pad(i + 1)} / {section.label}
                              </h3>
                              <p className="whitespace-pre-wrap break-words text-[17px] leading-[1.7] text-ink/85 md:col-span-9">
                                {section.body}
                              </p>
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-[17px] leading-[1.7] text-ink/85">
                      {description}
                    </p>
                  )}
                </section>
              </Reveal>
            </div>

            <aside
              aria-label="Project record"
              className="min-w-0 md:col-span-4 md:col-start-1 md:row-start-1 lg:col-span-3"
            >
              <div className="border-t hairline pt-4">
                <h2 className="mono text-faint">Tech stack</h2>
                {project.stack.length > 0 ? (
                  <ul aria-label="Tech stack" className="mt-3 flex flex-wrap gap-2">
                    {project.stack.map((s) => (
                      <li
                        key={s}
                        className="mono max-w-full break-words border hairline px-2.5 py-1 text-quiet"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-quiet">No stack listed for this build.</p>
                )}
              </div>

              <div className="mt-8 border-t hairline pt-4">
                <h2 className="mono text-faint">Record</h2>
                <p className="mono-sm mt-2 break-all text-ink">{project.id}</p>
                <p className="mono mt-3 text-faint">
                  {caseInfo
                    ? `Case ${pad(caseInfo.index)} of ${pad(caseInfo.total)}`
                    : 'Case sheet'}
                </p>
              </div>

              <div className="mt-8 border-t hairline pt-4">
                <h2 className="mono text-faint">Index</h2>
                <Link
                  to="/projects"
                  className="mt-2 inline-block text-sm text-quiet transition-colors duration-200 hover:text-ink"
                >
                  All projects →
                </Link>
              </div>
            </aside>
          </div>

          <div className="mt-12 border-t hairline pt-5 md:mt-16">
            <Link
              to="/projects"
              className="mono text-quiet transition-colors duration-200 hover:text-ink"
            >
              ← All projects
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}
