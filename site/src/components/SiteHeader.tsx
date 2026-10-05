import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Sections the club will ship later. Rendered as visibly-disabled placeholders. */
const COMING_SOON = ['Registrations', 'Media'];

export default function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // AuthProvider clears local state regardless; a stale cookie at worst
      // expires on its own. Nothing actionable for the user here.
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="border-b border-white/10 bg-void/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-3">
          <img src="/nsdc_logo.png" alt="" aria-hidden="true" className="h-8 w-8 rounded" />
          <span className="font-display text-base font-bold tracking-mega text-white">NSDC</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-5 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'font-medium text-white' : 'text-white/60 transition hover:text-white'
            }
          >
            Home
          </NavLink>
          {COMING_SOON.map((label) => (
            <span
              key={label}
              aria-disabled="true"
              title="Coming soon"
              className="cursor-not-allowed text-white/30"
            >
              {label}
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-white/25">soon</span>
              <span className="sr-only"> (coming soon)</span>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {loading ? (
            <span role="status" aria-live="polite" className="text-white/50">
              Checking session...
            </span>
          ) : user ? (
            <>
              <span className="max-w-[14rem] truncate text-white/70">{user.email}</span>
              <span className="rounded-full border border-neon/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neon">
                {user.role}
              </span>
              <button type="button" onClick={handleSignOut} disabled={signingOut} className="btn-ghost">
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}