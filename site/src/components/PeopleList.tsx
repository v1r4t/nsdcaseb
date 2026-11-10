import { useCallback, useRef, useState } from 'react';
import type { OfficeBearer } from '../lib/content';
import BearerDeck from './BearerDeck';
import BearerDialog from './BearerDialog';

/**
 * PEOPLE — the board as a deck of portrait cards.
 *
 * The deck is the whole section: no roster underneath. Every card is a real
 * button, so Tab reaches each bearer and Enter/Space opens the enlarged card
 * over a dimmed page. Closing restores focus to the card that opened it.
 */
export default function PeopleList({ bearers }: { bearers: OfficeBearer[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    setOpenIndex(null);
    if (opener) window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
  }, []);

  const open = useCallback((index: number, opener: HTMLElement) => {
    openerRef.current = opener;
    setOpenIndex(index);
  }, []);

  if (bearers.length === 0) {
    return (
      <p className="border-t py-5 text-sm text-quiet hairline">
        The current board has not been published yet.
      </p>
    );
  }

  const current = openIndex !== null ? bearers[openIndex] : null;

  return (
    <div>
      <BearerDeck bearers={bearers} onOpen={open} />

      <p className="mono mt-6 text-faint">Select a card</p>

      {current ? (
        <BearerDialog
          bearer={current}
          position={openIndex ?? 0}
          total={bearers.length}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
