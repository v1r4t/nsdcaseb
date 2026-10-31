/**
 * StoryPlate — the fixed dial the bearer turns inside.
 *
 * A hairline circle with a crosshair and four ticks, plus a seal-red zero mark
 * at twelve o'clock. Drawn as measurement marks, it makes the turning
 * silhouette read as a plate on a pin rather than a body falling through the
 * room. The plate stays still; only the figure rotates.
 */
export default function StoryPlate({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 440"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-story-plate=""
    >
      <g fill="none" stroke="var(--color-ink)" strokeWidth="1">
        <circle cx="200" cy="220" r="196" strokeOpacity="0.28" />
        <path d="M200 20 V420" strokeOpacity="0.1" />
        <path d="M6 220 H394" strokeOpacity="0.1" />
        {/* Four dial ticks, just inside the rim. */}
        <path d="M200 26 V40 M200 400 V414 M6 220 H20 M380 220 H394" strokeOpacity="0.45" />
        {/* Zero mark: the chapter counter starts here. */}
        <path d="M200 16 V30" stroke="var(--color-seal)" strokeWidth="2" />
      </g>
    </svg>
  );
}
