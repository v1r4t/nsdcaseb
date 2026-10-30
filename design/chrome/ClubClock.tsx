import { useClock } from "../hooks/useClock";
import { dayCounter, formatClock } from "../lib/time";

/** Bengaluru time and the chapter's age, in the margin of every page. */
export function ClubClock({
  className,
  stacked = false,
  tone = "ink",
  since = "2024-08-01T00:00:00+05:30",
}: {
  className?: string;
  stacked?: boolean;
  /** "paper" is for the inverted footer slab. */
  tone?: "ink" | "paper";
  /** ISO founding date for the day counter. */
  since?: string;
}) {
  const now = useClock();
  const day = dayCounter(since, now);
  const clockTone = tone === "paper" ? "text-paper" : "text-ink";
  const dayTone = tone === "paper" ? "text-footer-muted" : "text-faint";

  return (
    <div className={className} data-testid="club-clock">
      <span className={`mono whitespace-nowrap ${clockTone}`}>{formatClock(now)} IST</span>
      <span
        className={
          stacked
            ? `mono block whitespace-nowrap ${dayTone}`
            : `mono ml-3 hidden whitespace-nowrap ${dayTone} sm:inline`
        }
      >
        DAY {day}
      </span>
    </div>
  );
}
