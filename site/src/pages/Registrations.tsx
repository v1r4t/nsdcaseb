import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, eventDateParts, formatEventDate, formatEventTimeRange, listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useAuth } from '../lib/auth';
import { posterSources } from '../lib/image-variants';
import StatusDot from '../components/StatusDot';
import Reveal from '../components/Reveal';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { SectionIndex } from '../../../design/primitives/SectionIndex';

function dateParts(iso: string): { day: string; mon: string; year: string } | null {
  return eventDateParts(iso);
}

function timeRange(starts: string, ends: string): string {
  return formatEventTimeRange(starts, ends);
}

/** Hairline event row. Kept custom (not kit Row) so the title stays an h3 and
 *  spans the full width on phones, as the mobile-layout regression expects. */
function EventRow({ event }: { event: EventSummary }) {
  const parts = dateParts(event.starts_at);
  const range = timeRange(event.starts_at, event.ends_at);

  return (
    <li>
      <Link
        to={`/registrations/${encodeURIComponent(event.id)}`}
        data-cursor="VIEW EVENT →"
        className="group relative grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b hairline py-5 transition-colors duration-200 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-3"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -inset-x-1 border border-transparent transition-colors duration-200 group-hover:border-ink/35 group-focus-visible:border-ink/35"
        />
        {/* Phones: date + status share the top line, title gets the full width. */}
        <div aria-hidden="true" className="relative col-start-1 row-start-1 w-16 shrink-0 leading-none sm:w-auto">
          {parts ? (
            <>
              <time dateTime={event.starts_at} className="mono block text-ink">
                {parts.day} {parts.mon}
              </time>
              <span className="mono mt-1 block text-faint">{parts.year}</span>
            </>
          ) : (
            <span className="mono block text-quiet">TBD</span>
          )}
        </div>
        <div className="relative col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <h3 className="font-display text-[clamp(1.15rem,2vw,1.6rem)] font-normal leading-tight text-ink transition-colors duration-200 group-hover:text-seal">
            {event.title}
          </h3>
          {range && <p className="mono mt-1 text-quiet">{range}</p>}
        </div>
        <div className="relative col-start-2 row-start-1 flex shrink-0 flex-col items-end gap-2 justify-self-end sm:col-start-3 sm:row-start-1">
          <StatusDot event={event} />
          <span
            aria-hidden="true"
            className="mono hidden text-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline"
          >
            View event →
          </span>
        </div>
      </Link>
    </li>
  );
}

function FeaturedNext({ event }: { event: EventSummary }) {
  const [variantFailed, setVariantFailed] = useState(false);
  const poster = posterSources(event.poster_url, event.poster_variants);
  const range = timeRange(event.starts_at, event.ends_at);

  useEffect(() => {
    setVariantFailed(false);
  }, [event.id, event.poster_url, event.poster_variants?.thumb]);
  const cta = event.mine?.status === 'registered' || event.mine?.status === 'waitlisted'
    ? 'View registration →'
    : event.registration_open
      ? 'Register →'
      : 'View event →';
  return (
    <section aria-label="Next event" className="mt-10">
      <div className="flex items-baseline justify-between gap-4 sm:justify-start sm:gap-8">
        <p className="mono text-quiet">Next up</p>
        <StatusDot event={event} />
      </div>
      <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-start">
        <div className="min-w-0">
          <p className="mono text-faint">
            {formatEventDate(event.starts_at)}
            {range ? ` / ${range}` : ''}
          </p>
          <h2 className="statement-sm mt-3 text-ink">{event.title}</h2>
          <Link
            to={`/registrations/${encodeURIComponent(event.id)}`}
            data-cursor="VIEW EVENT →"
            className="link mt-5 inline-block text-sm"
          >
            {cta}
          </Link>
        </div>
        {poster && (
          <img
            key={variantFailed ? 'poster-original' : 'poster-variants'}
            src={poster.src}
            srcSet={variantFailed ? undefined : poster.srcSet}
            sizes="(max-width: 640px) 100vw, 288px"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onError={() => {
              if (poster.srcSet) setVariantFailed(true);
            }}
            className="h-44 w-full border hairline object-cover sm:h-52"
          />
        )}
      </div>
    </section>
  );
}

