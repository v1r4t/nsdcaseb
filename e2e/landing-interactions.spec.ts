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
// StoryStages — the globe is retired, the 01/02/03 dossier is not
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

  // The bearer is decorative: a single halftone figure that turns on desktop.
  // It does not belong in the accessibility tree.
  const figure = story.locator('[data-story-figure]');
  await expect(figure).toHaveCount(1);
  await expect(figure).toHaveAttribute('aria-hidden', 'true');

  for (const stage of STORY_STAGES) {
    const mark = story.getByText(stage, { exact: true });
    await expect(mark, `stage "${stage}" should render exactly once`).toHaveCount(1);
    await expect(mark).toBeVisible();
  }
}

test.describe('story stages under normal motion', () => {
  // The suite default is reduced motion; this describe asserts the motion path.
  test.use({ reducedMotion: 'no-preference' });

  test('keeps 01/02/03 in the paper story', async ({ page }) => {
    await page.goto('/');
    await expectStoryStages(page);
  });

  test('turns the bearer and clears the plate before About', async ({ page }) => {
    await page.goto('/');
    const story = landingSection(page, 'Our story');
    await story.scrollIntoViewIfNeeded();

    const geometry = await story.evaluate((el) => {
      const node = el as HTMLElement;
      const stage = node.firstElementChild as HTMLElement;
      return { top: node.offsetTop, span: node.offsetHeight - stage.offsetHeight };
    });
    const turn = async (frac: number) => {
      await page.evaluate(
        ({ top, span, frac: f }) => window.scrollTo(0, top + span * f),
        { ...geometry, frac },
      );
      await page.waitForTimeout(650);
    };

    const rotating = story.locator('[data-story-figure]').locator('..');
    const bearer = story.locator('[data-story-figure]').locator('..').locator('..');

    await turn(0.05);
    expect(await rotating.getAttribute('style')).toMatch(/rotateY\((1[0-9]|2[0-9])(\.\d+)?deg\)/);
    expect(await bearer.evaluate((el) => Number((el as HTMLElement).style.opacity || 1))).toBe(1);

    await turn(0.55);
    expect(await rotating.getAttribute('style')).toMatch(/rotateY\((19[0-9]|20[0-9])(\.\d+)?deg\)/);

    // The bearer leaves before the story unpins, so About arrives clean.
    await turn(0.98);
    const leaving = await bearer.evaluate((el) => Number((el as HTMLElement).style.opacity));
    expect(leaving).toBeLessThan(0.25);
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
// People — the portrait plate follows the active bearer; Next advances
// ---------------------------------------------------------------------------

const PEOPLE_EMPTY = 'The current board has not been published yet.';

/** Index rows live inside the roster list. */
function peopleRows(region: Locator): Locator {
  return region.locator('ol').getByRole('button');
}

/** The active row carries a screen-reader suffix naming its state. */
function activeRow(region: Locator): Locator {
  return region.getByRole('button', { name: /,\s*Active bearer$/ });
}

/** The standalone control that steps the active bearer forward. */
function nextControl(region: Locator): Locator {
  return region.getByRole('button', { name: /^Next\b/i });
}

/** The plate's portrait: a real <img> or the drawn placeholder (role="img"). */
function platePortrait(region: Locator): Locator {
  return region.getByRole('img').first();
}

/** Accessible label of the portrait, for both <img alt> and role="img". */
async function accessibleLabel(locator: Locator): Promise<string> {
  const label = await locator.evaluate((el) => {
    const labelled = el.getAttribute('aria-label');
    if (labelled) return labelled;
    if (el instanceof HTMLImageElement) return el.getAttribute('alt') ?? '';
    return el.textContent ?? '';
  });
  return label.trim();
}

/**
 * The person a portrait names. A real photo reads `Portrait of <name>`; the
 * drawn stand-in reads `Drawn portrait placeholder for <name>.` — both are
 * part of the People contract, so the spec accepts either.
 */
function portraitPerson(label: string): string {
  const patterns = [
    /^Portrait of (.+)$/i,
    /^Drawn portrait placeholder for (.+?)(?:\.|$)/i,
    /^Portrait placeholder for (.+?)(?:\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = label.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

/** The plate must show the bearer that hover/focus/Next made active. */
async function expectPlateShows(region: Locator, row: Locator): Promise<void> {
  await expect
    .poll(
      async () => {
        const person = portraitPerson(await accessibleLabel(platePortrait(region)));
        if (!person) return false;
        return ((await row.textContent()) ?? '').includes(person);
      },
      { message: 'the plate portrait should belong to the active row' },
    )
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

test('people: the plate shows the active bearer and a separate Next advances', async ({ page }) => {
  const people = await openPeople(page);
  const portrait = platePortrait(people);

  await expect(portrait.or(people.getByText(PEOPLE_EMPTY)).first()).toBeVisible();
  test.skip(
    (await people.getByRole('img').count()) === 0,
    'content API has no bearers — honest empty state only',
  );

  // At rest the plate already belongs to the active bearer — no hover needed.
  await expect(activeRow(people)).toHaveCount(1);
  await expect(portrait).toBeVisible();
  await expectPlateShows(people, activeRow(people));

  // Advancing is a separate control, not the portrait plate itself.
  const next = nextControl(people);
  await expect(next).toBeVisible();
  await expect(next).toBeEnabled();
  await expect(next.getByRole('img')).toHaveCount(0);

  // Advancing needs a second bearer to advance to; the rest is still covered.
  test.skip(
    (await peopleRows(people).count()) < 2,
    'a single bearer has no next bearer to advance to',
  );

  // The pointer is off the roster: only the Next control moves the bearer.
  await page.mouse.move(0, 0);
  const activeBefore = (await activeRow(people).textContent()) ?? '';
  await next.click();

  await expect
    .poll(async () => (await activeRow(people).textContent()) ?? '')
    .not.toBe(activeBefore);
  await expect(activeRow(people)).toHaveCount(1);
  await expectPlateShows(people, activeRow(people));
});

test('people: focus and hover point the portrait at that bearer', async ({ page }) => {
  const people = await openPeople(page);
  const portrait = platePortrait(people);

  await expect(portrait.or(people.getByText(PEOPLE_EMPTY)).first()).toBeVisible();
  test.skip(
    (await people.getByRole('img').count()) === 0,
    'content API has no bearers — honest empty state only',
  );

  const rows = peopleRows(people);
  const total = await rows.count();
  test.skip(total < 2, 'focus/hover mapping needs at least two bearers');

  const focusIndex = 1;
  const hoverIndex = (focusIndex + 1) % total;
  const advanceTarget = (hoverIndex + 1) % total;

  // Focus is an activation path: the plate shows that row's portrait.
  await rows.nth(focusIndex).focus();
  await expect(rows.nth(focusIndex)).toHaveAccessibleName(/,\s*Active bearer$/);
  await expectPlateShows(people, rows.nth(focusIndex));

  // Pointer enter is the same activation path on a mouse/trackpad.
  await rows.nth(hoverIndex).hover();
  await expect(rows.nth(hoverIndex)).toHaveAccessibleName(/,\s*Active bearer$/);
  await expectPlateShows(people, rows.nth(hoverIndex));

  // Return to keyboard-only input before stepping the index with Enter.
  await page.mouse.move(0, 0);
  await rows.nth(hoverIndex).focus();
  await expect(rows.nth(hoverIndex)).toHaveAccessibleName(/,\s*Active bearer$/);
  await rows.nth(hoverIndex).press('Enter');

  await expect(rows.nth(advanceTarget)).toHaveAccessibleName(/,\s*Active bearer$/);
  await expect(rows.nth(advanceTarget)).toBeFocused();
  await expectPlateShows(people, rows.nth(advanceTarget));
});

test('people: the plate portrait is a real photo or a drawn placeholder', async ({ page }) => {
  const people = await openPeople(page);
  const portrait = platePortrait(people);

  await expect(portrait.or(people.getByText(PEOPLE_EMPTY)).first()).toBeVisible();
  test.skip(
    (await people.getByRole('img').count()) === 0,
    'content API has no bearers — honest empty state only',
  );

  await portrait.scrollIntoViewIfNeeded();
  await expect(portrait).toBeVisible();

  // The lazy <img> either decodes (real photo) or falls back on error to the
  // drawn monogram — both are honest; a permanent spinner is not.
  const kindOf = (): Promise<string> =>
    portrait.evaluate((el) => {
      if (el.tagName.toLowerCase() !== 'img') return 'placeholder';
      const img = el as HTMLImageElement;
      return img.complete && img.naturalWidth > 0 ? 'photo' : 'pending';
    });

  await expect
    .poll(kindOf, { message: 'the portrait should settle into a photo or a placeholder' })
    .toMatch(/photo|placeholder/);

  if ((await kindOf()) === 'photo') {
    await expect(portrait).toHaveAttribute('alt', /^Portrait of \S+/);
    expect(await portrait.getAttribute('src'), 'a real portrait needs a source').toBeTruthy();
  } else {
    await expect(portrait).toHaveAttribute('role', 'img');
    await expect(portrait).toHaveAccessibleName(/portrait placeholder for \S+/i);
  }

  // Whichever shape it takes, it names the active bearer.
  await expectPlateShows(people, activeRow(people));
});
