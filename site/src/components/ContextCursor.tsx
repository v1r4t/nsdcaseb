import { useEffect, useRef, useState } from 'react';
import { resolveCursorLabel } from '../lib/cursor';

const LERP = 0.18;
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True while an overlay that owns the screen is up (palette, menu, lightbox). */
function overlayLockActive(): boolean {
  return document.body.style.overflow === 'hidden';
}

/**
 * CONTEXT CURSOR — a pointer-following label chip. Informational only:
 * `aria-hidden`, `pointer-events-none`, never intercepts clicks, and every
 * opt-in stays fully usable without it.
 */
export default function ContextCursor() {
  const [enabled] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(FINE_POINTER_QUERY).matches,
  );
  // Only the label text (and show/hide) lives in state — position stays in
  // refs and is written straight to the DOM, so no re-render per mousemove.
  const [label, setLabel] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const target = useRef({ x: -100, y: -100 });
  const current = useRef({ x: -100, y: -100 });
  const labelRef = useRef<string | null>(null);
  const visibleRef = useRef(false);
  const paletteOpen = useRef(false);

  useEffect(() => {
    if (!enabled || !frameRef.current) return;
    const reduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    let raf = 0;
    let alive = true;

    const setVisible = (next: boolean) => {
      if (visibleRef.current === next) return;
      visibleRef.current = next;
      setShown(next);
    };

    const hide = () => {
      labelRef.current = null;
      setLabel(null);
      setVisible(false);
    };

    const onMove = (e: PointerEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      // Snap the follower on first contact so it never flies in from (-100,-100).
      if (current.current.x < -50 && current.current.y < -50) {
        current.current.x = e.clientX;
        current.current.y = e.clientY;
      }
      if (paletteOpen.current || overlayLockActive()) {
        hide();
        return;
      }
      const next = resolveCursorLabel(e.target);
      if (next !== labelRef.current) {
        labelRef.current = next;
        setLabel(next);
      }
      setVisible(next !== null);
    };

    const onOpen = () => {
      paletteOpen.current = true;
      hide();
    };
    const onClose = () => {
      paletteOpen.current = false;
    };
    const onBlur = () => hide();
    const onLeaveDocument = () => hide();

    const tick = () => {
      if (!alive) return;
      const t = target.current;
      const c = current.current;
      if (reduced) {
        c.x = t.x;
        c.y = t.y;
      } else {
        c.x += (t.x - c.x) * LERP;
        c.y += (t.y - c.y) * LERP;
      }
      // One transform write per frame; hide entirely when there is no label
      // so the parked chip never flashes on load.
      const el = frameRef.current;
      if (el) {
        if (!visibleRef.current) {
          el.style.transform = 'translate3d(-200px, -200px, 0)';
        } else {
          el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0) translate(14px, 18px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    // A fullscreen menu/palette locks body scroll without moving the pointer;
    // observe the lock directly so the chip hides even with no pointermove.
    const observer = new MutationObserver(() => {
      if (paletteOpen.current || overlayLockActive()) hide();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('blur', onBlur);
    window.addEventListener('nsdc:open-palette', onOpen);
    window.addEventListener('nsdc:close-palette', onClose);
    document.documentElement.addEventListener('mouseleave', onLeaveDocument);
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('nsdc:open-palette', onOpen);
      window.removeEventListener('nsdc:close-palette', onClose);
      document.documentElement.removeEventListener('mouseleave', onLeaveDocument);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[70]"
      style={{ transform: 'translate3d(-200px, -200px, 0)' }}
    >
      <span
        className={
          'block whitespace-nowrap rounded-sm bg-signal px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-ink transition-opacity transition-transform duration-150 ease-out motion-reduce:transition-none motion-reduce:duration-0' +
          (shown && label ? ' opacity-100 scale-100' : ' opacity-0 scale-95')
        }
      >
        {label}
      </span>
    </div>
  );
}