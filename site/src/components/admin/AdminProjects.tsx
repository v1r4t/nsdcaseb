import { useCallback, useEffect, useMemo, useState } from 'react';
import { createProject, deleteProject, listProjects, updateProject } from '../../lib/projects';
import type { Project, ProjectStatus } from '../../lib/projects';
import { listAdminEvents } from '../../lib/admin';
import { errText } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

interface ProjectFormState {
  title: string;
  author: string;
  summary: string;
  description: string;
  stackText: string;
  url: string;
  cover_url: string;
  event_id: string;
  status: ProjectStatus;
  sort_order: string;
  featured: boolean;
}

const EMPTY_FORM: ProjectFormState = {
  title: '',
  author: '',
  summary: '',
  description: '',
  stackText: '',
  url: '',
  cover_url: '',
  event_id: '',
  status: 'active',
  sort_order: '',
  featured: false,
};

const STATUSES: ProjectStatus[] = ['active', 'shipped', 'archived'];

function toForm(p: Project): ProjectFormState {
  return {
    title: p.title,
    author: p.author,
    summary: p.summary,
    description: p.description,
    stackText: p.stack.join(', '),
    url: p.url ?? '',
    cover_url: p.cover_url ?? '',
    event_id: p.event_id ?? '',
    status: p.status,
    sort_order: String(p.sort_order),
    featured: p.featured === true,
  };
}

/**
 * Mirror the worker's validateStack (worker/projects.ts): an array of at
 * most 12 strings, each at most 40 chars. The form splits on commas and
 * trims; empty entries are dropped so stray commas never 400.
 */
function parseStackText(raw: string): { ok: true; value: string[] } | { ok: false; error: string } {
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length > 12) return { ok: false, error: 'At most 12 stack tags.' };
  for (const item of items) {
    if (item.length > 40) return { ok: false, error: `Stack tag “${item.slice(0, 40)}” is over 40 characters.` };
  }
  return { ok: true, value: items };
}

/**
 * Mirror the worker's safeUrlScheme: http(s) absolute URLs plus
 * relative/scheme-less values pass; every other scheme (javascript:, data:)
 * is rejected before it can 400.
 */
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function urlOk(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  const match = SCHEME_RE.exec(trimmed);
  if (!match) return true;
  const scheme = match[0].slice(0, -1).toLowerCase();
  return scheme === 'http' || scheme === 'https';
}

/** Blank sort input means "leave it out"; otherwise it must be an integer. */
function parseSortOrder(raw: string): { ok: true; value: number | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, error: 'Sort order must be a whole number.' };
  return { ok: true, value: Number(trimmed) };
}

