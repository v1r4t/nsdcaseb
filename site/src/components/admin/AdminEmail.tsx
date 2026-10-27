import { useCallback, useEffect, useState } from 'react';
import {
  describeEmailTest,
  getAuditLog,
  getOutbox,
  listAdminEvents,
  retryOutbox,
  sendBroadcast,
  sendTestEmail,
  uploadBroadcastImage,
} from '../../lib/admin';
import type {
  AdminEventSummary,
  AuditEntry,
  EmailTestResult,
  OutboxEntry,
  OutboxKind,
  OutboxStatus,
} from '../../lib/admin';
import { EmailImageError, compressEmailImage } from '../../lib/email-image';
import RichTextEditor from './RichTextEditor';
import { errText, fmtDateTime } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

const KIND_LABELS: Record<OutboxKind, string> = {
  verification: 'Verification',
  password_reset: 'Password reset',
  waitlist: 'Waitlist',
  recruitment_decision: 'Recruitment decision',
  broadcast: 'Broadcast',
  test: 'Delivery test',
  registration_confirmation: 'Registration confirmation',
  event_reminder: 'Event reminder',
  other: 'Other',
};

const KIND_OPTIONS = Object.keys(KIND_LABELS) as OutboxKind[];

/** Read-only summary of the mail policy surfaced next to the outbox. */
const SEND_ON = [
  'Verification',
  'Password reset',
  'Waitlist join',
  'Waitlist promotion',
  'Recruitment decision',
  'Broadcast',
  'Delivery test',
];
const SEND_OFF = ['Welcome', 'Registration confirmation', 'Event reminder'];

function kindLabel(kind: OutboxKind | undefined): string {
  return kind ? KIND_LABELS[kind] ?? kind : 'Other';
}

