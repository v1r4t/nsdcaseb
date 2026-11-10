import type { CSSProperties } from 'react';
import type { OfficeBearer } from '../lib/content';
import { useMediaQuery } from '../../../design/hooks/useMediaQuery';
import BearerPortrait from './BearerPortrait';

/** Per-step rotation of the fan. Shrinks as the deck grows. */
export function fanSpread(total: number): number {
  return Math.min(8, 40 / Math.max(1, total - 1));
}

/**
 * One card's transform inside the fan. All cards share the same bottom pivot,
 * so they read as one hand of cards rather than scattered plates. `index` is
 * the slot in the deck.
 */
export function fanTransform(index: number, total: number): string {
  const center = (total - 1) / 2;
  // Reverse the horizontal order so the first bearer (President) sits at the
  // front/right and the last (Mentor) at the back/left. Each card's left
  // edge — where the name sits — stays exposed behind the one in front.
  const step = center - index;
  const angle = step * fanSpread(total);
  const x = step * 120;
  const y = Math.abs(step) * 12;
  return `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0px) rotateZ(${angle.toFixed(2)}deg)`;
}

interface BearCardProps {
  bearer: OfficeBearer;
  /** Roster index, used for the ordinal and the open callback. */
  index: number;
  onOpen: (index: number, opener: HTMLElement) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * One portrait card. A real button: Tab reaches every card, Enter/Space opens
 * the enlarged dialog. Hover lifts it immediately and brings it to the front.
 */
function BearCard({ bearer, index, onOpen, className = '', style }: BearCardProps) {
  return (
    <button
      type="button"
      data-deck-card={index}
      aria-haspopup="dialog"
      onClick={(event) => onOpen(index, event.currentTarget)}
      style={style}
      className={`group cursor-pointer text-left hover:z-40 focus-visible:z-40 ${className}`}
    >
      <div className="h-full overflow-hidden border border-[color:var(--hairline)] bg-paper p-2 transition-[border-color,transform] duration-100 group-hover:-translate-y-6 group-hover:border-seal group-focus-visible:-translate-y-6 group-focus-visible:border-seal">
        <div className="mono flex items-center justify-between text-faint">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 bg-seal opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </div>
        <p className="mt-2 line-clamp-2 font-serif text-base leading-tight tracking-tight text-ink sm:text-lg">
          {bearer.name}
        </p>
        <p className="mono mt-1 truncate text-quiet">{bearer.role}</p>
        <div className="mt-2">
          <BearerPortrait bearer={bearer} />
        </div>
      </div>
    </button>
  );
}

interface BearerDeckProps {
  bearers: OfficeBearer[];
  onOpen: (index: number, opener: HTMLElement) => void;
}

export default function BearerDeck({ bearers, onOpen }: BearerDeckProps) {
  const tilted = useMediaQuery('(min-width: 1024px) and (pointer: fine)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  if (bearers.length === 0) return null;

  if (reduced) {
    return (
      <div data-deck-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {bearers.map((bearer, index) => (
          <BearCard key={bearer.id} bearer={bearer} index={index} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  if (!tilted) {
    return (
      <div
        data-deck-rail
        className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--gutter)] pb-4"
      >
        {bearers.map((bearer, index) => (
          <BearCard
            key={bearer.id}
            bearer={bearer}
            index={index}
            onOpen={onOpen}
            className="w-[72vw] max-w-[280px] shrink-0 snap-center"
          />
        ))}
      </div>
    );
  }

  return (
    <div data-deck className="relative mx-auto h-[clamp(480px,32vw,520px)] w-full overflow-hidden">
      {bearers.map((bearer, slot) => (
        <BearCard
          key={bearer.id}
          bearer={bearer}
          index={slot}
          onOpen={onOpen}
          className="absolute left-1/2 top-[40%] h-[370px] w-[220px]"
          style={{
            transform: fanTransform(slot, bearers.length),
            // Roster order is the stack order: President on top, Mentor at the back.
            zIndex: 10 + (bearers.length - slot),
          }}
        />
      ))}
    </div>
  );
}
