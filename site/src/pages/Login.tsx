import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, forgotPassword } from '../lib/api';
import { useAuth } from '../lib/auth';
import PasswordField from '../components/PasswordField';
import { useDocumentMeta } from '../lib/useDocumentMeta';

type Mode = 'signin' | 'forgot';

/** Read the `from` location stashed by ProtectedRoute, defaulting to "/". */
function redirectTarget(state: unknown): string {
  if (state && typeof state === 'object') {
    const from = (state as { from?: unknown }).from;
    if (from && typeof from === 'object') {
      const loc = from as { pathname?: unknown; search?: unknown; hash?: unknown };
      // Require a same-app path so we never bounce off-site.
      if (typeof loc.pathname === 'string' && loc.pathname.startsWith('/')) {
        const search = typeof loc.search === 'string' ? loc.search : '';
        const hash = typeof loc.hash === 'string' ? loc.hash : '';
        return `${loc.pathname}${search}${hash}`;
      }
    }
  }
  return '/';
}

function signInMessage(error: ApiError): string {
  switch (error.error) {
    case 'invalid_credentials':
      return 'That email and password combination did not work. Check both and try again.';
    case 'email_unverified':
      return 'Verify your email first — check your inbox for the link.';
    case 'rate_limited':
      return 'Too many attempts from this device. Wait about a minute, then try again.';
    case 'unauthenticated':
      return 'Your session expired. Sign in again.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useDocumentMeta({
    title: 'Sign in — NSDC',
    description: 'Sign in to your NSDC member account to register for events and reach club media.',
  });

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Already signed in (e.g. after a password-less flow) -- skip the form.
  if (user) return <Navigate to={redirectTarget(location.state)} replace />;

  const busy = pending;

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await login(email, password, remember, adminCode);
      navigate(redirectTarget(location.state), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.error === 'email_unverified') {
        navigate('/verify-pending', { state: { email }, replace: true });
        return;
      }
      setError(err instanceof ApiError ? signInMessage(err) : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await forgotPassword(email);
      // The API answers 202 regardless of whether the address exists, so the
      // confirmation must stay neutral -- never confirm an account.
      setNotice("If that email exists, we've sent a reset link.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError('Could not reach the server. Check your connection and try again.');
      } else {
        setNotice("If that email exists, we've sent a reset link.");
      }
    } finally {
      setPending(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  const signin = mode === 'signin';

  return (
    <section className="wrap py-10 md:py-20">
      <div className="max-w-xl">
        {/* Dossier line: the page states its purpose before it asks for anything. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-4">
          <p className="mono text-quiet">{signin ? '01 / Access' : '01 / Recovery'}</p>
          <p className="mono text-quiet">NSDC · Members</p>
        </div>

        <h1 className="mt-6 max-w-md font-display text-3xl font-normal leading-[1.05] tracking-tight text-ink sm:mt-8 sm:text-5xl">
          {signin ? 'Sign in' : 'Reset your password'}
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-quiet sm:mt-4">
          {signin
            ? 'Sign in to reach registrations, club media and member resources.'
            : 'Enter your email and we will send a reset link if the address is registered.'}
        </p>

        <div className="rule mt-6 max-w-md sm:mt-8" aria-hidden="true" />

        {signin ? (
          <form
            className="mt-6 max-w-md space-y-5 sm:mt-8 sm:space-y-6"
            onSubmit={handleSignIn}
            aria-busy={busy}
          >
            <div>
              <label htmlFor="login-email" className="mono mb-1.5 block text-ink/80 sm:mb-2">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field min-h-11 text-base sm:text-sm"
                placeholder="you@bl.students.amrita.edu"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mono mb-1.5 block text-ink/80 sm:mb-2">
                Password
              </label>
              <div className="[&_button]:flex [&_button]:h-11 [&_button]:items-center [&_input]:min-h-11 [&_input]:text-base sm:[&_input]:text-sm">
                <PasswordField
                  id="login-password"
                  name="password"
                  label="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-admin-code" className="mono mb-1.5 block text-ink/80 sm:mb-2">
                Office bearer code (if applicable)
              </label>
              <div className="[&_button]:flex [&_button]:h-11 [&_button]:items-center [&_input]:min-h-11 [&_input]:text-base sm:[&_input]:text-sm">
                <PasswordField
                  id="login-admin-code"
                  name="admin_code"
                  label="office bearer code"
                  value={adminCode}
                  onChange={setAdminCode}
                  autoComplete="off"
                  disabled={busy}
                  required={false}
                />
              </div>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm text-ink/75">
              <input
                type="checkbox"
                name="remember"
                checked={remember}
                disabled={busy}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 shrink-0 accent-seal"
              />
              Keep me signed in on this device
            </label>

            {error && (
              <p role="alert" aria-live="assertive" className="error-text">
                <span aria-hidden="true">! </span>
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary min-h-11 w-full">
              {busy ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="flex flex-col items-start gap-1 pt-1 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4 sm:gap-y-2 sm:pt-2">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="link inline-flex min-h-11 items-center"
              >
                Forgot password?
              </button>
              <span className="text-quiet">
                No account?{' '}
                <Link to="/register" className="link">
                  Register
                </Link>
              </span>
            </div>
          </form>
        ) : (
          <form
            className="mt-6 max-w-md space-y-5 sm:mt-8 sm:space-y-6"
            onSubmit={handleForgot}
            aria-busy={busy}
          >
            <div>
              <label htmlFor="forgot-email" className="mono mb-1.5 block text-ink/80 sm:mb-2">
                Email
              </label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field min-h-11 text-base sm:text-sm"
                placeholder="you@bl.students.amrita.edu"
              />
            </div>

            {error && (
              <p role="alert" aria-live="assertive" className="error-text">
                <span aria-hidden="true">! </span>
                {error}
              </p>
            )}
            {notice && (
              <p role="status" aria-live="polite" className="hint">
                {notice}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary min-h-11 w-full">
              {busy ? 'Sending...' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="link inline-flex min-h-11 items-center text-sm"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