function Group({
  id,
  label,
  count,
  events,
  empty,
  dimmed,
}: {
  id?: string;
  label: string;
  count: number;
  events: EventSummary[];
  empty: string;
  dimmed?: boolean;
}) {
  return (
    <section aria-label={label} id={id} className="mt-12 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="mono text-quiet">{label}</h2>
        <span aria-hidden="true" className="mono text-faint">
          {String(count).padStart(2, '0')}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="mono mt-3 border-t hairline py-8 text-quiet">{empty}</p>
      ) : (
        <ul className={`mt-3 border-t hairline ${dimmed ? 'opacity-60' : ''}`}>
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Registrations() {
  useDocumentMeta({
    title: 'Events — NSDC',
    description:
      'Talks, workshops and competitions from NSDC at Amrita Bengaluru. See what is upcoming, register, or check your registration status.',
  });
  const { user } = useAuth();
  const location = useLocation();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listEvents()
      .then((res) => {
        if (active) setEvents(res.events);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError && err.error === 'network_error'
              ? 'Could not reach the server. Check your connection and try again.'
              : 'Could not load events. Please try again.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const { upcoming, archive, archiveByYear } = useMemo(() => {
    const now = Date.now();
    const up: EventSummary[] = [];
    const arch: EventSummary[] = [];
    for (const e of events ?? []) {
      const t = new Date(e.starts_at).getTime();
      if (!Number.isNaN(t) && t > now) up.push(e);
      else arch.push(e);
    }
    up.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    arch.sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
    const byYear = new Map<string, EventSummary[]>();
    for (const e of arch) {
      const year = dateParts(e.starts_at)?.year ?? String(new Date(e.starts_at).getFullYear());
      const list = byYear.get(year);
      if (list) list.push(e);
      else byYear.set(year, [e]);
    }
    const years = [...byYear.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
    return { upcoming: up, archive: arch, archiveByYear: years };
  }, [events]);

  return (
    <div className="wrap py-12 md:py-16">
      <Reveal>
        <header className="border-b hairline pb-8 md:pb-10">
          <div className="grid gap-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <p className="mono text-quiet">01 / Index</p>
              <h1 className="mt-4 font-display text-[clamp(3.25rem,9vw,7rem)] leading-[0.9] tracking-tight text-ink">
                Events
              </h1>
            </div>
            <div className="md:col-span-3 md:col-start-10 md:justify-self-end">
              <SectionIndex value="01" className="hidden md:block" />
            </div>
          </div>
          {events !== null && (
            <p aria-live="polite" className="mono mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-quiet">
              <span>
                Upcoming <span className="text-ink">{String(upcoming.length).padStart(2, '0')}</span>
              </span>
              <span aria-hidden="true">/</span>
              <span>
                Archive <span className="text-ink">{String(archive.length).padStart(2, '0')}</span>
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
      {!error && events === null && (
        <div aria-live="polite" aria-busy="true" className="mt-12">
          <p className="mono text-quiet">Loading events…</p>
          {/* Skeleton reserves ~the list area (6 rows + hairlines) so the rows
              popping in don't shift layout. Same rhythm as Group below. */}
          <div aria-hidden="true" className="mt-4 min-h-[480px] animate-pulse border-t hairline">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 border-b hairline py-5"
              >
                <div className="h-3 w-14 bg-quiet/15" />
                <div className="min-w-0">
                  <div className="h-5 w-3/4 bg-quiet/15" />
                  <div className="mt-2 h-3 w-1/3 bg-quiet/15" />
                </div>
                <div className="h-3 w-16 bg-quiet/15" />
              </div>
            ))}
          </div>
        </div>
      )}

      {events !== null && !error && (
        <>
          {upcoming.length > 0 && <FeaturedNext event={upcoming[0]} />}
          <Group label="Upcoming" count={upcoming.length} events={upcoming} empty="No upcoming events" />
          {!user && (
            <p className="mono mt-8 text-quiet">
              <Link to="/login" state={{ from: location }} className="link mono">
                Sign in to register
              </Link>
            </p>
          )}
          <section aria-label="Archive" id="archive" className="mt-12 scroll-mt-24">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="mono text-quiet">Archive</h2>
              <span aria-hidden="true" className="mono text-faint">
                {String(archive.length).padStart(2, '0')}
              </span>
            </div>
            {archive.length === 0 ? (
              <p className="mono mt-3 border-t hairline py-8 text-quiet">
                Nothing in the archive yet
              </p>
            ) : (
              archiveByYear.map(([year, yearEvents]) => (
                <div key={year} className="mt-8 first:mt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="mono text-ink">{year}</h3>
                    <span aria-hidden="true" className="mono text-faint">
                      {String(yearEvents.length).padStart(2, '0')}
                    </span>
                  </div>
                  <ul className="mt-3 border-t hairline">
                    {yearEvents.map((e) => (
                      <EventRow key={e.id} event={e} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
