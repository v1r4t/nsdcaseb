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

const STATUS_LABEL: Record<Project['status'], string> = {
  active: 'Active build',
  shipped: 'Shipped',
  archived: 'Archived',
};

/** Small solid marker; the three tones are the whole kit. */
function statusDot(status: Project['status']): string {
  if (status === 'active') return 'bg-seal';
  if (status === 'shipped') return 'bg-ink';
  return 'bg-faint';
}

// TODO(cover-variants): cover_url is a full-size original with no resized
// derivatives. When a variant pipeline lands, the expected convention is a
// width-suffixed derivative (e.g. `?width=800` / `-800w` key) with 480w / 800w
// candidates. Until then return the original as the only source — never invent
// variant URLs that would 404.
function coverSources(url: string): { src: string; srcSet: string | undefined } {
  return { src: url, srcSet: undefined };
}

// Covers span full width below md, roughly half the row above it.
const COVER_SIZES = '(max-width: 768px) 100vw, 46vw';

function StackTokens({ stack }: { stack: string[] }) {
  if (stack.length === 0) return null;
  return (
    <ul aria-label="Tech stack" className="mt-5 flex flex-wrap gap-2">
      {stack.map((s) => (
        <li
          key={s}
          className="mono max-w-full break-words border border-[color:var(--hairline)] px-2 py-1 text-quiet"
        >
          {s}
        </li>
      ))}
    </ul>
  );
}

function EventLink({
  event,
  className = '',
}: {
  event: EventSummary | undefined;
  className?: string;
}) {
  if (!event) return null;
  return (
    <Link
      to={`/registrations/${encodeURIComponent(event.id)}`}
      aria-label={`From: ${event.title}`}
      className={`text-quiet transition-colors duration-200 hover:text-ink ${className}`}
    >
      From: {event.title} →
    </Link>
  );
}

function Cover({
  project,
  priority = false,
}: {
  project: Project;
  priority?: boolean;
}) {
  const cover = project.cover_url ? coverSources(project.cover_url) : null;
  if (!cover) return null;
  return (
    <img
      src={cover.src}
      srcSet={cover.srcSet}
      sizes={COVER_SIZES}
      alt={`${project.title} project cover`}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      width={800}
      height={600}
      className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-ink group-hover:scale-[1.02] motion-reduce:transform-none"
    />
  );
}

/**
 * The lead case study: the first screen after the masthead. One project, given
 * the room a case sheet deserves — a serif headline, the real summary, a ruled
 * metadata row, a large cover and one clear path into the detail page.
 */
