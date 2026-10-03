import { useEffect, useState, type FormEvent } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

const STORAGE_KEY = 'nsdc:notified';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function NotifyForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  // Revisit after signing up? Show the success state straight away.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) setStatus('success');
    } catch {
      /* private mode etc. — ignore */
    }
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'loading') return;

    const company =
      (e.currentTarget.elements.namedItem('company') as HTMLInputElement | null)?.value ?? '';
    const value = email.trim();

    if (!EMAIL_RE.test(value)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, company }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; already?: boolean }
        | null;

      if (res.ok && data?.ok) {
        try {
          localStorage.setItem(STORAGE_KEY, value.toLowerCase());
        } catch {
          /* ignore */
        }
        setStatus('success');
        return;
      }
      setStatus('error');
      setMessage(
        res.status === 400
          ? 'That email looks off — try again.'
          : 'Couldn’t reach us — try again in a moment.',
      );
    } catch {
      setStatus('error');
      setMessage('Network hiccup — try again?');
    }
  };

  if (status === 'success') {
    return (
      <p role="status" className="text-sm text-neon">
        ✓ You’re on the list — we’ll reach out at launch.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="notify-email" className="sr-only">
          Email address
        </label>
        <input
          id="notify-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@college.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-neon/60 focus:bg-white/[0.08] disabled:opacity-60"
        />
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="shrink-0 rounded-xl bg-gradient-to-r from-neon to-deepblue px-6 py-3 text-sm font-semibold text-void transition hover:brightness-110 disabled:opacity-60"
        >
          {status === 'loading' ? 'Sending…' : 'Notify me'}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1rem] text-xs text-slate-400">
        {status === 'error' ? message : '\u00A0'}
      </p>
    </form>
  );
}
