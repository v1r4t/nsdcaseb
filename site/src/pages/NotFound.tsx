import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDocumentMeta } from '../lib/useDocumentMeta';

interface NotFoundProps {
  onZero?: () => void;
  zeroLabel?: string;
}

/**
 * Egg 4 — the "Error / …" label cycles deadpan field notes on tap/click.
 * Never mentions admin; the `0` stays the only secret entrance on `/admin`.
 */
const FIELD_NOTES = [
  'Error / Route not resolved',
  'Error / We checked twice.',
  'Error / Definitely not here.',
  'Error / Try the menu.',
];

const digitStroke = { WebkitTextStroke: '1px var(--color-faint)' } as const;

/**
 * The 404 sits over the door-ajar motif that `PageScene` mounts for unknown
 * routes: the numerals are drawn as hollow outlines, the content stays in a
 * left-hand column, and the open door reads in the right-hand margin.
 */
export default function NotFound({ onZero, zeroLabel }: NotFoundProps) {
  useDocumentMeta({
    title: 'Page not found — NSDC',
    description: 'The page you are looking for does not exist. Head back to the NSDC home page.',
    robots: 'noindex',
  });
  const location = useLocation();
  const [note, setNote] = useState(0);

  return (
    <section className="wrap min-h-[60svh] py-16 md:py-24">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b hairline pb-6">
        <p
          aria-hidden={onZero ? undefined : true}
          style={digitStroke}
          className="select-none font-mono text-[clamp(3.5rem,11vw,7rem)] font-normal leading-[0.78] tracking-[-0.06em] text-transparent"
        >
          {onZero ? (
            <>
              <span aria-hidden="true">4</span>
              <button
                type="button"
                onClick={onZero}
                aria-label={zeroLabel ?? 'Continue'}
                style={digitStroke}
                className="cursor-pointer appearance-none border-0 bg-transparent p-0 text-transparent transition-colors duration-200 hover:text-ink focus-visible:text-ink"
              >
                0
              </button>
              <span aria-hidden="true">4</span>
            </>
          ) : (
            '404'
          )}
        </p>
        <button
          type="button"
          onClick={() => setNote((current) => (current + 1) % FIELD_NOTES.length)}
          className="mono cursor-pointer appearance-none border-0 bg-transparent p-0 text-left text-quiet transition-colors duration-200 hover:text-ink"
        >
          {FIELD_NOTES[note]}
        </button>
      </div>

      <h1 className="mt-10 max-w-2xl font-display text-[clamp(2.5rem,6vw,4rem)] font-normal leading-[1.02] tracking-tight text-ink">
        Page not found
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-quiet">
        Nothing lives at{' '}
        <span className="mono-sm break-all text-ink">{location.pathname}</span> yet.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
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
