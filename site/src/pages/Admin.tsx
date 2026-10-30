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
  { id: 'media', label: 'Gallery' },
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
      <div className="wrap py-12 md:py-16">
        <p aria-live="polite" className="mono text-quiet">
          Loading…
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wrap py-12 md:py-16">
        <h1 className="font-display text-4xl font-normal tracking-tight text-ink">Admin</h1>
        <p className="mt-3 text-sm text-quiet">
          Please <Link to="/login" className="link">sign in</Link> to continue.
        </p>
      </div>
    );
  }

  if (user.role !== 'ob') {
    return (
      <div className="wrap py-12 md:py-16">
        <h1 className="font-display text-4xl font-normal tracking-tight text-ink">Admin</h1>
        <p role="alert" className="error-text mt-3">Restricted — this area is for club admins only.</p>
      </div>
    );
  }

  return (
    <div className="wrap py-10 md:py-14">
      <div className="max-w-5xl">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-5">
          <h1 className="font-display text-3xl font-normal tracking-tight text-ink md:text-4xl">
            Admin dashboard
          </h1>
          <p
            role="status"
            aria-live="polite"
            className="min-h-5 max-w-md font-mono text-xs text-quiet md:text-right"
          >
            {notice}
          </p>
        </header>

        {/* Tab bar only — no new routes. The /admin 404 disguise is untouched:
            AdminDoor still owns the single route and reveals this console in place. */}
        <div
          role="tablist"
          aria-label="Admin sections"
          className="-mx-1 mt-6 flex gap-6 overflow-x-auto border-b hairline px-1"
        >
          {TABS.map((t) => {
            const current = tab === t.id;

            return (
              <button
                key={t.id}
                id={`admin-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={current}
                aria-controls="admin-panel"
                onClick={() => setTab(t.id)}
                className={`mono -mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-0.5 transition-colors duration-200 ${
                  current
                    ? 'border-seal text-ink'
                    : 'border-transparent text-quiet hover:text-ink focus-visible:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div
          id="admin-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${tab}`}
          className="pt-6"
        >
          <Suspense
            fallback={
              <p aria-live="polite" className="mono text-quiet">
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
