import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { DataGlobe } from '../three/DataGlobe';
import Loader from './Loader';
import Socials from './Socials';

interface HeroProps {
  onDone?: () => void;
}

const MIN_DURATION_MS = 3000;

function isWebGLAvailable(canvas: HTMLCanvasElement): boolean {
  try {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

export default function Hero({ onDone }: HeroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<DataGlobe | null>(null);
  const gsapCtxRef = useRef<{ revert: () => void } | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [progress, setProgressState] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  // Own the DataGlobe lifecycle. Contract: constructor(canvas);
  // setProgress(0..1); setRevealed(bool); dispose().
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isWebGLAvailable(canvas)) {
      setWebglFailed(true);
      return;
    }
    let globe: DataGlobe | null = null;
    try {
      globe = new DataGlobe(canvas);
      globeRef.current = globe;
      globe.setProgress(0);
      globe.setRevealed(false);
    } catch {
      globeRef.current = null;
      setWebglFailed(true);
      return;
    }
    return () => {
      globe?.dispose();
      if (globeRef.current === globe) globeRef.current = null;
    };
  }, []);

  // Park entrance targets in their hidden state on mount so the reveal
  // timeline never snaps visible content backwards at 100%.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      gsap.set('.hero-stagger', { y: 28, opacity: 0 });
      const canvas = canvasRef.current;
      if (canvas) gsap.set(canvas, { scale: 0.94, opacity: 0.6 });
    }, root);
    return () => {
      ctx.revert();
    };
  }, []);

  // Fake-but-real progress: RAF-interpolate displayed progress toward
  // asset-ready, enforce >= 1.8s, complete at 100 -> reveal + onDone.
  useEffect(() => {
    let raf = 0;
    let assetsReady = false;
    let done = false;
    const start = performance.now();
    let displayed = 0;

    const markReady = () => {
      assetsReady = true;
    };

    let fontsPromise: Promise<unknown> | null = null;
    try {
      fontsPromise = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready ?? null;
    } catch {
      fontsPromise = null;
    }
    if (fontsPromise && typeof (fontsPromise as Promise<unknown>).then === 'function') {
      (fontsPromise as Promise<unknown>).then(markReady, markReady);
    }
    // Fallback: never stall longer than ~1s waiting on "assets".
    const fallback = window.setTimeout(markReady, 1000);

    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      displayed = 1;
      setProgressState(1);
      globeRef.current?.setProgress(1);
      globeRef.current?.setRevealed(true);
      setRevealed(true);

      // GSAP entrance: targets were parked hidden on mount, animate to final.
      const root = rootRef.current;
      const canvas = canvasRef.current;
      if (root) {
        const ctx = gsap.context(() => {
          const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
          if (canvas && !webglFailed) {
            tl.to(canvas, { scale: 1, opacity: 1, duration: 1.6 }, 0);
          }
          tl.to(
            '.hero-stagger',
            { y: 0, opacity: 1, duration: 1.0, stagger: 0.15 },
            0.15,
          );
        }, root);
        gsapCtxRef.current = ctx;
      }
      onDoneRef.current?.();
    };

    const tick = (now: number) => {
      if (done) return;
      const elapsed = now - start;
      const target = assetsReady ? 1 : 0.9;
      displayed += (target - displayed) * 0.035 + 0.001;
      if (displayed > target) displayed = target;
      // Hold under 100% until the minimum duration has passed — clamp the
      // ceiling instead of resetting so the bar never bounces 99<->100.
      if (elapsed < MIN_DURATION_MS && displayed > 0.99) displayed = 0.99;
      if (elapsed >= MIN_DURATION_MS && displayed >= 0.999) {
        finish();
        return;
      }
      // Globe gets smooth per-frame values (cheap uniform); React state only
      // updates on integer-% changes to avoid 60fps re-renders.
      globeRef.current?.setProgress(displayed);
      const pct = Math.round(displayed * 100);
      setProgressState((prev) => (Math.round(prev * 100) === pct ? prev : displayed));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(fallback);
      cancelAnimationFrame(raf);
      gsapCtxRef.current?.revert();
      gsapCtxRef.current = null;
    };
    // webglFailed intentionally excluded: canvas element is conditionally
    // rendered, but globe driving simply no-ops when failed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={rootRef} className="relative h-screen w-full overflow-hidden bg-void text-white">
      {webglFailed ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-void via-[#0a1628] to-[#0b2b3a]"
        />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      )}
      <div aria-hidden="true" className="nsdc-vignette pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="nsdc-grain pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,8,16,0.78)_0%,rgba(5,8,16,0.42)_45%,transparent_70%)]"
      />

      {/* Overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="hero-stagger mb-6 text-xs font-medium uppercase tracking-mega text-neon opacity-0 md:text-sm">
            National Student Data Corps
          </p>
          <h1 className="hero-stagger bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-extrabold uppercase leading-none tracking-mega text-transparent opacity-0 md:text-7xl lg:text-8xl">
            Coming Soon
          </h1>
          <p className="hero-stagger mt-6 max-w-md text-base text-slate-300 opacity-0 md:text-lg">
            Something data-driven is brewing.
          </p>
          <div className="hero-stagger pointer-events-auto mt-10 opacity-0">
            <Socials />
          </div>
        </div>

        <div
          className={`pointer-events-auto flex justify-center px-6 pb-10 transition-opacity duration-700 ${
            revealed ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Loader progress={progress} />
        </div>
      </div>
    </section>
  );
}
