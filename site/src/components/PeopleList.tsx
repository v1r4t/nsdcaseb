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
 * a mono index number, the name in display type, the role in muted mono.
 * Hover reveals a large low-opacity initials monogram behind the row.
 * No photos: `photo_url` is null.
 */
export default function PeopleList({ bearers }: { bearers: OfficeBearer[] }) {
  if (bearers.length === 0) {
    return <p className="text-sm text-muted">The current board has not been published yet.</p>;
  }
  return (
    <ol>
      {bearers.map((bearer, i) => (
        <li key={bearer.id} className="border-t border-line last:border-b">
          <Reveal delay={Math.min(i, 5) * 60}>
            <div className="group relative overflow-hidden py-6 sm:py-7">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 select-none font-display text-[7rem] font-bold leading-none tracking-tight text-signal opacity-0 transition-opacity duration-200 group-hover:opacity-10 sm:text-[10rem]"
              >
                {initials(bearer.name)}
              </span>
              <div className="relative flex items-baseline gap-5 sm:gap-8">
                <span className="w-8 shrink-0 font-mono text-xs text-muted">{indexOf(i)}</span>
                <div className="min-w-0">
                  <p className="truncate font-display text-xl font-bold uppercase tracking-tight text-paper sm:text-3xl">
                    {bearer.name}
                  </p>
                  <p className="mt-1.5 font-mono text-xs uppercase tracking-wide text-muted">
                    {bearer.role}
                    {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}
