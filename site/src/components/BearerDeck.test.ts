import { describe, expect, it } from 'vitest';
import { fanSpread, fanTransform, visibleCards } from './BearerDeck';
import type { OfficeBearer } from '../lib/content';

const bearer = (id: string): OfficeBearer => ({
  id,
  name: id,
  role: 'Role',
  cohort: null,
  photo_url: null,
  links: [],
  sort_order: 1,
});

const roster = (n: number): OfficeBearer[] => Array.from({ length: n }, (_, i) => bearer(`b${i}`));

describe('fanSpread', () => {
  it('shrinks per-step angle as the deck grows', () => {
    expect(fanSpread(4)).toBeGreaterThan(fanSpread(8));
  });

  it('caps the spread', () => {
    expect(fanSpread(2)).toBeLessThanOrEqual(16);
  });
});

describe('fanTransform', () => {
  it('keeps outer cards angled and offset', () => {
    const left = fanTransform(0, 6);
    const right = fanTransform(5, 6);
    expect(left).toMatch(/rotateZ\(-/);
    expect(right).toMatch(/rotateZ\(\d/);
    expect(left).toContain('calc(var(--fan-step) * -');
    expect(right).toContain('calc(var(--fan-step) * ');
  });

  it('gives the two centre cards opposite angles', () => {
    expect(fanTransform(1, 4)).toMatch(/rotateZ\(-/);
    expect(fanTransform(2, 4)).toMatch(/rotateZ\(\d/);
  });

  it('is fixed for a slot, so selection cannot reflow the fan', () => {
    expect(fanTransform(2, 6)).toBe(fanTransform(2, 6));
  });
});

describe('visibleCards', () => {
  it('returns everyone when the roster fits', () => {
    expect(visibleCards(roster(6), 3, 8).map((v) => v.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps the first eight when the active bearer is inside them', () => {
    expect(visibleCards(roster(9), 5, 8).map((v) => v.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('swaps an out-of-fan active bearer into the last slot', () => {
    const visible = visibleCards(roster(9), 8, 8);
    expect(visible).toHaveLength(8);
    expect(visible[7].index).toBe(8);
    expect(visible.slice(0, 7).map((v) => v.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
