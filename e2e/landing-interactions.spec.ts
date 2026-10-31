import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Landing interaction contract. Selectors stay on roles, accessible names and
// the sections' stable landmark labels, so a visual refactor that keeps the
// semantics does not break the suite.

function landingSection(page: Page, label: string): Locator {
  return page.locator(`section[aria-label="${label}"]`);
}

// ---------------------------------------------------------------------------
// About — the founding question is the page's only h1
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
// Globe story — the static fallback keeps all three stages
// ---------------------------------------------------------------------------

test.describe('globe story under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps 01/02/03 in the paper story', async ({ page }) => {
    await page.goto('/');

    const story = landingSection(page, 'Our story');
    await expect(story).toBeVisible();

    for (const stage of [
      '01 / A CHAPTER IN BENGALURU',
      '02 / STUDENTS, CONNECTED',
      '03 / WHAT WE BUILD TOGETHER',
    ]) {
      await expect(story.getByText(stage, { exact: true })).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// IndexStage — desktop index + stages, 390px stacked fallback
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
  // Mobile width alone must produce the stacked list — not reduced motion.
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

// ---------------------------------------------------------------------------
// People — the NEXT plate is always on screen and advances the index
// ---------------------------------------------------------------------------

const PEOPLE_EMPTY = 'The current board has not been published yet.';

/** The plate is the button whose visible label starts with NEXT. */
function peoplePreview(region: Locator): Locator {
  return region.getByRole('button', { name: /^Next\b/i });
}

/** Index rows live inside the roster list. */
function peopleRows(region: Locator): Locator {
  return region.locator('ol').getByRole('button');
}

/** The active row carries a screen-reader suffix naming its state. */
function activeRow(region: Locator): Locator {
  return region.getByRole('button', { name: /,\s*Active bearer$/ });
}

/** The plate's sr-only tail reports which bearer is currently active. */
function previewActiveName(text: string): string {
  const current = text.match(/Currently active: (.+)\.\s*$/);
  if (current) return current[1].trim();
  const after = text.match(/after (.+?)(?:\s+Next:|\s*$)/);
  return after?.[1]?.trim() ?? '';
}

/** The plate must name the row it follows (hover, focus or keyboard). */
async function expectPreviewFollows(preview: Locator, row: Locator): Promise<void> {
  const rowText = (await row.textContent()) ?? '';
  await expect
    .poll(async () => {
      const active = previewActiveName((await preview.textContent()) ?? '');
      return active.length > 0 && rowText.includes(active);
    })
    .toBe(true);
}

async function openPeople(page: Page): Promise<Locator> {
  await page.goto('/');
  const people = page.locator('section#people');
  await expect(
    people.getByRole('heading', { name: 'The people holding it together.' }),
  ).toBeVisible();
  return people;
}

test('people: the NEXT plate is visible at rest and advances on click', async ({ page }) => {
  const people = await openPeople(page);
  const preview = peoplePreview(people);

  await expect(preview.or(people.getByText(PEOPLE_EMPTY)).first()).toBeVisible();
  test.skip(
    (await preview.count()) === 0,
    'content API has no bearers — honest empty state only',
  );

  // No hover required: the NEXT tag, portrait and label all render at rest.
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/^Next$/i)).toBeVisible();
  await expect(preview.getByRole('img')).toBeVisible();

  // Advancing needs a second bearer to advance to; the rest is still covered.
  test.skip(
    (await peopleRows(people).count()) < 2,
    'a single bearer has no next bearer to advance to',
  );

  const active = activeRow(people);
  await expect(active).toHaveCount(1);
  const activeBefore = (await active.textContent()) ?? '';
  const previewBefore = previewActiveName((await preview.textContent()) ?? '');
  expect(previewBefore, 'the plate should name the currently active bearer').not.toBe('');

  await preview.click();

  // The previewed bearer becomes active; the plate moves on to the next one.
  await expect
    .poll(async () => previewActiveName((await preview.textContent()) ?? ''))
    .not.toBe(previewBefore);
  await expect
    .poll(async () => (await activeRow(people).textContent()) ?? '')
    .not.toBe(activeBefore);
  await expect(activeRow(people)).toHaveCount(1);
});

test('people: focus and hover follow the row, Enter advances the bearer', async ({ page }) => {
  const people = await openPeople(page);
  const preview = peoplePreview(people);

  await expect(preview.or(people.getByText(PEOPLE_EMPTY)).first()).toBeVisible();
  test.skip(
    (await preview.count()) === 0,
    'content API has no bearers — honest empty state only',
  );

  const rows = peopleRows(people);
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);

  const focusIndex = total > 1 ? 1 : 0;
  const hoverIndex = (focusIndex + 1) % total;
  const advanceTarget = (hoverIndex + 1) % total;

  // Focus is an activation path: the plate reports that row as active.
  await rows.nth(focusIndex).focus();
  await expect(rows.nth(focusIndex)).toHaveAccessibleName(/,\s*Active bearer$/);
  await expectPreviewFollows(preview, rows.nth(focusIndex));

  // Pointer enter is the same activation path on a mouse/trackpad.
  await rows.nth(hoverIndex).hover();
  await expect(rows.nth(hoverIndex)).toHaveAccessibleName(/,\s*Active bearer$/);
  await expectPreviewFollows(preview, rows.nth(hoverIndex));

  // Return to keyboard-only input before stepping the index.
  await page.mouse.move(0, 0);
  await rows.nth(hoverIndex).focus();
  await expect(rows.nth(hoverIndex)).toHaveAccessibleName(/,\s*Active bearer$/);
  await rows.nth(hoverIndex).press('Enter');

  await expect(rows.nth(advanceTarget)).toHaveAccessibleName(/,\s*Active bearer$/);
  await expect(rows.nth(advanceTarget)).toBeFocused();
});
