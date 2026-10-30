import Lenis from "lenis";
import { ScrollTrigger, gsap, registerGsap } from "./gsap";
import { prefersReducedMotion } from "./motion";

let lenis: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Lenis drives native scroll, so ScrollTrigger needs only the ticker bridge —
 * no scrollerProxy. Both are torn down together.
 */
export function initSmoothScroll(): Lenis | null {
  if (typeof window === "undefined") return null;
  if (prefersReducedMotion()) return null;
  if (lenis) return lenis;

  registerGsap();
  lenis = new Lenis({ duration: 1.05, wheelMultiplier: 0.9, touchMultiplier: 1.6 });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

function tick(time: number) {
  lenis?.raf(time * 1000);
}

export function scrollToTop(immediate = true) {
  if (lenis) lenis.scrollTo(0, { immediate });
  else window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
}
