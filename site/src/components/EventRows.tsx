import { Link } from 'react-router-dom';
import type { EventSummary } from '../lib/events';
import Reveal from './Reveal';

/** `2025-08-14` stays as-is; a longer timestamp is trimmed to its date part. */
function readableDate(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

function statusOf(event: EventSummary): { glyph: string; text: string } {
  if (!event.registration_open) return { glyph: '○', text: 'CLOSED' };
  if (event.spots_left !== null) {
    if (event.spots_left <= 0) return { glyph: '●', text: 'WAITLIST' };
    if (event.capacity !== null && event.spots_left <= event.capacity * 0.15) {
      return { glyph: '●', text: 'FILLING FAST' };
    }
  }
  return { glyph: '●', text: 'OPEN' };
}

interface EventRowsProps {
  /** `null` while loading or when the fetch failed — renders an honest line. */
  events: EventSummary[] | null;
}

/**
 * EVENTS — the next 3 events as hairline rows: date (mono) · title ·
 * status. Hover turns the row signal orange with a `VIEW EVENT →` cue.
 * No cards. Links to /registrations in the section footer.
 */
export default function EventRows({ events }: EventRowsProps) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted">No events listed right now — check back soon.</p>;
  }
  return (
    <div>
      <ul>
        {events.slice(0, 3).map((event, i) => {
          const status = statusOf(event);
          const live = status.text !== 'CLOSED';
          return (
            <li key={event.id} className="border-t border-line last:border-b">
              <Reveal delay={Math.min(i, 3) * 60}>
                <Link
                  to={`/registrations/${encodeURIComponent(event.id)}`}
                  data-cursor="VIEW EVENT →"
                  className="group flex flex-wrap items-baseline gap-x-6 gap-y-1 py-5 transition-colors duration-200 hover:text-signal"
                >
                  <time dateTime={event.starts_at} className="w-24 shrink-0 font-mono text-xs text-muted group-hover:text-signal/80">
                    {readableDate(event.starts_at)}
                  </time>
                  <span className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight text-paper group-hover:text-signal">
                    {event.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 font-mono text-xs">
                    <span className={live ? 'text-signal' : 'text-muted'}>
                      {status.glyph} {status.text}
                    </span>
                    <span aria-hidden="true" className="text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      VIEW EVENT →
                    </span>
                  </span>
                </Link>
              </Reveal>
            </li>
          );
        })}
      </ul>
      <p className="mt-6">
        <Link to="/registrations" className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-signal">
          All registrations →
        </Link>
      </p>
    </div>
  );
}
