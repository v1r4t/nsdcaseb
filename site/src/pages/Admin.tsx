import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { fetchContent } from '../lib/content';
import type { SiteContent } from '../lib/content';
import {
  ApiError,
  adminUpdateEvent,
  createAchievement,
  createBearer,
  deleteAchievement,
  deleteBearer,
  getEventRoster,
  getOutbox,
  getStats,
  sendBroadcast,
  updateAchievement,
  updateBearer,
  updateSection,
} from '../lib/admin';
import type { AdminStats, OutboxEntry, OutboxStatus, RosterEntry } from '../lib/admin';

function errText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.error === 'network_error') return 'Could not reach the server.';
    return `Request failed (${err.error}).`;
  }
  return 'Something went wrong.';
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [rosterEvent, setRosterEvent] = useState('');
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [outboxStatus, setOutboxStatus] = useState<OutboxStatus>('pending');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [aud, setAud] = useState<'all' | 'event'>('all');
  const [audEvent, setAudEvent] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    let active = true;
    getStats().then((s) => active && setStats(s)).catch(() => active && setNotice('Could not load stats.'));
    listEvents().then((r) => active && setEvents(r.events)).catch(() => {});
    fetchContent().then((c) => active && setContent(c)).catch(() => {});
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    let active = true;
    getOutbox(outboxStatus).then((r) => active && setOutbox(r.outbox)).catch(() => {});
    return () => { active = false; };
  }, [user, outboxStatus, notice]);

  if (loading) return <p aria-live="polite" className="mx-auto max-w-4xl px-4 py-10 text-sm text-white/60">Loading…</p>;
  if (!user) return <div className="mx-auto max-w-4xl px-4 py-10"><h1 className="font-display text-2xl text-white">Admin</h1><p className="mt-2 text-sm text-white/60">Please <Link to="/login" className="link">sign in</Link> to continue.</p></div>;
  if (user.role !== 'admin') return <div className="mx-auto max-w-4xl px-4 py-10"><h1 className="font-display text-2xl text-white">Admin</h1><p role="alert" className="error-text mt-2">Restricted — this area is for club admins only.</p></div>;

  async function toggleEvent(e: EventSummary): Promise<void> {
    setBusy(true);
    try {
      await adminUpdateEvent(e.id, { force_closed: e.registration_open });
      const r = await listEvents();
      setEvents(r.events);
      setNotice(e.registration_open ? `Closed registration for ${e.title}.` : `Reopened registration for ${e.title}.`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function loadRoster(id: string): Promise<void> {
    setRosterEvent(id);
    if (!id) { setRoster(null); return; }
    try {
      const r = await getEventRoster(id);
      setRoster(r.registrations);
    } catch (err) { setNotice(errText(err)); }
  }

  async function broadcast(): Promise<void> {
    setBusy(true);
    try {
      const r = await sendBroadcast({ audience: aud, event_id: audEvent || undefined, subject, body });
      setNotice(`Queued ${r.queued} email(s). Delivery starts once club email is connected.`);
      setSubject(''); setBody('');
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function saveSection(key: string, title: string, sectionBody: string): Promise<void> {
    setBusy(true);
    try {
      await updateSection(key, { title, body: sectionBody });
      setContent(await fetchContent());
      setNotice(`Saved section ${key}.`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  const rosterCsv = (): void => {
    if (!roster) return;
    downloadCsv(`roster-${rosterEvent}.csv`, [
      ['email', 'status', 'answers', 'date'],
      ...roster.map((r) => [r.email, r.status, Object.entries(r.answers).map(([k, v]) => `${k}: ${v}`).join('; '), r.created_at]),
    ]);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-white">Admin dashboard</h1>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-white/70">{notice}</p>

      <section aria-label="Overview" className="mt-6">
        <h2 className="font-display text-lg text-white">Overview</h2>
        {stats && (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[['Members', stats.users_total], ['Executives', stats.users_by_role.executive], ['Events', stats.events_total], ['Registrations', stats.registrations_total], ['Waitlisted', stats.registrations_by_status.waitlisted], ['Emails pending', stats.outbox.pending]].map(([label, n]) => (
              <div key={label as string} className="card"><dt className="text-xs text-white/50">{label}</dt><dd className="text-xl font-semibold text-white">{n}</dd></div>
            ))}
          </dl>
        )}
      </section>

      <section aria-label="Events" className="mt-8">
        <h2 className="font-display text-lg text-white">Events</h2>
        <ul className="mt-3 space-y-2">
          {events.map((e) => (
            <li key={e.id} className="card flex items-center justify-between gap-3">
              <span className="text-sm text-white">{e.title}
                <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: e.registration_open ? '#0f3' : '#555' }}>{e.registration_open ? 'Open' : 'Closed'}</span>
                <span className="ml-2 text-xs text-white/50">cap {e.capacity ?? '∞'}</span>
              </span>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => toggleEvent(e)}>{e.registration_open ? 'Close' : 'Open'}</button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Roster" className="mt-8">
        <h2 className="font-display text-lg text-white">Roster</h2>
        <div className="mt-3 flex gap-2">
          <select aria-label="Event" value={rosterEvent} onChange={(e) => loadRoster(e.target.value)} className="rounded bg-white/10 px-2 py-1 text-sm text-white">
            <option value="">Select event…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          {roster && <button type="button" className="btn-ghost" onClick={rosterCsv}>Download CSV</button>}
        </div>
        {roster && (
          <table className="mt-3 w-full text-left text-sm text-white/80">
            <thead><tr><th>Email</th><th>Status</th><th>Answers</th><th>Date</th></tr></thead>
            <tbody>{roster.map((r) => <tr key={r.email}><td>{r.email}</td><td>{r.status}</td><td>{Object.entries(r.answers).map(([k, v]) => `${k}: ${v}`).join('; ')}</td><td>{r.created_at}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section aria-label="Broadcast" className="mt-8">
        <h2 className="font-display text-lg text-white">Broadcast</h2>
        <p className="mt-1 text-xs text-amber-300">Emails queue immediately, but delivery activates once club email is connected (mailer seam pending).</p>
        <div className="mt-3 space-y-2">
          <div className="flex gap-4 text-sm text-white/80">
            <label><input type="radio" checked={aud === 'all'} onChange={() => setAud('all')} /> All members</label>
            <label><input type="radio" checked={aud === 'event'} onChange={() => setAud('event')} /> Per-event</label>
          </div>
          {aud === 'event' && (
            <select aria-label="Broadcast event" value={audEvent} onChange={(e) => setAudEvent(e.target.value)} className="rounded bg-white/10 px-2 py-1 text-sm text-white">
              <option value="">Select event…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          )}
          <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="block w-full rounded bg-white/10 px-2 py-1 text-sm text-white" />
          <textarea aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={4} className="block w-full rounded bg-white/10 px-2 py-1 text-sm text-white" />
          <button type="button" className="btn-primary" disabled={busy || !subject.trim() || !body.trim()} onClick={broadcast}>Queue broadcast</button>
        </div>
      </section>

      <section aria-label="Content" className="mt-8">
        <h2 className="font-display text-lg text-white">Content</h2>
        {content?.sections.map((s) => (
          <SectionForm key={s.key} sectionKey={s.key} title={s.title} sectionBody={s.body} busy={busy} onSave={saveSection} />
        ))}
        <BearerEditor bearers={content?.bearers ?? []} onDone={async (m) => { setNotice(m); setContent(await fetchContent()); }} />
        <AchievementEditor achievements={content?.achievements ?? []} onDone={async (m) => { setNotice(m); setContent(await fetchContent()); }} />
      </section>

      <section aria-label="Outbox" className="mt-8">
        <h2 className="font-display text-lg text-white">Outbox</h2>
        <div className="mt-3 flex gap-2" role="group" aria-label="Status filter">
          {(['pending', 'sent', 'failed'] as OutboxStatus[]).map((s) => (
            <button key={s} type="button" className={s === outboxStatus ? 'btn-primary' : 'btn-ghost'} onClick={() => setOutboxStatus(s)}>{s}</button>
          ))}
        </div>
        <table className="mt-3 w-full text-left text-sm text-white/80">
          <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>Tries</th><th>Date</th></tr></thead>
          <tbody>{outbox.map((o) => <tr key={o.id}><td>{o.to_email}</td><td>{o.subject}</td><td>{o.status}</td><td>{o.attempts}</td><td>{o.created_at}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

function SectionForm({ sectionKey, title, sectionBody, busy, onSave }: { sectionKey: string; title: string; sectionBody: string; busy: boolean; onSave: (k: string, t: string, b: string) => Promise<void> }) {
  const [t, setT] = useState(title);
  const [b, setB] = useState(sectionBody);
  useEffect(() => { setT(title); setB(sectionBody); }, [title, sectionBody]);
  return (
    <form className="card mt-3" onSubmit={(e) => { e.preventDefault(); onSave(sectionKey, t, b); }}>
      <h3 className="text-sm font-semibold text-white">{sectionKey}</h3>
      <input aria-label="Section title" value={t} onChange={(e) => setT(e.target.value)} className="mt-2 block w-full rounded bg-white/10 px-2 py-1 text-sm text-white" />
      <textarea aria-label="Section body" value={b} onChange={(e) => setB(e.target.value)} rows={4} className="mt-2 block w-full rounded bg-white/10 px-2 py-1 text-sm text-white" />
      <button type="submit" className="btn-primary mt-2" disabled={busy}>Save</button>
    </form>
  );
}

function BearerEditor({ bearers, onDone }: { bearers: { id: string; name: string; role: string; cohort: string | null; photo_url: string | null }[]; onDone: (m: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [edits, setEdits] = useState<Record<string, { name: string; role: string }>>({});
  async function run(fn: () => Promise<unknown>, msg: string): Promise<void> {
    try { await fn(); await onDone(msg); } catch (err) { await onDone(errText(err)); }
  }
  return (
    <div className="card mt-3">
      <h3 className="text-sm font-semibold text-white">Office bearers</h3>
      <ul className="mt-2 space-y-2">
        {bearers.map((x) => {
          const ed = edits[x.id] ?? { name: x.name, role: x.role };
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2">
              <input aria-label="Bearer name" value={ed.name} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, name: e.target.value } })} className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
              <input aria-label="Bearer role" value={ed.role} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, role: e.target.value } })} className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
              <button type="button" className="btn-ghost" onClick={() => run(() => updateBearer(x.id, { name: ed.name, role: ed.role }), `Saved ${ed.name}.`)}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => { if (window.confirm(`Delete ${x.name}?`)) void run(() => deleteBearer(x.id), `Deleted ${x.name}.`); }}>Delete</button>
            </li>
          );
        })}
      </ul>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await createBearer({ name, role }); setName(''); setRole(''); }, `Added ${name}.`); }}>
        <input aria-label="New bearer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
        <input aria-label="New bearer role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
        <button type="submit" className="btn-primary" disabled={!name.trim() || !role.trim()}>Add</button>
      </form>
    </div>
  );
}

function AchievementEditor({ achievements, onDone }: { achievements: { id: string; title: string; description: string; date: string | null }[]; onDone: (m: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [edits, setEdits] = useState<Record<string, { title: string; description: string }>>({});
  async function run(fn: () => Promise<unknown>, msg: string): Promise<void> {
    try { await fn(); await onDone(msg); } catch (err) { await onDone(errText(err)); }
  }
  return (
    <div className="card mt-3">
      <h3 className="text-sm font-semibold text-white">Achievements</h3>
      <ul className="mt-2 space-y-2">
        {achievements.map((a) => {
          const ed = edits[a.id] ?? { title: a.title, description: a.description };
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <input aria-label="Achievement title" value={ed.title} onChange={(e) => setEdits({ ...edits, [a.id]: { ...ed, title: e.target.value } })} className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
              <input aria-label="Achievement description" value={ed.description} onChange={(e) => setEdits({ ...edits, [a.id]: { ...ed, description: e.target.value } })} className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
              <button type="button" className="btn-ghost" onClick={() => run(() => updateAchievement(a.id, { title: ed.title, description: ed.description }), 'Saved achievement.')}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => { if (window.confirm(`Delete ${a.title}?`)) void run(() => deleteAchievement(a.id), 'Deleted achievement.'); }}>Delete</button>
            </li>
          );
        })}
      </ul>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await createAchievement({ title, description: desc }); setTitle(''); setDesc(''); }, `Added ${title}.`); }}>
        <input aria-label="New achievement title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
        <input aria-label="New achievement description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="rounded bg-white/10 px-2 py-1 text-sm text-white" />
        <button type="submit" className="btn-primary" disabled={!title.trim() || !desc.trim()}>Add</button>
      </form>
    </div>
  );
}
