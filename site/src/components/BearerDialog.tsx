import { useEffect, useRef, useState } from 'react';
import type { OfficeBearer } from '../lib/content';
import { useFocusTrap } from '../lib/focus-trap';
import BearerPortrait from './BearerPortrait';

interface BearerDialogProps {
  bearer: OfficeBearer;
  position: number;
  total: number;
  onClose: () => void;
}

/**
 * The enlarged card. It flips 180° on open: the front is the portrait plate,
 * the back carries the name, role/class, links and Close. The page behind is
 * dimmed; backdrop click, Escape and Close return to the deck.
 */
export default function BearerDialog({ bearer, position, total, onClose }: BearerDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [shown, setShown] = useState(false);
  const [flipped, setFlipped] = useState(false);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => {
      setShown(true);
      setFlipped(true);
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-ink/45 transition-opacity duration-300 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${bearer.name}, ${bearer.role}`}
        onClick={(event) => event.stopPropagation()}
        className="relative z-10 w-full max-w-[24rem] [perspective:1400px]"
      >
        <div
          className={`relative aspect-[4/5] w-full transition-transform duration-700 ease-ink [transform-style:preserve-3d] motion-reduce:transition-none ${
            flipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          {/* Front: the portrait plate. Decorative; the back carries the facts. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 flex flex-col overflow-hidden border hairline bg-paper p-3 [backface-visibility:hidden]"
          >
            <div className="mono flex items-center justify-between text-faint">
              <span>
                {pad(position + 1)} / {pad(total)}
              </span>
              <span className="h-1.5 w-1.5 bg-seal" />
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-hidden">
              <BearerPortrait bearer={bearer} className="h-full" />
            </div>
            <p className="mt-3 truncate font-serif text-xl leading-tight tracking-tight text-ink">
              {bearer.name}
            </p>
            <p className="mono truncate text-quiet">{bearer.role}</p>
          </div>

          {/* Back: the enlarged facts, links and Close. */}
          <div className="absolute inset-0 flex flex-col overflow-y-auto border hairline bg-paper p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="mono flex items-center justify-between text-faint">
              <span>
                {pad(position + 1)} / {pad(total)}
              </span>
              <span aria-hidden="true" className="h-1.5 w-1.5 bg-seal" />
            </div>

            <div className="mt-4 flex justify-center">
              <div className="w-32">
                <BearerPortrait bearer={bearer} />
              </div>
            </div>

            <p className="mt-3 break-words text-center font-serif text-xl leading-tight tracking-tight text-ink">
              {bearer.name}
            </p>
            <p className="mono mt-1 text-center text-quiet">
              {bearer.role}
              {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
            </p>

            <div className="mono mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {bearer.links.length > 0 ? (
                bearer.links.map((link) => (
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
                ))
              ) : (
                <span className="text-faint">No links on file</span>
              )}
            </div>

            <div className="mt-auto flex justify-end border-t hairline pt-3">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="mono border border-ink/25 px-4 py-2 text-ink transition-colors duration-200 hover:border-seal hover:text-seal focus-visible:outline-offset-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
