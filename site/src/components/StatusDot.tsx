import type { EventSummary } from '../lib/events';

export type RowStatus = 'open' | 'filling' | 'waitlisted' | 'registered' | 'closed';

/** Single source of row-status logic, shared by list rows. Text label always rendered — never colour alone. */
export function statusFor(event: EventSummary): RowStatus {
  if (event.mine?.status === 'registered') return 'registered';
  if (event.mine?.status === 'waitlisted') return 'waitlisted';
  if (!event.registration_open) return 'closed';
  if (
    event.capacity !== null &&
    event.spots_left !== null &&
    event.capacity > 0 &&
    event.spots_left <= Math.max(1, event.capacity * 0.15)
  ) {
    return 'filling';
  }
  return 'open';
}

const LABEL: Record<RowStatus, string> = {
  open: 'OPEN',
  filling: 'FILLING FAST',
  waitlisted: 'WAITLIST',
  registered: 'REGISTERED',
  closed: 'CLOSED',
};

/** Status dot + text label. The label carries the meaning; the dot is decoration. */
export default function StatusDot({ event }: { event: EventSummary }) {
  const status = statusFor(event);
  if (status === 'registered') {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-paper">
        <span aria-hidden="true" className="text-signal">✓</span> REGISTERED
      </span>
    );
  }
  const filled = status === 'open' || status === 'filling' || status === 'waitlisted';
  const dotClass =
    status === 'closed' ? 'text-muted' : status === 'filling' ? 'text-signal' : 'text-paper';
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-paper/80">
      <span aria-hidden="true" className={dotClass}>{filled ? '●' : '○'}</span> {LABEL[status]}
    </span>
  );
}
