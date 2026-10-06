import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useAuth } from '../lib/auth';
import StatusDot from '../components/StatusDot';
import Reveal from '../components/Reveal';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function dateParts(iso: string): { day: string; mon: string; year: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: String(d.getDate()).padStart(2, '0'),
    mon: MONTHS[d.getMonth()] ?? '',
    year: String(d.getFullYear()),
  };
}

function timeRange(starts: string, ends: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  try {
    const s = new Date(starts);
    const e = new Date(ends);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
    return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)}`;
  } catch {
    return '';
  }
}

function Row({ event }: { event: EventSummary }) {
  const parts = dateParts(event.starts_at);
  const range = timeRange(event.starts_at, event.ends_at);
  return (
    <li>
      <Link
        to={`/events/${encodeURIComponent(event.id)}`}
        className="group flex items-baseline gap-5 border-t border-line py-5 transition-colors duration-200 hover:bg-paper/[0.025] sm:gap-8 sm:px-3"
      >
        <div aria-hidden="true" className="w-14 shrink-0 font-mono leading-none">
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
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-medium leading-snug text-paper transition-colors duration-200 group-hover:text-signal sm:text-xl">
            {event.title}
          </h3>
          {range && <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">{range}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusDot event={event} />
          <span
            aria-hidden="true"
            className="font-mono text-[11px] uppercase tracking-wide text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            View event →
          </span>
        </div>
      </Link>
    </li>
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

  const { upcoming, archive } = useMemo(() => {
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
    return { upcoming: up, archive: arch };
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
        <p aria-live="polite" className="mt-8 font-mono text-xs uppercase tracking-wide text-muted">
          Loading events…
        </p>
      )}

      {events !== null && !error && (
        <>
          <Group label="Upcoming" count={upcoming.length} events={upcoming} empty="No upcoming events" />
          {!user && (
            <p className="mt-8 font-mono text-[11px] uppercase tracking-wide text-muted">
              <Link to="/login" state={{ from: location }} className="link font-mono text-[11px] uppercase">
                Sign in to register
              </Link>
            </p>
          )}
          <Group
            id="archive"
            label="Archive"
            count={archive.length}
            events={archive}
            empty="Nothing in the archive yet"
            dimmed
          />
        </>
      )}
    </div>
  );
}
