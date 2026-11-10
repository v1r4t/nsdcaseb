import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { OfficeBearer } from '../lib/content';
import { useMediaQuery } from '../../../design/hooks/useMediaQuery';
import BearerDetail, { MonogramPortrait } from './BearerDetail';

export interface VisibleBearer {
  bearer: OfficeBearer;
  index: number;
}

/** Per-step rotation of the fan. Shrinks as the deck grows. */
export function fanSpread(total: number): number {
  return Math.min(12, 40 / Math.max(1, total - 1));
}

/**
 * One card's transform inside the tilted deck. The active card is flat and
 * lifted; the others fan out from the centre. `index` is the slot in the
 * visible deck, not the roster index.
 */
export function fanTransform(index: number, active: number, total: number): string {
  if (index === active) {
    return 'translate(-50%, -50%) rotateZ(0deg) translate3d(0px, -24px, 0px) scale(1.06)';
  }
  const center = (total - 1) / 2;
  const angle = (index - center) * fanSpread(total);
  const step = index - center;
  const y = Math.abs(step) * 5;
  return `translate(-50%, -50%) rotateZ(${angle.toFixed(2)}deg) translate3d(calc(var(--fan-step) * ${step.toFixed(2)}), ${y.toFixed(1)}px, 0px)`;
}

/**
 * The fan shows at most `max` cards. An active bearer outside the first `max`
 * replaces the last slot, so the selected person is always on the deck; the
 * roster below still lists everyone.
 */
export function visibleCards(bearers: OfficeBearer[], active: number, max = 8): VisibleBearer[] {
  const all = bearers.map((bearer, index) => ({ bearer, index }));
  if (all.length <= max) return all;
  const head = all.slice(0, max);
  if (active < max) return head;
  head[max - 1] = { bearer: bearers[active], index: active };
  return head;
}

function CardFace({ bearer }: { bearer: OfficeBearer }) {
  const [failed, setFailed] = useState(false);

  if (bearer.photo_url && !failed) {
    return (
      <div className="aspect-[4/5] w-full overflow-hidden border hairline bg-paper">
        <img
          src={bearer.photo_url}
          alt={`Portrait of ${bearer.name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full select-none object-cover"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden border hairline bg-paper">
      <MonogramPortrait name={bearer.name} />
    </div>
  );
}

interface BearCardProps {
  bearer: OfficeBearer;
  /** Roster index, used for the ordinal and the selection callback. */
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * One portrait card. Pointer-only by design: the roster below is the keyboard
 * and screen-reader control set, so the deck container is aria-hidden and the
 * cards never take focus.
 */
function BearCard({ bearer, index, active, onSelect, onHover, className = '', style }: BearCardProps) {
  return (
    <div
      data-deck-card={index}
      data-active={active ? 'true' : 'false'}
      onPointerEnter={() => onHover(index)}
      onClick={() => onSelect(index)}
      style={style}
      className={`cursor-pointer overflow-hidden border bg-paper p-2 transition-[transform,opacity,border-color] duration-300 ${
        active ? 'border-seal opacity-100' : 'border-[color:var(--hairline)] opacity-70 hover:opacity-90'
      } ${className}`}
    >
      <div className="mono flex items-center justify-between text-faint">
        <span>{String(index + 1).padStart(2, '0')}</span>
        {active ? <span aria-hidden="true" className="h-1.5 w-1.5 bg-seal" /> : null}
      </div>
      <div className="mt-2">
        <CardFace bearer={bearer} />
      </div>
      <p className="mt-2 truncate font-serif text-base leading-tight tracking-tight text-ink sm:text-lg">
        {bearer.name}
      </p>
      <p className="mono truncate text-quiet">{bearer.role}</p>
    </div>
  );
}

interface BearerDeckProps {
  bearers: OfficeBearer[];
  activeIndex: number;
  /** Click/tap: selects and announces. */
  onSelect: (index: number) => void;
  /** Pointer hover: selects silently. */
  onHover: (index: number) => void;
  onAdvance: () => void;
}

export default function BearerDeck({ bearers, activeIndex, onSelect, onHover, onAdvance }: BearerDeckProps) {
  const tilted = useMediaQuery('(min-width: 1024px) and (pointer: fine)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  if (bearers.length === 0) return null;

  const current = bearers[activeIndex] ?? bearers[0];
  const nextName = bearers[(activeIndex + 1) % bearers.length].name;

  const detail = (
    <BearerDetail
      bearer={current}
      position={activeIndex}
      total={bearers.length}
      nextName={nextName}
      onAdvance={onAdvance}
    />
  );

  if (reduced) {
    return (
      <div>
        <div data-deck-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-hidden="true">
          {bearers.map((bearer, index) => (
            <BearCard
              key={bearer.id}
              bearer={bearer}
              index={index}
              active={index === activeIndex}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </div>
        <div className="mt-8">{detail}</div>
      </div>
    );
  }

  if (!tilted) {
    return (
      <div>
        <div
          data-deck-rail
          aria-hidden="true"
          className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--gutter)] pb-4"
        >
          {bearers.map((bearer, index) => (
            <BearCard
              key={bearer.id}
              bearer={bearer}
              index={index}
              active={index === activeIndex}
              onSelect={onSelect}
              onHover={onHover}
              className="w-[72vw] max-w-[280px] shrink-0 snap-center"
            />
          ))}
        </div>
        <div className="mt-6">{detail}</div>
      </div>
    );
  }

  const visible = visibleCards(bearers, activeIndex);
  const activeSlot = visible.findIndex((card) => card.index === activeIndex);

  return (
    <div className="grid grid-cols-12 items-center gap-x-6">
      <div className="col-span-12 md:col-span-8">
        <div
          data-deck
          aria-hidden="true"
          className="relative mx-auto h-[clamp(340px,40vw,520px)] w-full [perspective:1200px]"
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
            {visible.map(({ bearer, index }, slot) => (
              <BearCard
                key={bearer.id}
                bearer={bearer}
                index={index}
                active={slot === activeSlot}
                onSelect={onSelect}
                onHover={onHover}
                className="absolute left-1/2 top-1/2 h-[310px] w-[180px]"
                style={{
                  transform: fanTransform(slot, activeSlot, visible.length),
                  // Natural stack: every card keeps its left strip reachable.
                  zIndex: 10 + slot,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="col-span-12 mt-6 md:col-span-4 md:mt-0">{detail}</div>
    </div>
  );
}
