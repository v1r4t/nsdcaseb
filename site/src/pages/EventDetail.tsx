import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ApiError,
  cancelRegistration,
  getEvent,
  myRegistration,
  registerForEvent,
} from '../lib/events';
import type { EventDetail, RegistrationStatus } from '../lib/events';
import { listProjects } from '../lib/projects';
import type { Project } from '../lib/projects';
import { useAuth } from '../lib/auth';
import SeatMeter from '../components/SeatMeter';

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: '01 / Your details',
  2: '02 / Event questions',
  3: '03 / Confirm',
};

function message(error: ApiError): string {
  switch (error.error) {
    case 'event_not_found':
      return 'That event does not exist.';
    case 'event_closed':
      return 'Registration for this event is closed.';
    case 'already_registered':
      return 'You are already registered for this event.';
    case 'answers_invalid':
      return 'Please answer the required questions (500 characters max each).';
    case 'unauthenticated':
      return 'Sign in to register for events.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

function formatTimeRange(starts: string, ends: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  try {
    const s = new Date(starts);
    const e = new Date(ends);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
    return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)}`;
  } catch {
    return '';
  }
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [related, setRelated] = useState<Project[] | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getEvent(id)
      .then((res) => {
        if (active) setEvent(res.event);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof ApiError ? message(err) : 'Could not load this event.');
      });
    if (user) {
      myRegistration(id)
        .then((res) => {
          if (active && res.registration) setStatus(res.registration.status);
        })
        .catch(() => {
          /* absence of a registration is not an error surface */
        });
    } else {
      setStatus(null);
    }
    return () => {
      active = false;
    };
  }, [id, user]);

  // Related work: projects that point back at this event. One fetch, filtered
  // locally; a miss renders nothing at all.
  useEffect(() => {
    if (!id) return;
    let active = true;
    listProjects()
      .then((res) => {
        if (active) setRelated(res.projects.filter((p) => p.event_id === id));
      })
      .catch(() => {
        if (active) setRelated([]);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Move focus to the step heading whenever the step changes.
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  const timeRange = useMemo(
    () => (event ? formatTimeRange(event.starts_at, event.ends_at) : ''),
    [event],
  );

  async function handleRegister() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const res = await registerForEvent(id, answers);
      setStatus(res.status);
    } catch (err) {
      setError(err instanceof ApiError ? message(err) : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    if (!confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await cancelRegistration(id);
      setStatus('cancelled');
      setConfirmArmed(false);
      setStep(1);
    } catch (err) {
      setError(err instanceof ApiError ? message(err) : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function goStep(next: Step) {
    setError(null);
    setStep(next);
  }

  if (error && !event) {
    return (
      <div className="shell py-12">
        <p role="alert" aria-live="assertive" className="error-text text-sm">
          {error}
        </p>
        <Link to="/registrations" className="link mt-4 inline-block text-sm">
          Back to events
        </Link>
      </div>
    );
  }
  if (!event) {
    return (
      <p aria-live="polite" className="shell py-12 font-mono text-xs uppercase tracking-wide text-muted">
        Loading event…
      </p>
    );
  }

  const closed = !event.registration_open;
  const showMeter =
    event.registration_open && event.capacity !== null && event.spots_left !== null;
  const isActive = status === 'registered' || status === 'waitlisted';

  return (
    <div className="shell py-12 md:py-16">
      <Link to="/registrations" className="font-mono text-[11px] uppercase tracking-wide text-muted hover:text-paper">
        ← All events
      </Link>

      {/* Mono metadata, then title, then prose */}
      <dl className="mt-8 font-mono text-[11px] uppercase tracking-wide text-muted">
        <div className="flex gap-3">
          <dt>Date</dt>
          <dd className="text-paper/80">{formatDate(event.starts_at)}</dd>
        </div>
        {timeRange && (
          <div className="mt-1 flex gap-3">
            <dt>Time</dt>
            <dd className="text-paper/80">{timeRange}</dd>
          </div>
        )}
      </dl>

      <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold tracking-tight text-paper sm:text-5xl">
        {event.title}
      </h1>
      <p className="mt-6 max-w-2xl whitespace-pre-wrap text-base leading-relaxed text-paper/70">
        {event.description}
      </p>

      {related !== null && related.length > 0 && (
        <section aria-label="Related work" className="mt-12 max-w-2xl border-t border-line pt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-muted">
            Related work
          </h2>
          <ul className="mt-2">
            {related.map((project) => (
              <li key={project.id} className="border-t border-line py-4 first:mt-4">
                {project.url ? (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener"
                    aria-label={`${project.title} (opens in a new tab)`}
                    className="group flex items-baseline justify-between gap-4"
                  >
                    <span className="font-display text-lg font-medium text-paper transition-colors duration-200 group-hover:text-signal">
                      {project.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted"
                    >
                      Visit →
                    </span>
                  </a>
                ) : (
                  <Link to="/projects" className="group flex items-baseline justify-between gap-4">
                    <span className="font-display text-lg font-medium text-paper transition-colors duration-200 group-hover:text-signal">
                      {project.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted"
                    >
                      Index →
                    </span>
                  </Link>
                )}
                {project.summary && (
                  <p className="mt-1 text-sm leading-relaxed text-paper/70">{project.summary}</p>
                )}
              </li>
            ))}
            <li aria-hidden="true" className="border-t border-line" />
          </ul>
        </section>
      )}

      {showMeter && event.capacity !== null && event.spots_left !== null && (
        <div className="mt-8 max-w-2xl">
          <SeatMeter spotsLeft={event.spots_left} capacity={event.capacity} />
        </div>
      )}

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-6 text-sm">
          {error}
        </p>
      )}

      {/* ---- Terminal states: success / waitlist ---- */}
      {status === 'registered' && (
        <section aria-label="Registration confirmed" className="mt-12 border-t border-line pt-10">
          <p className="label">Registration confirmed</p>
          <h2 className="mt-3 font-display text-5xl font-semibold tracking-tight text-paper sm:text-6xl">
            YOU&rsquo;RE IN.
          </h2>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted">
            NSDC / {formatDate(event.starts_at)}
          </p>
          <Link to="/registrations" className="btn-primary mt-8">
            See you there →
          </Link>
          <div className="mt-10">
            {!confirmArmed ? (
              <button type="button" onClick={handleCancel} disabled={busy} className="btn-ghost">
                {busy ? 'Working…' : 'Cancel registration'}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3" aria-live="polite">
                <button type="button" onClick={handleCancel} disabled={busy} className="btn-primary">
                  {busy ? 'Working…' : 'Yes, cancel my registration'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArmed(false)}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Keep my spot
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {status === 'waitlisted' && (
        <section aria-label="Waitlisted" className="mt-12 border-t border-line pt-10">
          <p className="label">Waitlist</p>
          <h2 className="mt-3 font-display text-5xl font-semibold tracking-tight text-paper sm:text-6xl">
            YOU&rsquo;RE ON THE WAITLIST.
          </h2>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted">
            NSDC / {formatDate(event.starts_at)}
          </p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/70">
            This event is full. We&rsquo;ll promote you automatically if a seat opens.
          </p>
          <div className="mt-8">
            {!confirmArmed ? (
              <button type="button" onClick={handleCancel} disabled={busy} className="btn-ghost">
                {busy ? 'Working…' : 'Cancel registration'}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="btn-primary"
                  aria-live="polite"
                >
                  {busy ? 'Working…' : 'Yes, cancel my registration'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArmed(false)}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Keep my spot
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {status === 'cancelled' && (
        <p role="status" aria-live="polite" className="mt-12 border-t border-line pt-8 font-mono text-xs uppercase tracking-wide text-muted">
          Your registration was cancelled.
          {!closed && user && (
            <>
              {' '}
              <button type="button" onClick={() => { setStatus(null); setStep(1); }} className="link font-mono text-xs uppercase">
                Register again
              </button>
            </>
          )}
        </p>
      )}

      {/* ---- Closed event ---- */}
      {!isActive && status !== 'cancelled' && closed && (
        <section aria-label="Registration closed" className="mt-12 border-t border-line pt-8">
          <p role="status" className="font-mono text-xs uppercase tracking-wide text-muted">
            Registration closed
          </p>
          <Link to="/registrations#archive" className="link mt-3 inline-block text-sm">
            Browse the archive
          </Link>
        </section>
      )}

      {/* ---- Logged out ---- */}
      {!isActive && status !== 'cancelled' && !closed && !user && (
        <section aria-label="Sign in to register" className="mt-12 border-t border-line pt-8">
          <Link to="/login" state={{ from: location }} className="btn-primary">
            Sign in to register
          </Link>
        </section>
      )}

      {/* ---- Stepped registration flow ---- */}
      {!isActive && status !== 'cancelled' && !closed && user && (
        <section aria-label="Register for this event" className="mt-12 border-t border-line pt-8">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted" aria-live="polite">
            Step {step} of 3 — {STEP_LABELS[step].replace(/^\d+ \/ /, '')}
          </p>
          <ol className="mt-2 flex gap-4 font-mono text-[11px] uppercase tracking-wide" aria-label="Registration progress">
            {([1, 2, 3] as Step[]).map((s) => (
              <li
                key={s}
                aria-current={s === step ? 'step' : undefined}
                className={s === step ? 'text-signal' : s < step ? 'text-paper/80' : 'text-muted'}
              >
                0{s}{s < step ? ' ✓' : ''}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-6 font-display text-2xl font-semibold text-paper">
                01 / Your details
              </h2>
              <p className="label mt-4">Signed in as</p>
              <p className="mt-1 font-mono text-sm text-paper">{user.email}</p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => goStep(2)} className="btn-primary">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-6 font-display text-2xl font-semibold text-paper">
                02 / Event questions
              </h2>
              {event.questions.length === 0 ? (
                <p className="mt-4 text-sm text-paper/70">
                  No additional questions for this event — continue to confirm.
                </p>
              ) : (
                <form
                  aria-label="Event questions"
                  className="mt-6 max-w-xl space-y-5"
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    goStep(3);
                  }}
                >
                  {event.questions.map((q) => (
                    <div key={q.id}>
                      <label htmlFor={`q-${q.id}`} className="label">
                        {q.label}
                        {q.required ? ' *' : ''}
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
                        className="field mt-2"
                      />
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => goStep(1)} className="btn-ghost">
                      ← Back
                    </button>
                    <button type="submit" className="btn-primary">
                      Continue →
                    </button>
                  </div>
                </form>
              )}
              {event.questions.length === 0 && (
                <div className="mt-6 flex gap-3">
                  <button type="button" onClick={() => goStep(1)} className="btn-ghost">
                    ← Back
                  </button>
                  <button type="button" onClick={() => goStep(3)} className="btn-primary">
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-6 font-display text-2xl font-semibold text-paper">
                03 / Confirm
              </h2>
              <dl className="mt-6 max-w-xl space-y-3 text-sm">
                <div className="flex gap-3 border-t border-line pt-3">
                  <dt className="label w-24 shrink-0">Email</dt>
                  <dd className="font-mono text-paper/90">{user.email}</dd>
                </div>
                <div className="flex gap-3 border-t border-line pt-3">
                  <dt className="label w-24 shrink-0">Event</dt>
                  <dd className="text-paper/90">{event.title}</dd>
                </div>
                {event.questions.map((q) => (
                  <div key={q.id} className="flex gap-3 border-t border-line pt-3">
                    <dt className="label w-24 shrink-0">{q.label}</dt>
                    <dd className="text-paper/90">{answers[q.id]?.trim() || '—'}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => goStep(2)} disabled={busy} className="btn-ghost">
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={busy}
                  className="btn-primary"
                  aria-busy={busy}
                >
                  {busy ? 'Submitting…' : 'Register →'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
