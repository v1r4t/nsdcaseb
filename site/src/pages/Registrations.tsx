import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, eventDateParts, formatEventDate, formatEventTimeRange, listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useAuth } from '../lib/auth';
import { posterSources } from '../lib/image-variants';
import StatusDot from '../components/StatusDot';
import Reveal from '../components/Reveal';

function dateParts(iso: string): { day: string; mon: string; year: string } | null {
  return eventDateParts(iso);
}

function timeRange(starts: string, ends: string): string {
  return formatEventTimeRange(starts, ends);
}

function Row({ event }: { event: EventSummary }) {
  const parts = dateParts(event.starts_at);
  const range = timeRange(event.starts_at, event.ends_at);
  return (
    <li>
      <Link
        to={`/registrations/${encodeURIComponent(event.id)}`}
        data-cursor="VIEW EVENT →"
        className="group grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2 border-t border-line py-5 transition-colors duration-200 hover:bg-paper/[0.025] sm:flex sm:gap-8 sm:px-3"
      >
        {/* Phones: date + status share the top line, title gets the full width. */}
        <div aria-hidden="true" className="col-start-1 row-start-1 w-14 shrink-0 font-mono leading-none">
          {parts ? (
            <>
              <span className="block text-sm text-paper">
                {parts.day} {parts.mon}
              </span>
              <span className="mt-1 block text-[11px] text-muted">{parts.year}</span>
            </>
          ) : (
            <span className="block text-sm text-muted">TBD</span>
          )}
        </div>
        <div className="col-span-2 row-start-2 min-w-0 sm:flex-1">
          <h3 className="font-display text-lg font-medium leading-snug text-paper transition-colors duration-200 group-hover:text-signal sm:text-xl">
            {event.title}
          </h3>
          {range && <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">{range}</p>}
        </div>
        <div className="col-start-2 row-start-1 flex shrink-0 flex-col items-end gap-2 justify-self-end">
          <StatusDot event={event} />
          <span
            aria-hidden="true"
            className="hidden font-mono text-[11px] uppercase tracking-wide text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline"
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
    <section aria-label="Next event" className="mt-12 border border-line p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="min-w-0 truncate font-mono text-[11px] uppercase tracking-wide text-muted">
          Next up
        </h2>
        <StatusDot event={event} />
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {poster && (
          <img
            key={variantFailed ? 'poster-original' : 'poster-variants'}
            src={poster.src}
            srcSet={variantFailed ? undefined : poster.srcSet}
            sizes="(max-width: 640px) 100vw, 176px"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onError={() => {
              if (poster.srcSet) setVariantFailed(true);
            }}
            className="h-32 w-full border border-line object-cover sm:h-28 sm:w-44 sm:shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
            {formatEventDate(event.starts_at)}
            {range ? ` / ${range}` : ''}
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold leading-tight text-paper sm:text-3xl">
            {event.title}
          </h3>
          <Link
            to={`/registrations/${encodeURIComponent(event.id)}`}
            data-cursor="VIEW EVENT →"
            className="link mt-3 inline-block text-sm"
          >
            {cta}
          </Link>
        </div>
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
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</h2>
        <span aria-hidden="true" className="font-mono text-[11px] text-muted">
          {String(count).padStart(2, '0')}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="border-t border-line py-8 font-mono text-xs uppercase tracking-wide text-muted">{empty}</p>
      ) : (
        <ul className={dimmed ? 'opacity-60' : undefined}>
          {events.map((e) => (
            <Row key={e.id} event={e} />
          ))}
          {/* Closing hairline for the last row */}
          <li aria-hidden="true" className="border-t border-line" />
        </ul>
      )}
    </section>
  );
}

export default function Registrations() {
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
    <div className="shell py-12 md:py-16">
      <Reveal>
        <p className="label">01 / Index</p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight text-paper sm:text-6xl">
          EVENTS
        </h1>
        {events !== null && (
          <p aria-live="polite" className="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted">
            Upcoming {String(upcoming.length).padStart(2, '0')}
            <span aria-hidden="true" className="mx-3">
              /
            </span>
            Archive {String(archive.length).padStart(2, '0')}
          </p>
        )}
      </Reveal>

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-8 text-sm">
          {error}
        </p>
      )}
      {!error && events === null && (
        <div aria-live="polite" aria-busy="true" className="mt-12">
          <p className="font-mono text-xs uppercase tracking-wide text-muted">Loading events…</p>
          {/* Skeleton reserves ~the list area (6 rows + hairlines) so the rows
              popping in don't shift layout. Same shell rhythm (mt-12 section,
              border-t hairline, py-5 rows) as Group below. */}
          <div aria-hidden="true" className="mt-4 min-h-[480px] animate-pulse border-t border-line">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2 border-b border-line py-5 sm:flex sm:gap-8 sm:px-3"
              >
                <div className="col-start-1 row-start-1 h-8 w-14 shrink-0 bg-line" />
                <div className="col-span-2 row-start-2 min-w-0 sm:flex-1">
                  <div className="h-5 w-3/4 bg-line" />
                  <div className="mt-2 h-3 w-1/3 bg-line" />
                </div>
                <div className="col-start-2 row-start-1 h-4 w-16 shrink-0 justify-self-end bg-line" />
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
            <p className="mt-8 font-mono text-[11px] uppercase tracking-wide text-muted">
              <Link to="/login" state={{ from: location }} className="link font-mono text-[11px] uppercase">
                Sign in to register
              </Link>
            </p>
          )}
          <section aria-label="Archive" id="archive" className="mt-12 scroll-mt-24">
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-wide text-muted">Archive</h2>
              <span aria-hidden="true" className="font-mono text-[11px] text-muted">
                {String(archive.length).padStart(2, '0')}
              </span>
            </div>
            {archive.length === 0 ? (
              <p className="border-t border-line py-8 font-mono text-xs uppercase tracking-wide text-muted">
                Nothing in the archive yet
              </p>
            ) : (
              archiveByYear.map(([year, yearEvents]) => (
                <div key={year} className="mt-8 first:mt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="min-w-0 truncate font-mono text-[11px] uppercase tracking-wide text-paper/80">
                      {year}
                    </h3>
                    <span aria-hidden="true" className="shrink-0 font-mono text-[11px] text-muted">
                      {String(yearEvents.length).padStart(2, '0')}
                    </span>
                  </div>
                  <ul>
                    {yearEvents.map((e) => (
                      <Row key={e.id} event={e} />
                    ))}
                    {/* Closing hairline for the last row */}
                    <li aria-hidden="true" className="border-t border-line" />
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
