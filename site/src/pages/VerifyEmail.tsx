import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';

type Status = 'missing' | 'verifying' | 'done' | 'invalid';

export default function VerifyEmail() {
  useDocumentMeta({
    title: 'Verify your email — NSDC',
    description: 'Confirm your NSDC account email address to activate your membership and sign in.',
  });
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
    <section className="wrap py-10 md:py-20">
      <div className="max-w-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-4">
          <p className="mono text-quiet">03 / Verify</p>
          <p className="mono text-quiet">NSDC · Members</p>
        </div>

        {status === 'verifying' && (
          <p role="status" aria-live="polite" className="mono mt-6 text-quiet sm:mt-8">
            Verifying your email...
          </p>
        )}
        {status === 'done' && (
          <>
            <h1 className="mt-6 max-w-md font-display text-3xl font-normal leading-[1.05] tracking-tight text-ink sm:mt-8 sm:text-5xl">
              Email verified
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-quiet sm:mt-4">
              Your account is active. Sign in to continue.
            </p>
            <div className="rule mt-6 max-w-md sm:mt-8" aria-hidden="true" />
            <p className="mt-4 max-w-md text-sm sm:mt-8">
              <Link to="/login" className="link inline-flex min-h-11 items-center">Sign in</Link>
            </p>
          </>
        )}
        {(status === 'invalid' || status === 'missing') && (
          <>
            <h1 className="mt-6 max-w-md font-display text-3xl font-normal leading-[1.05] tracking-tight text-ink sm:mt-8 sm:text-5xl">
              Link invalid or expired
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-quiet sm:mt-4">
              Verification links work once and expire after an hour. Request a fresh one below.
            </p>
            <div className="rule mt-6 max-w-md sm:mt-8" aria-hidden="true" />
            <p className="mt-4 max-w-md text-sm sm:mt-8">
              <Link to="/verify-pending" className="link inline-flex min-h-11 items-center">Re-send verification link</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
