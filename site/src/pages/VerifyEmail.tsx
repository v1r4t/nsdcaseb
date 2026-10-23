import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../lib/api';

type Status = 'missing' | 'verifying' | 'done' | 'invalid';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing');

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyEmail(token)
      .then(() => { if (active) setStatus('done'); })
      .catch(() => { if (active) setStatus('invalid'); });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        {status === 'verifying' && (
          <p role="status" aria-live="polite" className="font-mono text-[11px] uppercase tracking-wide text-muted">
            Verifying your email...
          </p>
        )}
        {status === 'done' && (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Email verified</h1>
            <p className="mt-2 text-sm text-muted">Your account is active. Sign in to continue.</p>
            <p className="pt-4 text-sm"><Link to="/login" className="link">Sign in</Link></p>
          </>
        )}
        {(status === 'invalid' || status === 'missing') && (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Link invalid or expired</h1>
            <p className="mt-2 text-sm text-muted">
              Verification links work once and expire after an hour. Request a fresh one below.
            </p>
            <p className="pt-4 text-sm"><Link to="/verify-pending" className="link">Re-send verification link</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
