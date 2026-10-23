import { useEffect, useMemo, useState } from 'react';
import { getEventRoster, listAdminEvents } from '../../lib/admin';
import type { AdminEventSummary, RosterEntry } from '../../lib/admin';
import { getEvent } from '../../lib/events';
import { errText, fmtDateTime } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

type StatusFilter = 'all' | 'registered' | 'waitlisted' | 'cancelled';

export default function AdminRegistrations({ notify }: PanelProps) {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [eventId, setEventId] = useState('');
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

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

  async function loadRoster(id: string): Promise<void> {
    setEventId(id);
    setQuery('');
    setStatus('all');
    if (!id) {
      setRoster(null);
      setLabels(new Map());
      return;
    }
    try {
      const [r, detail] = await Promise.all([getEventRoster(id), getEvent(id).catch(() => null)]);
      setRoster(r.registrations);
      setLabels(new Map((detail?.event.questions ?? []).map((q) => [q.id, q.label])));
    } catch (err) {
      notify(errText(err));
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
      const hay = [r.email, r.student_name ?? '', r.reg_number ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [roster, query, status]);

  return (
    <section aria-label="Roster">
      <h2 className="label">Registrations</h2>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select aria-label="Event" value={eventId} onChange={(e) => void loadRoster(e.target.value)} className="field max-w-xs">
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
              <li key={`${r.email}-${r.created_at}`} className="border border-line p-3">
                <p className="break-all text-sm text-paper/90">{r.email}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">
                  {r.status}
                  {r.student_name ? ` · ${r.student_name}` : ''}
                  {r.reg_number ? ` · ${r.reg_number}` : ''}
                </p>
                <dl className="mt-2 space-y-1 text-sm text-paper/80">
                  {Object.entries(r.answers).map(([k, v]) => (
                    <div key={k}>
                      <dt className="label">{labels.get(k) ?? k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 font-mono text-xs text-muted">{fmtDateTime(r.created_at)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[40rem] text-left text-sm text-paper/80">
              <thead className="sticky top-0 border-b border-line bg-[inherit]">
                <tr>
                  <th scope="col" className="label py-2 pr-6 text-left">Email</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Status</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Answers</th>
                  <th scope="col" className="label py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r) => (
                  <tr key={`${r.email}-${r.created_at}`}>
                    <td className="py-3 pr-6 break-all">
                      {r.email}
                      {r.student_name || r.reg_number ? (
                        <span className="block font-mono text-xs text-muted">
                          {[r.student_name, r.reg_number].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-6 font-mono text-xs uppercase tracking-wide">{r.status}</td>
                    <td className="py-3 pr-6">
                      {Object.entries(r.answers).map(([k, v]) => (
                        <span key={k} className="mr-3 inline-block">
                          <span className="text-muted">{labels.get(k) ?? k}:</span> {v}
                        </span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap py-3 font-mono text-xs text-muted">{fmtDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visible.length === 0 && <p className="mt-5 text-sm text-muted">No registrations match.</p>}
        </>
      )}
    </section>
  );
}
