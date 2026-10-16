import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';
import { fetchContent } from '../lib/content';
import type { SiteContent } from '../lib/content';
import {
  ApiError,
  adminCreateEvent,
  adminUpdateEvent,
  createAchievement,
  createBearer,
  deleteAchievement,
  deleteBearer,
  getEventRoster,
  getOutbox,
  getStats,
  listAdminUsers,
  sendAdminVerification,
  sendBroadcast,
  syncAdminRoles,
  updateAchievement,
  updateAdminUserRole,
  updateAdminUserVerified,
  updateBearer,
} from '../lib/admin';
import type { AdminUser } from '../lib/admin';
import type { AdminStats, OutboxEntry, OutboxStatus, RosterEntry } from '../lib/admin';

function errText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.error === 'network_error') return 'Could not reach the server.';
    return `Request failed (${err.error}).`;
  }
  return 'Something went wrong.';
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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [notice, setNotice] = useState('');
  const [newEvent, setNewEvent] = useState({
    title: '', description: '', starts_at: '', ends_at: '', reg_opens_at: '', reg_closes_at: '', capacity: '',
  });
  const [newEventPoster, setNewEventPoster] = useState<File | null>(null);
  const [windowEventId, setWindowEventId] = useState('');
  const [windowCloses, setWindowCloses] = useState('');
  const [windowForceClosed, setWindowForceClosed] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'ob') return;
    let active = true;
    getStats().then((s) => active && setStats(s)).catch(() => active && setNotice('Could not load stats.'));
    listEvents().then((r) => active && setEvents(r.events)).catch(() => {});
    fetchContent().then((c) => active && setContent(c)).catch(() => {});
    listAdminUsers().then((r) => active && setUsers(r.users)).catch(() => {});
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'ob') return;
    let active = true;
    getOutbox(outboxStatus).then((r) => active && setOutbox(r.outbox)).catch(() => {});
    return () => { active = false; };
  }, [user, outboxStatus, notice]);

  if (loading) {
    return (
      <div className="shell py-12 md:py-16">
        <p aria-live="polite" className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Loading…
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="shell py-12 md:py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-paper">Admin</h1>
        <p className="mt-3 text-sm text-muted">
          Please <Link to="/login" className="link">sign in</Link> to continue.
        </p>
      </div>
    );
  }

  if (user.role !== 'ob') {
    return (
      <div className="shell py-12 md:py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-paper">Admin</h1>
        <p role="alert" className="error-text mt-3">Restricted — this area is for club admins only.</p>
      </div>
    );
  }

  async function toggleEvent(e: EventSummary): Promise<void> {
    setBusy(true);
    try {
      await adminUpdateEvent(e.id, { force_closed: e.registration_open });
      const r = await listEvents();
      setEvents(r.events);
      setNotice(e.registration_open ? `Closed registration for ${e.title}.` : `Reopened registration for ${e.title}.`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function changeRole(u: AdminUser, role: AdminUser['role']): Promise<void> {
    setBusy(true);
    try {
      await updateAdminUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      setNotice(`Updated ${u.email} to ${role}.`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function toggleVerified(u: AdminUser): Promise<void> {
    setBusy(true);
    try {
      await updateAdminUserVerified(u.id, !u.email_verified);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, email_verified: !u.email_verified } : x)));
      setNotice(`${!u.email_verified ? 'Verified' : 'Unverified'} ${u.email}.`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function saveWindow(): Promise<void> {
    if (!windowEventId || !windowCloses) { setNotice('Select event and end time.'); return; }
    setBusy(true);
    try {
      await adminUpdateEvent(windowEventId, { reg_closes_at: new Date(windowCloses).toISOString(), force_closed: windowForceClosed });
      const r = await listEvents();
      setEvents(r.events);
      setNotice('Saved registration window.');
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function syncRoles(): Promise<void> {
    setBusy(true);
    try {
      const r = await syncAdminRoles();
      setUsers((await listAdminUsers()).users);
      setNotice(`Synced roles: ${r.changed} changed.`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function bulkVerify(): Promise<void> {
    setBusy(true);
    try {
      const r = await sendAdminVerification();
      setUsers((await listAdminUsers()).users);
      setNotice(`Queued verification for ${r.queued} user(s).`);
    } catch (err) { setNotice(errText(err)); } finally { setBusy(false); }
  }

  async function createEventSubmit(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    if (!newEventPoster) { setNotice('Poster required.'); return; }
    setBusy(true);
    try {
      const r = await adminCreateEvent({
        title: newEvent.title,
        description: newEvent.description,
        starts_at: new Date(newEvent.starts_at).toISOString(),
        ends_at: new Date(newEvent.ends_at).toISOString(),
        reg_opens_at: new Date(newEvent.reg_opens_at).toISOString(),
        reg_closes_at: new Date(newEvent.reg_closes_at).toISOString(),
        capacity: newEvent.capacity ? Number(newEvent.capacity) : null,
        poster: newEventPoster,
      });
      setNotice(`Created event ${r.id}.`);
      setNewEvent({ title: '', description: '', starts_at: '', ends_at: '', reg_opens_at: '', reg_closes_at: '', capacity: '' });
      setNewEventPoster(null);
      const rr = await listEvents();
      setEvents(rr.events);
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


  return (
    <div className="shell py-12 md:py-16">
      <div className="max-w-5xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-paper">Admin dashboard</h1>
        <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm text-paper/80">{notice}</p>

        <section aria-label="Overview" className="rule mt-10 pt-6">
          <h2 className="label">Overview</h2>
          {stats && (
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              {[['Members', stats.users_total], ['Executives', stats.users_by_role.executive], ['Events', stats.events_total], ['Registrations', stats.registrations_total], ['Waitlisted', stats.registrations_by_status.waitlisted], ['Emails pending', stats.outbox.pending]].map(([label, n]) => (
                <div key={label as string} className="border-t border-line pt-3">
                  <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-1 font-mono text-2xl font-medium leading-none text-paper">{n}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section aria-label="Events" className="rule mt-10 pt-6">
          <h2 className="label">Events</h2>
          <ul className="mt-5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-t border-line py-4 last:border-b">
                <span className="text-sm text-paper/80">{e.title}
                  <span className={`ml-3 font-mono text-[11px] uppercase tracking-wide ${e.registration_open ? 'text-signal' : 'text-muted'}`}>{e.registration_open ? 'Open' : 'Closed'}</span>
                  <span className="ml-3 font-mono text-[11px] uppercase tracking-wide text-muted">cap {e.capacity ?? '∞'}</span>
                </span>
                <button type="button" className="btn-ghost shrink-0" disabled={busy} onClick={() => toggleEvent(e)}>{e.registration_open ? 'Close' : 'Open'}</button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Accounts" className="rule mt-10 pt-6">
          <h2 className="label">Accounts and roles</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={syncRoles} className="btn-ghost" disabled={busy}>Sync roles from hardcoded lists</button>
            <button type="button" onClick={bulkVerify} className="btn-ghost" disabled={busy}>Send verification to unverified</button>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm text-paper/80">
              <thead className="border-b border-line">
                <tr>
                  <th className="label py-2 pr-4 text-left">Email</th>
                  <th className="label py-2 pr-4 text-left">Role</th>
                  <th className="label py-2 pr-4 text-left">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-4">{u.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as AdminUser['role'])}
                        className="field"
                      >
                        <option value="member">member</option>
                        <option value="executive">executive</option>
                        <option value="ob">ob</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <button type="button" onClick={() => toggleVerified(u)} disabled={busy} className="btn-ghost">
                        {u.email_verified ? 'Verified' : 'Mark verified'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Create event" className="rule mt-10 pt-6">
          <h2 className="label">Create event (poster required)</h2>
          <form className="mt-5 space-y-3" onSubmit={createEventSubmit}>
            <input aria-label="Title" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Title" className="field" required />
            <textarea aria-label="Description" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Description" rows={3} className="field resize-y" />
            <p className="label mt-2">Event schedule</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="label">Event starts</span>
                <input type="datetime-local" value={newEvent.starts_at} onChange={(e) => setNewEvent({ ...newEvent, starts_at: e.target.value })} className="field" required />
                <span className="hint">When the event actually begins.</span>
              </label>
              <label className="space-y-1">
                <span className="label">Event ends</span>
                <input type="datetime-local" value={newEvent.ends_at} onChange={(e) => setNewEvent({ ...newEvent, ends_at: e.target.value })} className="field" required />
                <span className="hint">When the event finishes.</span>
              </label>
            </div>
            <p className="label mt-3">Registration window</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="label">Registration opens</span>
                <input type="datetime-local" value={newEvent.reg_opens_at} onChange={(e) => setNewEvent({ ...newEvent, reg_opens_at: e.target.value })} className="field" required />
                <span className="hint">When people first can register.</span>
              </label>
              <label className="space-y-1">
                <span className="label">Registration closes</span>
                <input type="datetime-local" value={newEvent.reg_closes_at} onChange={(e) => setNewEvent({ ...newEvent, reg_closes_at: e.target.value })} className="field" required />
                <span className="hint">Deadline after which the form closes.</span>
              </label>
            </div>
            <input aria-label="Capacity" value={newEvent.capacity} onChange={(e) => setNewEvent({ ...newEvent, capacity: e.target.value })} placeholder="Capacity (blank = unlimited)" className="field" />
            <input aria-label="Poster" type="file" accept="image/*" onChange={(e) => setNewEventPoster(e.target.files?.[0] ?? null)} className="field" required />
            <button type="submit" disabled={busy} className="btn-primary">Create event</button>
          </form>
        </section>

        <section aria-label="Registration window" className="rule mt-10 pt-6">
          <h2 className="label">Registration window / close form</h2>
          <div className="mt-5 max-w-xl space-y-3">
            <select aria-label="Event" value={windowEventId} onChange={(e) => setWindowEventId(e.target.value)} className="field">
              <option value="">Select event…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            <input aria-label="Registration closes at" type="datetime-local" value={windowCloses} onChange={(e) => setWindowCloses(e.target.value)} className="field" />
            <label className="flex items-center gap-2 text-sm text-paper/80">
              <input type="checkbox" checked={windowForceClosed} onChange={(e) => setWindowForceClosed(e.target.checked)} className="h-4 w-4 shrink-0 accent-signal" />
              Force closed now
            </label>
            <button type="button" onClick={saveWindow} disabled={busy} className="btn-primary">Save window</button>
          </div>
        </section>

        <section aria-label="Roster" className="rule mt-10 pt-6">
          <h2 className="label">Roster</h2>
          <div className="mt-5 flex gap-2">
            <select aria-label="Event" value={rosterEvent} onChange={(e) => loadRoster(e.target.value)} className="field max-w-xs">
              <option value="">Select event…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            {roster && rosterEvent && (
              <a className="btn-ghost shrink-0" href={`/api/admin/events/${encodeURIComponent(rosterEvent)}/roster.csv`}>
                Download CSV (server)
              </a>
            )}
          </div>
          {roster && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm text-paper/80">
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className="label py-2 pr-6 text-left">Email</th>
                    <th scope="col" className="label py-2 pr-6 text-left">Status</th>
                    <th scope="col" className="label py-2 pr-6 text-left">Answers</th>
                    <th scope="col" className="label py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {roster.map((r) => (
                    <tr key={r.email}>
                      <td className="py-3 pr-6">{r.email}</td>
                      <td className="py-3 pr-6 font-mono text-xs uppercase tracking-wide">{r.status}</td>
                      <td className="py-3 pr-6">{Object.entries(r.answers).map(([k, v]) => `${k}: ${v}`).join('; ')}</td>
                      <td className="py-3 font-mono text-xs text-muted">{r.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label="Broadcast" className="rule mt-10 pt-6">
          <h2 className="label">Broadcast</h2>
          <p className="hint">Emails queue immediately, but delivery activates once club email is connected (mailer seam pending).</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-6 text-sm text-paper/80">
              <label><input type="radio" className="accent-signal" checked={aud === 'all'} onChange={() => setAud('all')} /> All members</label>
              <label><input type="radio" className="accent-signal" checked={aud === 'event'} onChange={() => setAud('event')} /> Per-event</label>
            </div>
            {aud === 'event' && (
              <select aria-label="Broadcast event" value={audEvent} onChange={(e) => setAudEvent(e.target.value)} className="field max-w-xs">
                <option value="">Select event…</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            )}
            <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="field" />
            <textarea aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={4} className="field resize-y" />
            <button type="button" className="btn-primary" disabled={busy || !subject.trim() || !body.trim()} onClick={broadcast}>Queue broadcast</button>
          </div>
        </section>

        <section aria-label="Content" className="rule mt-10 pt-6">
          <h2 className="label">Content</h2>
          {/* Hero/site-wide copy editing intentionally removed. */}
          <BearerEditor bearers={content?.bearers ?? []} onDone={async (m) => { setNotice(m); setContent(await fetchContent()); }} />
          <AchievementEditor achievements={content?.achievements ?? []} onDone={async (m) => { setNotice(m); setContent(await fetchContent()); }} />
        </section>

        <section aria-label="Outbox" className="rule mt-10 pb-4 pt-6">
          <h2 className="label">Outbox</h2>
          <div className="mt-5 flex gap-2" role="group" aria-label="Status filter">
            {(['pending', 'sent', 'failed'] as OutboxStatus[]).map((s) => (
              <button key={s} type="button" className={s === outboxStatus ? 'btn-primary' : 'btn-ghost'} onClick={() => setOutboxStatus(s)}>{s}</button>
            ))}
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm text-paper/80">
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className="label py-2 pr-6 text-left">To</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Subject</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Status</th>
                  <th scope="col" className="label py-2 pr-6 text-left">Tries</th>
                  <th scope="col" className="label py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {outbox.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pr-6">{o.to_email}</td>
                    <td className="py-3 pr-6">{o.subject}</td>
                    <td className="py-3 pr-6 font-mono text-xs uppercase tracking-wide">{o.status}</td>
                    <td className="py-3 pr-6 font-mono text-xs">{o.attempts}</td>
                    <td className="py-3 font-mono text-xs text-muted">{o.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
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
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="label">Office bearers</h3>
      <ul className="mt-4">
        {bearers.map((x) => {
          const ed = edits[x.id] ?? { name: x.name, role: x.role };
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2 border-t border-line py-3">
              <input aria-label="Bearer name" value={ed.name} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, name: e.target.value } })} className="field flex-1 min-w-[9rem]" />
              <input aria-label="Bearer role" value={ed.role} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, role: e.target.value } })} className="field flex-1 min-w-[9rem]" />
              <button type="button" className="btn-ghost shrink-0" onClick={() => run(() => updateBearer(x.id, { name: ed.name, role: ed.role }), `Saved ${ed.name}.`)}>Save</button>
              <button type="button" className="btn-ghost shrink-0" onClick={() => { if (window.confirm(`Delete ${x.name}?`)) void run(() => deleteBearer(x.id), `Deleted ${x.name}.`); }}>Delete</button>
            </li>
          );
        })}
      </ul>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await createBearer({ name, role }); setName(''); setRole(''); }, `Added ${name}.`); }}>
        <input aria-label="New bearer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field flex-1 min-w-[9rem]" />
        <input aria-label="New bearer role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="field flex-1 min-w-[9rem]" />
        <button type="submit" className="btn-primary shrink-0" disabled={!name.trim() || !role.trim()}>Add</button>
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
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="label">Achievements</h3>
      <ul className="mt-4">
        {achievements.map((a) => {
          const ed = edits[a.id] ?? { title: a.title, description: a.description };
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 border-t border-line py-3">
              <input aria-label="Achievement title" value={ed.title} onChange={(e) => setEdits({ ...edits, [a.id]: { ...ed, title: e.target.value } })} className="field flex-1 min-w-[9rem]" />
              <input aria-label="Achievement description" value={ed.description} onChange={(e) => setEdits({ ...edits, [a.id]: { ...ed, description: e.target.value } })} className="field flex-1 min-w-[9rem]" />
              <button type="button" className="btn-ghost shrink-0" onClick={() => run(() => updateAchievement(a.id, { title: ed.title, description: ed.description }), 'Saved achievement.')}>Save</button>
              <button type="button" className="btn-ghost shrink-0" onClick={() => { if (window.confirm(`Delete ${a.title}?`)) void run(() => deleteAchievement(a.id), 'Deleted achievement.'); }}>Delete</button>
            </li>
          );
        })}
      </ul>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await createAchievement({ title, description: desc }); setTitle(''); setDesc(''); }, `Added ${title}.`); }}>
        <input aria-label="New achievement title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="field flex-1 min-w-[9rem]" />
        <input aria-label="New achievement description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="field flex-1 min-w-[9rem]" />
        <button type="submit" className="btn-primary shrink-0" disabled={!title.trim() || !desc.trim()}>Add</button>
      </form>
    </div>
  );
}
