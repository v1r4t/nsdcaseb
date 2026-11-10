import type { CSSProperties } from 'react';
import type { OfficeBearer } from '../lib/content';
import { useMediaQuery } from '../../../design/hooks/useMediaQuery';
import BearerPortrait from './BearerPortrait';

/** Per-step rotation of the fan. Shrinks as the deck grows. */
export function fanSpread(total: number): number {
  return Math.min(12, 40 / Math.max(1, total - 1));
}

/**
 * One card's transform inside the tilted deck. The slot is fixed; opening a
 * card never moves the fan, so the page underneath stays where it was.
 * `index` is the slot in the deck.
 */
export function fanTransform(index: number, total: number): string {
  const center = (total - 1) / 2;
  const angle = (index - center) * fanSpread(total);
  const step = index - center;
  const y = Math.abs(step) * 5;
  return `translate(-50%, -50%) rotateZ(${angle.toFixed(2)}deg) translate3d(calc(var(--fan-step) * ${step.toFixed(2)}), ${y.toFixed(1)}px, 0px)`;
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
 * the enlarged dialog. The visual card sits in an inner layer so a focus ring
 * or hover border never changes the hit area.
 */
function BearCard({ bearer, index, onOpen, className = '', style }: BearCardProps) {
  return (
    <button
      type="button"
      data-deck-card={index}
      aria-haspopup="dialog"
      onClick={(event) => onOpen(index, event.currentTarget)}
      style={style}
      className={`group cursor-pointer text-left focus-visible:z-40 ${className}`}
    >
      <div className="h-full overflow-hidden border border-[color:var(--hairline)] bg-paper p-2 transition-[border-color,transform] duration-300 group-hover:border-ink/40 group-focus-visible:border-seal">
        <div className="mono flex items-center justify-between text-faint">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 bg-seal opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </div>
        <div className="mt-2" aria-hidden="true">
          <BearerPortrait bearer={bearer} />
        </div>
        <p className="mt-2 truncate font-serif text-base leading-tight tracking-tight text-ink sm:text-lg">
          {bearer.name}
        </p>
        <p className="mono truncate text-quiet">{bearer.role}</p>
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
    <div
      data-deck
      className="relative mx-auto h-[clamp(340px,40vw,520px)] w-full overflow-hidden [perspective:1200px]"
    >
      <div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={
          {
            transform: 'rotateX(14deg) rotateZ(-8deg)',
            '--fan-step': 'clamp(76px, 8.5vw, 132px)',
          } as CSSProperties
        }
      >
        {bearers.map((bearer, slot) => (
          <BearCard
            key={bearer.id}
            bearer={bearer}
            index={slot}
            onOpen={onOpen}
            className="absolute left-1/2 top-1/2 h-[310px] w-[180px]"
            style={{
              transform: fanTransform(slot, bearers.length),
              zIndex: 10 + slot,
            }}
          />
        ))}
      </div>
    </div>
  );
}
