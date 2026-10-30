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
    <section className="wrap py-14 md:py-20">
      <div className="max-w-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-4">
          <p className="mono text-quiet">03 / Verify</p>
          <p className="mono text-quiet">NSDC · Members</p>
        </div>

        {status === 'verifying' && (
          <p role="status" aria-live="polite" className="mono mt-8 text-quiet">
            Verifying your email...
          </p>
        )}
        {status === 'done' && (
          <>
            <h1 className="mt-8 max-w-md font-display text-4xl font-normal leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Email verified
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-quiet">
              Your account is active. Sign in to continue.
            </p>
            <div className="rule mt-8 max-w-md" aria-hidden="true" />
            <p className="mt-8 max-w-md text-sm">
              <Link to="/login" className="link">Sign in</Link>
            </p>
          </>
        )}
        {(status === 'invalid' || status === 'missing') && (
          <>
            <h1 className="mt-8 max-w-md font-display text-4xl font-normal leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Link invalid or expired
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-quiet">
              Verification links work once and expire after an hour. Request a fresh one below.
            </p>
            <div className="rule mt-8 max-w-md" aria-hidden="true" />
            <p className="mt-8 max-w-md text-sm">
              <Link to="/verify-pending" className="link">Re-send verification link</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
