import { useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { OfficeBearer } from '../lib/content';
import Reveal from './Reveal';
import BearerDeck from './BearerDeck';

function indexOf(position: number): string {
  return String(position + 1).padStart(2, '0');
}

/**
 * PEOPLE — the bearers as a deck of portrait cards over an editorial index.
 *
 * The deck is the visual layer: a fan of paper cards, one per bearer, that
 * lifts on hover and opens that person's facts. It is pointer-only and
 * aria-hidden; the roster below is the keyboard and screen-reader control set.
 * Advancing is available from the roster (arrows/Enter) and the detail block's
 * Next control.
 */
export default function PeopleList({ bearers }: { bearers: OfficeBearer[] }) {
  const [active, setActive] = useState(0);
  // Only keyboard/click changes are announced; pointer sweeps stay silent.
  const [announced, setAnnounced] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hintId = useId();
  const total = bearers.length;

  if (total === 0) {
    return (
      <p className="border-t py-5 text-sm text-quiet hairline">
        The current board has not been published yet.
      </p>
    );
  }

  const activeIndex = ((active % total) + total) % total;
  const announcedBearer = bearers[((announced % total) + total) % total];

  const focusRow = (index: number) => {
    rowRefs.current[index]?.focus();
  };

  const select = (index: number, announce = false) => {
    setActive(index);
    if (announce) setAnnounced(index);
  };

  const advance = (from: number, delta: number, moveFocus: boolean) => {
    const target = (from + delta + total) % total;
    select(target, true);
    if (moveFocus) focusRow(target);
  };

  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        advance(index, 1, true);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        advance(index, 1, true);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        advance(index, -1, true);
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <BearerDeck
        bearers={bearers}
        activeIndex={activeIndex}
        onSelect={(index) => select(index, true)}
        onHover={(index) => select(index, false)}
        onAdvance={() => advance(activeIndex, 1, false)}
      />

      <ol aria-describedby={hintId} className="mt-10 border-t hairline">
        {bearers.map((bearer, i) => {
          const isActive = activeIndex === i;
          return (
            <li key={bearer.id} className="border-b hairline">
              <Reveal delay={Math.min(i, 5) * 60}>
                <div
                  className="group relative"
                  onPointerEnter={() => select(i, false)}
                  onFocus={() => select(i, true)}
                >
                  <div className="flex items-start gap-5 py-5 sm:gap-8 sm:py-6">
                    <span
                      aria-hidden="true"
                      className={`mono w-8 shrink-0 pt-1 transition-colors duration-200 ${
                        isActive ? 'text-seal' : 'text-faint'
                      }`}
                    >
                      {indexOf(i)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <button
                        ref={(node) => {
                          rowRefs.current[i] = node;
                        }}
                        type="button"
                        onClick={() => select(i, true)}
                        onKeyDown={(event) => onRowKeyDown(event, i)}
                        data-active={isActive ? 'true' : undefined}
                        className="group/row block w-full text-left"
                      >
                        <span className="flex items-baseline gap-3">
                          <span
                            aria-hidden="true"
                            className={`inline-block h-1.5 w-1.5 shrink-0 transition-colors duration-200 ${
                              isActive ? 'bg-seal' : 'border border-ink/25'
                            }`}
                          />
                          <span className="min-w-0 break-words font-serif text-xl leading-tight tracking-tight text-ink sm:text-2xl">
                            {bearer.name}
                          </span>
                        </span>
                        <span className="mono mt-2 block pl-[18px] text-quiet">
                          {bearer.role}
                          {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
                        </span>
                        {isActive ? <span className="sr-only">, Active bearer</span> : null}
                      </button>

                      {bearer.links.length > 0 && (
                        <p className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-[18px]">
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

                    <span aria-hidden="true" className="mono hidden shrink-0 pt-1.5 text-faint md:block">
                      {isActive ? 'Active' : '\u00A0'}
                    </span>
                  </div>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>

      <p id={hintId} className="mono mt-4 text-faint">
        <span className="md:hidden">Tap a row to view the card. Tap Next to advance.</span>
        <span className="hidden md:inline">
          Hover or focus a row to view that bearer; the arrow keys move through the index and
          Enter advances, or use Next.
        </span>
      </p>

      <p role="status" className="sr-only">
        Viewing {announcedBearer.name}, {announcedBearer.role}
        {announcedBearer.cohort ? `, class of ${announcedBearer.cohort}` : ''}. Bearer{' '}
        {((announced % total) + total) % total + 1} of {total}.
      </p>
    </div>
  );
}
