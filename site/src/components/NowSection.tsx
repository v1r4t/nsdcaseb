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
 * NOW / 2026 — the live status index. Every line is derived from real props or
 * a real fetch; a fact we do not have is omitted rather than guessed, so the
 * section shrinks instead of lying. When nothing at all is known it renders a
 * single honest line. Hairlines and mono carry the structure; no cards.
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
              hint: 'Application form',
              to: '/recruit',
            }
          : {
              key: 'recruitment',
              body: 'Recruitment closed',
              hint: 'Recruitment status',
              to: '/recruit',
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
        body: `${count(mediaCount)} frames archived`,
        hint: 'Photo archive',
        to: '/archive',
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
        <p className="mono flex items-baseline gap-4 border-y py-4 text-quiet hairline">
          <span aria-hidden="true" className="text-seal">
            →
          </span>
          Awaiting live status
        </p>
      ) : (
        <ul aria-label="Live status" className="border-t hairline">
          {lines.map((line) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-seal transition-transform duration-200 group-hover:translate-x-1"
                >
                  →
                </span>
                <span className="min-w-0 flex-1">{line.body}</span>
                {line.to ? <span className="sr-only"> — {line.hint}</span> : null}
              </>
            );
            return (
              <li key={line.key} className="border-b hairline">
                {line.to ? (
                  <Link
                    to={line.to}
                    data-cursor={line.hint}
                    className="mono group flex items-baseline gap-4 py-4 text-quiet transition-colors duration-200 hover:text-ink"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="mono flex items-baseline gap-4 py-4 text-quiet">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Reveal>
  );
}
