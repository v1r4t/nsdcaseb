import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  decideRecruitmentApplication,
  listRecruitmentApplications,
  setRecruitmentOpen,
} from '../../lib/admin';
import type { RecruitmentApplication, RecruitmentStatus } from '../../lib/admin';
import { loadSiteState } from '../../lib/site';
import { errText, fmtDateTime } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

type StatusFilter = 'all' | RecruitmentStatus;

const FILTERS: StatusFilter[] = ['all', 'pending', 'selected', 'rejected'];

const STATUS_ORDER: RecruitmentStatus[] = ['pending', 'selected', 'rejected'];

/** Newest first; stable on the name when dates are missing or tied. */
function sortApplications(list: RecruitmentApplication[]): RecruitmentApplication[] {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Fetch every status explicitly instead of relying on a status-less list:
 * the counts need all three buckets regardless of how the worker treats the
 * query parameter. Dedupe by id in case a worker ignores the filter.
 */
async function fetchAllApplications(): Promise<RecruitmentApplication[]> {
  const pages = await Promise.all(
    STATUS_ORDER.map((status) => listRecruitmentApplications(status)),
  );
  const byId = new Map<string, RecruitmentApplication>();
  for (const page of pages) {
    for (const app of page.applications) byId.set(app.id, app);
  }
  return sortApplications([...byId.values()]);
}

function statusTone(status: RecruitmentStatus): string {
  if (status === 'selected') return 'text-signal';
  if (status === 'rejected') return 'text-muted';
  return 'text-paper/80';
}

function StatusBadge({ status }: { status: RecruitmentStatus }) {
  return (
    <span className={`font-mono text-[11px] uppercase tracking-wide ${statusTone(status)}`}>
      {status}
    </span>
  );
}

function Answers({ app }: { app: RecruitmentApplication }) {
  const fields: Array<[string, string]> = [
    ['Why join', app.why_join],
    ['Can contribute', app.contribute],
    ['Time commitment', app.time_commitment],
    ['Remarks', app.remarks],
  ];
  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-signal">
        Answers
      </summary>
      <dl className="mt-2 space-y-2 text-sm text-paper/80">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value?.trim() ? value : '—'}</dd>
          </div>
        ))}
      </dl>
      {app.decided_at ? (
        <p className="mt-2 font-mono text-xs text-muted">Decided {fmtDateTime(app.decided_at)}</p>
      ) : null}
    </details>
  );
}

function DecisionButtons({
  app,
  busy,
  onDecide,
}: {
  app: RecruitmentApplication;
  busy: boolean;
  onDecide: (app: RecruitmentApplication, status: Exclude<RecruitmentStatus, 'pending'>) => void;
}) {
  if (app.status !== 'pending') return <span className="font-mono text-xs text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => onDecide(app, 'selected')}
      >
        Select
      </button>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={() => onDecide(app, 'rejected')}
      >
        Reject
      </button>
    </div>
  );
}

