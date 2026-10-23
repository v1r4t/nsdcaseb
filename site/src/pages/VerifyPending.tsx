import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, resendVerification } from '../lib/api';

function presetEmail(state: unknown): string {
  if (state && typeof state === 'object') {
    const email = (state as { email?: unknown }).email;
    if (typeof email === 'string') return email;
  }
  return '';
}

export default function VerifyPending() {
  const location = useLocation();
  const [email, setEmail] = useState(() => presetEmail(location.state));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await resendVerification(email.trim());
      // Neutral: the endpoint never reveals whether the address exists.
      setNotice("If that email is registered and unverified, we've re-sent the link.");
    } catch (err) {
      if (err instanceof ApiError && err.error === 'rate_limited') {
        setError('Too many attempts from this device. Wait about a minute, then try again.');
      } else {
        setError(err instanceof ApiError ? 'Could not reach the server. Check your connection and try again.' : 'Something went wrong. Please try again.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a verification link to your email. Open it within an hour to activate your account,
          then sign in.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleResend} aria-busy={pending}>
          <div>
            <label htmlFor="pending-email" className="label">Email</label>
            <input id="pending-email" name="email" type="email" autoComplete="email" required disabled={pending}
              value={email} onChange={(event) => setEmail(event.target.value)} className="field" placeholder="you@amrita.edu" />
          </div>
          {error && (<p role="alert" aria-live="assertive" className="error-text"><span aria-hidden="true">! </span>{error}</p>)}
          {notice && (<p role="status" aria-live="polite" className="hint">{notice}</p>)}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? 'Sending...' : 'Re-send verification link'}
          </button>
        </form>
        <p className="pt-4 text-sm text-muted">
          Verified already?{' '}<Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
