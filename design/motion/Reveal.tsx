import { useEffect, useRef, type ComponentType, type ElementType, type ReactNode, type Ref } from "react";
import { prefersReducedMotion } from "../lib/motion";

/**
 * Line-mask reveal.
 *
 * The readable copy never leaves the DOM: SplitText only wraps the existing
 * text nodes, and `aria: "auto"` hides those generated wrappers from assistive
 * tech while labelling the original element with the full text. (GSAP's
 * `aria: "hidden"` would set aria-hidden on the original element itself, which
 * would silence the copy for screen readers.)
 *
 * ScrollTrigger and SplitText are the only GSAP plugins this component needs,
 * so they load from `gsap-reveal` on demand rather than in the entry chunk.
 *
 * Under reduced motion, in a null-ref situation, or if SplitText ever throws,
 * the plain element renders exactly as authored.
 */
export function Reveal({
  as: Tag = "div",
  children,
  className,
  delay = 0,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void import("../lib/gsap-reveal")
      .then(({ gsap, ScrollTrigger, SplitText }) => {
        if (disposed) return;

        let split: ReturnType<typeof SplitText.create> | null = null;
        let tween: ReturnType<typeof gsap.to> | null = null;
        const triggers: ReturnType<typeof ScrollTrigger.create>[] = [];

        try {
          split = SplitText.create(el, {
            type: "lines",
            mask: "lines",
            linesClass: "split-line",
            aria: "auto",
          });

          const lines = split.lines;
          if (lines.length > 0) {
            gsap.set(lines, { yPercent: 110 });

            tween = gsap.to(lines, {
              yPercent: 0,
              duration: 0.9,
              stagger: 0.06,
              ease: "ink",
              delay,
              paused: true,
            });

            let played = false;
            const play = () => {
              if (played || !tween) return;
              played = true;
              tween.play(0);
            };

            triggers.push(
              ScrollTrigger.create({
                trigger: el,
                start: "top 85%",
                once: true,
                onEnter: play,
              }),
            );

            // Content that is already at or above the fold should never sit hidden
            // waiting for a scroll that may not happen.
            if (el.getBoundingClientRect().top < window.innerHeight * 0.85) play();
          }
        } catch {
          // Restore the authored markup if splitting failed halfway through.
          try {
            tween?.kill();
            split?.revert();
          } catch {
            // Nothing else to do; React still owns readable children.
          }
          split = null;
          tween = null;
          triggers.length = 0;
        }

        cleanup = () => {
          triggers.forEach((trigger) => trigger.kill());
          ScrollTrigger.getAll()
            .filter((trigger) => trigger.trigger === el)
            .forEach((trigger) => trigger.kill());
          try {
            tween?.kill();
            split?.revert();
          } catch {
            // Cleanup must never throw during unmount.
          }
        };
      })
      .catch(() => {
        // If the plugin chunk cannot load, the authored markup stays readable.
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [delay]);

  const Component = Tag as unknown as ComponentType<{
    className?: string;
    children?: ReactNode;
    ref?: Ref<HTMLElement>;
    "data-reveal"?: boolean;
    "data-reveal-delay"?: number;
  }>;

  return (
    <Component ref={ref} className={className} data-reveal data-reveal-delay={delay}>
      {children}
    </Component>
  );
}
