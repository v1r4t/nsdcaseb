import { useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { OfficeBearer } from '../lib/content';
import Reveal from './Reveal';
import PeoplePreview from './PeoplePreview';

function indexOf(position: number): string {
  return String(position + 1).padStart(2, '0');
}

/**
 * PEOPLE — the bearers as an editorial index, paired with a portrait plate.
 *
 * The rows stay the index: mono number, name in Bespoke Serif, role in quiet
 * mono, links intact. The active row is the one being read; the plate previews
 * the NEXT bearer after it, labelled `NEXT`. Pointing at or focusing a row makes
 * it active, so the plate follows the index without any hover-only content.
 *
 * Clicking the plate advances the active bearer by one and wraps. The same
 * movement is available from the keyboard: focus a row, then Enter/Space,
 * ArrowRight/Down to advance or ArrowLeft/Up to go back; focus follows the
 * active row. The plate itself is a button, so it is reachable and operable
 * without a pointer.
 */
export default function PeopleList({ bearers }: { bearers: OfficeBearer[] }) {
  const [active, setActive] = useState(0);
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
  const nextIndex = (activeIndex + 1) % total;
  const current = bearers[activeIndex];
  const next = bearers[nextIndex];

  const focusRow = (index: number) => {
    rowRefs.current[index]?.focus();
  };

  const advance = (from: number, delta: number, moveFocus: boolean) => {
    const target = (from + delta + total) % total;
    setActive(target);
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
    <div className="grid grid-cols-12 gap-x-6 gap-y-12">
      {/* Roster first in the DOM: on a phone the list leads and the preview
          follows it. On desktop the plate is placed in the right column and
          sticks, so the visual arrangement is unchanged. */}
      <div className="col-span-12 md:col-span-7 md:col-start-1 md:row-start-1">
        <ol aria-describedby={hintId} className="border-t hairline">
          {bearers.map((bearer, i) => {
            const isActive = activeIndex === i;
            return (
              <li key={bearer.id} className="border-b hairline">
                <Reveal delay={Math.min(i, 5) * 60}>
                  <div
                    className="group relative"
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                  >
                    <div className="flex items-start gap-5 py-6 sm:gap-8 sm:py-7">
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
                          onClick={() => setActive(i)}
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
                            <span className="min-w-0 break-words font-serif text-xl leading-tight tracking-tight text-ink sm:text-3xl">
                              {bearer.name}
                            </span>
                          </span>
                          <span className="mono mt-2 block pl-[18px] text-quiet">
                            {bearer.role}
                            {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
                          </span>
                          {isActive ? (
                            <span className="sr-only">, Active bearer</span>
                          ) : i === nextIndex ? (
                            <span className="sr-only">, Previewing as the next bearer</span>
                          ) : null}
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

                      <span
                        aria-hidden="true"
                        className="mono hidden shrink-0 pt-1.5 text-faint md:block"
                      >
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
          <span className="md:hidden">
            Tap a row to preview the next bearer; tap Next to advance.
          </span>
          <span className="hidden md:inline">
            Focus a row, or use the arrow keys, to preview the next bearer. Enter or space advances.
          </span>
        </p>

        <p role="status" className="sr-only">
          Next bearer: {next.name}, {next.role}
          {next.cohort ? `, class of ${next.cohort}` : ''}. Activate the preview to advance.
        </p>
      </div>

      {/* Portrait plate: after the roster on mobile, right column on desktop. */}
      <div className="col-span-12 md:col-span-4 md:col-start-9 md:row-start-1">
        <div className="motion-safe:md:sticky motion-safe:md:top-24">
          <PeoplePreview
            bearer={next}
            position={nextIndex}
            total={total}
            activeName={current.name}
            onAdvance={() => advance(activeIndex, 1, false)}
          />
        </div>
      </div>
    </div>
  );
}
