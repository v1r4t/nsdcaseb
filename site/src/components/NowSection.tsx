import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventSummary } from '../lib/events';
import { loadSiteState } from '../lib/site';
import Reveal from './Reveal';

interface NowSectionProps {
  /** `null` while the events fetch is in flight or when it failed. */
  events: EventSummary[] | null;
  /** Number of media items loaded for the archive line. Omitted or 0 hides it. */
  mediaCount?: number;
}

interface NowLine {
  key: string;
  /** Mono line body. The accent belongs to the arrow, not to this. */
  body: string;
  /** Hidden suffix that makes the link's purpose explicit to a screen reader. */
  hint: string;
  to?: string;
}

/** Counts are part of the club's data language: `084`, not `84`. */
function count(value: number): string {
  return String(value).padStart(3, '0');
}

/** The next event worth naming: one you can join, else one still to come. */
function nextEvent(events: EventSummary[]): EventSummary | null {
  const joinable = events.find((event) => event.registration_open);
  if (joinable) return joinable;
  const now = Date.now();
  const upcoming = events.find((event) => {
    const at = Date.parse(event.starts_at);
    return !Number.isNaN(at) && at >= now;
  });
  return upcoming ?? null;
}

/**
 * NOW / 2026 — the live status strip. Every line is derived from real props or
 * a real fetch; a fact we do not have is omitted rather than guessed, so the
 * section shrinks instead of lying. When nothing at all is known it renders a
 * single honest line.
 */
export default function NowSection({ events, mediaCount = 0 }: NowSectionProps) {
  const [recruitmentOpen, setRecruitmentOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void loadSiteState().then((state) => {
      if (live) setRecruitmentOpen(state.recruitment_open);
    });
    return () => {
      live = false;
    };
  }, []);

  const lines = useMemo<NowLine[]>(() => {
    const rows: NowLine[] = [];

    if (recruitmentOpen !== null) {
      rows.push(
        recruitmentOpen
          ? {
              key: 'recruitment',
              body: 'Recruitment open',
              hint: 'Registration page',
              to: '/registrations',
            }
          : {
              key: 'recruitment',
              body: 'Recruitment closed',
              hint: 'Recruitment status',
            },
      );
    }

    const next = events ? nextEvent(events) : null;
    if (next) {
      rows.push({
        key: 'next',
        body: `Next: ${next.title}`,
        hint: 'Event registration page',
        to: `/registrations/${encodeURIComponent(next.id)}`,
      });
    }

    if (mediaCount > 0) {
      rows.push({
        key: 'media',
        body: `${count(mediaCount)} media items archived`,
        hint: 'Media archive',
        to: '/media',
      });
    }

    if (events && events.length > 0) {
      rows.push({
        key: 'events',
        body: `${count(events.length)} events on the record`,
        hint: 'All registrations',
        to: '/registrations',
      });
    }

    return rows.slice(0, 4);
  }, [events, mediaCount, recruitmentOpen]);

  return (
    <Reveal className="md:ml-[8.333%] md:max-w-[66.666%]">
      {lines.length === 0 ? (
        <p className="flex items-baseline gap-4 border-t border-line py-4 font-mono text-xs uppercase tracking-wide text-muted">
          <span aria-hidden="true" className="text-signal">
            →
          </span>
          Awaiting live status
        </p>
      ) : (
        <ul aria-label="Live status">
          {lines.map((line) => {
            const content = (
              <>
                <span aria-hidden="true" className="shrink-0 text-signal">
                  →
                </span>
                <span className="min-w-0 flex-1">{line.body}</span>
                {line.to ? <span className="sr-only"> — {line.hint}</span> : null}
              </>
            );
            return (
              <li key={line.key} className="border-t border-line last:border-b">
                {line.to ? (
                  <Link
                    to={line.to}
                    data-cursor={line.hint}
                    className="flex items-baseline gap-4 py-4 font-mono text-xs uppercase tracking-wide text-muted transition-colors duration-200 hover:text-paper"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-baseline gap-4 py-4 font-mono text-xs uppercase tracking-wide text-muted">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Reveal>
  );
}