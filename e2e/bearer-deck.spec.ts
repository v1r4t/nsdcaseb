import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The People section is a deck of buttons with no roster underneath. Clicking
 * or pressing Enter opens one enlarged card over a dimmed page; the backdrop,
 * Escape or Close returns to the deck and restores focus.
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

  test('has no roster and every card is reachable', async ({ page }) => {
    const people = await peopleSection(page);
    await expect(people.locator('ol')).toHaveCount(0);
    const cards = people.locator('[data-deck-card]');
    const total = await cards.count();
    expect(total).toBeGreaterThan(1);

    for (let index = 0; index < total; index += 1) {
      const point = await exposedPoint(cards.nth(index));
      expect(point, `card ${index} must expose a pointer-reachable area`).not.toBeNull();
    }
  });

  test('clicking a card opens it enlarged and the backdrop closes it', async ({ page }) => {
    const people = await peopleSection(page);
    const card = people.locator('[data-deck-card="1"]');
    const name = await card.locator('p').first().textContent();
    const point = await exposedPoint(card);
    expect(point).not.toBeNull();

    await page.mouse.click(point!.x, point!.y);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(name ?? '');

    await page.mouse.click(8, 8);
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('keyboard opens and Escape closes, restoring the card', async ({ page }) => {
    const people = await peopleSection(page);
    const card = people.locator('[data-deck-card="0"]');
    await card.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('the open card has no critical or serious axe findings', async ({ page }) => {
    const people = await peopleSection(page);
    await people.locator('[data-deck-card="0"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    // Let the 300ms entrance settle before measuring contrast.
    await page.waitForTimeout(400);

    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    const blockers = results.violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => `${violation.id} (${violation.impact})`);
    expect(blockers).toEqual([]);
  });

  test('the deck stays inside the page', async ({ page }) => {
    await peopleSection(page);
    const { overflow, offenders } = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const offenders = Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.right > width + 1 || rect.left < -1;
        })
        .slice(0, 10)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
      return {
        overflow: document.documentElement.scrollWidth - width,
        offenders,
      };
    });
    expect(overflow, offenders.join('\n')).toBeLessThanOrEqual(0);
  });
});

test.describe('office-bearer deck on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', hasTouch: true });

  test('the rail opens a card without page overflow', async ({ page }) => {
    const people = await peopleSection(page);
    const rail = people.locator('[data-deck-rail]');
    await expect(rail).toHaveCount(1);

    const scrollable = await rail.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);

    await people.locator('[data-deck-card="0"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('office-bearer deck under reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('renders the flat grid and still opens a card', async ({ page }) => {
    const people = await peopleSection(page);
    await expect(people.locator('[data-deck-grid]')).toHaveCount(1);
    await expect(people.locator('[data-deck]')).toHaveCount(0);
    await expect(people.locator('[data-deck-rail]')).toHaveCount(0);

    await people.locator('[data-deck-card="0"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
