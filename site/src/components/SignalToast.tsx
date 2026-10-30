/**
 * Signal toast (Egg 3 payoff) — fixed bottom-right mono `SHIPPED.`.
 * `aria-live="polite"`, auto-dismisses after ~4s, `pointer-events-none`,
 * no layout impact, reduced-motion safe (plain fade, killed by the global
 * reduced-motion rule when requested). `.nsdc-toast` in a11y-eggs.css owns
 * the paper ground, seal border and ink type.
 */

import { useEffect } from 'react';

interface SignalToastProps {
  /** Increment to show; 0 means hidden. Keys the entrance animation. */
  toastKey: number;
  onDone: () => void;
}

const DISMISS_MS = 4000;

export default function SignalToast({ toastKey, onDone }: SignalToastProps) {
  useEffect(() => {
    if (toastKey === 0) return;
    const timer = window.setTimeout(onDone, DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toastKey, onDone]);

  if (toastKey === 0) return null;

  return (
    <div key={toastKey} role="status" aria-live="polite" className="nsdc-toast">
      <span className="nsdc-toast-accent">SHIPPED.</span>
    </div>
  );
}
