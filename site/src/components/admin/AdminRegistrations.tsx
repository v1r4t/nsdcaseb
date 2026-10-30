import { useEffect, useMemo, useRef, useState } from 'react';
import { cancelAdminRegistration, getEventRoster, listAdminEvents } from '../../lib/admin';
import type { AdminEventSummary, RosterEntry } from '../../lib/admin';
import { getEvent } from '../../lib/events';
import { errText, fmtDateTime } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

type StatusFilter = 'all' | 'registered' | 'waitlisted' | 'cancelled';

/** Only live registrations can be cancelled. */
function isLive(status: string): boolean {
  return status === 'registered' || status === 'waitlisted';
}

/** Confirmation copy, readable for members and guests alike. */
function cancelPrompt(r: RosterEntry): string {
  const who = r.email || r.student_name;
  const subject = who ? `${who}'s registration` : 'this guest registration';
  return `Cancel ${subject} for this event? A registered seat will promote the next waitlisted person.`;
}

export default function AdminRegistrations({ notify }: PanelProps) {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [eventId, setEventId] = useState('');
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  /** The event the roster belongs to, readable after an await. */
  const selectedEventIdRef = useRef('');

  useEffect(() => {
    let active = true;
    // Archived events included: their rosters stay queryable after archival.
    listAdminEvents(true)
      .then((r) => {
        if (active) setEvents(r.events);
      })
      .catch((err: unknown) => {
        if (active) notify(errText(err));
      });
    return () => {
      active = false;
    };
  }, [notify]);

  /** Re-fetch one roster without touching the search box or status filter. */
  async function refreshRoster(id: string): Promise<void> {
    try {
      const [r, detail] = await Promise.all([getEventRoster(id), getEvent(id).catch(() => null)]);
      setRoster(r.registrations);
      setLabels(new Map((detail?.event.questions ?? []).map((q) => [q.id, q.label])));
    } catch (err) {
      notify(errText(err));
    }
  }

  async function loadRoster(id: string): Promise<void> {
    selectedEventIdRef.current = id;
    setEventId(id);
    setQuery('');
    setStatus('all');
    if (!id) {
      setRoster(null);
      setLabels(new Map());
      return;
    }
    await refreshRoster(id);
  }

  async function handleCancel(r: RosterEntry): Promise<void> {
    if (!window.confirm(cancelPrompt(r))) return;
    // Remember which roster this row came from: a refresh after the await must
    // never land on a different event.
    const targetEventId = eventId;
    setCancellingId(r.id);
    try {
      const result = await cancelAdminRegistration(r.id);
      notify(
        result.promoted_email
          ? `Registration cancelled. Promoted ${result.promoted_email}.`
          : 'Registration cancelled.',
      );
      if (targetEventId && selectedEventIdRef.current === targetEventId) {
        await refreshRoster(targetEventId);
      }
    } catch (err) {
      notify(errText(err));
    } finally {
      setCancellingId(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<Exclude<StatusFilter, 'all'>, number> & { all: number } = {
      all: 0,
      registered: 0,
      waitlisted: 0,
      cancelled: 0,
    };
    for (const r of roster ?? []) {
      c.all += 1;
      if (r.status === 'registered' || r.status === 'waitlisted' || r.status === 'cancelled') {
        c[r.status] += 1;
      }
    }
    return c;
  }, [roster]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster ?? []).filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      const hay = [r.email ?? '', r.student_name ?? '', r.reg_number ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [roster, query, status]);

  return (
    <section aria-label="Roster">
      <h2 className="font-display text-2xl text-ink">Registrations</h2>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select
          aria-label="Event"
          value={eventId}
          onChange={(e) => void loadRoster(e.target.value)}
          className="field max-w-xs"
          disabled={cancellingId !== null}
        >
          <option value="">Select event…</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
              {e.archived ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        {roster && eventId && (
          <a className="btn-ghost shrink-0" href={`/api/admin/events/${encodeURIComponent(eventId)}/roster.csv`}>
            Download CSV (server)
          </a>
        )}
      </div>

      {roster && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <input
              aria-label="Search roster by email or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email or name…"
              className="field max-w-xs"
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
              {(['all', 'registered', 'waitlisted', 'cancelled'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={s === status ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setStatus(s)}
                >
                  {s} ({s === 'all' ? counts.all : counts[s]})
                </button>
              ))}
            </div>
          </div>

          {/* Mobile: stacked cards. sm+: scrollable table with a sticky header. */}
          <ul className="mt-5 space-y-3 sm:hidden">
            {visible.map((r) => (
              <li key={r.id} className="border hairline p-3">
                <p className="break-all text-sm text-ink">{r.email ?? 'Guest registration'}</p>
                <p className="mt-1 mono text-quiet">
                  {r.status}
                  {r.student_name ? ` · ${r.student_name}` : ''}
                  {r.reg_number ? ` · ${r.reg_number}` : ''}
                </p>
                <dl className="mt-2 space-y-1 text-sm text-ink/80">
                  {Object.entries(r.answers).map(([k, v]) => (
                    <div key={k}>
                      <dt className="mono text-quiet">{labels.get(k) ?? k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 mono text-quiet">{fmtDateTime(r.created_at)}</p>
                {isLive(r.status) && (
                  <button
                    type="button"
                    className="btn-ghost mt-3"
                    onClick={() => void handleCancel(r)}
                    disabled={cancellingId !== null}
                  >
                    {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[40rem] text-left text-sm text-ink/80">
              <thead className="sticky top-0 border-b hairline bg-paper">
                <tr>
                  <th scope="col" className="mono py-2 pr-6 text-left text-ink">Email</th>
                  <th scope="col" className="mono py-2 pr-6 text-left text-ink">Status</th>
                  <th scope="col" className="mono py-2 pr-6 text-left text-ink">Answers</th>
                  <th scope="col" className="mono py-2 pr-6 text-left text-ink">Date</th>
                  <th scope="col" className="mono py-2 text-left text-ink">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hairline)]">
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-6 break-all">
                      {r.email ?? 'Guest registration'}
                      {r.student_name || r.reg_number ? (
                        <span className="block mono text-quiet">
                          {[r.student_name, r.reg_number].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-6 mono">{r.status}</td>
                    <td className="py-3 pr-6">
                      {Object.entries(r.answers).map(([k, v]) => (
                        <span key={k} className="mr-3 inline-block">
                          <span className="text-quiet">{labels.get(k) ?? k}:</span> {v}
                        </span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-6 mono text-quiet">{fmtDateTime(r.created_at)}</td>
                    <td className="py-3">
                      {isLive(r.status) && (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => void handleCancel(r)}
                          disabled={cancellingId !== null}
                        >
                          {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visible.length === 0 && <p className="mt-5 text-sm text-quiet">No registrations match.</p>}
        </>
      )}
    </section>
  );
}
