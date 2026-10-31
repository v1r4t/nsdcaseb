import { useEffect, useRef, useState } from 'react';
import type { ComponentType, CSSProperties, ElementType, ReactNode, Ref } from 'react';

interface ZoomInProps {
  /** Element to render. Defaults to a `div`; pages may pass `section`, `p`, ... */
  as?: ElementType;
  /** Extra class on the element (spacing, max-width, grid, ...). */
  className?: string;
  /** Stagger in milliseconds, applied to the transition delay. */
  delay?: number;
  children: ReactNode;
}

/** Barely perceptible at first, then settling to true size. */
const START_SCALE = 0.94;
const DURATION = 780;
/** The kit's single curve (`--ease-ink`); the var keeps the token authoritative. */
const EASE_INK = 'var(--ease-ink)';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scale + fade entrance. The block grows from 0.94 to 1 and fades in once,
 * the first time it intersects the viewport. Only `opacity` and `transform`
 * are animated, so surrounding layout never moves.
 *
 * Under reduced motion — and without IntersectionObserver support — the
 * children render statically at rest from the first paint. A preference change
 * mid-session settles the block immediately.
 */
export default function ZoomIn({
  as: Tag = 'div',
  className,
  delay = 0,
  children,
}: ZoomInProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver !== 'function',
  );

  useEffect(() => {
    const node = ref.current;
    if (shown || !node) return;
    if (typeof IntersectionObserver !== 'function') {
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

  // If the preference flips to reduce after mount, settle at rest at once.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => {
      if (query.matches) {
        setReduced(true);
        setShown(true);
      }
    };
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const style: CSSProperties | undefined = reduced
    ? undefined
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `scale(${START_SCALE})`,
        transition: `opacity ${DURATION}ms ${EASE_INK} ${delay}ms, transform ${DURATION}ms ${EASE_INK} ${delay}ms`,
        willChange: shown ? undefined : 'transform, opacity',
      };

  const Component = Tag as unknown as ComponentType<{
    className?: string;
    children?: ReactNode;
    style?: CSSProperties;
    ref?: Ref<HTMLElement>;
  }>;

  return (
    <Component ref={ref} className={className} style={style}>
      {children}
    </Component>
  );
}

export { ZoomIn };
