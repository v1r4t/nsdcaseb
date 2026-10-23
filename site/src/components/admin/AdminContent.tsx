import { useEffect, useState } from 'react';
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
    </section>
  );
}

function BearerEditor({ bearers, onDone }: { bearers: OfficeBearer[]; onDone: (m: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [edits, setEdits] = useState<Record<string, { name: string; role: string }>>({});
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
      <h3 className="label">Office bearers</h3>
      <ul className="mt-4">
        {bearers.map((x) => {
          const ed = edits[x.id] ?? { name: x.name, role: x.role };
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2 border-t border-line py-3">
              <input aria-label="Bearer name" value={ed.name} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, name: e.target.value } })} className="field min-w-[9rem] flex-1" />
              <input aria-label="Bearer role" value={ed.role} onChange={(e) => setEdits({ ...edits, [x.id]: { ...ed, role: e.target.value } })} className="field min-w-[9rem] flex-1" />
              <button type="button" className="btn-ghost shrink-0" onClick={() => void run(() => updateBearer(x.id, { name: ed.name, role: ed.role }), `Saved ${ed.name}.`)}>
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
