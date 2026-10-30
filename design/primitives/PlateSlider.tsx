import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { DrawnPlaceholder } from "./DrawnPlaceholder";
import { cn } from "../lib/cn";
import { prefersReducedMotion } from "../lib/motion";

export interface PlateItem {
  id: string;
  label: string;
  note: string;
}

export interface PlateSliderProps {
  items: readonly PlateItem[];
  /** Section eyebrow, and the accessible name of the carousel region. */
  label: string;
  className?: string;
}

/** Travel below this is still a click, so tapping a plate never starts a drag. */
const DRAG_THRESHOLD = 6;
/** Trackpads keep sending deltas after the fingers lift; snap once they stop. */
const WHEEL_SETTLE_MS = 140;
/** Line-based wheels (deltaMode 1) report lines rather than pixels. */
const LINE_PX = 16;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const pad = (value: number) => String(value).padStart(2, "0");
const clampOffset = (px: number, max: number) => Math.min(Math.max(px, 0), max);

/**
 * Movement is a transform only, so the browser composites it without touching
 * layout. Reduced motion gets no transition at all: drag and buttons still work,
 * they just jump instead of gliding.
 */
function applyOffset(track: HTMLElement | null, px: number, animate: boolean) {
  if (!track) return;
  track.style.transition = animate && !prefersReducedMotion() ? `transform 520ms ${EASE}` : "none";
  track.style.transform = `translate3d(${-px}px, 0, 0)`;
}

export function PlateSlider({ items, label, className }: PlateSliderProps) {
  const count = items.length;
  const last = Math.max(0, count - 1);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  // The live position stays out of React state: a drag fires dozens of moves
  // a second, and re-rendering for each one would be the layout churn we avoid.
  const offset = useRef(0);
  const indexRef = useRef(0);
  const metrics = useRef({ step: 0, max: 0 });
  const press = useRef<{ id: number; startX: number; startOffset: number; dragging: boolean } | null>(
    null,
  );
  const settleTimer = useRef<number | undefined>(undefined);

  const goTo = useCallback(
    (target: number, animate = true) => {
      const next = Math.min(Math.max(target, 0), last);
      const { step, max } = metrics.current;
      indexRef.current = next;
      offset.current = clampOffset(next * step, max);
      applyOffset(trackRef.current, offset.current, animate);
      setIndex(next);
    },
    [last],
  );

  const settle = useCallback(() => {
    const { step } = metrics.current;
    goTo(step > 0 ? Math.round(offset.current / step) : 0);
  }, [goTo]);

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      const first = track?.firstElementChild;
      if (!track || !viewport || !(first instanceof HTMLElement)) return;
      // Plates carry their own right padding, so offsetWidth is the true stride.
      metrics.current = {
        step: first.offsetWidth,
        max: Math.max(0, track.scrollWidth - viewport.clientWidth),
      };
      offset.current = clampOffset(indexRef.current * metrics.current.step, metrics.current.max);
      applyOffset(track, offset.current, false);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [count]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      // Only a predominantly horizontal gesture is ours; vertical wheel scrolls the page.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const delta = event.deltaMode === 1 ? event.deltaX * LINE_PX : event.deltaX;
      const next = clampOffset(offset.current + delta, metrics.current.max);
      // At either end we let the event through, so the page can still scroll sideways.
      if (next === offset.current) return;
      event.preventDefault();
      offset.current = next;
      applyOffset(trackRef.current, next, false);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, WHEEL_SETTLE_MS);
    };
    // passive: false is required for preventDefault; React's wheel listeners are passive.
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      window.clearTimeout(settleTimer.current);
    };
  }, [settle]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    window.clearTimeout(settleTimer.current);
    press.current = {
      id: event.pointerId,
      startX: event.clientX,
      startOffset: offset.current,
      dragging: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = press.current;
    if (!active || active.id !== event.pointerId) return;
    const travel = event.clientX - active.startX;
    if (!active.dragging) {
      if (Math.abs(travel) < DRAG_THRESHOLD) return;
      active.dragging = true;
      // Capture only once the gesture is a drag, so a plain click keeps its target.
      event.currentTarget.setPointerCapture(active.id);
      setDragging(true);
    }
    offset.current = clampOffset(active.startOffset - travel, metrics.current.max);
    applyOffset(trackRef.current, offset.current, false);
  };

  const endPress = (event: PointerEvent<HTMLDivElement>) => {
    const active = press.current;
    if (!active || active.id !== event.pointerId) return;
    press.current = null;
    if (!active.dragging) return;
    setDragging(false);
    settle();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
        goTo(index + 1);
        break;
      case "ArrowLeft":
        goTo(index - 1);
        break;
      case "Home":
        goTo(0);
        break;
      case "End":
        goTo(last);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const progress = count > 0 ? (index + 1) / count : 0;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn("relative", className)}
    >
      <div className="mono flex items-baseline justify-between gap-6 text-faint">
        <span>{label}</span>
        <span aria-live="polite" className="text-ink">
          {`${pad(count === 0 ? 0 : index + 1)} / ${pad(count)}`}
        </span>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        className={cn(
          "mt-6 touch-pan-y overflow-hidden",
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
      >
        <ul ref={trackRef} role="list" className="flex will-change-transform">
          {items.map((item, i) => (
            <li
              key={item.id}
              // Only the active plate stays in the tab order / accessibility tree;
              // off-screen plates are inert so keyboard and screen-reader users
              // never land on content that is not currently visible.
              aria-hidden={i !== index ? true : undefined}
              // Spread rather than a bare attribute: `inert` is typed in React 19
              // but not in React 18, and the package supports both.
              {...(i !== index ? ({ inert: true } as Record<string, unknown>) : {})}
              className="group shrink-0 basis-full pr-4 md:basis-[62.5%] md:pr-6"
            >
              <DrawnPlaceholder caption={item.label} alt={item.label} anchor={pad(i + 1)} />
              <p className="mt-3 max-w-[40ch] text-[15px] leading-[1.7] text-pretty text-ink/75">
                {item.note}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <div aria-hidden="true" className="relative h-px flex-1 overflow-hidden bg-ink/15">
          <span
            className="absolute inset-0 origin-left bg-ink transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label="Previous plate"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            className="flex h-10 w-10 items-center justify-center border hairline font-mono text-[14px] transition-colors duration-200 hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-35"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            aria-label="Next plate"
            disabled={index >= last}
            onClick={() => goTo(index + 1)}
            className="flex h-10 w-10 items-center justify-center border hairline font-mono text-[14px] transition-colors duration-200 hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-35"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