export default function AdminRecruitment({ busy, setBusy, notify }: PanelProps) {
  const [apps, setApps] = useState<RecruitmentApplication[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [recruitmentOpen, setRecruitmentOpenState] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setApps(await fetchAllApplications());
      setError('');
    } catch (err) {
      const msg = errText(err);
      setError(msg);
      notify(msg);
    }
  }, [notify]);

  useEffect(() => {
    let active = true;
    fetchAllApplications()
      .then((list) => {
        if (!active) return;
        setApps(list);
        setError('');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = errText(err);
        setError(msg);
        notify(msg);
      });
    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    let active = true;
    loadSiteState()
      .then((state) => {
        if (active) setRecruitmentOpenState(state.recruitment_open);
      })
      .catch(() => {
        // Unknown state keeps the toggle disabled rather than guessing.
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, pending: 0, selected: 0, rejected: 0 };
    for (const app of apps ?? []) {
      c.all += 1;
      c[app.status] += 1;
    }
    return c;
  }, [apps]);

  const visible = useMemo(
    () => (apps ?? []).filter((app) => filter === 'all' || app.status === filter),
    [apps, filter],
  );

  async function decide(
    app: RecruitmentApplication,
    status: Exclude<RecruitmentStatus, 'pending'>,
  ): Promise<void> {
    const verb = status === 'selected' ? 'Select' : 'Reject';
    if (!window.confirm(`${verb} ${app.name}? This decision is final.`)) return;
    setDecidingId(app.id);
    setBusy(true);
    try {
      const result = await decideRecruitmentApplication(app.id, status);
      setApps((prev) =>
        (prev ?? []).map((row) =>
          row.id === app.id
            ? { ...row, status: result.status, decided_at: new Date().toISOString() }
            : row,
        ),
      );
      notify(`${status === 'selected' ? 'Selected' : 'Rejected'} ${app.name}.`);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notify('This application was already decided. Refreshing…');
        await reload();
      } else {
        notify(errText(err));
      }
    } finally {
      setDecidingId(null);
      setBusy(false);
    }
  }

  function onDecide(
    app: RecruitmentApplication,
    status: Exclude<RecruitmentStatus, 'pending'>,
  ): void {
    void decide(app, status);
  }

  async function toggleRecruitment(): Promise<void> {
    if (recruitmentOpen === null) return;
    const next = !recruitmentOpen;
    const pendingNote =
      counts.pending > 0
        ? ` ${counts.pending} application${counts.pending === 1 ? '' : 's'} still pending.`
        : '';
    const question = next
      ? 'Open recruitment? /recruit will accept new applications.'
      : `Close recruitment? /recruit will show the closed state.${pendingNote}`;
    if (!window.confirm(question)) return;
    setToggling(true);
    setBusy(true);
    try {
      await setRecruitmentOpen(next);
      setRecruitmentOpenState(next);
      notify(next ? 'Recruitment opened.' : 'Recruitment closed.');
    } catch (err) {
      notify(errText(err));
    } finally {
      setToggling(false);
      setBusy(false);
    }
  }

  const csvHref =
    filter === 'all'
      ? '/api/admin/recruitment.csv'
      : `/api/admin/recruitment.csv?status=${filter}`;

  return (
    <section aria-label="Recruitment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label">Recruitment</h2>
        <a className="btn-ghost shrink-0" href={csvHref}>
          Download CSV
        </a>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p role="status" aria-live="polite" className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Recruitment{' '}
          <span className={recruitmentOpen ? 'text-signal' : recruitmentOpen === false ? 'text-paper/80' : 'text-muted'}>
            {recruitmentOpen === null ? 'checking…' : recruitmentOpen ? 'open' : 'closed'}
          </span>
        </p>
        <button
          type="button"
          className={recruitmentOpen ? 'btn-ghost shrink-0' : 'btn-primary shrink-0'}
          disabled={busy || toggling || recruitmentOpen === null}
          onClick={() => void toggleRecruitment()}
        >
          {toggling ? 'Saving…' : recruitmentOpen ? 'Close recruitment' : 'Open recruitment'}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Application status filter">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            className={filter === f ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f} ({counts[f]})
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-5 border-t border-line pt-4">
          <p role="alert" aria-live="assertive" className="error-text text-sm">
            {error}
          </p>
          <button type="button" className="btn-ghost mt-3" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      {apps === null && !error && (
        <p aria-live="polite" className="mt-5 font-mono text-xs uppercase tracking-wide text-muted">
          Loading applications…
        </p>
      )}

      {apps !== null && visible.length === 0 && (
        <p className="mt-5 text-sm text-muted">
          {filter === 'all'
            ? 'No applications yet.'
            : `No ${filter} applications.`}
        </p>
      )}

      {/* Mobile: stacked cards. sm+: table with an expandable answers row. */}
      {visible.length > 0 && (
        <ul className="mt-5 space-y-3 sm:hidden">
          {visible.map((app) => (
            <li key={app.id} className="border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="break-words text-sm text-paper/90">{app.name}</p>
                <StatusBadge status={app.status} />
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">
                {[app.year, app.branch].filter(Boolean).join(' · ')}
              </p>
              <dl className="mt-2 space-y-1 text-sm text-paper/80">
                <div>
                  <dt className="label">Email</dt>
                  <dd className="break-all">{app.email}</dd>
                </div>
                <div>
                  <dt className="label">Register ID</dt>
                  <dd className="break-words">{app.reg_number || '—'}</dd>
                </div>
                <div>
                  <dt className="label">Phone</dt>
                  <dd className="break-words">{app.phone || '—'}</dd>
                </div>
              </dl>
              <p className="mt-2 font-mono text-xs text-muted">Applied {fmtDateTime(app.created_at)}</p>
              <Answers app={app} />
              <div className="mt-3">
                <DecisionButtons
                  app={app}
                  busy={busy || decidingId === app.id}
                  onDecide={onDecide}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div className="mt-5 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[44rem] text-left text-sm text-paper/80">
            <thead className="sticky top-0 border-b border-line bg-[inherit]">
              <tr>
                <th scope="col" className="label py-2 pr-6 text-left">Applicant</th>
                <th scope="col" className="label py-2 pr-6 text-left">Year · branch</th>
                <th scope="col" className="label py-2 pr-6 text-left">Register ID · phone</th>
                <th scope="col" className="label py-2 pr-6 text-left">Applied</th>
                <th scope="col" className="label py-2 pr-6 text-left">Status</th>
                <th scope="col" className="label py-2 text-left">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((app) => (
                <FragmentRow
                  key={app.id}
                  app={app}
                  busy={busy || decidingId === app.id}
                  onDecide={onDecide}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FragmentRow({
  app,
  busy,
  onDecide,
}: {
  app: RecruitmentApplication;
  busy: boolean;
  onDecide: (app: RecruitmentApplication, status: Exclude<RecruitmentStatus, 'pending'>) => void;
}) {
  return (
    <>
      <tr>
        <td className="py-3 pr-6">
          <span className="block break-words text-paper/90">{app.name}</span>
          <span className="block break-all font-mono text-xs text-muted">{app.email}</span>
        </td>
        <td className="py-3 pr-6">{[app.year, app.branch].filter(Boolean).join(' · ') || '—'}</td>
        <td className="py-3 pr-6">
          <span className="block break-words">{app.reg_number || '—'}</span>
          <span className="block font-mono text-xs text-muted">{app.phone || '—'}</span>
        </td>
        <td className="whitespace-nowrap py-3 pr-6 font-mono text-xs text-muted">
          {fmtDateTime(app.created_at)}
        </td>
        <td className="py-3 pr-6">
          <StatusBadge status={app.status} />
        </td>
        <td className="py-3">
          <DecisionButtons app={app} busy={busy} onDecide={onDecide} />
        </td>
      </tr>
      <tr>
        <td colSpan={6} className="pb-3">
          <Answers app={app} />
        </td>
      </tr>
    </>
  );
}
