import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import PasswordField from '../components/PasswordField';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  mobile?: string;
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
    case 'invalid_name':
      return 'Please enter your full name.';
    case 'invalid_mobile':
      return 'Please enter a valid mobile number.';
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
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // No session exists until verification — navigate to verify-pending.
  if (user) return <Navigate to="/" replace />;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!mobile.trim()) next.mobile = 'Enter your mobile number.';
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
      await register({ name: name.trim(), email: email.trim(), mobile: mobile.trim(), password });
      navigate('/verify-pending', { state: { email: email.trim() }, replace: true });
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
            <label htmlFor="register-name" className="label">
              Name
            </label>
            <input
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              disabled={pending}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
              className={`field ${errors.name ? 'field-invalid' : ''}`}
              placeholder="Your full name"
            />
            {errors.name && (
              <p id="register-name-error" className="error-text">
                <span aria-hidden="true">! </span>
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="register-mobile" className="label">
              Mobile number
            </label>
            <input
              id="register-mobile"
              name="mobile"
              type="tel"
              autoComplete="tel"
              required
              disabled={pending}
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              aria-invalid={errors.mobile ? true : undefined}
              aria-describedby={errors.mobile ? 'register-mobile-error' : undefined}
              className={`field ${errors.mobile ? 'field-invalid' : ''}`}
              placeholder="+91..."
            />
            {errors.mobile && (
              <p id="register-mobile-error" className="error-text">
                <span aria-hidden="true">! </span>
                {errors.mobile}
              </p>
            )}
          </div>

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
            <PasswordField
              id="register-password"
              name="password"
              label="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={pending}
              describedBy={`register-password-hint${errors.password ? ' register-password-error' : ''}`}
              invalid={!!errors.password}
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
            <PasswordField
              id="register-confirm"
              name="confirm"
              label="password confirmation"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              disabled={pending}
              describedBy={errors.confirm ? 'register-confirm-error' : undefined}
              invalid={!!errors.confirm}
            />
            {errors.confirm && (
              <p id="register-confirm-error" className="error-text">
                <span aria-hidden="true">! </span>
                {errors.confirm}
              </p>
            )}
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