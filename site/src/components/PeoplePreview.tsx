import { useState } from 'react';
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
 * A drawn stand-in, never a fake photograph: a quiet paper ground, a soft
 * wash, a hairline frame and the bearer's initials held in a small ruled
 * square — a bookplate mark rather than a full-bleed texture. The mark stays
 * compact at every size, so it reads as deliberate in a 96px phone thumbnail
 * and in the large desktop plate alike.
 */
function MonogramPortrait({ name }: { name: string }) {
  return (
    <span
      role="img"
      aria-label={`Drawn portrait placeholder for ${name}. No photograph on file.`}
      className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-paper) 95%, var(--color-ink))',
        backgroundImage:
          'radial-gradient(62% 52% at 50% 44%, color-mix(in srgb, var(--color-ink) 7%, transparent), transparent 72%)',
      }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-2 border hairline md:inset-3" />
      <span
        aria-hidden="true"
        className="absolute right-3 top-3 h-1.5 w-1.5 bg-seal md:right-4 md:top-4"
      />
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center border hairline md:h-24 md:w-24"
      >
        <span className="font-serif text-base leading-none tracking-[-0.02em] text-ink/65 md:text-4xl">
          {initials(name)}
        </span>
      </span>
      <span aria-hidden="true" className="mono absolute bottom-3 left-4 hidden text-faint md:block">
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
 * On a phone this is a compact plate after the roster: a 96–112px portrait
 * beside the name, so the list stays the lead and the preview reads as a
 * secondary control. From `md` up the same markup opens into the sticky
 * portrait plate in the right column.
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

        <span className="mt-3 flex items-center gap-4 md:mt-4 md:block">
          <span className="block w-24 shrink-0 overflow-hidden border hairline sm:w-28 md:w-full">
            <Portrait key={bearer.id} bearer={bearer} />
          </span>

          <span className="min-w-0 flex-1 md:mt-4 md:block">
            <span className="flex items-baseline justify-between gap-4 md:border-b md:hairline md:pb-3">
              <span className="min-w-0 flex-1">
                <span className="block break-words font-serif text-[clamp(1.35rem,2.4vw,1.85rem)] leading-tight tracking-tight text-ink">
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
        </span>

        <span className="mono mt-2 block text-faint transition-colors duration-200 group-hover:text-seal">
          <span className="md:hidden">Tap NEXT to advance</span>
          <span className="hidden md:inline">Select to advance · after {activeName}</span>
        </span>

        <span className="sr-only">
          {' '}Next: select to make this bearer active. Currently active: {activeName}.
        </span>
      </button>
    </div>
  );
}
