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
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={taken}
      aria-label={`${taken} of ${capacity} seats taken`}
    >
      {/* Drawn rule, not a progress bar with a fill colour per state. */}
      <div className="relative h-[7px] w-full overflow-hidden border hairline" role="presentation">
        <div
          className="absolute inset-y-0 left-0 bg-seal transition-[width] duration-700 ease-ink"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mono mt-2 flex items-baseline justify-between gap-4 text-faint">
        <span>{taken} / {capacity} seats</span>
        <span className="text-ink">{pct}%</span>
      </div>
    </div>
  );
}
