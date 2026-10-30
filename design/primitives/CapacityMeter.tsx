/** A drawn bar, not a progress element with a gradient. */
export function CapacityMeter({
  registered,
  capacity,
  className,
}: {
  registered: number;
  capacity: number;
  className?: string;
}) {
  const ratio = capacity === 0 ? 0 : Math.max(0, Math.min(1, registered / capacity));
  const label = `${registered} of ${capacity} seats taken`;

  return (
    <div className={className}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={registered}
        aria-valuetext={label}
        aria-label="Seats taken"
        className="relative h-[7px] w-full overflow-hidden border hairline"
      >
        <div
          aria-hidden="true"
          data-testid="capacity-fill"
          className="absolute inset-0 origin-left bg-seal transition-transform duration-500 ease-ink"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      <p className="mono mt-2 text-faint">{label}</p>
    </div>
  );
}
