import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Gate for signed-in-only routes. Unauthenticated visitors are sent to
 * /login with the location they wanted, which Login reads back as `from`.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Don't bounce to /login while the session probe is still running.
  if (loading) {
    return (
      <div className="shell py-16">
        <p role="status" aria-live="polite" className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Checking your session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}