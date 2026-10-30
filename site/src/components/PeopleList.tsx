import type { OfficeBearer } from '../lib/content';
import Reveal from './Reveal';

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase());
  return letters.join('') || '—';
}

function indexOf(position: number): string {
  return String(position + 1).padStart(2, '0');
}

/**
 * PEOPLE — the bearers as an editorial index, not profile cards. Each row is
 * a mono index number, the name in Bespoke Serif, the role in quiet mono.
 * Hover raises a large ink-wash initials monogram behind the row. No photos:
 * `photo_url` is null.
 */
export default function PeopleList({ bearers }: { bearers: OfficeBearer[] }) {
  if (bearers.length === 0) {
    return (
      <p className="border-t py-5 text-sm text-quiet hairline">
        The current board has not been published yet.
      </p>
    );
  }
  return (
    <ol className="border-t hairline">
      {bearers.map((bearer, i) => (
        <li key={bearer.id} className="border-b hairline">
          <Reveal delay={Math.min(i, 5) * 60}>
            <div className="group relative overflow-hidden py-6 sm:py-7">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 select-none font-display text-[7rem] leading-none tracking-tight text-ink/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:text-[10rem]"
              >
                {initials(bearer.name)}
              </span>
              <div className="relative flex items-baseline gap-5 sm:gap-8">
                <span className="mono w-8 shrink-0 text-faint">{indexOf(i)}</span>
                <div className="min-w-0">
                  <p className="truncate font-serif text-xl leading-tight tracking-tight text-ink sm:text-3xl">
                    {bearer.name}
                  </p>
                  <p className="mono mt-2 text-quiet">
                    {bearer.role}
                    {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
                  </p>
                  {bearer.links.length > 0 && (
                    <p className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1">
                      {bearer.links.map((link) => (
                        <a
                          key={`${link.label}-${link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${bearer.name} — ${link.label} (opens in a new tab)`}
                          className="text-quiet underline decoration-[color:var(--hairline)] underline-offset-4 transition-colors duration-200 hover:text-seal hover:decoration-seal/40"
                        >
                          ↗ {link.label}
                        </a>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}
