import { useEffect, useRef } from "react";
import { gsap } from "../lib/gsap";
import { useDeviceTier } from "../lib/motion";
import { subscribePointer, setPointerLabel } from "../lib/pointer";

const RING_REST = 34;
const RING_HOVER = 64;
const TAIL_POINTS = 14;
const TAIL_IDLE_MS = 400;
const REVEAL_MS = 160;
const HIDE_MS = 220;
const IDLE_MS = 5000;
// Canvas 2D cannot resolve CSS custom properties, so the palette lives here too.
const SEAL = "#b33c1b";
const INK = "#111110";
const PAPER = "#f2eee3";
// How often the ground under the pointer is sampled. Cheap enough to keep the
// cursor correct through a fast scroll, rare enough to stay off the hot path.
const TONE_INTERVAL_MS = 90;
const TONE_DISTANCE_PX = 12;

const CURSOR_CSS = `
html.cursor-active,
html.cursor-active * {
  cursor: none !important;
}

/* Fields keep their native text cursor. */
html.cursor-active input,
html.cursor-active textarea {
  cursor: text !important;
}

html.cursor-active select {
  cursor: auto !important;
}

/* --cursor-* is rewritten whenever the ground under the pointer changes, so the
   cursor inverts over the ink and seal slabs instead of disappearing into them. */
.cursor-ring {
  border: 1px solid var(--cursor-line, var(--color-ink));
  background-color: transparent;
  transition:
    border-color 300ms var(--ease-ink),
    background-color 300ms var(--ease-ink);
}

.cursor-ring[data-hover="true"] {
  border-color: var(--cursor-accent, var(--color-seal));
  background-color: color-mix(in srgb, var(--cursor-accent, var(--color-seal)) 10%, transparent);
}

.cursor-label {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cursor-accent, var(--color-seal));
  white-space: nowrap;
  opacity: 0;
  transition: opacity 180ms var(--ease-ink);
}

.cursor-ring[data-hover="true"] .cursor-label {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  html.cursor-active,
  html.cursor-active * {
    cursor: auto !important;
  }
}
`;

function clock(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function channels(color: string): [number, number, number, number] | null {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match?.[1]) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part));
  const [r, g, b] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  return [r, g, b, parts[3] ?? 1];
}

