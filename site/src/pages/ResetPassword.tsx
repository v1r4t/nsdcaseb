import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, resetPassword } from '../lib/api';
import PasswordField from '../components/PasswordField';
import { useDocumentMeta } from '../lib/useDocumentMeta';

function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  return null;
}

export default function ResetPassword() {
  useDocumentMeta({
    title: 'Reset your password — NSDC',
    description:
      'Request a password reset link for your NSDC account, or set a new password from your reset email.',
  });
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    if (confirm !== password) { setError('Passwords do not match.'); return; }
    setError(null);
    setPending(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.error === 'invalid_token'
        ? 'This reset link is invalid or expired. Request a fresh one from the sign-in page.'
        : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <section className="wrap py-10 md:py-20">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-4">
            <p className="mono text-quiet">02 / Recovery</p>
            <p className="mono text-quiet">NSDC · Members</p>
          </div>
          <h1 className="mt-6 max-w-md font-display text-3xl font-normal leading-[1.05] tracking-tight text-ink sm:mt-8 sm:text-5xl">
            Reset link missing
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-quiet sm:mt-4">
            Open the link from your reset email to set a new password.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="wrap py-10 md:py-20">
      <div className="max-w-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-4">
          <p className="mono text-quiet">02 / Recovery</p>
          <p className="mono text-quiet">NSDC · Members</p>
        </div>
        <h1 className="mt-6 max-w-md font-display text-3xl font-normal leading-[1.05] tracking-tight text-ink sm:mt-8 sm:text-5xl">
          Set a new password
        </h1>
        {done ? (
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-quiet sm:mt-4">
            Done — sign in with your new password.{' '}
            <Link to="/login" className="link">Sign in</Link>
          </p>
        ) : (
          <>
            <div className="rule mt-6 max-w-md sm:mt-8" aria-hidden="true" />

            <form
              className="mt-6 max-w-md space-y-5 sm:mt-8 sm:space-y-6"
              onSubmit={handleSubmit}
              aria-busy={pending}
            >
              <div>
                <label htmlFor="reset-password" className="mono mb-1.5 block text-ink/80 sm:mb-2">
                  New password
                </label>
                <div className="[&_button]:flex [&_button]:h-11 [&_button]:items-center [&_input]:min-h-11 [&_input]:text-base sm:[&_input]:text-sm">
                  <PasswordField
                    id="reset-password"
                    name="password"
                    label="new password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    disabled={pending}
                    describedBy="reset-password-hint"
                  />
                </div>
                <p id="reset-password-hint" className="hint">
                  At least 10 characters, including a letter and a number.
                </p>
              </div>
              <div>
                <label htmlFor="reset-confirm" className="mono mb-1.5 block text-ink/80 sm:mb-2">
                  Confirm password
                </label>
                <div className="[&_button]:flex [&_button]:h-11 [&_button]:items-center [&_input]:min-h-11 [&_input]:text-base sm:[&_input]:text-sm">
                  <PasswordField
                    id="reset-confirm"
                    name="confirm"
                    label="password confirmation"
                    value={confirm}
                    onChange={setConfirm}
                    autoComplete="new-password"
                    disabled={pending}
                  />
                </div>
              </div>
              {error && (
                <p role="alert" aria-live="assertive" className="error-text">
                  <span aria-hidden="true">! </span>
                  {error}
                </p>
              )}
              <button type="submit" disabled={pending} className="btn-primary min-h-11 w-full">
                {pending ? 'Saving...' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
