import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { loadSiteState } from '../lib/site';
import {
  ELIGIBLE_YEARS,
  MIN_ANSWER_LENGTH,
  RecruitmentApiError,
  applicationStatusCopy,
  lookupStatus,
  submitApplication,
  validateApplication,
} from '../lib/recruitment';
import type {
  ApplicationErrors,
  ApplicationInput,
  ApplicationRecord,
  ApplicationReceipt,
} from '../lib/recruitment';

const EMPTY_FORM: ApplicationInput = {
  name: '',
  email: '',
  reg_number: '',
  phone: '',
  year: '',
  branch: '',
  why_join: '',
  contribute: '',
  time_commitment: '',
  remarks: '',
};

/** Order used to move focus to the first invalid control after a failed submit. */
const FIELD_ORDER = [
  'name',
  'email',
  'reg_number',
  'phone',
  'year',
  'branch',
  'why_join',
  'contribute',
  'time_commitment',
] as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="error-text">
      <span aria-hidden="true">! </span>
      {message}
    </p>
  );
}

function submitErrorMessage(error: unknown): string {
  if (!(error instanceof RecruitmentApiError)) {
    return 'Something went wrong on our side. Please try again.';
  }
  switch (error.error) {
    case 'already_applied':
      return 'You have already applied with these details. Check your application status below.';
    case 'rate_limited':
      return 'Too many submissions from this connection. Wait a few minutes, then try again.';
    case 'recruitment_closed':
      return 'Recruitment closed while you were applying. Your form was not submitted. Check this page for the next opening.';
    case 'invalid_email':
      return 'Use your @bl.students.amrita.edu college email.';
    case 'invalid_phone':
      return 'Enter a phone number with 10 to 15 digits.';
    case 'invalid_year':
      return 'Select your year of study: 1st, 2nd or 3rd year.';
    case 'invalid_name':
      return 'Enter your full name.';
    case 'invalid_reg_number':
      return 'Enter your register ID.';
    case 'invalid_json':
      return 'We could not read that request. Reload the page and try again.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}

function lookupErrorMessage(error: unknown): string {
  if (!(error instanceof RecruitmentApiError)) {
    return 'Something went wrong on our side. Please try again.';
  }
  if (error.error === 'network_error') {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (error.error === 'rate_limited') {
    return 'Too many status checks from this connection. Wait a minute, then try again.';
  }
  return 'We could not check that application right now. Please try again.';
}

type LookupResult =
  | { kind: 'found'; application: ApplicationRecord }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export default function Recruit() {
  useDocumentMeta({
    title: 'Join the corps — NSDC Recruitment',
    description:
      'Apply to join the National Student Data Corps at Amrita Vishwa Vidyapeetham, Bengaluru. Open to 1st, 2nd and 3rd-year students of all branches. Check your application status here.',
  });

  // null = unknown (in flight or failed); the form only appears once open is true.
  const [recruitmentOpen, setRecruitmentOpen] = useState<boolean | null>(null);
  const [siteLoaded, setSiteLoaded] = useState(false);

  const [form, setForm] = useState<ApplicationInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ApplicationReceipt | null>(null);

  const successRef = useRef<HTMLHeadingElement | null>(null);
  const formErrorRef = useRef<HTMLParagraphElement | null>(null);

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupReg, setLookupReg] = useState('');
  const [lookupErrors, setLookupErrors] = useState<{ email?: string; reg_number?: string }>({});
  const [lookupPending, setLookupPending] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const lookupResultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void loadSiteState().then((state) => {
      if (active) {
        setRecruitmentOpen(state.recruitment_open);
        setSiteLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (receipt) successRef.current?.focus();
  }, [receipt]);

  useEffect(() => {
    if (formError) formErrorRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (lookupResult) lookupResultRef.current?.focus();
  }, [lookupResult]);

  function update<K extends keyof ApplicationInput>(field: K, value: ApplicationInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
    if (field !== 'remarks' && errors[field as keyof ApplicationErrors]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field as keyof ApplicationErrors];
        return next;
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateApplication(form);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      const id = `recruit-${firstInvalid}`;
      // Wait for the inline error to render so aria-describedby is in place.
      requestAnimationFrame(() => document.getElementById(id)?.focus());
      return;
    }

    setPending(true);
    try {
      const next = await submitApplication(form);
      setReceipt(next);
    } catch (error) {
      setFormError(submitErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: { email?: string; reg_number?: string } = {};
    if (!lookupEmail.trim()) found.email = 'Enter the email you applied with.';
    if (!lookupReg.trim()) found.reg_number = 'Enter your register ID.';
    setLookupErrors(found);
    setLookupResult(null);
    if (Object.keys(found).length > 0) {
      const id = found.email ? 'lookup-email' : 'lookup-reg';
      requestAnimationFrame(() => document.getElementById(id)?.focus());
      return;
    }

    setLookupPending(true);
    try {
      const result = await lookupStatus(lookupEmail, lookupReg);
      setLookupResult({ kind: 'found', application: result.application });
    } catch (error) {
      if (error instanceof RecruitmentApiError && (error.status === 404 || error.error === 'not_found')) {
        setLookupResult({ kind: 'missing' });
      } else {
        setLookupResult({ kind: 'error', message: lookupErrorMessage(error) });
      }
    } finally {
      setLookupPending(false);
    }
  }

  const statusLine =
    recruitmentOpen === true
      ? 'Recruitment is open now.'
      : recruitmentOpen === false
        ? 'Recruitment is currently closed.'
        : 'Checking recruitment status…';

  return (
    // Reserve a full viewport of page height so the footer starts below the
    // fold while `loadSiteState()` is in flight. Without it the footer sits at
    // the viewport bottom on the short "Checking recruitment status…" state
    // and is pushed down when the form mounts (mobile /recruit CLS 0, desktop
    // 0.36 — the footer shift). No visible content is added; the space is
    // simply the page's minimum height.
    <div className="shell min-h-[100svh] py-12 md:py-16">
      <div className="max-w-xl">
        <header className="rule pt-8">
          <p className="label">Recruitment</p>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
            Join the corps.
          </h1>
          <p role="status" className="mt-3 font-mono text-xs uppercase tracking-wide text-muted">
            {statusLine}
          </p>
        </header>

        {siteLoaded && recruitmentOpen === null && (
          <section aria-label="Recruitment status" className="mt-8 border border-line p-5">
            <p className="text-sm leading-relaxed text-paper/70">
              We could not confirm recruitment status right now. Refresh the page in a moment, or
              check an existing application below.
            </p>
          </section>
        )}

        {recruitmentOpen === false && (
          <section aria-label="Recruitment closed" className="mt-8 border border-line p-5">
            <h2 className="font-display text-xl font-semibold tracking-tight text-paper">
              Applications are closed.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-paper/70">
              Recruitment for this cycle is closed, so there is no form to submit. The next opening
              will be announced on this page. If you already applied, you can check its status
              below.
            </p>
          </section>
        )}

        {recruitmentOpen === true && receipt && (
          <section aria-labelledby="recruit-success-title" className="mt-8 border border-line p-5">
            <h2
              id="recruit-success-title"
              ref={successRef}
              tabIndex={-1}
              className="font-display text-xl font-semibold tracking-tight text-paper"
            >
              Application received
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-paper/70">
              Your reference ID is{' '}
              <span className="font-mono text-paper">{receipt.id}</span>. Keep it — you can use the
              status check below at any time.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-paper/70">
              Every application is reviewed, and you will be notified whether you are selected or
              not.
            </p>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-wide text-muted">
              Status: {applicationStatusCopy(receipt.status).label}
            </p>
          </section>
        )}

        {recruitmentOpen === true && !receipt && (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit} aria-busy={pending} noValidate>
            <fieldset className="space-y-5" disabled={pending}>
              <legend className="label">Application form</legend>

              <div>
                <label htmlFor="recruit-name" className="label">
                  Full name
                </label>
                <input
                  id="recruit-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? 'recruit-name-error' : undefined}
                  className={`field ${errors.name ? 'field-invalid' : ''}`}
                  placeholder="Your full name"
                />
                <FieldError id="recruit-name-error" message={errors.name} />
              </div>

              <div>
                <label htmlFor="recruit-email" className="label">
                  College email
                </label>
                <input
                  id="recruit-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'recruit-email-error' : undefined}
                  className={`field ${errors.email ? 'field-invalid' : ''}`}
                  placeholder="you@bl.students.amrita.edu"
                />
                <FieldError id="recruit-email-error" message={errors.email} />
              </div>

              <div>
                <label htmlFor="recruit-reg_number" className="label">
                  Register ID
                </label>
                <input
                  id="recruit-reg_number"
                  name="reg_number"
                  type="text"
                  autoComplete="off"
                  required
                  value={form.reg_number}
                  onChange={(event) => update('reg_number', event.target.value)}
                  aria-invalid={errors.reg_number ? true : undefined}
                  aria-describedby={errors.reg_number ? 'recruit-reg_number-error' : undefined}
                  className={`field ${errors.reg_number ? 'field-invalid' : ''}`}
                  placeholder="BL.SC.U4CSE24001"
                />
                <FieldError id="recruit-reg_number-error" message={errors.reg_number} />
              </div>

              <div>
                <label htmlFor="recruit-phone" className="label">
                  Phone number
                </label>
                <input
                  id="recruit-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={form.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={errors.phone ? 'recruit-phone-error' : undefined}
                  className={`field ${errors.phone ? 'field-invalid' : ''}`}
                  placeholder="+91 98765 43210"
                />
                <FieldError id="recruit-phone-error" message={errors.phone} />
              </div>

              <div>
                <label htmlFor="recruit-year" className="label">
                  Year of study
                </label>
                <select
                  id="recruit-year"
                  name="year"
                  required
                  value={form.year}
                  onChange={(event) => update('year', event.target.value)}
                  aria-invalid={errors.year ? true : undefined}
                  aria-describedby={errors.year ? 'recruit-year-error' : undefined}
                  className={`field ${errors.year ? 'field-invalid' : ''}`}
                >
                  <option value="">Select year</option>
                  {ELIGIBLE_YEARS.map((year) => (
                    <option key={year.value} value={year.value}>
                      {year.label}
                    </option>
                  ))}
                </select>
                <FieldError id="recruit-year-error" message={errors.year} />
              </div>

              <div>
                <label htmlFor="recruit-branch" className="label">
                  Branch
                </label>
                <input
                  id="recruit-branch"
                  name="branch"
                  type="text"
                  autoComplete="off"
                  required
                  value={form.branch}
                  onChange={(event) => update('branch', event.target.value)}
                  aria-invalid={errors.branch ? true : undefined}
                  aria-describedby={errors.branch ? 'recruit-branch-error' : undefined}
                  className={`field ${errors.branch ? 'field-invalid' : ''}`}
                  placeholder="Computer Science"
                />
                <FieldError id="recruit-branch-error" message={errors.branch} />
              </div>

              <div>
                <label htmlFor="recruit-why_join" className="label">
                  Why do you want to join?
                </label>
                <textarea
                  id="recruit-why_join"
                  name="why_join"
                  rows={4}
                  required
                  value={form.why_join}
                  onChange={(event) => update('why_join', event.target.value)}
                  aria-invalid={errors.why_join ? true : undefined}
                  aria-describedby={
                    errors.why_join ? 'recruit-why_join-hint recruit-why_join-error' : 'recruit-why_join-hint'
                  }
                  className={`field ${errors.why_join ? 'field-invalid' : ''}`}
                  placeholder="What draws you to data, AI and this community?"
                />
                <p id="recruit-why_join-hint" className="hint">
                  At least {MIN_ANSWER_LENGTH} characters.
                </p>
                <FieldError id="recruit-why_join-error" message={errors.why_join} />
              </div>

              <div>
                <label htmlFor="recruit-contribute" className="label">
                  What can you contribute?
                </label>
                <textarea
                  id="recruit-contribute"
                  name="contribute"
                  rows={4}
                  required
                  value={form.contribute}
                  onChange={(event) => update('contribute', event.target.value)}
                  aria-invalid={errors.contribute ? true : undefined}
                  aria-describedby={
                    errors.contribute
                      ? 'recruit-contribute-hint recruit-contribute-error'
                      : 'recruit-contribute-hint'
                  }
                  className={`field ${errors.contribute ? 'field-invalid' : ''}`}
                  placeholder="Skills, interests or time you can bring to the team"
                />
                <p id="recruit-contribute-hint" className="hint">
                  At least {MIN_ANSWER_LENGTH} characters.
                </p>
                <FieldError id="recruit-contribute-error" message={errors.contribute} />
              </div>

              <div>
                <label htmlFor="recruit-time_commitment" className="label">
                  Time commitment
                </label>
                <input
                  id="recruit-time_commitment"
                  name="time_commitment"
                  type="text"
                  autoComplete="off"
                  required
                  value={form.time_commitment}
                  onChange={(event) => update('time_commitment', event.target.value)}
                  aria-invalid={errors.time_commitment ? true : undefined}
                  aria-describedby={
                    errors.time_commitment ? 'recruit-time_commitment-error' : undefined
                  }
                  className={`field ${errors.time_commitment ? 'field-invalid' : ''}`}
                  placeholder="e.g. 4–6 hours a week"
                />
                <FieldError id="recruit-time_commitment-error" message={errors.time_commitment} />
              </div>

              <div>
                <label htmlFor="recruit-remarks" className="label">
                  Remarks (optional)
                </label>
                <textarea
                  id="recruit-remarks"
                  name="remarks"
                  rows={3}
                  value={form.remarks ?? ''}
                  onChange={(event) => update('remarks', event.target.value)}
                  className="field"
                  placeholder="Anything else we should know?"
                />
              </div>

              {formError && (
                <p
                  ref={formErrorRef}
                  tabIndex={-1}
                  role="alert"
                  aria-live="assertive"
                  className="error-text"
                >
                  <span aria-hidden="true">! </span>
                  {formError}
                </p>
              )}

              <button type="submit" className="btn-primary w-full sm:w-auto">
                {pending ? 'Submitting…' : 'Submit application'}
              </button>
            </fieldset>
          </form>
        )}

        <section aria-labelledby="lookup-title" className="mt-12 border-t border-line pt-8">
          <h2 id="lookup-title" className="font-display text-xl font-semibold tracking-tight text-paper">
            Check your application status
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-paper/70">
            Use the same email and register ID you applied with.
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleLookup} aria-busy={lookupPending} noValidate>
            <div>
              <label htmlFor="lookup-email" className="label">
                College email
              </label>
              <input
                id="lookup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={lookupPending}
                value={lookupEmail}
                onChange={(event) => {
                  setLookupEmail(event.target.value);
                  setLookupErrors((current) => ({ ...current, email: undefined }));
                }}
                aria-invalid={lookupErrors.email ? true : undefined}
                aria-describedby={lookupErrors.email ? 'lookup-email-error' : undefined}
                className={`field ${lookupErrors.email ? 'field-invalid' : ''}`}
                placeholder="you@bl.students.amrita.edu"
              />
              {lookupErrors.email && (
                <p id="lookup-email-error" className="error-text">
                  <span aria-hidden="true">! </span>
                  {lookupErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="lookup-reg" className="label">
                Register ID
              </label>
              <input
                id="lookup-reg"
                name="reg_number"
                type="text"
                autoComplete="off"
                required
                disabled={lookupPending}
                value={lookupReg}
                onChange={(event) => {
                  setLookupReg(event.target.value);
                  setLookupErrors((current) => ({ ...current, reg_number: undefined }));
                }}
                aria-invalid={lookupErrors.reg_number ? true : undefined}
                aria-describedby={lookupErrors.reg_number ? 'lookup-reg-error' : undefined}
                className={`field ${lookupErrors.reg_number ? 'field-invalid' : ''}`}
                placeholder="BL.SC.U4CSE24001"
              />
              {lookupErrors.reg_number && (
                <p id="lookup-reg-error" className="error-text">
                  <span aria-hidden="true">! </span>
                  {lookupErrors.reg_number}
                </p>
              )}
            </div>

            <button type="submit" className="btn-ghost w-full sm:w-auto">
              {lookupPending ? 'Checking…' : 'Check status'}
            </button>
          </form>

          <div
            ref={lookupResultRef}
            tabIndex={-1}
            aria-live="polite"
            className="mt-5 empty:mt-0"
          >
            {lookupResult?.kind === 'missing' && (
              <p className="text-sm leading-relaxed text-paper/70">
                No application found for those details.
              </p>
            )}
            {lookupResult?.kind === 'error' && (
              <p className="error-text">
                <span aria-hidden="true">! </span>
                {lookupResult.message}
              </p>
            )}
            {lookupResult?.kind === 'found' && (
              <div className="border border-line p-5">
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  {applicationStatusCopy(lookupResult.application.status).label}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-paper/70">
                  {applicationStatusCopy(lookupResult.application.status).body}
                </p>
                {lookupResult.application.created_at && (
                  <p className="mt-3 font-mono text-xs text-muted">
                    Applied {lookupResult.application.created_at.slice(0, 10)}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
