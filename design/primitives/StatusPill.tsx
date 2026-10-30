export type SeatPhase = "OPEN" | "WAITLIST" | "CLOSED" | "UPCOMING" | "ENDED";

const LABEL: Record<SeatPhase, string> = {
  OPEN: "Open",
  WAITLIST: "Waitlist",
  CLOSED: "Closed",
  UPCOMING: "Opens soon",
  ENDED: "Ended",
};

const TONE: Record<SeatPhase, string> = {
  OPEN: "text-seal",
  WAITLIST: "text-ink",
  CLOSED: "text-faint",
  UPCOMING: "text-faint",
  ENDED: "text-faint",
};

export function StatusPill({ phase, className }: { phase: SeatPhase; className?: string }) {
  return (
    <span
      data-testid="status-pill"
      aria-label={`Registration ${LABEL[phase].toLowerCase()}`}
      className={`mono inline-flex items-center gap-1.5 whitespace-nowrap ${TONE[phase]} ${className ?? ""}`}
    >
      <span aria-hidden="true" className="inline-block h-[5px] w-[5px] bg-current" />
      {LABEL[phase]}
    </span>
  );
}
