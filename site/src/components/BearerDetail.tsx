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
 * compact at every size, so it reads as deliberate in a card face and in the
 * detail block alike.
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
      <span aria-hidden="true" className="mono absolute bottom-2 left-2 hidden text-[10px] text-faint sm:block">
        No photograph on file
      </span>
    </span>
  );
}

interface BearerDetailProps {
  /** The bearer currently being viewed — always a real row, never invented. */
  bearer: OfficeBearer;
  /** Zero-based position of the viewed bearer in the index. */
  position: number;
  total: number;
  /** Name of the bearer the Next control would move to. */
  nextName: string;
  onAdvance: () => void;
}

/**
 * The facts beside the deck: name, role, class, links and index. Deliberately
 * text-only — the portrait lives on the card, so repeating it here would show
 * the same face twice.
 */
export default function BearerDetail({
  bearer,
  position,
  total,
  nextName,
  onAdvance,
}: BearerDetailProps) {
  return (
    <div data-bearer-detail className="border-t hairline pt-3">
      <div className="flex items-baseline justify-between gap-4 border-b hairline pb-2">
        <span className="mono flex items-center gap-2 text-seal">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
          Viewing
        </span>
        <span className="mono text-faint">
          {pad(position + 1)} / {pad(total)}
        </span>
      </div>

      <p
        data-bearer-detail-name
        className="mt-4 break-words font-serif text-[clamp(1.35rem,2.4vw,1.85rem)] leading-tight tracking-tight text-ink"
      >
        {bearer.name}
      </p>
      <p className="mono mt-2 text-quiet">
        {bearer.role}
        {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
      </p>

      {bearer.links.length > 0 && (
        <ul className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {bearer.links.map((link) => (
            <li key={`${link.label}-${link.url}`}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${bearer.name} — ${link.label} (opens in a new tab)`}
                className="text-quiet underline decoration-[color:var(--hairline)] underline-offset-4 transition-colors duration-200 hover:text-seal hover:decoration-seal/40"
              >
                ↗ {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex justify-end border-t hairline pt-3">
        <button
          type="button"
          onClick={onAdvance}
          aria-label={`Next — view ${nextName}`}
          className="mono inline-flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 border border-ink/25 px-4 text-ink transition-colors duration-200 hover:border-seal hover:text-seal focus-visible:outline-offset-4 sm:w-auto sm:justify-center sm:gap-2"
        >
          <span>Next</span>
          <span aria-hidden="true" className="transition-transform duration-200">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
