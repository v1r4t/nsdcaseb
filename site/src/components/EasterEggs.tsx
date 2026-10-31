/**
 * Signal Trail headless controller (plan_v2) — mounted once inside
 * `BrowserRouter` by App. Owns every egg that is not tied to a specific
 * component's render output:
 *
 * - Egg 3 keyboard detector (`build` → `learn` → `ship`) + `nsdc:ship`
 *   payoff listener (toast + sweep).
 * - Egg 4 Konami detector (↑↑↓↓←→←→ B A) + `nsdc:konami` payoff listener
 *   (glyph-rain overlay + toast; toast only under reduced motion).
 * - Egg 5 tab-away title (`Still building — NSDC`, restores on return).
 *
 * Renders only `<SignalToast />`, `<SignalSweep />`, the Konami overlay and
 * the Konami toast. Removes all listeners on unmount. Never steals focus,
 * never blocks navigation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import SignalSweep from './SignalSweep';
import SignalToast from './SignalToast';
import {
  KONAMI_EVENT,
  SHIP_EVENT,
  dispatchKonami,
  dispatchShip,
  hasKonami,
  hasShipped,
  installKonamiDetector,
  installShipDetector,
  markKonami,
  markShipped,
} from '../lib/easter-eggs';

const AWAY_TITLE = 'Still building — NSDC';
const KONAMI_DISMISS_MS = 4000;
/** Overlay holds ~5.5s, then unmounts and releases every timer. */
const KONAMI_OVERLAY_MS = 5500;
/** ~30fps cap: one paint per interval, no per-frame layout reads. */
const KONAMI_FRAME_MS = 33;
const KONAMI_TOAST_TEXT = 'SIGNAL FOUND.';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/**
 * Egg 4 payoff overlay — drifting mono glyph columns in seal over an ink
 * veil. Canvas 2D only (no three.js), half-resolution backing store scaled
 * up by CSS, one paint per ~33ms tick (~30fps cap).
 * `aria-hidden` + `pointer-events: none`: never intercepts input, never
 * blocks navigation. Unmounts after KONAMI_OVERLAY_MS with every timer
 * cleared. Kept in this file so the whole trail stays centrally owned.
 *
 * Colours are the ink-on-paper tokens (ink #111110, seal #b33c1b, the seal
 * tint used on ink #dd7048) because the canvas cannot read CSS variables.
 */
const KONAMI_GLYPHS = '01NSDC<>+*#$%&'.split('');
const KONAMI_TRAIL = 'rgba(17, 17, 16, 0.22)';
const KONAMI_GLYPH = '#b33c1b';
const KONAMI_GLYPH_HEAD = '#dd7048';

