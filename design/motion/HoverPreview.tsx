import { useEffect, useId, useRef } from "react";
import { gsap, registerGsap } from "../lib/gsap";
import { isCoarsePointer, prefersReducedMotion } from "../lib/motion";

export interface PreviewItem {
  id: string;
  caption: string;
  detail?: string;
}

const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 380;
const EDGE = 8;
const GAP_X = 24;
const GAP_Y = 40;

type QuickTo = (value: number) => void;

/** Never let the panel sit under the cursor, and never let it leave the viewport. */
function place(pointerX: number, pointerY: number): { x: number; y: number } {
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;

  let x = pointerX + GAP_X;
  if (x + PANEL_WIDTH + EDGE > viewportWidth) x = pointerX - GAP_X - PANEL_WIDTH;
  x = Math.max(EDGE, Math.min(x, viewportWidth - PANEL_WIDTH - EDGE));

  let y = pointerY - GAP_Y;
  y = Math.max(EDGE, Math.min(y, viewportHeight - PANEL_HEIGHT - EDGE));

  return { x, y };
}

/**
 * A cursor-following preview for list rows. It is a drawing on paper, not a
 * card: a hatched plate above an ink block carrying the caption and detail.
 * Purely decorative — aria-hidden, pointer-events-none, and absent entirely on
 * touch devices or when the reader asked for reduced motion.
 */
export function HoverPreview({
  items,
  activeId,
}: {
  items: PreviewItem[];
  activeId: string | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const quick = useRef<{ x: QuickTo; y: QuickTo } | null>(null);
  const hatchId = `preview-hatch-${useId().replace(/:/g, "")}`;

  const reduced = prefersReducedMotion();
  const coarse = isCoarsePointer();
  const active = activeId ? (items.find((item) => item.id === activeId) ?? null) : null;
  const activeKey = active?.id ?? null;

  // Track the pointer even while hidden so the panel can appear under the right
  // row immediately; the listener is passive and removed on unmount.
  useEffect(() => {
    if (reduced || coarse) return;

    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      const panel = panelRef.current;
      if (!panel || !quick.current) return;
      const { x, y } = place(event.clientX, event.clientY);
      quick.current.x(x);
      quick.current.y(y);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, coarse]);

  // Entering a row fades and scales the plate in, then hands movement to quickTo
  // so it trails the cursor instead of snapping to it.
  useEffect(() => {
    if (reduced || coarse || !activeKey) return;

    const panel = panelRef.current;
    if (!panel) return;

    registerGsap();

    const { x, y } = place(pointer.current.x, pointer.current.y);
    gsap.set(panel, { x, y, opacity: 0, scale: 0.92 });

    quick.current = {
      x: gsap.quickTo(panel, "x", { duration: 0.45, ease: "power3" }),
      y: gsap.quickTo(panel, "y", { duration: 0.45, ease: "power3" }),
    };

    gsap.to(panel, {
      opacity: 1,
      scale: 1,
      duration: 0.22,
      ease: "ink",
      overwrite: "auto",
    });

    return () => {
      gsap.killTweensOf(panel);
      quick.current = null;
    };
  }, [activeKey, reduced, coarse]);

  if (reduced || coarse || !active) return null;

  return (
    <div
      ref={panelRef}
      data-hover-preview
      data-testid="hover-preview"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-30 flex flex-col overflow-hidden border border-ink bg-paper"
      style={{
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        opacity: 0,
        willChange: "transform, opacity",
      }}
    >
      <div
        className="relative h-[210px] shrink-0 overflow-hidden border-b hairline"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, var(--color-ink))" }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full text-ink"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern
              id={hatchId}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(38)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="0.7" opacity="0.16" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${hatchId})`} />
        </svg>
        <span className="mono absolute left-3 top-3 text-faint">Preview</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="absolute bottom-3 right-3 h-5 w-5 text-seal"
        >
          <path d="M0 24 L24 24 L24 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 bg-ink px-4 py-4 text-paper">
        <p className="line-clamp-3 font-serif text-[1.6rem] leading-[1.02] tracking-[-0.01em]">
          {active.caption}
        </p>
        {active.detail ? (
          <p className="mono line-clamp-3 text-paper/60">{active.detail}</p>
        ) : null}
      </div>
    </div>
  );
}
