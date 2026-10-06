import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const location = useLocation();

  return (
    <section className="shell py-16 md:py-24">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-line pb-6">
        <p aria-hidden="true" className="font-mono text-6xl font-medium leading-none tracking-tight text-signal sm:text-8xl">
          404
        </p>
        <p className="label">Error / Route not resolved</p>
      </div>

      <h1 className="mt-10 max-w-3xl font-display text-4xl font-semibold tracking-tight text-paper sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-xl text-sm text-paper/80">
        Nothing lives at <span className="break-all font-mono text-paper">{location.pathname}</span> yet.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
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
