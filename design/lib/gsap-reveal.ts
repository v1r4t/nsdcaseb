import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { registerGsap } from "./gsap";

/**
 * Reveal-only GSAP surface.
 *
 * `Reveal` is the only consumer of ScrollTrigger and SplitText on the site, so
 * both live here and are loaded on demand instead of riding in the entry chunk.
 * Loading this module also completes the core registration (the `ink` ease).
 */
registerGsap();
gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };
