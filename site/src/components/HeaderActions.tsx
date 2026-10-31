import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeaderActionsContext } from '../../../design/chrome/Header';
import { useAuth } from '../lib/auth';

/** OS detection (evaluated once per mount): macOS → ⌘K, otherwise Ctrl K. */
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  if (/mac/i.test(platform)) return true;
  return /mac/i.test(nav.userAgent ?? '');
}

/** A real magnifier, painted with currentColor, for the compact control. */
function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      className={className}
    >
      <circle cx="10.75" cy="10.75" r="6.75" />
      <path d="m15.75 15.75 4.5 4.5" />
    </svg>
  );
}

/**
 * Host controls in the kit header: search and session.
 *
 * The header renders this node twice — once in the sticky bar and once inside
 * the phone menu — and tells it which slot it is in through context. In the bar
 * only the 44px search control appears below `md`; sign in/out moves into the
 * full-screen menu. Desktop keeps the original search + session layout.
 */
export default function HeaderActions() {
  const { user, loading, logout } = useAuth();
  const { slot, closeMenu } = useHeaderActionsContext();
  const [signingOut, setSigningOut] = useState(false);
  const [isMac] = useState(() => isMacOS());
  const shortcut = isMac ? '⌘K' : 'Ctrl K';

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

  function openSearch() {
    closeMenu?.();
    window.dispatchEvent(new CustomEvent('nsdc:open-palette'));
  }

  if (slot === 'menu') {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={openSearch}
          className="mono flex min-h-11 w-full items-center justify-between gap-3 border-b hairline text-left text-quiet transition-colors duration-200 hover:text-ink"
        >
          <span className="inline-flex items-center gap-3">
            <SearchGlyph className="h-[18px] w-[18px]" />
            Search
          </span>
          <span aria-hidden="true" className="text-faint">
            {shortcut}
          </span>
        </button>

        {loading ? null : user ? (
          <>
            <p className="mono flex min-h-11 items-center justify-between gap-3 border-b hairline text-quiet">
              <span className="truncate" title={user.email}>
                {user.name?.trim() || user.email}
              </span>
              <span aria-hidden="true" className="shrink-0 text-faint">
                Signed in
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                closeMenu?.();
                void handleSignOut();
              }}
              disabled={signingOut}
              className="mono flex min-h-11 w-full items-center justify-between gap-3 border-b hairline text-left text-quiet transition-colors duration-200 hover:text-ink disabled:opacity-50"
            >
              {signingOut ? 'Signing out' : 'Sign out'}
              <span aria-hidden="true" className="text-faint">
                →
              </span>
            </button>
          </>
        ) : (
          <Link
            to="/login"
            onClick={closeMenu}
            className="mono flex min-h-11 items-center justify-between gap-3 border-b hairline text-quiet transition-colors duration-200 hover:text-ink"
          >
            Sign in
            <span aria-hidden="true" className="text-faint">
              →
            </span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <button
        type="button"
        onClick={openSearch}
        aria-label={`Search ${shortcut}`}
        className="mono inline-flex min-h-11 min-w-11 items-center justify-center gap-2 border hairline bg-paper text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink md:min-w-0 md:justify-start md:gap-0 md:border-0 md:bg-transparent"
      >
        <SearchGlyph className="h-[18px] w-[18px] md:hidden" />
        <span className="hidden md:inline">
          Search <span className="ml-1 hidden text-quiet lg:inline">{shortcut}</span>
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
            className="mono hidden min-h-11 items-center text-quiet transition-colors duration-200 hover:text-ink disabled:opacity-50 md:inline-flex"
          >
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </>
      ) : (
        <Link
          to="/login"
          className="mono hidden min-h-11 items-center text-quiet transition-colors duration-200 hover:text-ink md:inline-flex"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
