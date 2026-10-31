import { useEffect, useRef, useState } from "react";
import { gsap, registerGsap, ScrollTrigger } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import { cn } from "../lib/cn";

/**
 * A full-bleed ink band. Two identical rows sit side by side and the track
 * shifts by exactly one row, so the loop is seamless at any viewport width.
 * Scroll velocity briefly accelerates it; hover and a hidden tab pause it.
 *
 * Entirely decorative: the wrapper is aria-hidden and clips its own overflow so
 * the page can never gain a horizontal scrollbar from the moving track.
 */
export function Marquee({
  items,
  className,
  speed = 60,
}: {
  items: string[];
  className?: string;
  speed?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (reduced) return;

    const wrapper = wrapperRef.current;
    const track = trackRef.current;
    if (!wrapper || !track) return;

    let tween: gsap.core.Tween | null = null;
    let trigger: ScrollTrigger | null = null;
    let settle = 0;
    let hovered = false;
    let disposed = false;

    try {
      registerGsap();
      gsap.registerPlugin(ScrollTrigger);

      const firstRow = track.firstElementChild as HTMLElement | null;
      const distance = firstRow?.offsetWidth || track.scrollWidth / 2 || 600;
      const pxPerSecond = speed > 0 ? speed : 60;

      tween = gsap.to(track, {
        x: "-=50%",
        duration: Math.max(0.5, distance / pxPerSecond),
        ease: "none",
        repeat: -1,
      });

      if (document.hidden) tween.pause();

      const onEnter = () => {
        hovered = true;
        tween?.pause();
      };
      const onLeave = () => {
        hovered = false;
        if (!document.hidden) tween?.resume();
      };
      const onVisibility = () => {
        if (!tween) return;
        if (document.hidden) tween.pause();
        else if (!hovered) tween.resume();
      };

      wrapper.addEventListener("pointerenter", onEnter);
      wrapper.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);

      try {
        trigger = ScrollTrigger.create({
          onUpdate: (self) => {
            const active = tween;
            if (disposed || !active) return;

            const velocity = Math.abs(self.getVelocity());
            if (velocity < 60) return;

            active.timeScale(
              Math.max(active.timeScale(), gsap.utils.clamp(1, 2.2, 1 + velocity / 1200)),
            );

            window.clearTimeout(settle);
            settle = window.setTimeout(() => {
              if (disposed || !tween) return;
              gsap.to(tween, {
                timeScale: 1,
                duration: 0.6,
                ease: "power2.out",
                overwrite: true,
              });
            }, 140);
          },
        });
      } catch {
        trigger = null;
      }

      return () => {
        disposed = true;
        window.clearTimeout(settle);
        wrapper.removeEventListener("pointerenter", onEnter);
        wrapper.removeEventListener("pointerleave", onLeave);
        document.removeEventListener("visibilitychange", onVisibility);
        trigger?.kill();
        if (tween) {
          gsap.killTweensOf(tween);
          tween.kill();
        }
      };
    } catch {
      ScrollTrigger.getAll()
        .filter((instance) => instance.trigger === wrapper)
        .forEach((instance) => instance.kill());
      gsap.killTweensOf(track);
      return;
    }
  }, [items, speed, reduced]);

  const row = (prefix: string) => (
    <div
      className="flex shrink-0 items-center gap-8 whitespace-nowrap"
      style={{ minWidth: "100vw" }}
    >
      {items.map((item, index) => (
        <span key={`${prefix}-${item}-${index}`} className="statement-sm">
          {item}
          <span className="mx-6 text-seal">·</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full overflow-hidden", className)}
      data-marquee
      data-speed={speed}
      aria-hidden="true"
    >
      {reduced ? (
        <div className="flex w-max items-center">{row("static")}</div>
      ) : (
        <div ref={trackRef} className="flex w-max items-center will-change-transform">
          {row("a")}
          {row("b")}
        </div>
      )}
    </div>
  );
}
