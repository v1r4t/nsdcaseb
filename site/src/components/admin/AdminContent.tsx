import { useCallback, useEffect, useState } from 'react';
import { fetchContent } from '../../lib/content';
import type { Achievement, OfficeBearer } from '../../lib/content';
import {
  createAchievement,
  createBearer,
  deleteAchievement,
  deleteBearer,
  updateAchievement,
  updateBearer,
} from '../../lib/admin';
import {
  ApiError,
  createTestimonial,
  deleteTestimonial,
  listTestimonials,
  updateTestimonial,
} from '../../lib/projects';
import type { Testimonial } from '../../lib/projects';
import { errText } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

export default function AdminContent({ notify }: PanelProps) {
  const [bearers, setBearers] = useState<OfficeBearer[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    let active = true;
    fetchContent()
      .then((c) => {
        if (!active) return;
        setBearers(c.bearers);
        setAchievements(c.achievements);
      })
      .catch((err: unknown) => {
        if (active) notify(errText(err));
      });
    return () => {
      active = false;
    };
  }, [notify]);

  async function refresh(): Promise<void> {
    const c = await fetchContent();
    setBearers(c.bearers);
    setAchievements(c.achievements);
  }

  return (
    <section aria-label="Content">
      <h2 className="label">Content</h2>
      {/* Hero/site-wide copy editing intentionally removed. */}
      <BearerEditor
        bearers={bearers}
        onDone={async (m) => {
          notify(m);
          await refresh();
        }}
      />
      <AchievementEditor
        achievements={achievements}
        onDone={async (m) => {
          notify(m);
          await refresh();
        }}
      />
      <TestimonialsEditor notify={notify} />
    </section>
  );
}

/** One link per line: `Label https://…`. Returns null on any bad line. */
function parseLinksText(raw: string): { label: string; url: string }[] | null {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const out: { label: string; url: string }[] = [];
  for (const line of lines) {
    const cut = line.lastIndexOf(' ');
    if (cut <= 0) return null;
    const label = line.slice(0, cut).trim();
    const url = line.slice(cut + 1).trim();
    if (!label || label.length > 60) return null;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    out.push({ label, url: parsed.toString() });
  }
  if (out.length > 10) return null;
  return out;
}

function linksText(links: { label: string; url: string }[]): string {
  return links.map((link) => `${link.label} ${link.url}`).join('\n');
}

