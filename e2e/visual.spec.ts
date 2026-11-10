import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Visual regression for the landing page's two canonical widths plus the
// People plate. Baselines are pixel images: animation, fonts and lazy images
// all have to be settled before the shutter, or every run diffs.
//
// Rendering of text (font hinting, subpixel antialiasing) differs per engine,
// so the baselines are captured on Chromium only. CI runs all three browser
// projects; this file skips the other two instead of demanding three snapshot
// sets. Regenerate with:
//   npx playwright test -c e2e/playwright.config.ts visual --update-snapshots

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'visual baselines are captured on chromium only',
);

// Baselines are platform-specific and not committed yet. Generate them with
// `VISUAL=1 npx playwright test ... --update-snapshots` on the target OS,
// commit the snapshot directory, then drop this gate.
test.skip(process.env.VISUAL !== '1', 'set VISUAL=1 after generating baselines');

/** The kit preloader runs once per browser session; it is not the subject. */
const PRELOADER_KEY = 'nsdc:seen-preloader';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key: string) => {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      // Private mode: the preloader may still paint; the settle wait covers it.
    }
  }, PRELOADER_KEY);
});

/**
 * Settle the page: fetch the content, load the web fonts, walk top → bottom so
 * every scroll-triggered Reveal/Swoop fires and every lazy portrait starts
 * loading, wait for the images, then return to the top.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await page.evaluate(async () => {
    const nextFrame = (): Promise<void> =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    const step = Math.max(240, Math.floor(window.innerHeight * 0.75));
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    for (let y = 0; y <= height; y += step) {
      window.scrollTo(0, y);
      await nextFrame();
    }
    window.scrollTo(0, 0);
    await nextFrame();
  });

  // Portrait/archive images are lazy: they only start fetching while the walk
  // brings them into view. Wait for decode, not just the request.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
              window.setTimeout(resolve, 5000);
            }),
      ),
    );
  });

  // The longest entrance (900 ms reveal) plus the room's first draw.
  await page.waitForTimeout(1000);
}

/** Shared shutter options: no motion, no caret, CSS pixels, small AA slack. */
const SHOT = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
  maxDiffPixelRatio: 0.02,
} as const;

test.describe('landing at desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('matches the settled page', async ({ page }) => {
    await page.goto('/');
    await settle(page);

    await expect(page).toHaveScreenshot('landing-desktop.png', {
      ...SHOT,
      fullPage: true,
    });
  });

  test('People shows the card deck', async ({ page }) => {
    await page.goto('/');
    await settle(page);

    const people = page.locator('section#people');
    await expect(people).toBeAttached();
    await expect(
      people.getByRole('heading', { name: 'The people holding it together.' }),
    ).toBeVisible();

    await people.scrollIntoViewIfNeeded();
    await expect(people.locator('[data-deck-grid]')).toHaveCount(1);
    await page.waitForTimeout(250);

    await expect(people).toHaveScreenshot('landing-people.png', SHOT);
  });
});

test.describe('landing at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('matches the settled page', async ({ page }) => {
    await page.goto('/');
    await settle(page);

    // A phone layout must never scroll sideways; that would hide content in
    // the baseline instead of showing it.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'landing must not scroll horizontally at 390px').toBeLessThanOrEqual(1);

    await expect(page).toHaveScreenshot('landing-mobile.png', {
      ...SHOT,
      fullPage: true,
    });
  });
});
