import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { Flip } from "gsap/Flip";
import { Observer } from "gsap/Observer";
import { Draggable } from "gsap/Draggable";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { CustomEase } from "gsap/CustomEase";

let registered = false;

/** Register every plugin once. Safe to call from anywhere and during SSR. */
export function registerGsap(): void {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(
    ScrollTrigger,
    SplitText,
    Flip,
    Observer,
    Draggable,
    MotionPathPlugin,
    CustomEase,
  );
  // Matches --ease-ink in tokens.css: cubic-bezier(.16, 1, .3, 1)
  CustomEase.create("ink", "M0,0 C0.16,1 0.3,1 1,1");
  gsap.defaults({ ease: "ink" });
  registered = true;
}

export { gsap, ScrollTrigger, SplitText, Flip, Observer, Draggable, MotionPathPlugin, CustomEase };
