import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/**
 * LazyGlobe — defers the three.js globe bundle until it is needed.
 *
 * `GlobeNarrative` pulls in `three` (~871KB) via `lib/narrative-globe.ts`.
 * React.lazy only calls the dynamic `import()` when the component first
 * renders, so `three` is never fetched until the observer below fires — and
 * never at all for `prefers-reduced-motion` visitors, who get the static
 * fallback permanently.
 *
 * The fallback is a plain `<section>` with the exact same geometry as the
 * real globe section (`relative h-[170vh] bg-ink`), so swapping it for the
 * live globe causes no layout shift.
 */
const GlobeNarrative = lazy(() => import('./GlobeNarrative'));

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Same static gradient the globe renders when WebGL fails — no CLS. */
function GlobeFallback() {
  return (
    <section aria-label="Our story" className="relative h-[170vh] bg-ink">
      <div className="sticky top-0 h-screen overflow-hidden">
        <a
          href="#about"
          className="absolute left-6 top-14 z-10 font-mono text-[11px] uppercase tracking-wide text-muted underline underline-offset-4 transition-colors duration-200 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal md:left-12"
        >
          Skip the story ↓
        </a>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(245,245,242,0.08), transparent 70%), radial-gradient(ellipse 30% 25% at 62% 40%, rgba(255,90,54,0.10), transparent 70%), #080808',
          }}
        />
        <div className="pointer-events-none absolute inset-0">
          <p className="label absolute left-6 top-6 md:left-12">OUR STORY</p>
          <p className="absolute left-6 top-1/3 max-w-sm font-display text-2xl leading-tight tracking-tight text-paper md:left-12 md:text-4xl">
            Rooted at Amrita, Bengaluru.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function LazyGlobe() {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Static from the first render — a mid-session preference change must not
  // unload an already-running globe or suddenly fetch `three`.
  const [reduced] = useState(prefersReducedMotion);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const node = wrapRef.current;
    if (!node) return;
    if (typeof IntersectionObserver !== 'function') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNear(true);
            io.disconnect();
          }
        }
      },
      // Start fetching ~one viewport before the section scrolls into view.
      // The section is now ~170vh, so a tighter margin still preloads in time.
      { rootMargin: '200px 0px 200px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  const ready = near && !reduced;

  return (
    <div ref={wrapRef}>
      {ready ? (
        <Suspense fallback={<GlobeFallback />}>
          <GlobeNarrative />
        </Suspense>
      ) : (
        <GlobeFallback />
      )}
    </div>
  );
}
