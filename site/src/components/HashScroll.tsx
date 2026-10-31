import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hash links on a client-rendered page do not scroll by themselves: React
 * Router updates `location.hash` without moving the viewport, and a hard load
 * jumps before content/fonts settle. This keeps the anchor contract working:
 * after any hash navigation, scroll the target into view — retrying briefly so
 * late layout (fonts, lazy globe, images) cannot leave the user at the top.
 *
 * `scroll-margin-top` on `[id]` (index.css) keeps the sticky header clear.
 */
export default function HashScroll() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;

    let cancelled = false;
    const scroll = () => {
      if (cancelled) return;
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      // Move keyboard/AT focus with the viewport so the next Tab starts from
      // the destination rather than the page header.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };

    // Immediate pass after the route paints, then a few short retries for
    // layout that settles after paint. Stops as soon as the component unmounts.
    const frame = requestAnimationFrame(scroll);
    const timers = [120, 400, 900].map((ms) => window.setTimeout(scroll, ms));
    document.fonts?.ready.then(scroll).catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [hash, pathname]);

  return null;
}