export default function AdminEmail({ busy, setBusy, notify }: PanelProps) {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [outboxStatus, setOutboxStatus] = useState<OutboxStatus>('pending');
  const [outboxKind, setOutboxKind] = useState<'all' | OutboxKind>('all');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [aud, setAud] = useState<'all' | 'event'>('all');
  const [audEvent, setAudEvent] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [editorReset, setEditorReset] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [testResult, setTestResult] = useState<EmailTestResult | null>(null);

  const refreshOutbox = useCallback(
    async (status: OutboxStatus, kind: 'all' | OutboxKind): Promise<void> => {
      try {
        const r = await getOutbox(status, kind === 'all' ? undefined : kind);
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
    void refreshOutbox(outboxStatus, outboxKind);
  }, [outboxStatus, outboxKind, refreshOutbox]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function broadcast(): Promise<void> {
    setBusy(true);
    try {
      // The image is optional: compress + upload first, then queue. Any
      // failure here aborts before a single mail is enqueued.
      let imageUrl: string | null = null;
      if (imageFile) {
        setUploading(true);
        try {
          const compressed = await compressEmailImage(imageFile);
          const uploaded = await uploadBroadcastImage(
            new File([compressed], 'broadcast.jpg', { type: 'image/jpeg' }),
          );
          imageUrl = uploaded.url;
        } finally {
          setUploading(false);
        }
      }
      const r = await sendBroadcast({
        audience: aud,
        event_id: audEvent || undefined,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        image_url: imageUrl,
        image_alt: imageUrl ? imageAlt.trim() || null : null,
      });
      notify(`Queued ${r.queued} email(s). The scheduled sweep delivers them within 15 minutes.`);
      setSubject('');
      setBodyHtml('');
      setBodyText('');
      setEditorReset((n) => n + 1);
      setImageFile(null);
      setImageAlt('');
      await refreshOutbox(outboxStatus, outboxKind);
    } catch (err) {
      notify(err instanceof EmailImageError ? err.message : errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function testDelivery(): Promise<void> {
    setBusy(true);
    setTestResult(null);
    try {
      setTestResult(await sendTestEmail());
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
      await refreshOutbox(outboxStatus, outboxKind);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  const testCopy = testResult ? describeEmailTest(testResult) : null;
  const testToneClass =
    testCopy?.tone === 'error'
      ? 'text-signal'
      : testCopy?.tone === 'delivered'
        ? 'text-paper/80'
        : 'text-muted';

  return (
    <section aria-label="Email and audit" className="space-y-8">
      {/* One-click delivery probe — proves the Resend key + sender domain. */}
      <div className="border border-line p-4" role="note" aria-label="Delivery test">
        <h2 className="label">Delivery test</h2>
        <p className="hint mt-2">
          Send one message to your signed-in admin address to prove this worker can deliver through
          Resend. The result says whether delivery worked, the key is missing, or the provider
          rejected the sender domain.
        </p>
        <button
          type="button"
          className="btn-primary mt-4"
          disabled={busy}
          onClick={() => void testDelivery()}
        >
          Send test email
        </button>
        {testCopy && (
          <p role="status" className={`mt-3 text-sm ${testToneClass}`}>
            {testCopy.text}
          </p>
        )}
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
          <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="field" maxLength={200} />
          <RichTextEditor
            label="Broadcast message body"
            placeholder="Write the update you want to send…"
            onChange={(value) => {
              setBodyHtml(value.html);
              setBodyText(value.text);
            }}
            resetSignal={editorReset}
            onInvalidLink={notify}
          />

          <div className="border border-line p-3">
            <label className="label" htmlFor="broadcast-image">
              Image (optional)
            </label>
            <input
              id="broadcast-image"
              key={editorReset}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Broadcast image"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="field mt-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-signal file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
            <p className="hint">
              JPEG, PNG or WebP up to 10 MB. Resized to 1200px wide and re-encoded as JPEG before upload.
            </p>
            {imagePreview && (
              <img
                src={imagePreview}
                alt={imageAlt.trim() || 'Selected broadcast image preview'}
                className="mt-3 max-h-48 w-auto border border-line"
              />
            )}
            {imageFile && (
              <div className="mt-3 space-y-2">
                <input
                  aria-label="Image description"
                  value={imageAlt}
                  maxLength={200}
                  onChange={(e) => setImageAlt(e.target.value)}
                  placeholder="Image description (alt text, optional)"
                  className="field"
                />
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-xs"
                  disabled={busy || uploading}
                  onClick={() => {
                    setImageFile(null);
                    setImageAlt('');
                  }}
                >
                  Remove image
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={busy || uploading || !subject.trim() || !bodyText.trim()}
            onClick={() => void broadcast()}
          >
            {uploading ? 'Uploading image…' : 'Queue broadcast'}
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <h2 className="label">Outbox</h2>

        {/* Read-only policy panel: what the site still sends, and what it does not. */}
        <div className="mt-4 border border-line p-4" role="note" aria-label="What we send">
          <h3 className="label">What we send</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-paper/80">On</p>
              <ul className="mt-2 space-y-1 text-sm text-paper/80">
                {SEND_ON.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Off</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {SEND_OFF.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="hint mt-3">
            Verification and password reset sent directly by the auth flow go out immediately.
            Bulk verification sent from this console is queued. Welcome is disabled.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex gap-2" role="group" aria-label="Status filter">
            {(['pending', 'sent', 'failed'] as OutboxStatus[]).map((s) => (
              <button key={s} type="button" className={s === outboxStatus ? 'btn-primary' : 'btn-ghost'} onClick={() => setOutboxStatus(s)}>
                {s}
              </button>
            ))}
          </div>
          <select
            aria-label="Email type filter"
            value={outboxKind}
            onChange={(e) => setOutboxKind(e.target.value as 'all' | OutboxKind)}
            className="field max-w-xs"
          >
            <option value="all">All types</option>
            {KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <ul className="mt-5 space-y-3">
          {outbox.map((o) => (
            <li key={o.id} className="border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="break-all text-sm text-paper/90">{o.to_email}</p>
                <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                  <span className="border border-line px-1.5 py-0.5 text-paper/70">{kindLabel(o.kind)}</span>
                  <span>{o.status} · tries {o.attempts}</span>
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
        {outbox.length === 0 && (
          <p className="mt-5 text-sm text-muted">
            Outbox is empty for “{outboxStatus}”
            {outboxKind === 'all' ? '' : ` · ${KIND_LABELS[outboxKind]}`}.
          </p>
        )}
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
