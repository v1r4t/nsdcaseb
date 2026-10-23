import { useEffect, useState } from 'react';
import { ApiError, getStats } from '../../lib/admin';
import type { AdminStats } from '../../lib/admin';

export interface PanelProps {
  busy: boolean;
  setBusy: (b: boolean) => void;
  notify: (m: string) => void;
}

export function errText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.error === 'network_error') return 'Could not reach the server.';
    return `Request failed (${err.error}).`;
  }
  return 'Something went wrong.';
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function AdminOverview({ notify }: PanelProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let active = true;
    getStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch((err: unknown) => {
        if (active) notify(errText(err));
      });
    return () => {
      active = false;
    };
  }, [notify]);

  return (
    <section aria-label="Overview">
      <h2 className="label">Overview</h2>
      {stats ? (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          {[
            ['Members', stats.users_total],
            ['Executives', stats.users_by_role.executive],
            ['Events', stats.events_total],
            ['Registrations', stats.registrations_total],
            ['Waitlisted', stats.registrations_by_status.waitlisted],
            ['Emails pending', stats.outbox.pending],
          ].map(([label, n]) => (
            <div key={label as string} className="border-t border-line pt-3">
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</dt>
              <dd className="mt-1 font-mono text-2xl font-medium leading-none text-paper">{n}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-5 font-mono text-xs uppercase tracking-wide text-muted">Loading stats…</p>
      )}
    </section>
  );
}
