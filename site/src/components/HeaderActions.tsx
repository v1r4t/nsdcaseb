import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** OS detection (evaluated once per mount): macOS → ⌘K, otherwise Ctrl K. */
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  if (/mac/i.test(platform)) return true;
  return /mac/i.test(nav.userAgent ?? '');
}

/**
 * Host controls in the kit header: search and session.
 * Kept compact so the bar still works at 320px.
 */
export default function HeaderActions() {
  const { user, loading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [isMac] = useState(() => isMacOS());

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // AuthProvider clears local state regardless.
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('nsdc:open-palette'))}
        aria-label={`Search ${isMac ? '⌘K' : 'Ctrl K'}`}
        className="mono min-h-11 text-quiet transition-colors duration-200 hover:text-ink"
      >
        <span aria-hidden="true" className="min-[400px]:hidden">
          &#8981;
        </span>
        <span className="hidden min-[400px]:inline">
          Search <span className="ml-1 hidden text-quiet lg:inline">{isMac ? '⌘K' : 'Ctrl K'}</span>
        </span>
      </button>

      {loading ? null : user ? (
        <>
          <span className="mono hidden max-w-40 truncate text-quiet lg:inline" title={user.email}>
            {user.name?.trim() || user.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mono min-h-11 text-quiet transition-colors duration-200 hover:text-ink disabled:opacity-50"
          >
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </>
      ) : (
        <Link to="/login" className="mono min-h-11 text-quiet transition-colors duration-200 hover:text-ink">
          Sign in
        </Link>
      )}
    </div>
  );
}