export default function AdminProjects({ busy, setBusy, notify }: PanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [eventTitles, setEventTitles] = useState<Map<string, string>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [pr, ev] = await Promise.all([listProjects(), listAdminEvents(true).catch(() => null)]);
      setProjects(pr.projects);
      if (ev) setEventTitles(new Map(ev.events.map((e) => [e.id, e.title])));
    } catch (err) {
      notify(errText(err));
    }
  }, [notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Featured first, then sort_order — client-side only, the API is untouched. */
  const sorted = useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          Number(b.featured === true) - Number(a.featured === true) || a.sort_order - b.sort_order,
      ),
    [projects],
  );

  async function run(fn: () => Promise<unknown>, msg: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      await refresh();
      notify(msg);
      return true;
    } catch (err) {
      notify(errText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function resetForm(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(p: Project): void {
    setEditingId(p.id);
    setForm(toForm(p));
    notify(`Editing ${p.title}.`);
  }

  function toggleFeatured(p: Project): void {
    void run(() => updateProject(p.id, { featured: !(p.featured === true) }), p.featured ? `Unfeatured ${p.title}.` : `Featured ${p.title}.`);
  }

  function remove(p: Project): void {
    if (!window.confirm(`Delete “${p.title}”?`)) return;
    void run(
      async () => {
        await deleteProject(p.id);
        if (editingId === p.id) resetForm();
      },
      `Deleted ${p.title}.`,
    );
  }

  /** Shared validation for create + edit; returns the API-ready fields or null. */
  function buildPayload(): {
    title: string;
    author: string | null;
    summary: string;
    description: string;
    stack: string[];
    url: string | null;
    cover_url: string | null;
    status: ProjectStatus;
    event_id: string | null;
    featured: boolean;
    sort_order: number | undefined;
  } | null {
    if (!form.title.trim()) {
      notify('Title is required.');
      return null;
    }
    const author = form.author.trim();
    if (author.length > 120) {
      notify('Author must be 120 characters or fewer.');
      return null;
    }
    const stack = parseStackText(form.stackText);
    if (!stack.ok) {
      notify(stack.error);
      return null;
    }
    if (!urlOk(form.url)) {
      notify('Project URL must be http(s) or a relative path.');
      return null;
    }
    if (!urlOk(form.cover_url)) {
      notify('Cover URL must be http(s) or a relative path.');
      return null;
    }
    const sort = parseSortOrder(form.sort_order);
    if (!sort.ok) {
      notify(sort.error);
      return null;
    }
    return {
      title: form.title.trim(),
      author: author === '' ? null : author,
      summary: form.summary,
      description: form.description,
      stack: stack.value,
      url: form.url.trim() === '' ? null : form.url.trim(),
      cover_url: form.cover_url.trim() === '' ? null : form.cover_url.trim(),
      status: form.status,
      event_id: form.event_id === '' ? null : form.event_id,
      featured: form.featured,
      sort_order: sort.value,
    };
  }

  async function submitCreate(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    const { sort_order, ...body } = payload;
    setBusy(true);
    try {
      const r = await createProject(body);
      // The worker POST ignores sort_order, so apply a non-zero one via PATCH.
      if (sort_order !== undefined && sort_order !== 0) {
        await updateProject(r.id, { sort_order });
      }
      resetForm();
      await refresh();
      notify(`Created project ${payload.title}.`);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    if (!editingId) return;
    const payload = buildPayload();
    if (!payload) return;
    const { sort_order, ...rest } = payload;
    const saved = await run(
      () => updateProject(editingId, sort_order === undefined ? rest : { ...rest, sort_order }),
      'Saved project.',
    );
    // Keep the form (and the user's edits) when the update failed; `run`
    // already surfaced the error.
    if (saved) resetForm();
  }

  return (
    <section aria-label="Projects" className="space-y-8">
      <div>
        <h2 className="label">Projects</h2>
        <ul className="mt-5">
          {sorted.map((p) => (
            <li key={p.id} className="border-t border-line py-4 last:border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-paper/80">
                    <span aria-hidden="true" className={p.featured ? 'text-signal' : 'text-muted'}>
                      {p.featured ? '★' : '☆'}{' '}
                    </span>
                    {p.title}
                    <span className="ml-3 font-mono text-[11px] uppercase tracking-wide text-muted">
                      {p.status}
                    </span>
                    {p.author !== '' && (
                      <span className="ml-3 font-mono text-[11px] uppercase tracking-wide text-muted">
                        by {p.author}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    sort {p.sort_order} · stack {p.stack.join(', ') || '—'} ·{' '}
                    {p.event_id ? `event ${eventTitles.get(p.event_id) ?? p.event_id.slice(0, 8)}` : 'no event'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    aria-pressed={p.featured === true}
                    aria-label={p.featured ? `Unfeature ${p.title}` : `Feature ${p.title}`}
                    title={p.featured ? 'Featured — click to unfeature' : 'Not featured — click to feature'}
                    onClick={toggleFeatured.bind(null, p)}
                  >
                    {p.featured ? '★' : '☆'}
                  </button>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => remove(p)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {sorted.length === 0 && <p className="mt-5 text-sm text-muted">No projects yet.</p>}
      </div>

      <div className="border-t border-line pt-6">
        <h3 className="label">{editingId ? 'Edit project' : 'Create project'}</h3>
        <form className="mt-5 space-y-3" onSubmit={editingId ? submitEdit : submitCreate}>
          <input
            aria-label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title"
            className="field"
            required
          />
          <div>
            <input
              aria-label="Author"
              value={form.author}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
              placeholder="Author (credit line, blank = none)"
              maxLength={120}
              className="field"
            />
            <p className="hint mt-1">Shown under the project on the public site. Max 120 characters.</p>
          </div>
          <textarea
            aria-label="Summary"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Summary (short line under the title)"
            rows={2}
            className="field resize-y"
          />
          <textarea
            aria-label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (longer detail)"
            rows={3}
            className="field resize-y"
          />
          <div>
            <input
              aria-label="Stack (comma-separated)"
              value={form.stackText}
              onChange={(e) => setForm({ ...form, stackText: e.target.value })}
              placeholder="Stack (comma-separated, e.g. React, TypeScript)"
              className="field"
            />
            <p className="hint mt-1">Comma-separated. Max 12 tags, 40 characters each — matches API validation.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              aria-label="Project URL"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="Project URL (blank = none)"
              inputMode="url"
              className="field"
            />
            <input
              aria-label="Cover URL"
              value={form.cover_url}
              onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
              placeholder="Cover image URL (blank = none)"
              inputMode="url"
              className="field"
            />
          </div>
          <p className="hint">Cover is a URL string only — paste an image URL. No upload flow here (posters live in Supabase via events).</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="label">Linked event</span>
              <select
                aria-label="Linked event"
                value={form.event_id}
                onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                className="field"
              >
                <option value="">No linked event</option>
                {[...eventTitles].map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">Status</span>
              <select
                aria-label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                className="field"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            aria-label="Sort order"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            placeholder="Sort order (blank = 0)"
            inputMode="numeric"
            className="field"
          />
          <p className="hint">Whole number. Featured projects list first regardless of sort order.</p>
          <label className="flex items-center gap-2 text-sm text-paper/80">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-signal"
            />
            Featured (standout project)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {editingId ? 'Save project' : 'Create project'}
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
