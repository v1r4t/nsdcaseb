/**
 * Minimal site header: NSDC mark left, `26—27` centre, MENU + session right.
 *
 * There is no classic nav bar here — all navigation lives in the full-screen
 * MENU overlay. The header only states where you are and who you are.
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FullscreenMenu from './FullscreenMenu';
import { useAuth } from '../lib/auth';

export default function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
        <div className="grid h-16 grid-cols-[1fr_auto] items-center gap-x-4 px-6 md:grid-cols-3 md:px-12">
          <Link
            to="/"
            className="justify-self-start font-display text-base font-medium tracking-tight text-paper transition-colors hover:text-signal"
          >
            NSDC
          </Link>

          {/* Season marker. Centred on desktop, dropped on small screens. */}
          <span aria-hidden="true" className="hidden justify-self-center font-mono text-[11px] uppercase tracking-wide text-muted md:block">
            26&mdash;27
          </span>

          <div className="col-start-2 flex items-center justify-self-end gap-3 md:col-start-3">
            {loading ? (
              <span role="status" aria-live="polite" className="label hidden sm:inline">
                Checking session&hellip;
              </span>
            ) : user ? (
              <>
                <span className="hidden max-w-[12rem] truncate text-sm text-muted lg:inline">{user.email}</span>
                <span
                  className={`font-mono text-[10px] uppercase tracking-wide ${
                    user.role === 'admin' ? 'text-signal' : 'text-muted'
                  }`}
                >
                  {user.role}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="btn-ghost px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide"
                >
                  {signingOut ? 'Signing out' : 'Sign out'}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-ghost px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide">
                Sign in
              </Link>
            )}

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('nsdc:open-palette'))}
              aria-label="Search the site"
              className="btn-ghost px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide"
            >
              Search
              <span aria-hidden="true" className="ml-2 hidden text-muted sm:inline">
                ⌘K
              </span>
            </button>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="nsdc-menu"
              aria-haspopup="dialog"
              className="btn-ghost px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide"
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      <FullscreenMenu open={menuOpen} onClose={() => setMenuOpen(false)} returnFocusRef={menuButtonRef} />
    </>
  );
}