import { useEffect, useRef, type ReactNode } from "react";
import { gsap, registerGsap } from "../lib/gsap";
import { isCoarsePointer, prefersReducedMotion } from "../lib/motion";
import { cn } from "../lib/cn";

/**
 * Pulls its children toward the pointer inside a small radius. Transform only,
 * so the surrounding layout never moves. Touch devices and reduced-motion
 * readers get the plain, unmoved element.
 */
export function Magnetic({
  children,
  className,
  strength = 8,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const childRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const child = childRef.current;
    if (!el || !child) return;
    if (strength <= 0) return;
    if (prefersReducedMotion() || isCoarsePointer()) return;

    let moveX: gsap.QuickToFunc | null = null;
    let moveY: gsap.QuickToFunc | null = null;

    try {
      registerGsap();
      moveX = gsap.quickTo(child, "x", { duration: 0.4, ease: "power3" });
      moveY = gsap.quickTo(child, "y", { duration: 0.4, ease: "power3" });
    } catch {
      return;
    }

    const radius = strength * 3;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;

      if (Math.hypot(dx, dy) > radius) return;

      moveX?.(gsap.utils.clamp(-strength, strength, (dx / radius) * strength));
      moveY?.(gsap.utils.clamp(-strength, strength, (dy / radius) * strength));
    };

    const onLeave = () => {
      moveX?.(0);
      moveY?.(0);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(child);
      gsap.set(child, { clearProps: "transform" });
    };
  }, [strength]);

  return (
    <span
      ref={ref}
      className={cn("inline-block", className)}
      data-magnetic
      data-strength={strength}
    >
      <span ref={childRef} className="inline-block" data-magnetic-child>
        {children}
      </span>
    </span>
  );
}
