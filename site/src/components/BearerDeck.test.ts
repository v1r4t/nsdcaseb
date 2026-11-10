import { describe, expect, it } from 'vitest';
import { fanSpread, fanTransform } from './BearerDeck';

describe('fanSpread', () => {
  it('shrinks per-step angle as the deck grows', () => {
    expect(fanSpread(4)).toBeGreaterThan(fanSpread(8));
  });

  it('caps the spread', () => {
    expect(fanSpread(2)).toBeLessThanOrEqual(8);
  });
});

describe('fanTransform', () => {
  it('fans outward around a shared centre', () => {
    const right = fanTransform(0, 6);
    const left = fanTransform(5, 6);
    expect(right).toContain('translate(-50%, -50%)');
    expect(right).toMatch(/rotateZ\(\d/);
    expect(left).toMatch(/rotateZ\(-/);
  });

  it('gives the two centre cards opposite angles', () => {
    expect(fanTransform(1, 4)).toMatch(/rotateZ\(\d/);
    expect(fanTransform(2, 4)).toMatch(/rotateZ\(-/);
  });

  it('is fixed for a slot, so opening a card cannot reflow the fan', () => {
    expect(fanTransform(2, 6)).toBe(fanTransform(2, 6));
  });
});