/** WCAG relative luminance, so the switch happens where the eye expects it. */
export function luminance(color: string): number {
  const parsed = channels(color);
  if (!parsed) return 1;
  const [r, g, b] = parsed;
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function alpha(color: string): number {
  const parsed = channels(color);
  return parsed ? parsed[3] : 0;
}

/** jsdom does not implement hit testing; a missing ground must never throw. */
function elementAt(x: number, y: number): Element | null {
  try {
    if (typeof document.elementFromPoint !== "function") return null;
    return document.elementFromPoint(x, y);
  } catch {
    return null;
  }
}

interface TailPoint {
  x: number;
  y: number;
}

/**
 * Award-site cursor: a hard ink dot, a ring that lags behind on quickTo, and a
 * fading seal-coloured polyline tail on a 2D canvas.
 *
 * Mounted only for fine pointers with motion allowed. On a phone this component
 * returns null and never binds a single listener.
 */
export function Cursor() {
  const { reduced, touch } = useDeviceTier();
  const active = !reduced && !touch;

  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Nothing is painted until the pointer has genuinely moved once. Before that
  // the component sits at (0,0) and would otherwise look like a stray ink box.
  const seen = useRef(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;
    const canvas = canvasRef.current;
    if (!dot || !ring || !label || !canvas) return;

    const html = document.documentElement;
    let visible = false;

    /* ---------------------------------------------------------------- tone */
    // The dot, ring, label and tail are one colour set, chosen by the ground
    // under the pointer. Seal is the accent on paper; on an ink or seal slab the
    // whole cursor steps up to paper so it never sinks into the background.
    let tailColor = SEAL;
    let tone: "light" | "dark" = "light";

    const applyTone = (next: "light" | "dark") => {
      if (next === tone) return;
      tone = next;
      const dark = next === "dark";
      html.style.setProperty("--cursor-line", dark ? PAPER : INK);
      html.style.setProperty("--cursor-accent", dark ? PAPER : SEAL);
      tailColor = dark ? PAPER : SEAL;
      ring.dataset.tone = next;
    };

    let lastX = 0;
    let lastY = 0;
    let lastToneAt = 0;
    let lastToneX = -999;
    let lastToneY = -999;

    const resolveTone = (force = false) => {
      const now = clock();
      if (!force) {
        if (now - lastToneAt < TONE_INTERVAL_MS) return;
        if (Math.hypot(lastX - lastToneX, lastY - lastToneY) < TONE_DISTANCE_PX) return;
      }
      lastToneAt = now;
      lastToneX = lastX;
      lastToneY = lastY;

      let node = elementAt(lastX, lastY);
      while (node) {
        const background = getComputedStyle(node).backgroundColor;
        // Skip transparent wrappers: only an actually painted ground decides.
        if (alpha(background) > 0.1) {
          applyTone(luminance(background) < 0.35 ? "dark" : "light");
          return;
        }
        node = node.parentElement;
      }
      applyTone("light");
    };

    ring.dataset.tone = "light";
    html.style.setProperty("--cursor-line", INK);
    html.style.setProperty("--cursor-accent", SEAL);

    /* --------------------------------------------------------------- paint */
    // Inline transitions so the dot, ring and canvas share the same 160ms
    // reveal / 220ms hide without losing the ring's border-colour transition.
    const fade = (value: string, duration: number) => {
      dot.style.transition = `opacity ${duration}ms var(--ease-ink)`;
      canvas.style.transition = `opacity ${duration}ms var(--ease-ink)`;
      ring.style.transition = `border-color 300ms var(--ease-ink), background-color 300ms var(--ease-ink), opacity ${duration}ms var(--ease-ink)`;
      dot.style.opacity = value;
      ring.style.opacity = value;
      canvas.style.opacity = value;
    };

    const show = () => {
      if (visible) return;
      visible = true;
      html.style.cursor = "";
      html.classList.add("cursor-active");
      fade("1", REVEAL_MS);
    };

    /* ---------------------------------------------------------------- ring */
    gsap.set(ring, { xPercent: -50, yPercent: -50 });
    const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });

    /* -------------------------------------------------------------- canvas */
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }

    const sizeCanvas = () => {
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    sizeCanvas();

    const points: TailPoint[] = [];
    let raf = 0;
    let running = false;
    let lastMove = 0;

    const clearTail = () => {
      ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const drawTail = () => {
      if (!ctx) return;
      clearTail();
      if (points.length < 2) return;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < points.length; i += 1) {
        const from = points[i - 1];
        const to = points[i];
        if (!from || !to) continue;
        const t = i / (points.length - 1);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = tailColor;
        // Taper: thin and faint at the tail, heavier and darker at the head.
        ctx.globalAlpha = 0.04 + t * 0.16;
        ctx.lineWidth = 0.5 + t * 2.6;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    };

    const frame = () => {
      raf = 0;
      if (clock() - lastMove > TAIL_IDLE_MS) {
        clearTail();
        running = false;
        return;
      }
      drawTail();
      raf = window.requestAnimationFrame(frame);
    };

    const wake = () => {
      if (running) return;
      running = true;
      raf = window.requestAnimationFrame(frame);
    };

    /* ---------------------------------------------------------------- idle */
    const hide = () => {
      if (!visible) return;
      visible = false;
      points.length = 0;
      clearTail();
      html.classList.remove("cursor-active");
      // The custom cursor is fading; give the native one back immediately so
      // the page is never left with no cursor at all.
      html.style.cursor = "auto";
      fade("0", HIDE_MS);
    };

    const scheduleIdle = () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        idleTimer.current = null;
        hide();
      }, IDLE_MS);
    };

    /* ------------------------------------------------------------ movement */
    // Only a real pointermove reveals the custom cursor; mounts, labels and
    // pointerdown all stay invisible until this listener has fired once.
    const onPointerMove = () => {
      if (!seen.current) seen.current = true;
      show();
      scheduleIdle();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // A scroll moves the page under a stationary pointer, so the ground can
    // change without a single pointermove event.
    let scrollToneAt = 0;
    const onScrollTone = () => {
      const now = clock();
      if (now - scrollToneAt < 120) return;
      scrollToneAt = now;
      resolveTone(true);
    };
    window.addEventListener("scroll", onScrollTone, { passive: true });

    const unsubscribe = subscribePointer((pointer) => {
      const { x, y } = pointer;
      lastX = x;
      lastY = y;

      dot.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${pointer.pressed ? 0.72 : 1})`;
      ringX(x);
      ringY(y);
      resolveTone();

      const previous = points[points.length - 1];
      if (!previous || Math.hypot(previous.x - x, previous.y - y) > 0.75) {
        points.push({ x, y });
        if (points.length > TAIL_POINTS) points.shift();
        lastMove = clock();
        wake();
      }
    });

    /* --------------------------------------------------------------- hover */
    let hovered: Element | null = null;

    const findTarget = (target: EventTarget | null): Element | null => {
      if (target instanceof Element) return target.closest("[data-cursor]");
      return null;
    };

    const showHover = (element: Element) => {
      if (element === hovered) return;
      hovered = element;

      const raw =
        element.getAttribute("data-cursor-label") ?? element.getAttribute("data-cursor") ?? "";
      const text = raw.trim();

      label.textContent = text.toUpperCase();
      ring.dataset.hover = "true";
      setPointerLabel(text || null);

      gsap.to(ring, {
        width: RING_HOVER,
        height: RING_HOVER,
        duration: 0.35,
        ease: "power3",
        overwrite: "auto",
      });
    };

    const hideHover = () => {
      if (!hovered) return;
      hovered = null;
      label.textContent = "";
      ring.dataset.hover = "false";
      setPointerLabel(null);

      gsap.to(ring, {
        width: RING_REST,
        height: RING_REST,
        duration: 0.35,
        ease: "power3",
        overwrite: "auto",
      });
    };

    const onOver = (event: Event) => {
      const target = findTarget(event.target);
      if (target) showHover(target);
      else hideHover();
    };

    const onOut = (event: Event) => {
      if (!hovered) return;
      const related = (event as PointerEvent).relatedTarget;
      if (related instanceof Node && hovered.contains(related)) return;
      hideHover();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    window.addEventListener("resize", sizeCanvas);

    return () => {
      unsubscribe();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScrollTone);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("resize", sizeCanvas);

      if (idleTimer.current !== null) {
        window.clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      seen.current = false;
      visible = false;

      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      running = false;

      gsap.killTweensOf(ring);
      gsap.killTweensOf(dot);
      setPointerLabel(null);
      clearTail();
      dot.style.opacity = "0";
      ring.style.opacity = "0";
      canvas.style.opacity = "0";
      html.classList.remove("cursor-active");
      html.style.cursor = "";
      html.style.removeProperty("--cursor-line");
      html.style.removeProperty("--cursor-accent");
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <style>{CURSOR_CSS}</style>

      <canvas
        ref={canvasRef}
        data-testid="cursor-tail"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 100,
          pointerEvents: "none",
          opacity: 0,
          willChange: "opacity",
        }}
      />

      <div
        ref={ringRef}
        data-testid="cursor-ring"
        data-hover="false"
        aria-hidden="true"
        className="cursor-ring pointer-events-none fixed left-0 top-0 flex items-center justify-center"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: RING_REST,
          height: RING_REST,
          zIndex: 101,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
          willChange: "transform, width, height, opacity",
        }}
      >
        <span ref={labelRef} data-testid="cursor-label" className="cursor-label" />
      </div>

      <div
        ref={dotRef}
        data-testid="cursor-dot"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 7,
          height: 7,
          marginLeft: -3.5,
          marginTop: -3.5,
          background: "var(--cursor-line, var(--color-ink))",
          zIndex: 102,
          pointerEvents: "none",
          opacity: 0,
          willChange: "transform, opacity",
        }}
      />
    </>
  );
}
