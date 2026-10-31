import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

let registered = false;

/**
 * Register the shared ease setup once. Safe to call from anywhere and during
 * SSR.
 *
 * ScrollTrigger and SplitText deliberately live with the components that need
 * them: `Reveal` loads SplitText on demand, and the four ScrollTrigger consumers
 * register it themselves. Importing/registering it here would pull the whole
 * plugin into the entry chunk via `RisingText`.
 */
export function registerGsap(): void {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(CustomEase);
  // Matches --ease-ink in tokens.css: cubic-bezier(.16, 1, .3, 1)
  CustomEase.create("ink", "M0,0 C0.16,1 0.3,1 1,1");
  gsap.defaults({ ease: "ink" });
  registered = true;
}

export { gsap };
export { ScrollTrigger } from "gsap/ScrollTrigger";
