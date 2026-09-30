interface LoaderProps {
  /** Displayed load progress, 0..1 */
  progress: number;
}

export default function Loader({ progress }: LoaderProps) {
  const clamped = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
  const pct = Math.round(clamped * 100);

  return (
    <div className="w-full max-w-md" aria-label={`Loading ${pct} percent`}>
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-400">
        <span>Loading</span>
        <span className="tabular-nums text-slate-200">{pct}%</span>
      </div>
      <div
        className="h-[2px] w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-neon to-deepblue transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
