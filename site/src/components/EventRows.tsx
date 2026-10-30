import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EventSummary } from '../lib/events';
import Reveal from './Reveal';
import { Row } from '../../../design/primitives/Row';

/** `2025-08-14` stays as-is; a longer timestamp is trimmed to its date part. */
function readableDate(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

function statusOf(event: EventSummary): string {
  if (!event.registration_open) return 'CLOSED';
  if (event.spots_left !== null) {
    if (event.spots_left <= 0) return 'WAITLIST';
    if (event.capacity !== null && event.spots_left <= event.capacity * 0.15) {
      return 'FILLING FAST';
    }
  }
  return 'OPEN';
}

/** Router link adapter for the kit Row; keeps the row's cursor cue. */
function EventLink({
  href,
  className,
  children,
  'data-testid': testId,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <Link to={href} className={className} data-testid={testId} data-cursor="VIEW EVENT →">
      {children}
    </Link>
  );
}

/** Small seal/ink square + the word. The word is the status; the mark is not. */
function StatusMark({ status }: { status: string }) {
  const closed = status === 'CLOSED';
  const tone = closed ? 'text-quiet' : status === 'FILLING FAST' ? 'text-seal' : 'text-ink';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`}>
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 ${closed ? 'border border-current' : 'bg-current'}`}
      />
      {status}
    </span>
  );
}

interface EventRowsProps {
  /** `null` while loading or when the fetch failed — renders an honest line. */
  events: EventSummary[] | null;
}

/**
 * EVENTS — the next 3 events as hairline rows: date (mono) · title (serif) ·
 * status. The kit Row draws the hover box and the arrow; no cards.
 * Links to /registrations in the section footer.
 */
export default function EventRows({ events }: EventRowsProps) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-quiet">No events listed right now — check back soon.</p>;
  }
  return (
    <div>
      <ul>
        {events.slice(0, 3).map((event, i) => {
          const status = statusOf(event);
          return (
            <li key={event.id}>
              <Reveal delay={Math.min(i, 3) * 60}>
                <Row
                  index={readableDate(event.starts_at)}
                  title={event.title}
                  meta={<StatusMark status={status} />}
                  href={`/registrations/${encodeURIComponent(event.id)}`}
                  linkComponent={EventLink}
                  className="max-sm:grid-cols-[auto_minmax(0,1fr)_auto] max-sm:gap-3 max-sm:[&>span:last-child]:hidden"
                />
              </Reveal>
            </li>
          );
        })}
      </ul>
      <p className="mt-6">
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
