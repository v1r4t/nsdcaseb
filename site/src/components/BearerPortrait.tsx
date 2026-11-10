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

/**
 * A drawn stand-in, never a fake photograph: a quiet paper ground, a soft
 * wash, a hairline frame and the bearer's initials held in a small ruled
 * square — a bookplate mark rather than a full-bleed texture.
 */
export function MonogramPortrait({ name }: { name: string }) {
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
      <span aria-hidden="true" className="pointer-events-none absolute inset-2 border hairline" />
      <span aria-hidden="true" className="absolute right-2 top-2 h-1.5 w-1.5 bg-seal" />
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center border hairline sm:h-12 sm:w-12"
      >
        <span className="font-serif text-sm leading-none tracking-[-0.02em] text-ink/65 sm:text-lg">
          {initials(name)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="mono absolute bottom-2 left-2 hidden text-[10px] text-faint sm:block"
      >
        No photograph on file
      </span>
    </span>
  );
}

/** A real portrait when the CMS has one, the drawn monogram otherwise. */
export default function BearerPortrait({
  bearer,
  className = '',
}: {
  bearer: OfficeBearer;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`aspect-[4/5] w-full overflow-hidden border hairline bg-paper ${className}`}>
      {bearer.photo_url && !failed ? (
        <img
          src={bearer.photo_url}
          alt={`Portrait of ${bearer.name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full select-none object-cover"
        />
      ) : (
        <MonogramPortrait name={bearer.name} />
      )}
    </div>
  );
}