function LeadCase({
  project,
  total,
  event,
}: {
  project: Project;
  total: number;
  event: EventSummary | undefined;
}) {
  const href = `/projects/${encodeURIComponent(project.id)}`;
  const hasCover = Boolean(project.cover_url);
  return (
    <article
      aria-labelledby={`lead-${project.id}`}
      className="mt-8 border-t hairline pt-6 md:mt-12 md:pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-quiet">
          <span className="inline-flex items-center gap-2 text-seal">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-seal" />
            Featured case study
          </span>
          <span aria-hidden="true" className="text-faint">/</span>
          <span className="text-faint">
            {pad(1)} / {pad(total)}
          </span>
        </p>
        <p className="mono flex items-center gap-2 text-quiet">
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 shrink-0 ${statusDot(project.status)}`}
          />
          {STATUS_LABEL[project.status]}
        </p>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-12 md:items-start md:gap-8">
        <div className={`min-w-0 ${hasCover ? 'md:col-span-6' : 'md:col-span-9'}`}>
          <h2
            id={`lead-${project.id}`}
            className="max-w-2xl text-balance break-words font-display text-[clamp(2rem,5.2vw,3.75rem)] leading-[1.02] tracking-tight text-ink"
          >
            <Link to={href} className="transition-colors duration-200 hover:text-seal">
              {project.title}
            </Link>
          </h2>
          {project.summary && (
            <p className="mt-4 max-w-xl text-pretty break-words text-[17px] leading-[1.65] text-quiet md:text-lg">
              {project.summary}
            </p>
          )}

          <StackTokens stack={project.stack} />

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t hairline pt-4 sm:grid-cols-3">
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
            {event && (
              <div className="min-w-0">
                <dt className="mono text-faint">Filed from</dt>
                <dd className="mt-1 break-words text-sm text-ink">{event.title}</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link to={href} className="btn-primary">
              Read the case sheet →
            </Link>
            {project.url && (
              <a
                href={project.url}
                target="_blank"
                rel="noopener"
                aria-label={`Visit ${project.title} (opens in a new tab)`}
                className="link text-sm"
              >
                Visit live ↗
              </a>
            )}
          </div>
        </div>

        {hasCover && (
          <div className="md:col-span-5 md:col-start-8">
            <Link
              to={href}
              aria-label={`${project.title} — case sheet`}
              className="group block border hairline"
            >
              <Cover project={project} priority />
              <span className="mono flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t hairline px-3 py-2 text-faint">
                <span className="mono min-w-0 break-words">
                Cover / {project.title}
              </span>
                <span aria-hidden="true">{pad(project.stack.length)} tools</span>
              </span>
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

/** Alternating editorial card for any featured project after the lead. */
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
  const hasCover = Boolean(project.cover_url);
  const textCols = hasCover
    ? even
      ? 'md:col-span-6 md:col-start-7'
      : 'md:col-span-6'
    : 'md:col-span-9';
  const imageCols = even
    ? 'md:col-span-5 md:col-start-1 md:row-start-1'
    : 'md:col-span-5 md:col-start-8';
  const href = `/projects/${encodeURIComponent(project.id)}`;
  return (
    <div className="grid gap-6 border-t hairline py-8 md:grid-cols-12 md:gap-8 md:py-12">
      <div className={`min-w-0 ${textCols}`}>
        <p aria-hidden="true" className="mono flex flex-wrap items-baseline gap-x-4 gap-y-2 text-faint">
          <span>{pad(index + 1)}</span>
          <span className="inline-flex items-baseline gap-2 text-seal">
            <span className="h-px w-5 translate-y-[-0.2em] bg-seal" />
            Featured
          </span>
        </p>
        <h3 className="mt-4 text-balance break-words font-display text-[clamp(1.8rem,3.2vw,2.75rem)] leading-[1.04] tracking-tight text-ink">
          <Link to={href} className="transition-colors duration-200 hover:text-seal">
            {project.title}
          </Link>
        </h3>
        {project.summary && (
          <p className="mt-4 max-w-xl break-words text-[17px] leading-relaxed text-quiet">
            {project.summary}
          </p>
        )}
        <StackTokens stack={project.stack} />
        {project.author && <p className="mono mt-4 text-quiet">{project.author}</p>}
        <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Link to={href} className="link text-sm">
            Read the case sheet →
          </Link>
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener"
              aria-label={`Visit ${project.title} (opens in a new tab)`}
              className="text-sm text-seal underline decoration-seal/40 underline-offset-4 transition-colors hover:decoration-seal"
            >
              Visit live ↗
            </a>
          )}
          <EventLink event={event} className="min-w-0 break-words text-sm" />
        </div>
      </div>
      {hasCover && (
        <div className={imageCols}>
          <Link
            to={href}
            aria-label={`${project.title} — case sheet`}
            className="group block border hairline"
          >
            <Cover project={project} />
            <span className="mono flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t hairline px-3 py-2 text-faint">
              <span>Case / {pad(index + 1)}</span>
              <span aria-hidden="true">{STATUS_LABEL[project.status]}</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * One row in the full index. Kept compact and ruled so the complete list reads
 * as the page's register, not as a second set of cards.
 */
function IndexRow({
  project,
  index,
  featured,
  event,
}: {
  project: Project;
  index: number;
  featured: boolean;
  event: EventSummary | undefined;
}) {
  const href = `/projects/${encodeURIComponent(project.id)}`;
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-5 md:grid-cols-[3rem_minmax(0,1fr)_16rem] md:items-baseline md:gap-x-6">
      <span aria-hidden="true" className="mono pt-1 text-faint">
        {pad(index)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            to={href}
            className="break-words font-display text-xl leading-tight text-ink transition-colors duration-200 hover:text-seal md:text-2xl"
          >
            {project.title}
          </Link>
          {featured && <span className="mono text-seal">Featured</span>}
        </div>
        {project.summary && (
          <p className="mt-1.5 line-clamp-2 max-w-xl text-sm leading-relaxed text-quiet">
            {project.summary}
          </p>
        )}
        {project.stack.length > 0 && (
          <p className="mono mt-2 break-words text-faint">{project.stack.join(' · ')}</p>
        )}
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-2 md:col-start-3 md:justify-end">
        <span className="mono flex items-center gap-2 text-quiet">
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 shrink-0 ${statusDot(project.status)}`}
          />
          {STATUS_LABEL[project.status]}
        </span>
        {project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noopener"
            aria-label={`Visit ${project.title} (opens in a new tab)`}
            className="mono text-seal underline decoration-seal/40 underline-offset-4 transition-colors hover:decoration-seal"
          >
            Live ↗
          </a>
        )}
        <EventLink event={event} className="min-w-0 break-words text-sm" />
        <Link
          to={href}
          aria-label={`${project.title} — case sheet`}
          className="mono text-ink transition-colors duration-200 hover:text-seal"
        >
          Case sheet →
        </Link>
      </div>
    </div>
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

  const featuredIds = useMemo(() => new Set(featured.map((p) => p.id)), [featured]);
  const secondary = featured.slice(1);

  const eventFor = (p: Project): EventSummary | undefined =>
    p.event_id && eventsById ? eventsById.get(p.event_id) : undefined;

  const hasProjects = projects !== null && projects.length > 0;
  const hasFiltered = hasProjects && filtered.length > 0;

  return (
    <div className="wrap py-8 md:py-16">
      <Reveal>
        <header className="border-b hairline pb-6 md:pb-10">
          <div className="grid gap-8 md:grid-cols-12 md:items-end">
            <div className="min-w-0 md:col-span-8">
              <p className="mono text-quiet">Projects / 26—27</p>
              <h1 className="mt-3 font-display text-[clamp(3.25rem,9vw,7rem)] leading-[0.9] tracking-tight text-ink md:mt-4">
                Projects
              </h1>
              <p className="mt-4 max-w-xl text-pretty text-[17px] leading-[1.7] text-quiet md:mt-5">
                A working index of student-built systems — what the club is building now,
                and what it has already shipped.
              </p>
            </div>
            <div className="w-full md:col-span-3 md:col-start-10 md:w-auto md:justify-self-end">
              <SectionIndex value="03" className="hidden md:block" />
              {projects !== null && (
                <dl
                  aria-live="polite"
                  className="mt-5 grid grid-cols-3 gap-x-4 border-t hairline pt-4 md:mt-6 md:grid-cols-1 md:gap-y-3"
                >
                  <div className="md:flex md:items-baseline md:justify-between md:gap-4">
                    <dt className="mono text-faint">Active</dt>
                    <dd className="mt-1 font-mono text-xl leading-none text-ink md:mt-0">
                      {pad(counts.active)}
                    </dd>
                  </div>
                  <div className="md:flex md:items-baseline md:justify-between md:gap-4">
                    <dt className="mono text-faint">Shipped</dt>
                    <dd className="mt-1 font-mono text-xl leading-none text-ink md:mt-0">
                      {pad(counts.shipped)}
                    </dd>
                  </div>
                  <div className="md:flex md:items-baseline md:justify-between md:gap-4">
                    <dt className="mono text-faint">All</dt>
                    <dd className="mt-1 font-mono text-xl leading-none text-ink md:mt-0">
                      {pad(projects.length)}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
          {hasProjects && (
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 md:mt-8">
              <p className="mono text-faint">Case studies first, full index below.</p>
              {hasFiltered && (
                <a
                  href="#all-projects"
                  className="mono text-quiet transition-colors duration-200 hover:text-ink"
                >
                  All projects ↓
                </a>
              )}
            </div>
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

      {!error && hasProjects && (
        <>
          {stacks.length > 0 && (
            <div className="mt-5 md:mt-8">
              <p className="mono text-faint">Filter / stack</p>
              <div
                role="group"
                aria-label="Filter by stack"
                className="-mx-6 mt-1 flex gap-2 overflow-x-auto px-6 py-2 [scrollbar-width:none] md:mx-0 md:mt-2 md:flex-wrap md:overflow-visible md:px-0 md:py-0 [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  aria-pressed={activeStack === null}
                  onClick={() => setActiveStack(null)}
                  className={`mono inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[2px] border px-3 py-2 transition-colors duration-200 md:min-h-0 md:min-w-0 md:py-1.5 ${
                    activeStack === null
                      ? 'border-seal text-seal'
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
                    className={`mono inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[2px] border px-3 py-2 transition-colors duration-200 md:min-h-0 md:min-w-0 md:py-1.5 ${
                      activeStack === s
                        ? 'border-seal text-seal'
                        : 'border-[color:var(--hairline)] text-quiet hover:border-ink/40 hover:text-ink'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="mt-10 border-t hairline py-8">
              <p className="text-sm text-quiet">No projects use this stack yet.</p>
              <button
                type="button"
                onClick={() => setActiveStack(null)}
                className="link mono mt-4 inline-block"
              >
                Show all projects →
              </button>
            </div>
          ) : (
            <>
              <Reveal>
                <LeadCase
                  key={featured[0].id}
                  project={featured[0]}
                  total={filtered.length}
                  event={eventFor(featured[0])}
                />
              </Reveal>

              {secondary.length > 0 && (
                <ol
                  aria-label="More featured projects"
                  className="mt-10 border-b hairline md:mt-14"
                >
                  {secondary.map((project, i) => (
                    <Reveal as="li" key={project.id} delay={Math.min(i, 4) * 60}>
                      <FeaturedCard
                        project={project}
                        index={i + 1}
                        event={eventFor(project)}
                      />
                    </Reveal>
                  ))}
                </ol>
              )}

              <section
                id="all-projects"
                aria-labelledby="all-projects-title"
                className="mt-14 scroll-mt-24 border-t hairline pt-6 md:mt-20 md:pt-8"
              >
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <p className="mono text-faint">The index</p>
                    <h2 id="all-projects-title" className="statement-sm mt-2 text-ink">
                      All projects
                    </h2>
                  </div>
                  <p className="mono text-quiet">
                    {pad(filtered.length)} {filtered.length === 1 ? 'work' : 'works'}
                    {activeStack && (
                      <>
                        <span aria-hidden="true"> / </span>
                        {activeStack}
                      </>
                    )}
                  </p>
                </div>
                <ol aria-label="All projects" className="mt-4 border-t hairline md:mt-6">
                  {filtered.map((project, i) => (
                    <Reveal
                      as="li"
                      key={project.id}
                      delay={Math.min(i, 4) * 40}
                      className="border-b hairline"
                    >
                      <IndexRow
                        project={project}
                        index={i + 1}
                        featured={featuredIds.has(project.id)}
                        event={eventFor(project)}
                      />
                    </Reveal>
                  ))}
                </ol>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
