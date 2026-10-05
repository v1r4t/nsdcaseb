import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Phase 1 placeholder. The real sections (about, events, data projects) land
 * in Phase 2 -- keep this thin until then.
 */
export default function Landing() {
  const { user, loading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // The session is cleared locally regardless; nothing to report.
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="text-xs uppercase tracking-mega text-neon">National Student Data Corps</p>
      <h1 className="mt-5 pl-mega font-display text-4xl font-bold tracking-mega text-white sm:text-6xl">
        NSDC
      </h1>
      <p className="mx-auto mt-8 max-w-xl text-base text-white/70">
        The full club site is being built. Accounts are live now, so sign in or register to keep
        your place.
      </p>

      <div className="mt-10 flex min-h-[3.5rem] items-center justify-center">
        {loading ? (
          <p role="status" aria-live="polite" className="text-sm text-white/50">
            Checking session...
          </p>
        ) : user ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <span className="text-sm text-white/80">{user.email}</span>
            <span className="rounded-full border border-neon/40 px-3 py-1 text-xs uppercase tracking-wide text-neon">
              {user.role}
            </span>
            <button type="button" onClick={handleSignOut} disabled={signingOut} className="btn-ghost">
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <Link to="/login" className="btn-primary">
              Sign in
            </Link>
            <Link to="/register" className="btn-ghost">
              Register
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}