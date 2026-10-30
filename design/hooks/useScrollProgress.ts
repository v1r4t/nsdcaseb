import { useEffect, useState, type RefObject } from "react";
import { useReducedMotion } from "./useReducedMotion";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * 0..1 for how far a tall element has travelled through the viewport.
 * One rAF-throttled passive listener; no layout reads outside the frame.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const span = rect.height + viewport;
      setProgress(clamp01((viewport - rect.top) / span));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, reduced]);

  return progress;
}
