import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The People section's two layers: the pointer-only card deck and the
 * keyboard/reader roster. The deck must mirror the roster, and never trap a
 * keyboard user or overflow the page.
 */

async function peopleSection(page: Page) {
  await page.goto('/');
  const people = page.getByRole('region', { name: 'People' });
  await people.scrollIntoViewIfNeeded();
  return people;
}

/** A point that actually hits this rotated card; null means it is unreachable. */
async function exposedPoint(card: Locator) {
  await card.scrollIntoViewIfNeeded();
  return card.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let dy = 12; dy < r.height; dy += 12) {
      for (let dx = 12; dx < r.width; dx += 12) {
        const hit = document.elementFromPoint(r.left + dx, r.top + dy);
        if (hit === el || el.contains(hit)) return { x: r.left + dx, y: r.top + dy };
      }
    }
    return null;
  });
}

test.describe('office-bearer deck', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });

  test('clicking any card opens that bearer in the detail block', async ({ page }) => {
    const people = await peopleSection(page);
    const detail = people.locator('[data-bearer-detail-name]');
    const cards = people.locator('[data-deck-card]');
    const total = await cards.count();
    expect(total).toBeGreaterThan(1);

    for (let index = 0; index < total; index += 1) {
      const card = cards.nth(index);
      const name = await card.locator('p').first().textContent();
      const point = await exposedPoint(card);
      expect(point, `card ${index} must expose a pointer-reachable area`).not.toBeNull();

      // The exposed point proves a pointer can reach the card; dispatching the
      // click on the card then verifies the selection handler without relying
      // on Playwright's coordinate mapping through the 3D transform.
      await card.dispatchEvent('click');
      await expect(people.locator(`[data-deck-card="${index}"]`)).toHaveAttribute(
        'data-active',
        'true',
      );
      await expect(detail).toHaveText(name ?? '');
    }
  });

  test('the roster arrows move the deck and the detail together', async ({ page }) => {
    const people = await peopleSection(page);
    const detail = people.locator('[data-bearer-detail-name]');
    const rows = people.locator('ol button');

    await rows.nth(1).focus();
    await page.keyboard.press('ArrowDown');

    const thirdName = await people.locator('[data-deck-card="2"] p').first().textContent();
    await expect(detail).toHaveText(thirdName ?? '');
    await expect(people.locator('[data-deck-card="2"]')).toHaveAttribute('data-active', 'true');
  });

  test('the deck stays inside the page', async ({ page }) => {
    await peopleSection(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('office-bearer deck on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', hasTouch: true });

  test('uses the horizontal rail without page overflow', async ({ page }) => {
    const people = await peopleSection(page);
    const rail = people.locator('[data-deck-rail]');
    await expect(rail).toHaveCount(1);
    await expect(people.locator('[data-deck]')).toHaveCount(0);

    const scrollable = await rail.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('office-bearer deck under reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('renders the flat grid, never the tilted deck', async ({ page }) => {
    const people = await peopleSection(page);
    await expect(people.locator('[data-deck-grid]')).toHaveCount(1);
    await expect(people.locator('[data-deck]')).toHaveCount(0);
    await expect(people.locator('[data-deck-rail]')).toHaveCount(0);
  });
});
