import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Landing interaction contract. Selectors stay on roles, accessible names and
// the sections' stable landmark labels, so a visual refactor that keeps the
// semantics does not break the suite.

function landingSection(page: Page, label: string): Locator {
  return page.locator(`section[aria-label="${label}"]`);
}

// ---------------------------------------------------------------------------
// About â€” the founding question is the page's only h1
// ---------------------------------------------------------------------------

test('about leads with the only h1 and drops the retired slogans', async ({ page }) => {
  await page.goto('/');

  const about = landingSection(page, 'About');
  await about.scrollIntoViewIfNeeded();

  await expect(about.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    about.getByRole('heading', {
      level: 1,
      name: /what happens when students stop waiting for the future and start building it\?/i,
    }),
  ).toBeVisible();
  // The question is the only h1 on the page, not just inside the section.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

  // Retired landing copy must not come back as visible text.
  await expect(page.getByText('We bring students together')).toHaveCount(0);
  await expect(page.getByText('Build. Learn. Ship.')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// StoryStages â€” the globe is retired, the 01/02/03 dossier is not
// ---------------------------------------------------------------------------

const STORY_STAGES = [
  '01 / A CHAPTER IN BENGALURU',
  '02 / STUDENTS, CONNECTED',
  '03 / WHAT WE BUILD TOGETHER',
] as const;

async function expectStoryStages(page: Page): Promise<void> {
  const story = landingSection(page, 'Our story');
  await expect(story).toBeVisible();
  await story.scrollIntoViewIfNeeded();

  // The retired globe painted through a <canvas>; StoryStages is paper only.
  await expect(story.locator('canvas')).toHaveCount(0);

  for (const stage of STORY_STAGES) {
    const mark = story.getByText(stage, { exact: true });
    await expect(mark, `stage "${stage}" should render exactly once`).toHaveCount(1);
    await expect(mark).toBeVisible();
  }

  const record = story.getByRole('region', { name: 'The record' });
  await expect(record).toBeVisible();
  for (const band of ['founded', 'network', 'open']) {
    await expect(record.locator(`[data-band="${band}"]`)).toHaveCount(1);
  }
  await expect(record.getByText('OFFICE BEARERS')).toBeVisible();
  await expect(record.getByText('FRAMES FILED')).toBeVisible();
}

test.describe('story stages under normal motion', () => {
  // The suite default is reduced motion; this describe asserts the motion path.
  test.use({ reducedMotion: 'no-preference' });

  test('keeps 01/02/03 in the paper story', async ({ page }) => {
    await page.goto('/');
    await expectStoryStages(page);
  });

  test('pins the record beside the chapters at a tall desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(landingSection(page, 'Our story')).toHaveAttribute('data-layout', 'pinned');
  });

  test('falls back to the static stack on a short desktop', async ({ page }) => {
    for (const height of [640, 720]) {
      await page.setViewportSize({ width: 1024, height });
      await page.goto('/');
      const story = landingSection(page, 'Our story');
      await expect(story).toHaveAttribute('data-layout', 'static');
      await expect(story.getByRole('region', { name: 'The record' })).toBeVisible();
    }
  });

  test('keeps the record and its last link inside the pinned stage', async ({ page }) => {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/');
      const story = landingSection(page, 'Our story');
      await expect(story).toHaveAttribute('data-layout', 'pinned');

      const stage = await story.locator('[data-story-stage]').boundingBox();
      const record = await story.getByRole('region', { name: 'The record' }).boundingBox();
      const link = await story.getByRole('link', { name: /Open the archive/ }).boundingBox();
      expect(stage).not.toBeNull();
      expect(record).not.toBeNull();
      expect(link).not.toBeNull();

      const stageBottom = stage!.y + stage!.height;
      expect(record!.y + record!.height, 'record fits the pinned stage').toBeLessThanOrEqual(stageBottom);
      expect(link!.y + link!.height, 'archive link fits the pinned stage').toBeLessThanOrEqual(stageBottom);
    }
  });

  test('shows dashes, not fallback roster numbers, when content fails', async ({ page }) => {
    await page.route('**/api/content', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-content', 'fallback');
    const record = landingSection(page, 'Our story').getByRole('region', { name: 'The record' });
    await expect(record.getByText('MENTOR').locator('..')).toContainText('\u2014');
    await expect(record.getByText('OFFICE BEARERS').locator('..')).toContainText('\u2014');
  });

  test('renders zeros, not dashes, when content succeeds empty', async ({ page }) => {
    await page.route('**/api/content', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sections: [], bearers: [], achievements: [] }),
      }),
    );
    await page.goto('/');
    const record = landingSection(page, 'Our story').getByRole('region', { name: 'The record' });
    await expect(record.getByText('MENTOR').locator('..')).toContainText('00');
    await expect(record.getByText('OFFICE BEARERS').locator('..')).toContainText('00');
  });

  test('the record and NOW report the same frame count', async ({ page }) => {
    await page.goto('/');
    const record = landingSection(page, 'Our story').getByRole('region', { name: 'The record' });
    await record.scrollIntoViewIfNeeded();
    const nowLine = page.getByText(/frames archived/);
    test.skip((await nowLine.count()) === 0, 'archive empty â€” NOW hides the line');

    const digits = (text: string | null) => {
      const found = (text ?? '').match(/\d+/)?.[0];
      return found === undefined ? undefined : String(Number(found));
    };
    expect(digits(await record.getByText('FRAMES FILED').locator('..').textContent())).toBe(
      digits(await nowLine.textContent()),
    );
  });
});

