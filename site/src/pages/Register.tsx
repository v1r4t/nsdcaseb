import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

/** Mirrors the server's weak_password rule: 10+ chars, a letter and a digit. */
function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  return null;
}

function registerMessage(error: ApiError): string {
  switch (error.error) {
    case 'email_taken':
      return 'That email is already registered. Sign in instead, or register with another address.';
    case 'weak_password':
      return 'Choose a stronger password: at least 10 characters including a letter and a number.';
    case 'invalid_email':
      return 'That email address is not valid. Use a normal address like you@amrita.edu.';
    case 'invalid_json':
      return 'We could not read that request. Reload the page and try again.';
    case 'rate_limited':
      return 'Too many attempts from this device. Wait about a minute, then try again.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}

export default function Register() {
  const { user, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isExecutive, setIsExecutive] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // A successful register signs the member in, so leave the form behind.
  if (user) return <Navigate to="/" replace />;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    const passwordError = passwordProblem(password);
    if (passwordError) next.password = passwordError;
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await register(email.trim(), password, isExecutive);
      // AuthProvider now holds the session; the Navigate above takes over.
    } catch (err) {
      setFormError(err instanceof ApiError ? registerMessage(err) : 'Something went wrong. Please try again.');
      setPending(false);
    }
  }

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Create your account</h1>
        <p className="mt-2 text-sm text-muted">
          Members use this to register for events and access club media.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} aria-busy={pending} noValidate>
          <div>
            <label htmlFor="register-email" className="label">
              Email
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'register-email-error' : undefined}
              className={`field ${errors.email ? 'field-invalid' : ''}`}
              placeholder="you@amrita.edu"
            />
            {errors.email && (
              <p id="register-email-error" className="error-text">
                <span aria-hidden="true">! </span>
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="register-password" className="label">
              Password
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={`register-password-hint${errors.password ? ' register-password-error' : ''}`}
              className={`field ${errors.password ? 'field-invalid' : ''}`}
            />
            <p id="register-password-hint" className="hint">
              At least 10 characters, including a letter and a number.
            </p>
            {errors.password && (
              <p id="register-password-error" className="error-text">
                <span aria-hidden="true">! </span>
                {errors.password}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="register-confirm" className="label">
              Confirm password
            </label>
            <input
              id="register-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={errors.confirm ? 'register-confirm-error' : undefined}
              className={`field ${errors.confirm ? 'field-invalid' : ''}`}
            />
            {errors.confirm && (
              <p id="register-confirm-error" className="error-text">
                <span aria-hidden="true">! </span>
                {errors.confirm}
              </p>
            )}
          </div>

          <div className="rule pt-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="is_executive"
                checked={isExecutive}
                disabled={pending}
                onChange={(event) => setIsExecutive(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-signal"
              />
              <span>
                <span className="font-medium text-paper">I'm an executive</span>
                <span className="mt-1 block text-xs text-muted">
                  Self-declared, not verified. An existing executive reviews new executive
                  requests before club access is granted, so pick this only if it is true today.
                </span>
              </span>
            </label>
          </div>

          {formError && (
            <p role="alert" aria-live="assertive" className="error-text">
              <span aria-hidden="true">! </span>
              {formError}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? 'Creating account...' : 'Create account'}
          </button>

          <p className="pt-2 text-sm text-muted">
            Already a member?{' '}
            <Link to="/login" className="link">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}