function KonamiOverlay({ overlayKey, onDone }: { overlayKey: number; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onDone();
      return;
    }
    const scale = 2;
    const width = Math.max(1, Math.floor(window.innerWidth / scale));
    const height = Math.max(1, Math.floor(window.innerHeight / scale));
    canvas.width = width;
    canvas.height = height;

    const fontPx = 14;
    const columns = Math.max(1, Math.ceil(width / fontPx));
    const drops: number[] = Array.from({ length: columns }, () =>
      Math.floor(Math.random() * Math.ceil(height / fontPx)),
    );
    const startedAt = performance.now();
    let alive = true;

    const paint = () => {
      if (!alive) return;
      if (performance.now() - startedAt >= KONAMI_OVERLAY_MS) {
        alive = false;
        window.clearInterval(timer);
        onDone();
        return;
      }
      ctx.fillStyle = KONAMI_TRAIL;
      ctx.fillRect(0, 0, width, height);
      ctx.font = `${fontPx}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
      for (let i = 0; i < columns; i += 1) {
        const glyph = KONAMI_GLYPHS[Math.floor(Math.random() * KONAMI_GLYPHS.length)];
        const head = Math.random() < 0.12;
        ctx.fillStyle = head ? KONAMI_GLYPH_HEAD : KONAMI_GLYPH;
        ctx.fillText(glyph, i * fontPx, drops[i] * fontPx);
        drops[i] += 1;
        if (drops[i] * fontPx > height && Math.random() < 0.06) drops[i] = 0;
      }
    };

    const timer = window.setInterval(paint, KONAMI_FRAME_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [overlayKey, onDone]);

  return (
    <div key={overlayKey} aria-hidden="true" className="nsdc-konami">
      <canvas ref={canvasRef} className="nsdc-konami-canvas" />
    </div>
  );
}

export default function EasterEggs() {
  const [toastKey, setToastKey] = useState(0);
  const [sweepKey, setSweepKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [sweepVisible, setSweepVisible] = useState(false);
  const [konamiKey, setKonamiKey] = useState(0);
  const [konamiVisible, setKonamiVisible] = useState(false);
  const [konamiToastKey, setKonamiToastKey] = useState(0);
  const [konamiToastVisible, setKonamiToastVisible] = useState(false);

  // The single ship payoff: once per session, toast always, sweep only with
  // full motion.
  const fireShip = useCallback(() => {
    if (hasShipped()) return;
    markShipped();
    setToastKey((key) => key + 1);
    setToastVisible(true);
    if (prefersReducedMotion()) return;
    setSweepKey((key) => key + 1);
    setSweepVisible(true);
  }, []);

  // The single Konami payoff: once per session, toast always, glyph-rain
  // overlay only with full motion. Nothing here steals focus or blocks nav.
  const fireKonami = useCallback(() => {
    if (hasKonami()) return;
    markKonami();
    setKonamiToastKey((key) => key + 1);
    setKonamiToastVisible(true);
    if (prefersReducedMotion()) return;
    setKonamiKey((key) => key + 1);
    setKonamiVisible(true);
  }, []);

  // Keyboard detector dispatches the event; the palette line dispatches the
  // same event — one listener performs the payoff for both paths.
  useEffect(() => {
    const uninstall = installShipDetector(dispatchShip);
    const onShip = () => fireShip();
    window.addEventListener(SHIP_EVENT, onShip);
    return () => {
      uninstall();
      window.removeEventListener(SHIP_EVENT, onShip);
    };
  }, [fireShip]);

  // Konami detector dispatches KONAMI_EVENT; one listener performs the payoff.
  useEffect(() => {
    const uninstall = installKonamiDetector(dispatchKonami);
    const onKonami = () => fireKonami();
    window.addEventListener(KONAMI_EVENT, onKonami);
    return () => {
      uninstall();
      window.removeEventListener(KONAMI_EVENT, onKonami);
    };
  }, [fireKonami]);

  // Egg 5 — tab-away title; restores whatever title was showing, so
  // route-specific titles (present or future) survive the round trip.
  useEffect(() => {
    let previous = document.title;
    const onVisibility = () => {
      if (document.hidden) {
        previous = document.title;
        document.title = AWAY_TITLE;
      } else {
        document.title = previous;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Konami toast auto-dismiss mirrors SignalToast's ~4s lifetime.
  useEffect(() => {
    if (!konamiToastVisible) return;
    const timer = window.setTimeout(() => setKonamiToastVisible(false), KONAMI_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [konamiToastVisible, konamiToastKey]);

  const hideToast = useCallback(() => setToastVisible(false), []);
  const hideSweep = useCallback(() => setSweepVisible(false), []);
  const hideKonami = useCallback(() => setKonamiVisible(false), []);

  return (
    <>
      <SignalToast toastKey={toastVisible ? toastKey : 0} onDone={hideToast} />
      <SignalSweep sweepKey={sweepVisible ? sweepKey : 0} onDone={hideSweep} />
      {konamiVisible ? <KonamiOverlay overlayKey={konamiKey} onDone={hideKonami} /> : null}
      {konamiToastVisible ? (
        <div key={konamiToastKey} role="status" aria-live="polite" className="nsdc-toast">
          <span className="nsdc-toast-accent">KONAMI.</span> {KONAMI_TOAST_TEXT}
        </div>
      ) : null}
    </>
  );
}
