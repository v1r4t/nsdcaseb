import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { useAuth } from '../lib/auth';

function formatRange(starts: string, ends: string): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return `${new Date(starts).toLocaleString(undefined, opts)} – ${new Date(ends).toLocaleString(undefined, opts)}`;
  } catch {
    return `${starts} – ${ends}`;
  }
}

function spotsLabel(event: EventSummary): string {
  if (event.capacity === null) return 'Open capacity';
  return `${event.spots_left ?? 0} of ${event.capacity} spots left`;
}

function Card({ event, authed, from }: { event: EventSummary; authed: boolean; from: string }) {
  const status = event.mine?.status ?? null;
  return (
    <article className="card" aria-label={event.title}>
      <h3 className="font-display text-base font-semibold text-white">{event.title}</h3>
      <p className="mt-1 text-xs text-white/50">{formatRange(event.starts_at, event.ends_at)}</p>
      <p className="mt-1 text-xs text-white/60">{spotsLabel(event)}</p>
      <div className="mt-4">
        {status === 'registered' ? (
          <span className="text-sm font-medium text-neon">Registered ✓</span>
        ) : status === 'waitlisted' ? (
          <span className="text-sm font-medium text-amber-300">Waitlisted — you’re on the list</span>
        ) : !event.registration_open ? (
          <span className="text-sm text-white/50">Closed</span>
        ) : authed ? (
          <Link to={`/events/${encodeURIComponent(event.id)}`} state={{ from }} className="btn-primary">
            Register
          </Link>
        ) : (
          <Link to="/login" state={{ from }} className="btn-ghost">
            Sign in to register
          </Link>
        )}
        {!status && (
          <Link to={`/events/${encodeURIComponent(event.id)}`} className="link ml-4 text-sm">
            Details
          </Link>
        )}
      </div>
    </article>
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
          setError(err instanceof ApiError && err.error === 'network_error'
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Could not load events. Please try again.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const from = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-white">Registrations</h1>
      <p className="mt-1 text-sm text-white/60">Workshops, meetups and hack nights — reserve your seat.</p>
      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-4">
          {error}
        </p>
      )}
      {!error && events === null && (
        <p aria-live="polite" className="mt-6 text-sm text-white/60">Loading events…</p>
      )}
      {events !== null && (
        <>
          <section aria-label="Open now" className="mt-8">
            <h2 className="font-display text-lg font-semibold text-white">Open now</h2>
            {events.filter((e) => e.registration_open).length === 0 ? (
              <p className="mt-3 text-sm text-white/50">No registrations are open right now. Check back soon.</p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {events.filter((e) => e.registration_open).map((e) => (
                  <Card key={e.id} event={e} authed={!!user} from={from} />
                ))}
              </div>
            )}
          </section>
          <section aria-label="Upcoming and past" className="mt-10">
            <h2 className="font-display text-lg font-semibold text-white">Upcoming &amp; past</h2>
            {events.filter((e) => !e.registration_open).length === 0 ? (
              <p className="mt-3 text-sm text-white/50">Nothing in the archive yet.</p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {events.filter((e) => !e.registration_open).map((e) => (
                  <Card key={e.id} event={e} authed={!!user} from={from} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
