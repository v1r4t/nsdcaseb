import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../../design/hooks/useMediaQuery';
import { useReducedMotion } from '../../../design/hooks/useReducedMotion';

/** One row of the index, plus the data its stage needs. */
export interface IndexStageItem {
  /** Stable key; also used to match a stage to its index row. */
  id: string;
  /** Leading mark in the index column — an ordinal, date, or short label. */
  index: string;
  /**
   * Whether the leading mark is only a visual ordinal. Defaults to true for
   * ordinals ("01") and false for meaningful marks such as an event date.
   */
  indexIsDecorative?: boolean;
  title: string;
  /** Optional second line in the index (status, album, stack, ...). */
  meta?: ReactNode;
  /** Real destination for the row. Internal paths render as router links. */
  href?: string;
}

export interface IndexStageProps {
  items: IndexStageItem[];
  /** The stage body for one item. Called for every item, in order. */
  renderStage: (item: IndexStageItem, index: number) => ReactNode;
  /** Filing label for the index (e.g. "Projects"). */
  label?: string;
}

function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function isExternal(href: string): boolean {
  return /^https?:/i.test(href);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "17 OCT 2025" (and ISO fallbacks) are information, not just ordinals. */
const DATE_INDEX = /^(?:\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|\d{4}-\d{2}-\d{2})/;

function indexIsDecorative(item: IndexStageItem): boolean {
  return item.indexIsDecorative ?? !DATE_INDEX.test(item.index.trim());
}

/**
 * INDEX + STAGE — one shared interaction for the landing sections.
 *
 * Desktop (1024px and up): the index sits in the left column and stays in
 * view while the stages scroll past on the right. The active row follows
 * hover, keyboard focus, and the stage nearest the middle of the viewport.
 * Nothing moves on activation (colour and a small seal mark only), so the
 * column never jolts.
 *
 * Below 1024px and under reduced motion: the same items render as a plain stacked list —
 * index head followed by its stage — with no sticky column, no observer, and
 * no scroll coupling. Content is identical either way; this is never
 * hover-only information.
 *
 * The row is a real link when `href` is present and a real button otherwise,
 * so every item is reachable and activatable from the keyboard.
 */
export default function IndexStage({ items, renderStage, label }: IndexStageProps) {
  const [active, setActive] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);
  // The sticky two-column interaction needs room for the index plus a stage;
  // below 1024 the same content stacks (768–1023 included).
  const desktop = useMediaQuery('(min-width: 1024px)');
  const reduced = useReducedMotion();
  // Pinning and scroll-linked activation are desktop-only enhancements.
  const interactive = desktop && !reduced && items.length > 0;
  const itemKey = items.map((item) => item.id).join('|');

  // Active row follows whichever stage crosses the centre band of the
  // viewport. Entries are tracked so two stages in the band resolve to the
  // one nearest the centre rather than whichever fired last.
  useEffect(() => {
    if (!interactive) return;
    const root = stackRef.current;
    if (!root || typeof IntersectionObserver !== 'function') return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-stage-index]'));
    if (nodes.length === 0) return;

    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ordinal = Number(entry.target.getAttribute('data-stage-index'));
          if (!Number.isFinite(ordinal)) continue;
          if (entry.isIntersecting) {
            const middle = entry.boundingClientRect.top + entry.boundingClientRect.height / 2;
            visible.set(ordinal, Math.abs(middle - (window.innerHeight || 1) / 2));
          } else {
            visible.delete(ordinal);
          }
        }
        if (visible.size === 0) return;
        let best = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const [ordinal, distance] of visible) {
          if (distance < bestDistance) {
            best = ordinal;
            bestDistance = distance;
          }
        }
        if (best >= 0) setActive(best);
      },
      { rootMargin: '-42% 0px -50% 0px', threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);
    return () => {
      visible.clear();
      observer.disconnect();
    };
    // itemKey re-arms the observer when the list identity changes.
  }, [interactive, itemKey]);

  // Keep the stored ordinal inside the current list when a refresh shrinks it.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (items.length === 0) return null;

  // `active` can survive a refresh that removed rows; never print "03 / 02".
  const activeIndex = Math.min(Math.max(active, 0), items.length - 1);

  // A row without a destination can still activate and reveal its stage.
  const scrollToStage = (ordinal: number): void => {
    const node = stackRef.current?.querySelector<HTMLElement>(
      `[data-stage-index="${ordinal}"]`,
    );
    node?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const rowClass = (isActive: boolean): string =>
    `group grid w-full grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 py-3.5 pr-2 text-left transition-colors duration-200 ${
      isActive ? 'text-ink' : 'text-quiet hover:text-ink focus-visible:text-ink'
    }`;

  const rowContent = (item: IndexStageItem, ordinal: number) => {
    const isActive = ordinal === activeIndex;
    const decorativeIndex = indexIsDecorative(item);
    return (
      <>
        {/* Width is reserved on every row so activation cannot shift the text. */}
        <span
          aria-hidden="true"
          className={`mt-[0.45em] inline-block h-1.5 w-1.5 shrink-0 ${
            isActive ? 'bg-seal' : 'bg-transparent'
          }`}
        />
        <span aria-hidden={decorativeIndex ? 'true' : undefined} className="mono text-faint">
          {item.index}
        </span>
        <span className="min-w-0">
          <span className="block font-display text-[1.05rem] leading-tight">{item.title}</span>
          {item.meta ? (
            <span className="mono mt-1 block truncate text-faint">{item.meta}</span>
          ) : null}
          {isActive ? <span className="sr-only">, Previewing</span> : null}
        </span>
      </>
    );
  };

  const indexRow = (item: IndexStageItem, ordinal: number): ReactNode => {
    const isActive = ordinal === activeIndex;
    const shared = {
      className: rowClass(isActive),
      'data-active': isActive ? 'true' : undefined,
      onMouseEnter: () => setActive(ordinal),
      onFocus: () => setActive(ordinal),
    };

    let control: ReactNode;
    if (item.href && isInternal(item.href)) {
      control = (
        <Link to={item.href} {...shared}>
          {rowContent(item, ordinal)}
        </Link>
      );
    } else if (item.href) {
      control = (
        <a
          href={item.href}
          {...(isExternal(item.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...shared}
        >
          {rowContent(item, ordinal)}
        </a>
      );
    } else {
      control = (
        <button
          type="button"
          onClick={() => {
            setActive(ordinal);
            scrollToStage(ordinal);
          }}
          {...shared}
        >
          {rowContent(item, ordinal)}
        </button>
      );
    }

    return (
      <li key={item.id} className="border-b hairline">
        {control}
      </li>
    );
  };

  if (!interactive) {
    // Mobile / reduced motion: a normal stacked list, index head then stage.
    return (
      <ol aria-label={label ?? 'Index'} className="border-t hairline">
        {items.map((item, ordinal) => (
          <li key={item.id} className="border-b hairline py-8">
            <div className="flex items-start gap-3">
              <span
                aria-hidden={indexIsDecorative(item) ? 'true' : undefined}
                className="mono mt-1 shrink-0 text-faint"
              >
                {item.index}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xl leading-tight tracking-tight text-ink">
                  {item.href && isInternal(item.href) ? (
                    <Link
                      to={item.href}
                      className="transition-colors duration-200 hover:text-seal"
                    >
                      {item.title}
                    </Link>
                  ) : item.href ? (
                    <a
                      href={item.href}
                      {...(isExternal(item.href)
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      className="transition-colors duration-200 hover:text-seal"
                    >
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                </h3>
                {item.meta ? <div className="mono mt-1 text-quiet">{item.meta}</div> : null}
              </div>
            </div>
            <div className="mt-5">{renderStage(item, ordinal)}</div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-x-10">
      <div className="col-span-4">
        <nav aria-label={label ? `${label} index` : 'Index'} className="sticky top-[7rem]">
          {label ? <p className="mono mb-3 text-quiet">{label}</p> : null}
          <ol>{items.map(indexRow)}</ol>
          <p aria-hidden="true" className="mono mt-3 text-faint">
            {pad(activeIndex + 1)} / {pad(items.length)}
          </p>
        </nav>
      </div>
      <div ref={stackRef} className="col-span-8 col-start-5">
        {items.map((item, ordinal) => (
          <div
            key={item.id}
            data-stage-index={ordinal}
            role="group"
            className="scroll-mt-28 border-t hairline py-10 first:border-t-0 first:pt-0"
          >
            {/* Same outline as the stacked branch: every stage names its item. */}
            <h3 className="sr-only">{item.title}</h3>
            {renderStage(item, ordinal)}
          </div>
        ))}
      </div>
    </div>
  );
}
