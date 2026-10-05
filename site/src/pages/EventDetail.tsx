import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError, cancelRegistration, getEvent, myRegistration, registerForEvent,
} from '../lib/events';
import type { EventDetail, RegistrationStatus } from '../lib/events';
import { useAuth } from '../lib/auth';

function message(error: ApiError): string {
  switch (error.error) {
    case 'event_not_found': return 'That event does not exist.';
    case 'event_closed': return 'Registration for this event is closed.';
    case 'already_registered': return 'You are already registered for this event.';
    case 'answers_invalid': return 'Please answer the required questions (500 characters max each).';
    case 'unauthenticated': return 'Sign in to register for events.';
    case 'network_error': return 'Could not reach the server. Check your connection and try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getEvent(id)
      .then((res) => { if (active) setEvent(res.event); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof ApiError ? message(err) : 'Could not load this event.');
      });
    if (user) {
      myRegistration(id)
        .then((res) => { if (active && res.registration) setStatus(res.registration.status); })
        .catch(() => { /* absence of a registration is not an error surface */ });
    }
    return () => { active = false; };
  }, [id, user]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id) return;
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/events/${id}` } } });
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await registerForEvent(id, answers);
      setStatus(res.status);
      setNotice(res.status === 'waitlisted'
        ? 'This event is full — you are on the waitlist.'
        : 'You are registered. See you there.');
    } catch (err) {
      setError(err instanceof ApiError ? message(err) : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!id || !window.confirm('Cancel your registration for this event?')) return;
    setError(null);
    setBusy(true);
    try {
      await cancelRegistration(id);
      setStatus(null);
      setNotice('Your registration was cancelled.');
    } catch (err) {
      setError(err instanceof ApiError ? message(err) : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !event) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <p role="alert" aria-live="assertive" className="error-text">{error}</p>
        <Link to="/registrations" className="link mt-4 inline-block text-sm">Back to registrations</Link>
      </div>
    );
  }
  if (!event) return <p aria-live="polite" className="mx-auto max-w-2xl px-4 py-10 text-sm text-white/60">Loading event…</p>;

  const closed = !event.registration_open;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link to="/registrations" className="link text-sm">← All events</Link>
      <h1 className="font-display mt-3 text-2xl font-semibold text-white">{event.title}</h1>
      <dl className="card mt-4 space-y-2 text-sm">
        <div className="flex gap-2"><dt className="text-white/50">Starts:</dt><dd className="text-white/90">{event.starts_at}</dd></div>
        <div className="flex gap-2"><dt className="text-white/50">Ends:</dt><dd className="text-white/90">{event.ends_at}</dd></div>
        <div className="flex gap-2"><dt className="text-white/50">Registration:</dt><dd className="text-white/90">{event.reg_opens_at} → {event.reg_closes_at}</dd></div>
        <div className="flex gap-2"><dt className="text-white/50">Spots:</dt><dd className="text-white/90">{event.capacity === null ? 'Unlimited' : `${event.spots_left ?? 0} of ${event.capacity} left`}</dd></div>
      </dl>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{event.description}</p>

      {error && <p role="alert" aria-live="assertive" className="error-text mt-4">{error}</p>}
      {notice && <p role="status" aria-live="polite" className="mt-4 text-sm text-neon">{notice}</p>}

      {status === 'registered' && (
        <div className="card mt-6">
          <p className="text-sm font-medium text-neon">Registered ✓</p>
          <button type="button" onClick={handleCancel} disabled={busy} className="btn-ghost mt-3">
            {busy ? 'Working…' : 'Cancel registration'}
          </button>
        </div>
      )}
      {status === 'waitlisted' && (
        <div className="card mt-6">
          <p className="text-sm font-medium text-amber-300">Waitlisted — we’ll promote you automatically if a seat opens.</p>
          <button type="button" onClick={handleCancel} disabled={busy} className="btn-ghost mt-3">
            {busy ? 'Working…' : 'Leave waitlist'}
          </button>
        </div>
      )}
      {!status && closed && (
        <p role="status" className="card mt-6 text-sm text-white/60">Registration for this event is closed.</p>
      )}
      {!status && !closed && (
        event.questions.length === 0 && !user ? (
          <div className="card mt-6">
            <p className="text-sm text-white/70">Sign in to register for this event.</p>
            <Link to="/login" state={{ from: { pathname: `/events/${event.id}` } }} className="btn-primary mt-3">
              Sign in to register
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} aria-busy={busy} className="card mt-6 space-y-4">
            {event.questions.map((q) => (
              <div key={q.id}>
                <label htmlFor={`q-${q.id}`} className="label">
                  {q.label}{q.required ? ' *' : ''}
                </label>
                <input
                  id={`q-${q.id}`}
                  name={q.id}
                  type="text"
                  required={q.required}
                  maxLength={Math.min(500, q.maxLength)}
                  disabled={busy}
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="field"
                />
              </div>
            ))}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Submitting…' : user ? 'Register' : 'Sign in to register'}
            </button>
          </form>
        )
      )}
    </div>
  );
}
