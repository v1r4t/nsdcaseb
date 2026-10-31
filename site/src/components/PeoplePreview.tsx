import { useId, useState } from 'react';
import type { OfficeBearer } from '../lib/content';

/** First letters of the first two words, matching the index's old monogram. */
function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase());
  return letters.join('') || '—';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A drawn stand-in, never a fake photograph: an ink wash, a fine hatch, the
 * bearer's initials in Bespoke Serif and a hairline frame inside the plate.
 * The wash is two blurred ellipses in `ink` on a slightly darkened `paper`
 * ground, so the whole thing stays inside the three-tone palette.
 */
function MonogramPortrait({ name }: { name: string }) {
  const uid = useId().replace(/:/g, '');
  const washId = `people-wash-${uid}`;
  const hatchId = `people-hatch-${uid}`;

  return (
    <span
      role="img"
      aria-label={`Drawn portrait placeholder for ${name}. No photograph on file.`}
      className="relative block aspect-[4/5] w-full overflow-hidden"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-paper) 88%, var(--color-ink))' }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 125"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-ink"
      >
        <defs>
          <filter id={washId} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <pattern
            id={hatchId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(38)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.4" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="125" fill={`url(#${hatchId})`} />
        <g filter={`url(#${washId})`} opacity="0.6">
          <ellipse cx="34" cy="46" rx="30" ry="24" fill="currentColor" opacity="0.24" />
          <ellipse cx="68" cy="76" rx="26" ry="20" fill="currentColor" opacity="0.16" />
          <ellipse cx="52" cy="32" rx="16" ry="13" fill="currentColor" opacity="0.12" />
        </g>
      </svg>

      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-serif leading-none tracking-[-0.03em] text-ink/70"
          style={{ fontSize: 'clamp(3rem, 8vw, 5.25rem)' }}
        >
          {initials(name)}
        </span>
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-3 border hairline" />
      <span aria-hidden="true" className="absolute right-4 top-4 h-1.5 w-1.5 bg-seal" />
      <span aria-hidden="true" className="mono absolute bottom-3 left-4 text-faint">
        No photograph on file
      </span>
    </span>
  );
}

/** Real photo when the CMS has one; the drawn monogram otherwise or on error. */
function Portrait({ bearer }: { bearer: OfficeBearer }) {
  const [failed, setFailed] = useState(false);

  if (bearer.photo_url && !failed) {
    return (
      <img
        src={bearer.photo_url}
        alt={`Portrait of ${bearer.name}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="block aspect-[4/5] w-full select-none object-cover"
      />
    );
  }

  return <MonogramPortrait name={bearer.name} />;
}

interface PeoplePreviewProps {
  /** The bearer after the active one — always a real row, never invented. */
  bearer: OfficeBearer;
  /** Zero-based position of the previewed bearer in the index. */
  position: number;
  total: number;
  activeName: string;
  onAdvance: () => void;
}

/**
 * PEOPLE preview — the next bearer's portrait, clearly tagged `NEXT`.
 *
 * The whole plate is one button: clicking, tapping, Enter or Space advances the
 * active bearer. It is never hover-only — it renders at rest, so touch, keyboard
 * and reduced-motion readers get the same portrait and control.
 */
export default function PeoplePreview({
  bearer,
  position,
  total,
  activeName,
  onAdvance,
}: PeoplePreviewProps) {
  return (
    <div className="border-t hairline pt-3">
      <button
        type="button"
        onClick={onAdvance}
        className="group block w-full text-left focus-visible:outline-offset-4"
      >
        <span className="flex items-baseline justify-between gap-4 border-b hairline pb-2">
          <span className="mono flex items-center gap-2 text-seal">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
            Next
          </span>
          <span className="mono text-faint">
            {pad(position + 1)} / {pad(total)}
          </span>
        </span>

        <span className="mt-4 block overflow-hidden border hairline">
          <Portrait key={bearer.id} bearer={bearer} />
        </span>

        <span className="mt-4 block border-b hairline pb-3">
          <span className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-[clamp(1.35rem,2.4vw,1.85rem)] leading-tight tracking-tight text-ink">
                {bearer.name}
              </span>
              <span className="mono mt-2 block text-quiet">
                {bearer.role}
                {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="mono shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-1 group-focus-visible:translate-x-1"
            >
              →
            </span>
          </span>
        </span>

        <span className="mono mt-2 block text-faint transition-colors duration-200 group-hover:text-seal">
          Select to advance · after {activeName}
        </span>

        <span className="sr-only">
          {' '}Next: select to make this bearer active. Currently active: {activeName}.
        </span>
      </button>
    </div>
  );
}
