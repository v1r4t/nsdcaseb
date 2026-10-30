import { Suspense, lazy, useState } from 'react';
import NotFound from './NotFound';

const Admin = lazy(() => import('./Admin'));

/**
 * /admin is disguised as the normal 404 page. The middle 0 of "404" is the
 * only interactive part: clicking it unlocks and reveals the Admin console in
 * place, without changing the URL. The unlock is intentionally ephemeral
 * (component state only), so a refresh re-hides the console. This is
 * camouflage only — real access control is enforced server-side.
 */
export default function AdminDoor() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <NotFound onZero={() => setUnlocked(true)} zeroLabel="0 · Open admin console" />;
  }

  return (
    <Suspense
      fallback={
        <div className="wrap min-h-[100svh] py-12 md:py-16">
          <p aria-live="polite" className="mono text-quiet">
            Loading…
          </p>
        </div>
      }
    >
      <Admin />
    </Suspense>
  );
}
