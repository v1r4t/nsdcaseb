import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  cancelRegistration,
  formatEventDate,
  formatEventDateTime,
  formatEventTimeRange,
  getEvent,
  myRegistration,
  registerForEvent,
} from '../lib/events';
import type { EventDetail, RegistrationStatus } from '../lib/events';
import { listProjects } from '../lib/projects';
import type { Project } from '../lib/projects';
import { useAuth } from '../lib/auth';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { posterSources } from '../lib/image-variants';
import SeatMeter from '../components/SeatMeter';
import ShareEvent from '../components/ShareEvent';

type Step = 1 | 2 | 3;

// Poster is capped at max-w-2xl (672px), full-bleed below that.
const POSTER_SIZES = '(max-width: 672px) 100vw, 672px';

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
  return formatEventDate(iso);
}

function formatTimeRange(starts: string, ends: string): string {
  return formatEventTimeRange(starts, ends);
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const guestMode = !user;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [guestName, setGuestName] = useState('');
  const [guestReg, setGuestReg] = useState('');
  const [memberName, setMemberName] = useState(user?.name ?? '');
  const [memberReg, setMemberReg] = useState(user?.reg_number ?? '');
  const [accountPrompt, setAccountPrompt] = useState(false);
  const [related, setRelated] = useState<Project[] | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [posterVariantFailed, setPosterVariantFailed] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // Older posters have no variant objects: drop srcSet on the error event and
  // let the original poster_url load instead.
  useEffect(() => {
    setPosterVariantFailed(false);
  }, [event?.id, event?.poster_url, event?.poster_variants?.thumb]);

  useDocumentMeta({
    title: event ? `${event.title} — NSDC` : 'Event — NSDC',
    description: event
      ? event.description
      : 'Event details and registration.',
  });

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
      setMemberName(user.name ?? '');
      setMemberReg(user.reg_number ?? '');
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
      const res = guestMode
        ? await registerForEvent(id, { name: guestName.trim(), reg_number: guestReg.trim(), answers: {} })
        : await registerForEvent(id, { name: memberName.trim(), reg_number: memberReg.trim(), answers });
      setStatus(res.status);
      setAccountPrompt(!!res.account_prompt);
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
      <div className="wrap py-16 md:py-24">
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
      <p aria-live="polite" className="wrap py-16 mono text-quiet">
        Loading event…
      </p>
    );
  }

  const closed = !event.registration_open;
  const ended = !Number.isNaN(Date.parse(event.ends_at)) && Date.parse(event.ends_at) <= Date.now();
  const showMeter =
    event.registration_open && event.capacity !== null && event.spots_left !== null;
  const isActive = status === 'registered' || status === 'waitlisted';
  const poster = posterSources(event.poster_url, event.poster_variants);

  return (
    <div className="wrap py-12 md:py-20">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Link
          to="/registrations"
          className="mono text-quiet transition-colors hover:text-ink"
        >
          ← All events
        </Link>
        <p className="mono text-quiet">Event sheet</p>
      </div>

      {/* Masthead: state marker, serif title, then a ruled metadata grid. */}
      <header className="mt-8 border-t hairline pt-8">
        <p className="mono flex flex-wrap items-center gap-2 text-quiet">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-seal" />
          <span>{formatDate(event.starts_at)}</span>
        </p>
        <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.02] tracking-tight text-ink">
          {event.title}
        </h1>

        <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-t hairline pt-6 sm:grid-cols-4">
          <div>
            <dt className="mono text-quiet">Date</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{formatDate(event.starts_at)}</dd>
          </div>
          {timeRange && (
            <div>
              <dt className="mono text-quiet">Time</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{timeRange}</dd>
            </div>
          )}
          <div>
            <dt className="mono text-quiet">Reg opens</dt>
            <dd className="mt-1 font-mono text-sm text-ink">
              {formatEventDateTime(event.reg_opens_at)}
            </dd>
          </div>
          <div>
            <dt className="mono text-quiet">Reg closes</dt>
            <dd className="mt-1 font-mono text-sm text-ink">
              {formatEventDateTime(event.reg_closes_at)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
        {/* Poster and description sit on the wide left sheet. */}
        <div className="min-w-0 lg:col-span-7">
          {poster && (
            <img
              key={posterVariantFailed ? 'poster-original' : 'poster-variants'}
              src={poster.src}
              srcSet={posterVariantFailed ? undefined : poster.srcSet}
              sizes={POSTER_SIZES}
              alt={`${event.title} poster`}
              loading="lazy"
              decoding="async"
              onError={() => {
                if (poster.srcSet) setPosterVariantFailed(true);
              }}
              className="block h-auto w-full max-w-2xl border hairline"
            />
          )}

          <p className="mt-8 max-w-[62ch] whitespace-pre-wrap font-sans text-[17px] leading-relaxed text-ink/80">
            {event.description}
          </p>
        </div>

        {/* Registration, seats and terminal states form a ruled side column. */}
        <aside
          aria-label="Registration and seats"
          className="min-w-0 border-t hairline pt-8 lg:col-span-5 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0"
        >
          {showMeter && event.capacity !== null && event.spots_left !== null && (
            <div className="max-w-sm">
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
            <section aria-label="Registration confirmed" className="mt-10 border-t hairline pt-8">
              <p className="mono flex items-center gap-2 text-quiet">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-seal" />
                Registration confirmed
              </p>
              <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl">
                YOU&rsquo;RE IN.
              </h2>
              <p className="mt-3 mono text-quiet">
                NSDC / {formatDate(event.starts_at)}
              </p>
              {accountPrompt && (
                <p className="mt-5">
                  <Link to="/register" className="btn-primary">
                    Create an account for updates and club activities
                  </Link>
                </p>
              )}
              <ShareEvent eventId={event.id} eventTitle={event.title} />
              <Link to="/registrations" className="btn-primary mt-8">
                See you there →
              </Link>
              <div className="mt-8">
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
            <section aria-label="Waitlisted" className="mt-10 border-t hairline pt-8">
              <p className="mono flex items-center gap-2 text-quiet">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-seal" />
                Waitlist
              </p>
              <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl">
                YOU&rsquo;RE ON THE WAITLIST.
              </h2>
              <p className="mt-3 mono text-quiet">
                NSDC / {formatDate(event.starts_at)}
              </p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-quiet">
                This event is full. We&rsquo;ll promote you automatically if a seat opens.
              </p>
              <ShareEvent eventId={event.id} eventTitle={event.title} />
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
            <p
              role="status"
              aria-live="polite"
              className="mt-10 border-t hairline pt-8 mono text-quiet"
            >
              Your registration was cancelled.
              {!closed && user && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => { setStatus(null); setStep(1); }}
                    className="link mono"
                  >
                    Register again
                  </button>
                </>
              )}
            </p>
          )}

          {/* ---- Closed / ended event ---- */}
          {!isActive && status !== 'cancelled' && closed && (
            <section
              aria-label={ended ? 'Event ended' : 'Registration closed'}
              className="mt-10 border-t hairline pt-8"
            >
              <p role="status" className="mono text-quiet">
                {ended ? `This event has ended — ${formatDate(event.starts_at)}` : 'Registration closed'}
              </p>
              <Link to="/registrations#archive" className="link mt-3 inline-block text-sm">
                Browse the archive
              </Link>
            </section>
          )}

          {/* ---- Logged out ---- */}
          {!isActive && status !== 'cancelled' && !closed && !user && (
            <section aria-label="Guest registration" className="mt-10 border-t hairline pt-8">
              <h2 className="font-display text-3xl leading-tight tracking-tight text-ink">
                Register as a guest
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-quiet">
                No account required. Create one afterwards for updates on upcoming events.
              </p>
              <div className="mt-6 max-w-xl space-y-4">
                <label className="block">
                  <span className="mono text-quiet">Name</span>
                  <input
                    aria-label="Name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your full name"
                    className="field mt-1"
                  />
                </label>
                <label className="block">
                  <span className="mono text-quiet">Registration number</span>
                  <input
                    aria-label="Registration number"
                    value={guestReg}
                    onChange={(e) => setGuestReg(e.target.value)}
                    placeholder="Registration number"
                    className="field mt-1"
                  />
                </label>
                {error && <p role="alert" className="error-text">{error}</p>}
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={busy || !guestName.trim() || !guestReg.trim()}
                  className="btn-primary"
                >
                  {busy ? 'Submitting...' : 'Register'}
                </button>
                <p className="text-sm text-quiet">
                  Prefer updates?{' '}
                  <Link to="/register" className="link">
                    Create an account
                  </Link>
                  {' '}after registering.
                </p>
              </div>
            </section>
          )}

          {/* ---- Stepped registration flow ---- */}
          {!isActive && status !== 'cancelled' && !closed && user && (
            <section aria-label="Register for this event" className="mt-10 border-t hairline pt-8">
              <p className="mono text-quiet" aria-live="polite">
                Step {step} of 3 — {STEP_LABELS[step].replace(/^\d+ \/ /, '')}
              </p>
              <ol className="mono mt-3 flex gap-4" aria-label="Registration progress">
                {([1, 2, 3] as Step[]).map((s) => (
                  <li
                    key={s}
                    aria-current={s === step ? 'step' : undefined}
                    className={s === step ? 'text-seal' : s < step ? 'text-ink' : 'text-quiet'}
                  >
                    0{s}{s < step ? ' ✓' : ''}
                  </li>
                ))}
              </ol>

              {step === 1 && (
                <div>
                  <h2
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="mt-6 font-display text-3xl leading-tight tracking-tight text-ink"
                  >
                    01 / Your details
                  </h2>
                  <p className="mono mt-6 text-quiet">Signed in as</p>
                  <p className="mt-1 break-words font-mono text-sm text-ink">{user.email}</p>
                  <div className="mt-6 max-w-xl space-y-4">
                    <label className="block">
                      <span className="mono text-quiet">Name</span>
                      <input
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                        placeholder="Your full name"
                        className="field mt-1"
                      />
                    </label>
                    <label className="block">
                      <span className="mono text-quiet">Registration number</span>
                      <input
                        value={memberReg}
                        onChange={(e) => setMemberReg(e.target.value)}
                        placeholder="Registration number"
                        className="field mt-1"
                      />
                    </label>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() => goStep(2)}
                      disabled={!memberName.trim() || !memberReg.trim()}
                      className="btn-primary"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="mt-6 font-display text-3xl leading-tight tracking-tight text-ink"
                  >
                    02 / Event questions
                  </h2>
                  {event.questions.length === 0 ? (
                    <p className="mt-4 text-sm leading-relaxed text-quiet">
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
                          <label htmlFor={`q-${q.id}`} className="mono text-quiet">
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
                  <h2
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="mt-6 font-display text-3xl leading-tight tracking-tight text-ink"
                  >
                    03 / Confirm
                  </h2>
                  <dl className="mt-6 max-w-xl text-sm">
                    <div className="grid grid-cols-[auto_1fr] gap-3 border-t hairline py-3">
                      <dt className="mono w-24 shrink-0 text-quiet">Email</dt>
                      <dd className="min-w-0 break-words font-mono text-sm text-ink/90">{user.email}</dd>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-3 border-t hairline py-3">
                      <dt className="mono w-24 shrink-0 text-quiet">Event</dt>
                      <dd className="min-w-0 text-ink/90">{event.title}</dd>
                    </div>
                    {event.questions.map((q) => (
                      <div key={q.id} className="grid grid-cols-[auto_1fr] gap-3 border-t hairline py-3">
                        <dt className="mono w-24 shrink-0 text-quiet">{q.label}</dt>
                        <dd className="min-w-0 text-ink/90">{answers[q.id]?.trim() || '—'}</dd>
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
        </aside>
      </div>

      {related !== null && related.length > 0 && (
        <section aria-label="Related work" className="mt-16 border-t hairline pt-8">
          <h2 className="mono text-quiet">Related work</h2>
          <ul className="mt-4 max-w-3xl border-t hairline">
            {related.map((project) => (
              <li key={project.id} className="border-b hairline">
                {project.url ? (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Visit ${project.title} (opens in a new tab)`}
                    className="group flex items-baseline justify-between gap-6 py-5"
                  >
                    <span className="font-display text-xl leading-snug text-ink transition-colors duration-200 group-hover:text-seal">
                      {project.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mono shrink-0 text-quiet transition-colors duration-200 group-hover:text-ink"
                    >
                      Visit →
                    </span>
                  </a>
                ) : (
                  <Link
                    to={`/projects/${encodeURIComponent(project.id)}`}
                    aria-label={`${project.title} (project details)`}
                    className="group flex items-baseline justify-between gap-6 py-5"
                  >
                    <span className="font-display text-xl leading-snug text-ink transition-colors duration-200 group-hover:text-seal">
                      {project.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mono shrink-0 text-quiet transition-colors duration-200 group-hover:text-ink"
                    >
                      Details →
                    </span>
                  </Link>
                )}
                {project.summary && (
                  <p className="max-w-xl pb-5 text-sm leading-relaxed text-quiet">
                    {project.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
