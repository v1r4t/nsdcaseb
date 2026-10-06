import { useEffect, useRef, useState } from 'react';

interface StatProps {
  /** Uppercase mono caption rendered beneath the figure, e.g. "MEMBERS". */
  label: string;
  /** Numeric target. Rendered zero-padded to 3 digits (`084` style). */
  value?: number;
  /** Trailing mark appended after the figure, e.g. "+". */
  suffix?: string;
  /** Non-numeric figure (e.g. "∞"). Skips the count animation. */
  glyph?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pad(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(3, '0');
}

/**
 * One animated figure in the NUMBERS console. Counts 000 → value exactly once,
 * the first time it scrolls into view. Renders the final figure immediately
 * under prefers-reduced-motion or without IntersectionObserver support.
 */
export default function Stat({ label, value, suffix, glyph }: StatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const [frame, setFrame] = useState<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    if (prefersReducedMotion()) {
      setFrame(target);
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver !== 'function') {
      setFrame(target);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          const start = performance.now();
          const duration = 1000;
          const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            setFrame(target * eased);
            if (progress < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target]);

  const figure = glyph ?? pad(frame ?? 0);

  return (
    <div ref={ref}>
      <dd className="font-mono text-6xl tracking-tight text-paper sm:text-7xl" aria-label={`${figure}${suffix ?? ''} ${label.toLowerCase()}`}>
        <span aria-hidden="true">
          {figure}
          {suffix ? <span className="text-signal">{suffix}</span> : null}
        </span>
      </dd>
      <dt className="label mt-3">{label}</dt>
    </div>
  );
}
