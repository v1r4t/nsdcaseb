import { useEffect, useRef, useState } from 'react';
import type { ComponentType, CSSProperties, ElementType, ReactNode, Ref } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Extra class on the wrapper element (spacing, max-width, grid, ...). */
  className?: string;
  /** Stagger in milliseconds, applied to the transition delay. */
  delay?: number;
  /** Element to render. Defaults to a `div`; pages may pass `li`, `p`, etc. */
  as?: ElementType;
}

const START: CSSProperties = { opacity: 0, transform: 'translateY(18px)' };
const END: CSSProperties = { opacity: 1, transform: 'translateY(0)' };
/** The kit's single easing curve (`--ease-ink` in design/tokens.css). */
const EASE_INK = 'cubic-bezier(0.16, 1, 0.3, 1)';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fades + lifts its children into view once, the first time they intersect the
 * viewport. Renders statically (no transform, no transition) when the visitor
 * prefers reduced motion, and stops observing after the reveal so scrolling
 * back up never re-hides content. Without IntersectionObserver support the
 * content is shown immediately rather than hidden forever.
 *
 * The element itself is authored by the host: `as` keeps list rows as `li`,
 * copy as `p`, and so on, so the reveal never inserts a layout wrapper.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver !== 'function',
  );

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

  // If the preference flips to reduce after mount, reveal the copy at once.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      if (query.matches) setShown(true);
    };
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const Component = Tag as unknown as ComponentType<{
    className?: string;
    children?: ReactNode;
    style?: CSSProperties;
    ref?: Ref<HTMLElement>;
  }>;

  return (
    <Component
      ref={ref}
      className={className}
      style={{
        ...(shown ? END : START),
        transition: `opacity 700ms ${EASE_INK} ${delay}ms, transform 700ms ${EASE_INK} ${delay}ms`,
      }}
    >
      {children}
    </Component>
  );
}
