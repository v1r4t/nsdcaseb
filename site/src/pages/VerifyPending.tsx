import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, resendVerification } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';

function presetEmail(state: unknown): string {
  if (state && typeof state === 'object') {
    const email = (state as { email?: unknown }).email;
    if (typeof email === 'string') return email;
  }
  return '';
}

export default function VerifyPending() {
  useDocumentMeta({
    title: 'Check your inbox — NSDC',
    description:
      'We sent a verification link to your email. Open it within an hour to activate your account, or request a new one.',
  });
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
    <section className="wrap py-14 md:py-20">
      <div className="max-w-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-4">
          <p className="mono text-quiet">03 / Verify</p>
          <p className="mono text-quiet">NSDC · Members</p>
        </div>

        <h1 className="mt-8 max-w-md font-display text-4xl font-normal leading-[1.05] tracking-tight text-ink sm:text-5xl">
          Check your inbox
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-quiet">
          We sent a verification link to your email. Open it within an hour to activate your account,
          then sign in.
        </p>

        <div className="rule mt-8 max-w-md" aria-hidden="true" />

        <form className="mt-8 max-w-md space-y-6" onSubmit={handleResend} aria-busy={pending}>
          <div>
            <label htmlFor="pending-email" className="mono mb-2 block text-ink/80">Email</label>
            <input
              id="pending-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
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
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? 'Sending...' : 'Re-send verification link'}
          </button>

          <p className="pt-2 text-sm text-quiet">
            Verified already?{' '}
            <Link to="/login" className="link">Sign in</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