function BearerEditor({ bearers, onDone }: { bearers: OfficeBearer[]; onDone: (m: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [edits, setEdits] = useState<Record<string, { name: string; role: string; links: string }>>({});
  async function run(fn: () => Promise<unknown>, msg: string): Promise<void> {
    try {
      await fn();
      await onDone(msg);
    } catch (err) {
      await onDone(errText(err));
    }
  }
  async function save(id: string, ed: { name: string; role: string; links: string }, fallbackName: string): Promise<void> {
    const links = parseLinksText(ed.links);
    if (links === null) {
      await onDone('Links must be one "Label https://…" per line.');
      return;
    }
    await run(() => updateBearer(id, { name: ed.name, role: ed.role, links }), `Saved ${ed.name || fallbackName}.`);
  }
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="label">Office bearers</h3>
      <ul className="mt-4">
        {bearers.map((x) => {
          const ed = edits[x.id] ?? { name: x.name, role: x.role, links: linksText(x.links) };
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2 border-t border-line py-3">
              <input aria-label="Bearer name" value={ed.name} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, name: e.target.value } })} className="field min-w-[9rem] flex-1" />
              <input aria-label="Bearer role" value={ed.role} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, role: e.target.value } })} className="field min-w-[9rem] flex-1" />
              <textarea
                aria-label="Bearer links, one Label and URL per line"
                value={ed.links}
                onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, links: e.target.value } })}
                placeholder="Label https://… (one per line)"
                rows={2}
                className="field min-w-[9rem] flex-1"
              />
              <button type="button" className="btn-ghost shrink-0" onClick={() => void save(x.id, ed, x.name)}>
                Save
              </button>
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  if (window.confirm(`Delete ${x.name}?`)) void run(() => deleteBearer(x.id), `Deleted ${x.name}.`);
                }}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () => {
              await createBearer({ name, role });
              setName('');
              setRole('');
            },
            `Added ${name}.`,
          );
        }}
      >
        <input aria-label="New bearer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field min-w-[9rem] flex-1" />
        <input aria-label="New bearer role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="field min-w-[9rem] flex-1" />
        <button type="submit" className="btn-primary shrink-0" disabled={!name.trim() || !role.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

function AchievementEditor({ achievements, onDone }: { achievements: Achievement[]; onDone: (m: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [edits, setEdits] = useState<Record<string, { title: string; description: string }>>({});
  async function run(fn: () => Promise<unknown>, msg: string): Promise<void> {
    try {
      await fn();
      await onDone(msg);
    } catch (err) {
      await onDone(errText(err));
    }
  }
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="label">Achievements</h3>
      <ul className="mt-4">
        {achievements.map((a) => {
          const ed = edits[a.id] ?? { title: a.title, description: a.description };
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 border-t border-line py-3">
              <input aria-label="Achievement title" value={ed.title} onChange={(e) => setEdits({ ...edits, [a.id]: { ...ed, title: e.target.value } })} className="field min-w-[9rem] flex-1" />
              <input aria-label="Achievement description" value={ed.description} onChange={(e) => setEdits({ ...edits, [a.id]: { ...ed, description: e.target.value } })} className="field min-w-[9rem] flex-1" />
              <button type="button" className="btn-ghost shrink-0" onClick={() => void run(() => updateAchievement(a.id, { title: ed.title, description: ed.description }), 'Saved achievement.')}>
                Save
              </button>
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  if (window.confirm(`Delete ${a.title}?`)) void run(() => deleteAchievement(a.id), 'Deleted achievement.');
                }}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () => {
              await createAchievement({ title, description: desc });
              setTitle('');
              setDesc('');
            },
            `Added ${title}.`,
          );
        }}
      >
        <input aria-label="New achievement title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="field min-w-[9rem] flex-1" />
        <input aria-label="New achievement description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="field min-w-[9rem] flex-1" />
        <button type="submit" className="btn-primary shrink-0" disabled={!title.trim() || !desc.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

interface TestimonialEdits {
  quote: string;
  name: string;
  role: string;
  sortOrder: string;
}

function editsFor(t: Testimonial): TestimonialEdits {
  return { quote: t.quote, name: t.name, role: t.role, sortOrder: String(t.sort_order) };
}

/**
 * Mirror the worker's testimonial validation (worker/projects.ts): quote and
 * name are required after trimming, role is any string, and sort_order is an
 * integer. Blank means "keep the current/fallback value".
 */
function parseSortOrder(raw: string, fallback: number): { ok: true; value: number } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: fallback };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return { ok: false };
  return { ok: true, value };
}

/**
 * `errText` checks lib/admin's ApiError class, but the testimonials client
 * throws lib/projects' class. Map our code so real API errors still surface.
 */
function testimonialErrText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.error === 'network_error') return 'Could not reach the server.';
    return `Request failed (${err.error}).`;
  }
  return 'Something went wrong.';
}

