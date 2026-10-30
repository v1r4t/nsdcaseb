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
  waitlisted: 'WAITLISTED',
  registered: 'REGISTERED',
  closed: 'CLOSED',
};

/** Ink label tone. FILLING FAST is the only state that earns seal text. */
const TONE: Record<RowStatus, string> = {
  open: 'text-ink',
  filling: 'text-seal',
  waitlisted: 'text-ink',
  registered: 'text-ink',
  closed: 'text-quiet',
};

/** Seal square + text label. The label carries the meaning; the mark is decoration. */
export default function StatusDot({ event }: { event: EventSummary }) {
  const status = statusFor(event);
  const hollow = status === 'closed';
  const sealed = status === 'filling' || status === 'registered' || status === 'waitlisted';

  return (
    <span className={`mono inline-flex items-center gap-2 whitespace-nowrap ${TONE[status]}`}>
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 shrink-0 ${
          hollow ? 'border border-current' : sealed ? 'bg-seal' : 'bg-ink'
        }`}
      />
      {LABEL[status]}
    </span>
  );
}
