import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const location = useLocation();

  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-xs uppercase tracking-mega text-neon">404</p>
      <h1 className="mt-5 font-display text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-4 text-sm text-white/70">
        Nothing lives at <span className="font-mono text-white/90">{location.pathname}</span> yet.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/" className="btn-primary">
          Back to home
        </Link>
        <Link to="/login" className="btn-ghost">
          Sign in
        </Link>
      </div>
    </section>
  );
}