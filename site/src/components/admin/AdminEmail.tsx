import { useCallback, useEffect, useState } from 'react';
import {
  getAuditLog,
  getOutbox,
  listAdminEvents,
  retryOutbox,
  sendBroadcast,
} from '../../lib/admin';
import type { AdminEventSummary, AuditEntry, OutboxEntry, OutboxStatus } from '../../lib/admin';
import { errText, fmtDateTime } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

export default function AdminEmail({ busy, setBusy, notify }: PanelProps) {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [outboxStatus, setOutboxStatus] = useState<OutboxStatus>('pending');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [aud, setAud] = useState<'all' | 'event'>('all');
  const [audEvent, setAudEvent] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  const refreshOutbox = useCallback(
    async (status: OutboxStatus): Promise<void> => {
      try {
        const r = await getOutbox(status);
        setOutbox(r.outbox);
      } catch (err) {
        notify(errText(err));
      }
    },
    [notify],
  );

  useEffect(() => {
    listAdminEvents()
      .then((r) => setEvents(r.events))
      .catch(() => {});
    getAuditLog()
      .then((r) => setAudit(r.entries))
      .catch((err: unknown) => notify(errText(err)));
  }, [notify]);

  useEffect(() => {
    void refreshOutbox(outboxStatus);
  }, [outboxStatus, refreshOutbox]);

  async function broadcast(): Promise<void> {
    setBusy(true);
    try {
      const r = await sendBroadcast({ audience: aud, event_id: audEvent || undefined, subject, body });
      notify(`Queued ${r.queued} email(s). Delivery starts once club email is connected.`);
      setSubject('');
      setBody('');
      await refreshOutbox(outboxStatus);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string): Promise<void> {
    setBusy(true);
    try {
      await retryOutbox(id);
      notify('Requeued for delivery.');
      await refreshOutbox(outboxStatus);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Email and audit" className="space-y-8">
      {/* Delivery seam callout — email queueing works, actual sending does not yet. */}
      <div className="border border-line p-4" role="note" aria-label="Delivery status">
        <h2 className="label">Delivery: not configured</h2>
        <p className="hint mt-2">
          Emails queue in the outbox immediately, but nothing is actually sent until club email is
          connected (mailer seam pending). The outbox below is the source of truth for what would go out.
        </p>
      </div>

      <div>
        <h2 className="label">Broadcast</h2>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-6 text-sm text-paper/80">
            <label>
              <input type="radio" className="accent-signal" checked={aud === 'all'} onChange={() => setAud('all')} /> All members
            </label>
            <label>
              <input type="radio" className="accent-signal" checked={aud === 'event'} onChange={() => setAud('event')} /> Per-event
            </label>
          </div>
          {aud === 'event' && (
            <select aria-label="Broadcast event" value={audEvent} onChange={(e) => setAudEvent(e.target.value)} className="field max-w-xs">
              <option value="">Select event…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          )}
          <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="field" />
          <textarea aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={4} className="field resize-y" />
          <button type="button" className="btn-primary" disabled={busy || !subject.trim() || !body.trim()} onClick={() => void broadcast()}>
            Queue broadcast
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <h2 className="label">Outbox</h2>
        <div className="mt-5 flex gap-2" role="group" aria-label="Status filter">
          {(['pending', 'sent', 'failed'] as OutboxStatus[]).map((s) => (
            <button key={s} type="button" className={s === outboxStatus ? 'btn-primary' : 'btn-ghost'} onClick={() => setOutboxStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <ul className="mt-5 space-y-3">
          {outbox.map((o) => (
            <li key={o.id} className="border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="break-all text-sm text-paper/90">{o.to_email}</p>
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  {o.status} · tries {o.attempts}
                </p>
              </div>
              <p className="mt-1 text-sm text-paper/80">{o.subject}</p>
              <p className="mt-1 font-mono text-xs text-muted">
                queued {fmtDateTime(o.created_at)}
                {o.sent_at ? ` · sent ${fmtDateTime(o.sent_at)}` : ''}
              </p>
              {o.preview ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-paper/70 underline underline-offset-4">Preview</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-paper/80">{o.preview}</p>
                </details>
              ) : null}
              {(o.status === 'failed' || o.status === 'pending') && (
                <button type="button" className="btn-ghost mt-3" disabled={busy} onClick={() => void retry(o.id)}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
        {outbox.length === 0 && <p className="mt-5 text-sm text-muted">Outbox is empty for “{outboxStatus}”.</p>}
      </div>

      <div className="border-t border-line pt-6">
        <h2 className="label">Audit log</h2>
        {audit === null ? (
          <p className="mt-5 font-mono text-xs uppercase tracking-wide text-muted">Loading audit log…</p>
        ) : audit.length === 0 ? (
          <p className="mt-5 text-sm text-muted">No audit entries yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm text-paper/80">
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className="label py-2 pr-6 text-left">Action</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Admin</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Detail</th>
                  <th scope="col" className="label py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {audit.map((a, i) => (
                  <tr key={`${a.created_at}-${a.action}-${i}`}>
                    <td className="py-3 pr-6 font-mono text-xs uppercase tracking-wide">{a.action}</td>
                    <td className="py-3 pr-6 break-all">{a.admin_email}</td>
                    <td className="max-w-xs truncate py-3 pr-6 font-mono text-xs text-muted" title={a.detail}>
                      {a.detail}
                    </td>
                    <td className="whitespace-nowrap py-3 font-mono text-xs text-muted">{fmtDateTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