function TestimonialsEditor({ notify }: { notify: (m: string) => void }) {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [edits, setEdits] = useState<Record<string, TestimonialEdits>>({});
  const [saving, setSaving] = useState(false);
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await listTestimonials();
      setTestimonials(r.testimonials);
    } catch (err) {
      notify(testimonialErrText(err));
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, msg: string): Promise<boolean> {
    setSaving(true);
    try {
      await fn();
      await load();
      notify(msg);
      return true;
    } catch (err) {
      notify(testimonialErrText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function edit(id: string, t: Testimonial, patch: Partial<TestimonialEdits>): void {
    setEdits({ ...edits, [id]: { ...(edits[id] ?? editsFor(t)), ...patch } });
  }

  function forget(id: string): void {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function save(t: Testimonial): Promise<void> {
    const ed = edits[t.id] ?? editsFor(t);
    const quoteText = ed.quote.trim();
    const nameText = ed.name.trim();
    if (quoteText === '') {
      notify('Quote is required.');
      return;
    }
    if (nameText === '') {
      notify('Name is required.');
      return;
    }
    const sort = parseSortOrder(ed.sortOrder, t.sort_order);
    if (!sort.ok) {
      notify('Sort order must be a whole number.');
      return;
    }
    const saved = await run(
      () =>
        updateTestimonial(t.id, {
          quote: quoteText,
          name: nameText,
          role: ed.role,
          sort_order: sort.value,
        }),
      `Saved the testimonial from ${nameText}.`,
    );
    if (saved) forget(t.id);
  }

  async function remove(t: Testimonial): Promise<void> {
    if (!window.confirm(`Delete the testimonial from ${t.name}?`)) return;
    const deleted = await run(() => deleteTestimonial(t.id), `Deleted the testimonial from ${t.name}.`);
    if (deleted) forget(t.id);
  }

  async function create(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    const quoteText = quote.trim();
    const nameText = name.trim();
    if (quoteText === '') {
      notify('Quote is required.');
      return;
    }
    if (nameText === '') {
      notify('Name is required.');
      return;
    }
    const sort = parseSortOrder(sortOrder, 0);
    if (!sort.ok) {
      notify('Sort order must be a whole number.');
      return;
    }
    const created = await run(async () => {
      const r = await createTestimonial({ quote: quoteText, name: nameText, role });
      // The worker POST ignores sort_order, so apply a non-zero one via PATCH.
      if (sort.value !== 0) await updateTestimonial(r.id, { sort_order: sort.value });
    }, `Added the testimonial from ${nameText}.`);
    if (created) {
      setQuote('');
      setName('');
      setRole('');
      setSortOrder('');
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="label">Testimonials</h3>
      <ul className="mt-4">
        {testimonials.map((t) => {
          const ed = edits[t.id] ?? editsFor(t);
          return (
            <li key={t.id} className="flex flex-wrap items-start gap-2 border-t border-line py-3">
              <textarea
                aria-label="Testimonial quote"
                value={ed.quote}
                onChange={(e) => edit(t.id, t, { quote: e.target.value })}
                placeholder="Quote"
                rows={2}
                className="field min-w-[12rem] flex-1"
              />
              <input
                aria-label="Testimonial name"
                value={ed.name}
                onChange={(e) => edit(t.id, t, { name: e.target.value })}
                placeholder="Name"
                className="field min-w-[9rem] flex-1"
              />
              <input
                aria-label="Testimonial role"
                value={ed.role}
                onChange={(e) => edit(t.id, t, { role: e.target.value })}
                placeholder="Role (optional)"
                className="field min-w-[9rem] flex-1"
              />
              <input
                aria-label="Testimonial sort order"
                value={ed.sortOrder}
                onChange={(e) => edit(t.id, t, { sortOrder: e.target.value })}
                placeholder="0"
                inputMode="numeric"
                className="field w-24 shrink-0"
              />
              <button type="button" className="btn-ghost shrink-0" disabled={saving} onClick={() => void save(t)}>
                Save
              </button>
              <button type="button" className="btn-ghost shrink-0" disabled={saving} onClick={() => void remove(t)}>
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      {testimonials.length === 0 && <p className="mt-4 text-sm text-muted">No testimonials yet.</p>}
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => void create(e)}>
        <textarea
          aria-label="New testimonial quote"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Quote"
          rows={2}
          className="field min-w-[12rem] flex-1 basis-full"
        />
        <input
          aria-label="New testimonial name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="field min-w-[9rem] flex-1"
        />
        <input
          aria-label="New testimonial role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (optional)"
          className="field min-w-[9rem] flex-1"
        />
        <input
          aria-label="New testimonial sort order"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="Sort order (blank = 0)"
          inputMode="numeric"
          className="field w-28 shrink-0"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={saving || !quote.trim() || !name.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
