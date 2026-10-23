import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, resetPassword } from '../lib/api';
import PasswordField from '../components/PasswordField';

function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  return null;
}

export default function ResetPassword() {
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
      <div className="shell py-12 md:py-16">
        <div className="rule max-w-md pt-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Reset link missing</h1>
          <p className="mt-2 text-sm text-muted">Open the link from your reset email to set a new password.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Set a new password</h1>
        {done ? (
          <p className="mt-2 text-sm text-muted">Done — sign in with your new password.{' '}
            <Link to="/login" className="link">Sign in</Link></p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit} aria-busy={pending}>
            <div>
              <label htmlFor="reset-password" className="label">New password</label>
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
              <p id="reset-password-hint" className="hint">At least 10 characters, including a letter and a number.</p>
            </div>
            <div>
              <label htmlFor="reset-confirm" className="label">Confirm password</label>
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
            {error && (<p role="alert" aria-live="assertive" className="error-text"><span aria-hidden="true">! </span>{error}</p>)}
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
