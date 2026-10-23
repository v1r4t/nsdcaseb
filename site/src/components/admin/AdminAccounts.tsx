import { useEffect, useState } from 'react';
import {
  listAdminUsers,
  sendAdminVerification,
  updateAdminUserRole,
  updateAdminUserVerified,
} from '../../lib/admin';
import type { AdminUser } from '../../lib/admin';
import { errText } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

export default function AdminAccounts({ busy, setBusy, notify }: PanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');

  // Debounced server-side search (the API matches email + name).
  useEffect(() => {
    let active = true;
    const t = window.setTimeout(() => {
      listAdminUsers(search.trim())
        .then((r) => {
          if (active) setUsers(r.users);
        })
        .catch((err: unknown) => {
          if (active) notify(errText(err));
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [search, notify]);

  async function changeRole(u: AdminUser, role: AdminUser['role']): Promise<void> {
    setBusy(true);
    try {
      await updateAdminUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      notify(`Updated ${u.email} to ${role}.`);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleVerified(u: AdminUser): Promise<void> {
    setBusy(true);
    try {
      await updateAdminUserVerified(u.id, !u.email_verified);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, email_verified: !u.email_verified } : x)));
      notify(`${!u.email_verified ? 'Verified' : 'Unverified'} ${u.email}.`);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function bulkVerify(): Promise<void> {
    setBusy(true);
    try {
      const r = await sendAdminVerification();
      setUsers((await listAdminUsers(search.trim())).users);
      notify(`Queued verification for ${r.queued} user(s).`);
    } catch (err) {
      notify(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Accounts and roles">
      <h2 className="label">Accounts and roles</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void bulkVerify()} className="btn-ghost" disabled={busy}>
          Send verification to unverified
        </button>
      </div>
      <input
        aria-label="Search accounts by email or name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search email or name…"
        className="field mt-4 max-w-xs"
      />
      {/* Mobile: stacked cards. sm+: scrollable table. */}
      <ul className="mt-5 space-y-3 sm:hidden">
        {users.map((u) => (
          <li key={u.id} className="space-y-2 border border-line p-3">
            <p className="break-all text-sm text-paper/90">{u.email}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Role for ${u.email}`}
                value={u.role}
                onChange={(e) => void changeRole(u, e.target.value as AdminUser['role'])}
                className="field min-w-[9rem] flex-1"
              >
                <option value="member">member</option>
                <option value="executive">executive</option>
                <option value="ob">ob</option>
              </select>
              <button type="button" onClick={() => void toggleVerified(u)} disabled={busy} className="btn-ghost shrink-0">
                {u.email_verified ? 'Verified' : 'Mark verified'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[32rem] text-left text-sm text-paper/80">
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
                <td className="py-3 pr-4 break-all">{u.email}</td>
                <td className="py-3 pr-4">
                  <select
                    aria-label={`Role for ${u.email}`}
                    value={u.role}
                    onChange={(e) => void changeRole(u, e.target.value as AdminUser['role'])}
                    className="field"
                  >
                    <option value="member">member</option>
                    <option value="executive">executive</option>
                    <option value="ob">ob</option>
                  </select>
                </td>
                <td className="py-3 pr-4">
                  <button type="button" onClick={() => void toggleVerified(u)} disabled={busy} className="btn-ghost">
                    {u.email_verified ? 'Verified' : 'Mark verified'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p className="mt-5 text-sm text-muted">No accounts match.</p>}
    </section>
  );
}
