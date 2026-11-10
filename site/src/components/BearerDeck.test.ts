import { describe, expect, it } from 'vitest';
import { fanSpread, fanTransform } from './BearerDeck';

describe('fanSpread', () => {
  it('shrinks per-step angle as the deck grows', () => {
    expect(fanSpread(4)).toBeGreaterThan(fanSpread(8));
  });

  it('caps the spread', () => {
    expect(fanSpread(2)).toBeLessThanOrEqual(12);
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

  it('is fixed for a slot, so opening a card cannot reflow the fan', () => {
    expect(fanTransform(2, 6)).toBe(fanTransform(2, 6));
  });
});
