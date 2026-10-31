import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import IndexStage from './IndexStage';
import type { IndexStageItem } from './IndexStage';
import StatusDot from './StatusDot';
import {
  ApiError,
  formatEventDate,
  formatEventTimeRange,
  listEvents,
} from '../lib/events';
import type { EventSummary } from '../lib/events';

/**
 * EVENTS — landing index + stage.
 *
 * Index: IST date, title, and the shared StatusDot label (OPEN, FILLING FAST,
 * FULL, CLOSED, REGISTERED, WAITLISTED). The stage repeats the date and time range,
 * the status, the description, any real seat count, and the link to the event's
 * registration page. The events API exposes no venue or location field, so
 * none is shown rather than inventing one.
 */
export default function LandingEvents() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listEvents()
      .then((res) => {
        if (active) setEvents(res.events);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.error === 'network_error'
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Could not load events. Please try again.',
        );
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div>
        <p role="alert" aria-live="assertive" className="text-sm text-seal">
          {error}
        </p>
        <p className="mt-8 border-t hairline pt-4">
          <Link
            to="/registrations"
            className="mono text-quiet transition-colors duration-200 hover:text-seal"
          >
            All registrations →
          </Link>
        </p>
      </div>
    );
  }

  if (events === null) return null;

  if (events.length === 0) {
    return <p className="text-sm text-quiet">No events listed right now — check back soon.</p>;
  }

  const shown = events.slice(0, 3);

  const items: IndexStageItem[] = shown.map((event) => ({
    id: event.id,
    index: formatEventDate(event.starts_at),
    title: event.title,
    meta: <StatusDot event={event} />,
    href: `/registrations/${encodeURIComponent(event.id)}`,
  }));

  const eventsById = new Map(shown.map((event) => [event.id, event]));

  const stage = (item: IndexStageItem): ReactNode => {
    const event = eventsById.get(item.id);
    if (!event) return null;
    const range = formatEventTimeRange(event.starts_at, event.ends_at);
    const href = `/registrations/${encodeURIComponent(event.id)}`;
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="mono text-quiet">
            {formatEventDate(event.starts_at)}
            {range ? ` / ${range}` : ''}
          </p>
          <StatusDot event={event} />
        </div>

        {event.description && (
          <p className="mt-4 max-w-[58ch] text-[17px] leading-[1.65] text-quiet">
            {event.description}
          </p>
        )}

        {event.registration_open && event.spots_left !== null && (
          <p className="mono mt-3 text-faint">
            {event.spots_left > 0
              ? `${event.spots_left} spots left`
              : 'No spots left — waitlist open'}
          </p>
        )}

        <p className="mono mt-6">
          <Link
            to={href}
            aria-label={`View event — ${event.title}`}
            className="text-ink transition-colors duration-200 hover:text-seal"
          >
            View event →
          </Link>
        </p>
      </div>
    );
  };

  return (
    <div>
      <IndexStage items={items} renderStage={stage} label="Events" />
      <p className="mt-8 border-t hairline pt-4">
        <Link
          to="/registrations"
          className="mono text-quiet transition-colors duration-200 hover:text-seal"
        >
          All registrations →
        </Link>
      </p>
    </div>
  );
}
