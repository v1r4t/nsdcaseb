import { useCallback, useEffect, useState } from 'react';
import {
  adminCreateEvent,
  adminUpdateEvent,
  adminUploadPoster,
  listAdminEvents,
} from '../../lib/admin';
import type { AdminEventSummary } from '../../lib/admin';
import { getEvent } from '../../lib/events';
import type { EventQuestion } from '../../lib/events';
import { errText, fmtDateTime } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

interface QuestionDraft {
  id: string;
  label: string;
  required: boolean;
  maxLength: string;
}

interface EventFormState {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  reg_opens_at: string;
  reg_closes_at: string;
  capacity: string;
  force_closed: boolean;
}

const EMPTY_FORM: EventFormState = {
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  reg_opens_at: '',
  reg_closes_at: '',
  capacity: '',
  force_closed: false,
};

function newQuestionId(): string {
  return `q-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** datetime-local inputs need `YYYY-MM-DDTHH:mm`; server stores full ISO. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Mirror the worker's validateQuestions so the UI rejects the same input. */
function buildQuestions(drafts: QuestionDraft[]): { ok: true; value: EventQuestion[] } | { ok: false; error: string } {
  if (drafts.length > 20) return { ok: false, error: 'At most 20 questions per event.' };
  const out: EventQuestion[] = [];
  for (const d of drafts) {
    if (!d.label.trim() || d.label.length > 200) {
      return { ok: false, error: 'Each question needs a label (1–200 characters).' };
    }
    const maxLength = d.maxLength.trim() === '' ? 500 : Math.floor(Number(d.maxLength));
    if (!Number.isFinite(maxLength) || maxLength < 1 || maxLength > 500) {
      return { ok: false, error: `“${d.label.trim()}”: answer length must be 1–500.` };
    }
    out.push({ id: d.id, label: d.label.trim(), required: d.required, maxLength });
  }
  return { ok: true, value: out };
}

function registeredCount(e: AdminEventSummary): string {
  if (e.capacity === null || e.spots_left === null) return '—';
  return String(e.capacity - e.spots_left);
}

export default function AdminEvents({ busy, setBusy, notify }: PanelProps) {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [poster, setPoster] = useState<File | null>(null);

  const refresh = useCallback(
    async (includeArchived: boolean): Promise<void> => {
      try {
        const r = await listAdminEvents(includeArchived);
        setEvents(r.events);
      } catch (err) {
        notify(errText(err));
      }
    },
    [notify],
  );

  useEffect(() => {
    void refresh(showArchived);
  }, [refresh, showArchived]);

  function resetForm(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setQuestions([]);
    setPoster(null);
  }

  async function startEdit(e: AdminEventSummary): Promise<void> {
    setBusy(true);
    try {
      // Full detail carries description + questions, which the list omits.
      const { event } = await getEvent(e.id);
      setEditingId(e.id);
      setForm({
        title: event.title,
        description: event.description,
        starts_at: toLocalInput(event.starts_at),
        ends_at: toLocalInput(event.ends_at),
        reg_opens_at: toLocalInput(event.reg_opens_at),
        reg_closes_at: toLocalInput(event.reg_closes_at),
        capacity: event.capacity === null ? '' : String(event.capacity),
        // registration_open is false for force-closed AND archived events;
        // the row's own flag disambiguates.
        force_closed: !event.registration_open && !e.archived,
      });
      setQuestions(
        event.questions.map((q) => ({ id: q.id, label: q.label, required: q.required, maxLength: String(q.maxLength) })),
      );
      setPoster(null);
      notify(`Editing ${event.title}.`);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleOpen(e: AdminEventSummary): Promise<void> {
    setBusy(true);
    try {
      await adminUpdateEvent(e.id, { force_closed: e.registration_open });
      await refresh(showArchived);
      notify(e.registration_open ? `Closed registration for ${e.title}.` : `Reopened registration for ${e.title}.`);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(e: AdminEventSummary, archived: boolean): Promise<void> {
    if (!window.confirm(`${archived ? 'Archive' : 'Unarchive'} “${e.title}”?${archived ? ' It will disappear from the public list.' : ''}`)) return;
    setBusy(true);
    try {
      await adminUpdateEvent(e.id, { archived });
      await refresh(showArchived);
      notify(`${archived ? 'Archived' : 'Unarchived'} ${e.title}.`);
      if (editingId === e.id) resetForm();
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    const q = buildQuestions(questions);
    if (!q.ok) {
      notify(q.error);
      return;
    }
    setBusy(true);
    try {
      const r = await adminCreateEvent({
        title: form.title,
        description: form.description,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        reg_opens_at: new Date(form.reg_opens_at).toISOString(),
        reg_closes_at: new Date(form.reg_closes_at).toISOString(),
        capacity: form.capacity ? Number(form.capacity) : null,
        force_closed: form.force_closed,
        questions: q.value,
        // Poster is required once club storage is connected; in local dev
        // without storage the worker accepts a poster-less create.
        ...(poster ? { poster } : {}),
      });
      notify(`Created event ${r.id}.`);
      resetForm();
      await refresh(showArchived);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    if (!editingId) return;
    const q = buildQuestions(questions);
    if (!q.ok) {
      notify(q.error);
      return;
    }
    setBusy(true);
    try {
      await adminUpdateEvent(editingId, {
        title: form.title,
        description: form.description,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        reg_opens_at: new Date(form.reg_opens_at).toISOString(),
        reg_closes_at: new Date(form.reg_closes_at).toISOString(),
        capacity: form.capacity ? Number(form.capacity) : null,
        force_closed: form.force_closed,
        questions: q.value,
      });
      if (poster) {
        try {
          await adminUploadPoster(editingId, poster);
        } catch (uploadErr) {
          notify(`Saved event, but the poster upload failed: ${errText(uploadErr)}`);
          await refresh(showArchived);
          return;
        }
      }
      notify('Saved event.');
      resetForm();
      await refresh(showArchived);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Events" className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="label">Events</h2>
          <label className="flex items-center gap-2 text-sm text-paper/80">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-signal"
            />
            Show archived
          </label>
        </div>
        <ul className="mt-5">
          {events.map((e) => (
            <li key={e.id} className="border-t border-line py-4 last:border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-paper/80">
                    {e.title}
                    <span className={`ml-3 font-mono text-[11px] uppercase tracking-wide ${e.registration_open ? 'text-signal' : 'text-muted'}`}>
                      {e.archived ? 'Archived' : e.registration_open ? 'Open' : 'Closed'}
                    </span>
                    <span className="ml-3 font-mono text-[11px] uppercase tracking-wide text-muted">cap {e.capacity ?? '∞'}</span>
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {fmtDateTime(e.starts_at)} · registered {registeredCount(e)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void startEdit(e)}>
                    Edit
                  </button>
                  {!e.archived && (
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => void toggleOpen(e)}>
                      {e.registration_open ? 'Close' : 'Open'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void setArchived(e, !e.archived)}
                  >
                    {e.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {events.length === 0 && (
          <p className="mt-5 text-sm text-muted">No events{showArchived ? '' : ' (archived hidden)'}.</p>
        )}
      </div>

      <div className="border-t border-line pt-6">
        <h3 className="label">{editingId ? 'Edit event' : 'Create event'}</h3>
        <form className="mt-5 space-y-3" onSubmit={editingId ? submitEdit : submitCreate}>
          <input
            aria-label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title"
            className="field"
            required
          />
          <textarea
            aria-label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description"
            rows={3}
            className="field resize-y"
          />
          <p className="label mt-2">Event schedule</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="label">Event starts</span>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="field" required />
              <span className="hint">When the event actually begins.</span>
            </label>
            <label className="space-y-1">
              <span className="label">Event ends</span>
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="field" required />
              <span className="hint">When the event finishes.</span>
            </label>
          </div>
          <p className="label mt-3">Registration window</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="label">Registration opens</span>
              <input type="datetime-local" value={form.reg_opens_at} onChange={(e) => setForm({ ...form, reg_opens_at: e.target.value })} className="field" required />
              <span className="hint">When people first can register.</span>
            </label>
            <label className="space-y-1">
              <span className="label">Registration closes</span>
              <input type="datetime-local" value={form.reg_closes_at} onChange={(e) => setForm({ ...form, reg_closes_at: e.target.value })} className="field" required />
              <span className="hint">Deadline after which the form closes.</span>
            </label>
          </div>
          <input
            aria-label="Capacity"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            placeholder="Capacity (blank = unlimited)"
            inputMode="numeric"
            className="field"
          />
          <label className="flex items-center gap-2 text-sm text-paper/80">
            <input
              type="checkbox"
              checked={form.force_closed}
              onChange={(e) => setForm({ ...form, force_closed: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-signal"
            />
            Force closed now
          </label>
          <div>
            <input
              aria-label="Poster"
              type="file"
              accept="image/*"
              onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
              className="field"
              required={!editingId}
            />
            <p className="hint mt-1">
              {editingId
                ? 'Leave empty to keep the current poster.'
                : 'Poster image. In local dev without club storage configured, creation works without one.'}
            </p>
          </div>

          <div className="border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="label">Registration questions ({questions.length}/20)</h4>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || questions.length >= 20}
                onClick={() => setQuestions([...questions, { id: newQuestionId(), label: '', required: false, maxLength: '500' }])}
              >
                Add question
              </button>
            </div>
            <ul className="mt-3 space-y-3">
              {questions.map((q, i) => (
                <li key={q.id} className="space-y-2 border border-line p-3">
                  <input
                    aria-label={`Question ${i + 1} label`}
                    value={q.label}
                    onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)))}
                    placeholder={`Question ${i + 1} label`}
                    maxLength={200}
                    className="field"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-paper/80">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, required: e.target.checked } : x)))}
                        className="h-4 w-4 shrink-0 accent-signal"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm text-paper/80">
                      Max length
                      <input
                        aria-label={`Question ${i + 1} max length`}
                        value={q.maxLength}
                        onChange={(e) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, maxLength: e.target.value } : x)))}
                        placeholder="500"
                        inputMode="numeric"
                        className="field w-24"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-ghost ml-auto"
                      onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {editingId ? 'Save event' : 'Create event'}
            </button>
            {editingId && (
              <button type="button" disabled={busy} className="btn-ghost" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
