import { Link } from 'react-router-dom';
import type { EventSummary } from '../lib/events';
import Reveal from './Reveal';

/** `2025-08-14` stays as-is; a longer timestamp is trimmed to its date part. */
function readableDate(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

interface NowSectionProps {
  /** `null` while the events fetch is in flight or when it failed. */
  events: EventSummary[] | null;
  /** Number of media frames loaded for the archive line. Zero hides it. */
  mediaCount: number;
}

/**
 * NOW / 2026 — a short editorial strip of what is actually happening. Every
 * line is derived from live data; when the fetch fails or nothing is open,
 * exactly one honest line renders. Never fabricated, never blocking paint.
 */
export default function NowSection({ events, mediaCount }: NowSectionProps) {
  const open = events?.find((event) => event.registration_open) ?? null;
  const upcoming = events?.find((event) => !event.registration_open) ?? null;

  const lines: { tag: string; body: string; to?: string; cta?: string }[] = [];
  if (open) {
    lines.push({
      tag: 'NEXT',
      body: `${open.title} · ${readableDate(open.starts_at)}`,
      to: `/registrations/${encodeURIComponent(open.id)}`,
      cta: 'Register →',
    });
  }
  if (upcoming) {
    lines.push({
      tag: 'SOON',
      body: `${upcoming.title} · ${readableDate(upcoming.starts_at)}`,
      to: '/registrations',
      cta: 'Details →',
    });
  }
  if (mediaCount > 0) {
    lines.push({
      tag: 'ARCHIVE',
      body: `${mediaCount} frames from recent sessions now filed`,
      to: '/media',
      cta: 'Browse →',
    });
  }

  return (
    <Reveal className="md:ml-[8.333%] md:max-w-[66.666%]">
      {lines.length === 0 ? (
        <p className="border-t border-line pt-5 text-base text-paper/70">
          Nothing scheduled right now — check back soon.
        </p>
      ) : (
        <ul>
          {lines.slice(0, 4).map((line) => (
            <li
              key={`${line.tag}-${line.body}`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line py-4"
            >
              <span className="w-20 shrink-0 font-mono text-xs text-signal">{line.tag}</span>
              <span className="min-w-0 flex-1 text-base text-paper/80">{line.body}</span>
              {line.to && line.cta ? (
                <Link to={line.to} className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-signal">
                  {line.cta}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Reveal>
  );
}
