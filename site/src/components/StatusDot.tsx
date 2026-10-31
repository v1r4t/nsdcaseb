import type { EventSummary } from '../lib/events';

export type RowStatus =
  | 'open'
  | 'filling'
  | 'full'
  | 'waitlisted'
  | 'registered'
  | 'closed';

/** Single source of row-status logic, shared by list rows. Text label always rendered — never colour alone. */
export function statusFor(event: EventSummary): RowStatus {
  if (event.mine?.status === 'registered') return 'registered';
  if (event.mine?.status === 'waitlisted') return 'waitlisted';
  if (!event.registration_open) return 'closed';
  // Zero seats left while registration is still open means the waitlist is
  // the only path in — not "filling fast". Capacity 0 / null is an unknown
  // cap, not a full room, so it stays `open`.
  if (
    event.capacity !== null &&
    event.capacity > 0 &&
    event.spots_left === 0
  ) {
    return 'full';
  }
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
  full: 'FULL',
  waitlisted: 'WAITLISTED',
  registered: 'REGISTERED',
  closed: 'CLOSED',
};

/** Ink label tone. FILLING FAST is the only state that earns seal text. */
const TONE: Record<RowStatus, string> = {
  open: 'text-ink',
  filling: 'text-seal',
  full: 'text-ink',
  waitlisted: 'text-ink',
  registered: 'text-ink',
  closed: 'text-quiet',
};

/** Seal square + text label. The label carries the meaning; the mark is decoration. */
export default function StatusDot({ event }: { event: EventSummary }) {
  const status = statusFor(event);
  const hollow = status === 'closed';
  const sealed =
    status === 'filling' ||
    status === 'full' ||
    status === 'registered' ||
    status === 'waitlisted';

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
