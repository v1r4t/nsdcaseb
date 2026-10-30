import { useEffect, useState } from 'react';
import {
  deleteAdminUser,
  listAdminUsers,
  sendAdminVerification,
  updateAdminUserRole,
  updateAdminUserVerified,
} from '../../lib/admin';
import type { AdminUser } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import { errText } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

export default function AdminAccounts({ busy, setBusy, notify }: PanelProps) {
  const { user: me, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  function openDelete(u: AdminUser): void {
    setPendingDelete(u);
    setConfirmEmail('');
    setDeleteError(null);
  }

  function closeDelete(): void {
    setPendingDelete(null);
    setConfirmEmail('');
    setDeleteError(null);
  }

  async function confirmDelete(): Promise<void> {
    const target = pendingDelete;
    if (!target || confirmEmail !== target.email) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const result = await deleteAdminUser(target.id);
      setUsers((prev) => prev.filter((x) => x.id !== target.id));
      notify(
        `Deleted ${target.email} (${result.registrations} registrations removed, ${result.promotions.length} promoted).`,
      );
      closeDelete();
    } catch (err) {
      setDeleteError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  // Until the session is known we cannot tell which row is ours, so no Delete
  // action is rendered at all (never a flash of self-delete).
  const canDelete = (u: AdminUser): boolean => !authLoading && me !== null && me.id !== u.id;

  return (
    <section aria-label="Accounts and roles">
      <h2 className="font-display text-2xl text-ink">Accounts and roles</h2>
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
      {pendingDelete && (
        <div
          role="alertdialog"
          aria-label={`Delete account ${pendingDelete.email}`}
          className="mt-4 space-y-3 border border-seal/40 bg-paper p-4"
        >
          <p className="text-sm text-ink">
            Delete <span className="break-all font-medium">{pendingDelete.email}</span>?
          </p>
          <p className="text-sm text-quiet">
            This permanently removes the account, its registrations and pending mail. Waitlisted people
            will be promoted.
          </p>
          <p className="mono text-quiet">
            {pendingDelete.registrations_count} registration(s)
          </p>
          <label className="block text-sm text-ink">
            Type the email to confirm
            <input
              aria-label="Confirm email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="field mt-1 max-w-xs"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          {deleteError && (
            <p role="alert" className="text-sm text-seal">
              {deleteError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void confirmDelete()}
              className="btn-primary"
              disabled={busy || confirmEmail !== pendingDelete.email}
            >
              Delete account
            </button>
            <button type="button" onClick={closeDelete} className="btn-ghost" disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Mobile: stacked cards. sm+: scrollable table. */}
      <ul className="mt-5 space-y-3 sm:hidden">
        {users.map((u) => (
          <li key={u.id} className="space-y-2 border hairline p-3">
            <p className="break-all text-sm text-ink">{u.email}</p>
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
              {canDelete(u) && (
                <button
                  type="button"
                  onClick={() => openDelete(u)}
                  disabled={busy}
                  className="btn-ghost shrink-0"
                  aria-label={`Delete ${u.email}`}
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[32rem] text-left text-sm text-ink/80">
          <thead className="border-b hairline">
            <tr>
              <th className="mono py-2 pr-4 text-left text-ink">Email</th>
              <th className="mono py-2 pr-4 text-left text-ink">Role</th>
              <th className="mono py-2 pr-4 text-left text-ink">Verified</th>
              <th className="mono py-2 pr-4 text-left text-ink">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--hairline)]">
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
                <td className="py-3 pr-4">
                  {canDelete(u) ? (
                    <button
                      type="button"
                      onClick={() => openDelete(u)}
                      disabled={busy}
                      className="btn-ghost"
                      aria-label={`Delete ${u.email}`}
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="mono text-quiet">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p className="mt-5 text-sm text-quiet">No accounts match.</p>}
    </section>
  );
}
