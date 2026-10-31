/**
 * Unit tests for statusFor (site/src/components/StatusDot.tsx).
 *
 * statusFor is the single shared source of row-status logic; the event
 * date/time formatters (EventDetail.formatDate/formatTimeRange) are
 * module-private and therefore untestable as-is without a refactor — noted as
 * a follow-up, current behavior pinned here only through the exported function.
 */
import { describe, expect, it } from 'vitest';
import { statusFor } from './StatusDot';
import type { EventSummary } from '../lib/events';

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'e1',
    title: 'Hack Night',
    description: '',
    starts_at: '2026-03-26T18:00:00.000Z',
    ends_at: '2026-03-26T21:00:00.000Z',
    reg_opens_at: '2026-03-01T00:00:00.000Z',
    reg_closes_at: '2026-03-25T00:00:00.000Z',
    capacity: 100,
    spots_left: 50,
    registration_open: true,
    poster_url: null,
    mine: null,
    ...overrides,
  };
}

describe('statusFor', () => {
  it('reports registered when the viewer is registered, even if closed', () => {
    expect(statusFor(event({ mine: { status: 'registered' } }))).toBe('registered');
    expect(
      statusFor(event({ mine: { status: 'registered' }, registration_open: false })),
    ).toBe('registered');
  });

  it('reports waitlisted when the viewer is waitlisted', () => {
    expect(statusFor(event({ mine: { status: 'waitlisted' } }))).toBe('waitlisted');
  });

  it('reports closed when registration is not open', () => {
    expect(statusFor(event({ registration_open: false }))).toBe('closed');
  });

  it('reports filling when spots are at or under 15% of capacity', () => {
    // 15% of 100 = 15 -> boundary is Math.max(1, 15).
    expect(statusFor(event({ capacity: 100, spots_left: 15 }))).toBe('filling');
    expect(statusFor(event({ capacity: 100, spots_left: 1 }))).toBe('filling');
    expect(statusFor(event({ capacity: 20, spots_left: 3 }))).toBe('filling');
  });

  it('reports open when spots are above the 15% threshold', () => {
    expect(statusFor(event({ capacity: 100, spots_left: 16 }))).toBe('open');
    expect(statusFor(event({ capacity: 20, spots_left: 4 }))).toBe('open');
  });

  it('reports open when capacity or spots_left is unknown', () => {
    expect(statusFor(event({ capacity: null, spots_left: 2 }))).toBe('open');
    expect(statusFor(event({ capacity: 100, spots_left: null }))).toBe('open');
    expect(statusFor(event({ capacity: 0, spots_left: 0 }))).toBe('open');
  });

  it('falls through to open/closed for a cancelled personal status (current behavior)', () => {
    expect(statusFor(event({ mine: { status: 'cancelled' } }))).toBe('open');
    expect(statusFor(event({ mine: { status: 'cancelled' }, registration_open: false }))).toBe('closed');
  });
});
