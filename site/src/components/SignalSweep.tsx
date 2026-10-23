/**
 * Signal sweep (Egg 3 payoff) — a thin orange line crossing the viewport once.
 * `aria-hidden`, `pointer-events-none`. Never rendered under
 * `prefers-reduced-motion` (callers skip it; CSS hides it as a backstop).
 */

import { useEffect } from 'react';

interface SignalSweepProps {
  /** Increment to play; 0 means hidden. Keys the animation. */
  sweepKey: number;
  onDone: () => void;
}

/** Matches the 800ms `nsdc-sweep-y` animation in a11y-eggs.css. */
const SWEEP_MS = 850;

export default function SignalSweep({ sweepKey, onDone }: SignalSweepProps) {
  useEffect(() => {
    if (sweepKey === 0) return;
    const timer = window.setTimeout(onDone, SWEEP_MS);
    return () => window.clearTimeout(timer);
  }, [sweepKey, onDone]);

  if (sweepKey === 0) return null;

  return <div key={sweepKey} aria-hidden="true" className="nsdc-sweep" />;
}
