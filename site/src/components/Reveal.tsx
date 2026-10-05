import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Extra class on the wrapper div (spacing, max-width, grid, ...). */
  className?: string;
  /** Stagger in milliseconds, applied to the transition delay. */
  delay?: number;
}

const START: CSSProperties = { opacity: 0, transform: 'translateY(18px)' };
const END: CSSProperties = { opacity: 1, transform: 'translateY(0)' };

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fades + lifts its children into view once, the first time they intersect the
 * viewport. Renders statically (no transform, no transition) when the visitor
 * prefers reduced motion, and stops observing after the reveal so scrolling
 * back up never re-hides content.
 */
export default function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion());

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    if (typeof IntersectionObserver !== 'function') {
      // No observer support: show the content rather than hide it forever.
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...(shown ? END : START),
        transition: `opacity 700ms ease ${delay}ms, transform 700ms ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}