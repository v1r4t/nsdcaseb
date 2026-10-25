import { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const AdminOverview = lazy(() => import('../components/admin/AdminOverview'));
const AdminEvents = lazy(() => import('../components/admin/AdminEvents'));
const AdminRegistrations = lazy(() => import('../components/admin/AdminRegistrations'));
const AdminRecruitment = lazy(() => import('../components/admin/AdminRecruitment'));
const AdminEmail = lazy(() => import('../components/admin/AdminEmail'));
const AdminContent = lazy(() => import('../components/admin/AdminContent'));
const AdminProjects = lazy(() => import('../components/admin/AdminProjects'));
const AdminMedia = lazy(() => import('../components/admin/AdminMedia'));
const AdminAccounts = lazy(() => import('../components/admin/AdminAccounts'));

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'events', label: 'Events' },
  { id: 'registrations', label: 'Registrations' },
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'email', label: 'Email' },
  { id: 'projects', label: 'Projects' },
  { id: 'media', label: 'Media' },
  { id: 'content', label: 'Content' },
  { id: 'accounts', label: 'Accounts' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Admin() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<TabId>('overview');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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

  return (
    <div className="shell py-12 md:py-16">
      <div className="max-w-5xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-paper">Admin dashboard</h1>
        <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm text-paper/80">{notice}</p>

        {/* Tab bar only — no new routes. The /admin 404 disguise is untouched:
            AdminDoor still owns the single route and reveals this console in place. */}
        <div role="tablist" aria-label="Admin sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`${tab === t.id ? 'btn-primary' : 'btn-ghost'} shrink-0`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="rule mt-6 pt-6">
          <Suspense
            fallback={
              <p aria-live="polite" className="font-mono text-[11px] uppercase tracking-wide text-muted">
                Loading…
              </p>
            }
          >
            {tab === 'overview' && <AdminOverview busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'events' && <AdminEvents busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'registrations' && <AdminRegistrations busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'recruitment' && <AdminRecruitment busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'email' && <AdminEmail busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'projects' && <AdminProjects busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'content' && <AdminContent busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'media' && <AdminMedia busy={busy} setBusy={setBusy} notify={setNotice} />}
            {tab === 'accounts' && <AdminAccounts busy={busy} setBusy={setBusy} notify={setNotice} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
