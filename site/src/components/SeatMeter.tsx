import { useEffect, useState } from 'react';

/**
 * Thin seat-availability meter. Rendered only when the event sets a capacity —
 * callers must not render this for open-capacity events.
 */
export default function SeatMeter({ spotsLeft, capacity }: { spotsLeft: number; capacity: number }) {
  const taken = Math.min(capacity, Math.max(0, capacity - spotsLeft));
  const pct = capacity > 0 ? Math.round((taken / capacity) * 100) : 0;
  const [width, setWidth] = useState(0);

  // Animate 0 → value once on mount. The global reduced-motion rule collapses
  // the transition to instant, so no JS media check is needed.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(frame);
  }, [pct]);

  return (
    <div aria-label={`${taken} of ${capacity} seats taken`}>
      <div className="h-px w-full bg-line" role="presentation">
        <div
          className="h-px bg-signal transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-3 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-wide">
        <span className="text-muted">{taken} / {capacity} SEATS</span>
        <span className="text-paper/80">{pct}%</span>
      </div>
    </div>
  );
}
