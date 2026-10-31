import { useEffect, useState, type RefObject } from "react";
import { gsap, registerGsap, ScrollTrigger } from "../lib/gsap";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Scroll progress for a drawn stroke: 0 as the element enters the lower
 * viewport, 1 once it has risen past the middle. Under reduced motion the
 * stroke is simply drawn in full.
 */
export function useScrollDraw(ref: RefObject<HTMLElement | null>): number {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    const node = ref.current;
    if (!node) return;

    registerGsap();
    gsap.registerPlugin(ScrollTrigger);
    const trigger = ScrollTrigger.create({
      trigger: node,
      start: "top 84%",
      end: "top 48%",
      scrub: 0.5,
      onUpdate: (self) => setProgress(self.progress),
    });

    return () => trigger.kill();
  }, [reduced, ref]);

  return progress;
}
