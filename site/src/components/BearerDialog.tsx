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
 * The enlarged card. One bearer, front and centre over a dimmed page; the card
 * is the visual, the strip under it carries the links and the Close control.
 * Clicking the backdrop, pressing Escape or Close returns to the deck.
 */
export default function BearerDialog({ bearer, position, total, onClose }: BearerDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [shown, setShown] = useState(false);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => setShown(true));
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
        className={`relative z-10 max-h-[86svh] w-full max-w-[24rem] overflow-y-auto transition-[transform,opacity] duration-300 motion-reduce:transition-none ${
          shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="border hairline bg-paper p-3">
          <div className="mono flex items-center justify-between text-faint">
            <span>
              {pad(position + 1)} / {pad(total)}
            </span>
            <span aria-hidden="true" className="h-1.5 w-1.5 bg-seal" />
          </div>
          <div className="mt-3">
            <BearerPortrait bearer={bearer} />
          </div>
          <p className="mt-3 break-words font-serif text-2xl leading-tight tracking-tight text-ink">
            {bearer.name}
          </p>
          <p className="mono mt-1 text-quiet">
            {bearer.role}
            {bearer.cohort ? <span> · Class of {bearer.cohort}</span> : null}
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between gap-4 border hairline bg-paper px-3 py-2">
          <div className="mono flex flex-wrap gap-x-4 gap-y-1">
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
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="mono shrink-0 border border-ink/25 px-3 py-2 text-ink transition-colors duration-200 hover:border-seal hover:text-seal focus-visible:outline-offset-4"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