test.describe('story stages under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps 01/02/03 in the paper story', async ({ page }) => {
    await page.goto('/');
    await expectStoryStages(page);
  });
});

// ---------------------------------------------------------------------------
// IndexStage â€” desktop index + stages, 390px stacked fallback
// ---------------------------------------------------------------------------

interface LandingIndex {
  label: 'Projects' | 'Events' | 'Archive';
  /** Accessible name of the desktop index nav. */
  nav: string;
  /** Honest empty state rendered when the section's fetch returns no rows. */
  empty: RegExp;
}

const INDEXES: LandingIndex[] = [
  { label: 'Projects', nav: 'Projects index', empty: /Projects coming soon\./ },
  { label: 'Events', nav: 'Events index', empty: /No events listed right now/ },
  { label: 'Archive', nav: 'Archive index', empty: /The archive is empty for now\./ },
];

test.describe('index + stage at desktop width', () => {
  // IndexStage only pins/splits when the viewport is wide AND motion is allowed.
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });

  test('Projects, Events and Archive render an index nav and stages', async ({ page }) => {
    await page.goto('/');

    for (const entry of INDEXES) {
      const region = landingSection(page, entry.label);
      const nav = region.getByRole('navigation', { name: entry.nav });
      const empty = region.getByText(entry.empty);

      // The strip fetches after mount: wait for the index or its honest empty
      // state before deciding which contract applies.
      await expect(nav.or(empty).first()).toBeVisible();

      if ((await nav.count()) === 0) {
        await expect(empty.first()).toBeVisible();
        continue;
      }

      await expect(nav).toBeVisible();
      await expect(nav.getByRole('list')).toBeVisible();

      const stages = region.getByRole('group');
      await expect(stages.first()).toBeVisible();
      expect(
        await stages.count(),
        `${entry.label} should render one stage per index item`,
      ).toBeGreaterThan(0);
    }
  });
});

test.describe('index + stage at 390px', () => {
  // Mobile width alone must produce the stacked list â€” not reduced motion.
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test('Projects, Events and Archive fall back to one stacked list', async ({ page }) => {
    await page.goto('/');

    for (const entry of INDEXES) {
      const region = landingSection(page, entry.label);
      const stacked = region.getByRole('list', { name: entry.label });
      const nav = region.getByRole('navigation', { name: entry.nav });
      const empty = region.getByText(entry.empty);

      await expect(stacked.or(empty).first()).toBeVisible();

      if ((await stacked.count()) === 0) {
        await expect(empty.first()).toBeVisible();
        await expect(nav).toHaveCount(0);
        continue;
      }

      // The stacked fallback renders index heads as h3s and no sticky nav.
      await expect(nav).toHaveCount(0);
      await expect(stacked).toBeVisible();
      await expect(region.getByRole('heading', { level: 3 }).first()).toBeVisible();
    }
  });
});
