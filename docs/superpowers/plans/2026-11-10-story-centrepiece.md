# Story Centrepiece Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the landing story stage with a typed record of the club (founded / network / output) that explains it and proves it is serious, without adding photography or runtime.

**Architecture:** A pure `buildRecord(facts)` helper maps D1-backed data to three record bands; a presentational `StoryRecord` renders them. `Landing` hoists the projects fetch, computes the archive frame count once, and passes a `StoryFacts` object to `StoryStages`, which pins a two-column stage at ≥1024×760 and falls back to the static stack otherwise.

**Tech Stack:** React 19, TypeScript strict, Tailwind 3, Vitest + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-story-centrepiece-design.md`

## Global Constraints

- No new dependencies; no `three`, canvas or WebGL in the story.
- Ink-on-paper tokens only (`text-ink`, `text-quiet`, `text-faint`, `text-seal`, `hairline`, `mono`, `font-display`); no shadows.
- Pinned layout only at `(min-width: 1024px) and (min-height: 760px)` and `prefers-reduced-motion: no-preference`; every other case renders the static stack.
- Counts are all-time rows from the API; `null` renders `—`, a present empty array renders `0`. Never invent a number.
- `FRAMES FILED` counts `type === 'image'` items with a non-empty `url`, and must equal the number the NOW section shows.
- Office-bearer count excludes anyone whose `role` matches `/mentor/i`; that person is counted once in band 01.
- The record contains no photography; portraits, project covers and the archive strip are unchanged.
- No API, migration, admin or auth changes.

## Review Focus

- **Content API down:** the page must show `—` for roster counts, not the six-person fallback roster's numbers.
- **Short desktop (1024×600):** the third band and its link must not clip; the stage must render the static stack.
- **Empty vs failed:** a successful empty response must render `0`; a failed one must render `—`.
- **Frame consistency:** the record's `FRAMES FILED` and NOW's `frames archived` must never disagree.
- **Chapter/record collision at 1024px:** the record and the chapter copy must not overlap or create horizontal overflow.

---

### Task 1: Content load status

**Files:**
- Modify: `site/src/lib/content.ts:182-207`
- Test: `site/src/lib/content.test.ts` (create)

**Interfaces:**
- Consumes: existing `SiteContent`, `FALLBACK_CONTENT`, `normalize()`.
- Produces: `export interface ContentLoad { content: SiteContent; fallback: boolean }` and `export async function loadContent(): Promise<ContentLoad>`; `fetchContent()` keeps returning `Promise<SiteContent>`.

- [ ] **Step 1: Write the failing test**

```ts
// site/src/lib/content.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_CONTENT, fetchContent, loadContent } from './content';

afterEach(() => vi.unstubAllGlobals());

const ok = (payload: unknown) =>
  vi.fn(async () => ({ ok: true, json: async () => payload }) as Response);

describe('loadContent', () => {
  it('reports fallback: false and the payload on success', async () => {
    vi.stubGlobal('fetch', ok({ sections: [], bearers: [], achievements: [] }));
    const result = await loadContent();
    expect(result.fallback).toBe(false);
    expect(result.content.bearers).toEqual([]);
  });

  it('reports fallback: true on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const result = await loadContent();
    expect(result.fallback).toBe(true);
    expect(result.content).toBe(FALLBACK_CONTENT);
  });

  it('reports fallback: true on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    expect((await loadContent()).fallback).toBe(true);
  });

  it('keeps fetchContent returning content only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(fetchContent()).resolves.toBe(FALLBACK_CONTENT);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run site/src/lib/content.test.ts`
Expected: FAIL — `loadContent` is not exported.

- [ ] **Step 3: Implement `loadContent` and make `fetchContent` delegate**

In `site/src/lib/content.ts`, add the type, rename the current body to `loadContent`, and return `{ content, fallback: true }` on every `markFallback()` path and `{ content: normalize(payload), fallback: false }` on success. Then:

```ts
export async function fetchContent(): Promise<SiteContent> {
  return (await loadContent()).content;
}
```

Keep the 15s abort timer and the existing `markFallback()` calls exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run site/src/lib/content.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/content.ts site/src/lib/content.test.ts
git commit -m "feat(content): report whether fetchContent fell back"
```

---

### Task 2: Record model

**Files:**
- Create: `site/src/lib/story-record.ts`
- Test: `site/src/lib/story-record.test.ts`

**Interfaces:**
- Consumes: `OfficeBearer` from `./content`, `EventSummary` from `./events`, `Project` from `./projects`, `MediaAlbum` from `./media`.
- Produces:
  - `export interface StoryFacts { bearers: OfficeBearer[] | null; events: EventSummary[] | null; projects: Project[] | null; frames: number | null }`
  - `export interface RecordValue { label: string; value: string }`
  - `export interface RecordBand { key: 'founded' | 'network' | 'open'; kicker: string; claim: string; values: RecordValue[]; link: { label: string; to: string } }`
  - `export function buildRecord(facts: StoryFacts): RecordBand[]`
  - `export function imageItemCount(albums: MediaAlbum[] | null): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// site/src/lib/story-record.test.ts
import { describe, expect, it } from 'vitest';
import { buildRecord, imageItemCount, type StoryFacts } from './story-record';
import type { OfficeBearer } from './content';
import type { EventSummary } from './events';
import type { MediaAlbum } from './media';
import type { Project } from './projects';

const bearer = (id: string, role: string): OfficeBearer => ({
  id, name: id, role, cohort: '2025', photo_url: null, links: [], sort_order: 1,
});
const event = { id: 'e1' } as EventSummary;
const project = { id: 'p1' } as Project;
const album = (types: Array<'image' | 'video'>, url = 'x'): MediaAlbum => ({
  id: 'a1', title: 'A', description: '', cover_url: null, event_id: null, sort_order: 1,
  items: types.map((type, i) => ({ id: `i${i}`, type, url, title: '', caption: '', sort_order: i })),
});

const facts = (overrides: Partial<StoryFacts> = {}): StoryFacts => ({
  bearers: [], events: [], projects: [], frames: 0, ...overrides,
});

describe('buildRecord', () => {
  it('renders an em dash for every value when all sources are unknown', () => {
    const bands = buildRecord({ bearers: null, events: null, projects: null, frames: null });
    expect(bands.flatMap((b) => b.values.map((v) => v.value))).toEqual(['—', '—', '—', '—', '—']);
  });

  it('counts the mentor once and excludes it from office bearers', () => {
    const bands = buildRecord(facts({ bearers: [bearer('pres', 'President'), bearer('ment', 'Mentor')] }));
    expect(bands[0].values).toEqual([{ label: 'MENTOR', value: '01' }]);
    expect(bands[1].values[0]).toEqual({ label: 'OFFICE BEARERS', value: '01' });
  });

  it('keeps zero distinct from unknown', () => {
    expect(buildRecord(facts())[2].values).toEqual([
      { label: 'EVENTS', value: '00' },
      { label: 'FRAMES FILED', value: '00' },
    ]);
    expect(buildRecord(facts({ frames: null }))[2].values[1].value).toBe('—');
  });

  it('pads counts to two digits and keeps larger numbers intact', () => {
    const bands = buildRecord(facts({ events: [event, event, event], projects: [project], frames: 190 }));
    expect(bands[1].values[1].value).toBe('01');
    expect(bands[2].values[0].value).toBe('03');
    expect(bands[2].values[1].value).toBe('190');
  });

  it('pins the three band keys and links in chapter order', () => {
    const bands = buildRecord(facts());
    expect(bands.map((b) => b.key)).toEqual(['founded', 'network', 'open']);
    expect(bands.map((b) => b.link.to)).toEqual(['/recruit', '/projects', '/archive']);
  });
});

describe('imageItemCount', () => {
  it('returns null before the media fetch resolves', () => {
    expect(imageItemCount(null)).toBeNull();
  });

  it('counts only image items with a non-empty url', () => {
    expect(imageItemCount([album(['image', 'video', 'image'], 'x'), album(['image'], '')])).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run site/src/lib/story-record.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the model**

`imageItemCount` returns `null` for `null`, else the count of `album.items` where `type === 'image' && item.url.length > 0`. `buildRecord` returns the three bands with these exact strings:

| key | kicker | claim | values | link |
|---|---|---|---|---|
| `founded` | `AUG 2024` | `Chapter founded at Amrita, Bengaluru.` | `MENTOR` | `{ label: 'Join the corps →', to: '/recruit' }` |
| `network` | `2024—26` | `The network.` | `OFFICE BEARERS`, `PROJECTS` | `{ label: 'All projects →', to: '/projects' }` |
| `open` | `NOW` | `In the open.` | `EVENTS`, `FRAMES FILED` | `{ label: 'Open the archive →', to: '/archive' }` |

Format counts with `String(n).padStart(2, '0')`; render `—` when the source is `null`. Mentor = `bearers.filter((b) => /mentor/i.test(b.role))`; office bearers = the complement.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run site/src/lib/story-record.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/story-record.ts site/src/lib/story-record.test.ts
git commit -m "feat(story): derive the record bands from landing data"
```

---

### Task 3: Hoist landing data into one facts object

**Files:**
- Modify: `site/src/pages/Landing.tsx:1-133,232-234`
- Modify: `site/src/components/LandingProjects.tsx:1-82`
- Test: `site/src/components/LandingProjects.test.ts` (create)

**Interfaces:**
- Consumes: `loadContent()` (Task 1), `imageItemCount` / `StoryFacts` (Task 2), existing `listProjects()`.
- Produces: `LandingProjects` becomes `({ projects, error }: { projects: Project[] | null; error: string | null })` and exports `projectsErrorMessage(err: unknown): string`.

- [ ] **Step 1: Write the failing test**

```ts
// site/src/components/LandingProjects.test.ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/projects';
import { projectsErrorMessage } from './LandingProjects';

describe('projectsErrorMessage', () => {
  it('names a network failure', () => {
    expect(projectsErrorMessage(new ApiError(0, 'network_error'))).toContain('Could not reach the server');
  });
  it('uses the generic copy for any other failure', () => {
    expect(projectsErrorMessage(new ApiError(500, 'request_failed'))).toBe('Could not load projects. Please try again.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run site/src/components/LandingProjects.test.ts`
Expected: FAIL — `projectsErrorMessage` is not exported.

- [ ] **Step 3: Implement the hoist**

In `LandingProjects.tsx`: delete the `useEffect`/`useState` fetch, take `projects` and `error` as props, and export the existing error mapping:

```ts
export function projectsErrorMessage(err: unknown): string {
  return err instanceof ApiError && err.error === 'network_error'
    ? 'Could not reach the server. Check your connection and try again.'
    : 'Could not load projects. Please try again.';
}
```

In `Landing.tsx`:

- Replace the content state with `const [contentState, setContentState] = useState<ContentLoad>({ content: FALLBACK_CONTENT, fallback: true })`, call `loadContent()`, and derive `const content = contentState.content`.
- Add the projects fetch (`listProjects()`), storing `Project[] | null` and `projectsError`.
- Replace `const photos = ...` with `const frames = useMemo(() => imageItemCount(albums), [albums])` and drop the now-unused `archiveSlides` import.
- Build `const facts: StoryFacts = { bearers: contentState.fallback ? null : content.bearers, events, projects, frames }`.
- Render `<StoryStages facts={facts} />` and `<LandingProjects projects={projects} error={projectsError} />`.
- Pass `mediaCount={frames ?? 0}` to `<NowSection>`.

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run site/src/components/LandingProjects.test.ts && npm run typecheck:site`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add site/src/pages/Landing.tsx site/src/components/LandingProjects.tsx site/src/components/LandingProjects.test.ts
git commit -m "refactor(landing): share one facts object across the story and sections"
```

---

### Task 4: The record component and the two-column stage

**Files:**
- Create: `site/src/components/StoryRecord.tsx`
- Modify: `site/src/components/StoryStages.tsx` (whole file)
- Test: `site/src/components/StoryRecord.test.tsx` (create)

**Interfaces:**
- Consumes: `RecordBand` (Task 2), `StoryFacts` (Task 3).
- Produces: `export default function StoryRecord({ bands, active }: { bands: RecordBand[]; active?: number })`; `StoryStages` takes `{ facts: StoryFacts }`.

- [ ] **Step 1: Write the failing test**

```tsx
// site/src/components/StoryRecord.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import StoryRecord from './StoryRecord';
import type { RecordBand } from '../lib/story-record';

const bands: RecordBand[] = [
  { key: 'founded', kicker: 'AUG 2024', claim: 'Chapter founded.', values: [{ label: 'MENTOR', value: '01' }], link: { label: 'Join →', to: '/recruit' } },
  { key: 'network', kicker: '2024—26', claim: 'The network.', values: [{ label: 'OFFICE BEARERS', value: '—' }], link: { label: 'Projects →', to: '/projects' } },
  { key: 'open', kicker: 'NOW', claim: 'In the open.', values: [{ label: 'FRAMES FILED', value: '00' }], link: { label: 'Archive →', to: '/archive' } },
];

const html = (active?: number) =>
  renderToStaticMarkup(<MemoryRouter><StoryRecord bands={bands} active={active} /></MemoryRouter>);

describe('StoryRecord', () => {
  it('marks the active band and leaves the others readable', () => {
    const out = html(1);
    expect(out).toContain('data-active="true"');
    expect(out.match(/data-active="false"/g)).toHaveLength(2);
    expect(out).toContain('OFFICE BEARERS');
    expect(out).toContain('—');
  });

  it('renders every band at rest when no active index is given', () => {
    expect(html().match(/data-active="true"/g)).toHaveLength(3);
  });

  it('is a labelled region with links to the three destinations', () => {
    const out = html(0);
    expect(out).toContain('aria-label="The record"');
    expect(out).toContain('href="/recruit"');
    expect(out).toContain('href="/projects"');
    expect(out).toContain('href="/archive"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run site/src/components/StoryRecord.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StoryRecord`**

```tsx
import { Link } from 'react-router-dom';
import type { RecordBand } from '../lib/story-record';

interface StoryRecordProps {
  bands: RecordBand[];
  /** Zero-based active band. Omit to render all bands at rest. */
  active?: number;
}

export default function StoryRecord({ bands, active }: StoryRecordProps) {
  const fallback = active === undefined;
  return (
    <section aria-label="The record" className="border-t hairline pt-4">
      <p className="mono text-seal">The record</p>
      <ol className="mt-4">
        {bands.map((band, index) => {
          const on = fallback || index === active;
          return (
            <li
              key={band.key}
              data-band={band.key}
              data-active={on ? 'true' : 'false'}
              aria-current={on ? 'step' : undefined}
              className={`border-b hairline py-5 transition-colors duration-200 ${on ? 'text-ink' : 'text-faint'}`}
            >
              <p className="mono">{band.kicker}</p>
              <h3 className="mt-2 font-display text-xl leading-snug tracking-tight">{band.claim}</h3>
              <dl className="mono mt-3 space-y-1">
                {band.values.map((v) => (
                  <div key={v.label} className="flex items-baseline justify-between gap-4">
                    <dt>{v.label}</dt>
                    <dd className="text-ink">{v.value}</dd>
                  </div>
                ))}
              </dl>
              <Link to={band.link.to} className="mono mt-3 inline-block text-quiet hover:text-seal">
                {band.link.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

Use the design tokens; adjust only spacing if the stage needs it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run site/src/components/StoryRecord.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewire `StoryStages`**

- Add `facts: StoryFacts` to props; pass it to both layouts.
- Replace `DESKTOP_QUERY` with `const PINNED_QUERY = '(min-width: 1024px) and (min-height: 760px)'`.
- `PinnedStory`: inside the sticky stage, after `StoryHeader`, use `grid grid-cols-12 gap-x-6`; left column `col-span-5 self-start` holds `<StoryRecord bands={bands} active={active} />`; right column `col-span-6 col-start-7 relative border-l hairline pl-6` holds the three absolute chapter articles. Keep the existing vertical placements (10%, 32%, 46%) and fade/slide; make all three enter from the right (`translate3d(84px, 0, 0)`), since the record sits to their left.
- Drop the `right`/right-alignment branch from `Stage`; keep the coordinates under chapter 02.
- `StaticStory`: render the three chapters, then `<StoryRecord bands={bands} />` after chapter 03 as a full-width panel.
- Put `data-layout={pinned ? 'pinned' : 'static'}` on the root section for tests.
- Build `bands` once per render: `const bands = buildRecord(facts)`.

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck:site && npm run build:site`
Expected: PASS; entry chunk grows by only the small record component (no new chunk over 10 kB).

- [ ] **Step 7: Commit**

```bash
git add site/src/components/StoryRecord.tsx site/src/components/StoryRecord.test.tsx site/src/components/StoryStages.tsx
git commit -m "feat(site): fill the story stage with the club record"
```

---

### Task 5: E2E coverage and doc truth

**Files:**
- Modify: `e2e/landing-interactions.spec.ts:36-90`
- Modify: `docs/baseline.md:49-54`
- Modify: `docs/production-cutover.md` §6 (the StoryStages sentence)
- Test: the same e2e file

**Interfaces:**
- Consumes: everything above; `data-layout`, `data-band`, `data-active` are the test hooks.

- [ ] **Step 1: Extend the story assertion**

In `expectStoryStages`, after the 01/02/03 marks, add:

```ts
const record = story.getByRole('region', { name: 'The record' });
await expect(record).toBeVisible();
for (const band of ['founded', 'network', 'open']) {
  await expect(record.locator(`[data-band="${band}"]`)).toHaveCount(1);
}
await expect(record.getByText('OFFICE BEARERS')).toBeVisible();
await expect(record.getByText('FRAMES FILED')).toBeVisible();
```

- [ ] **Step 2: Add the layout and failure tests**

```ts
test('pins the record beside the chapters at a tall desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-layout="pinned"]')).toHaveCount(1);
});

test('falls back to the static stack on a short desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/');
  await expect(page.locator('[data-layout="static"]')).toHaveCount(1);
});

test('shows em dashes, not fallback roster numbers, when content fails', async ({ page }) => {
  await page.route('**/api/content', (route) => route.abort());
  await page.goto('/');
  const record = page.getByRole('region', { name: 'The record' });
  await expect(record.getByText('MENTOR').locator('..')).toContainText('—');
  await expect(record.getByText('OFFICE BEARERS').locator('..')).toContainText('—');
});

test('the record and NOW report the same frame count', async ({ page }) => {
  await page.goto('/');
  const recordFrames = await page
    .getByRole('region', { name: 'The record' })
    .getByText('FRAMES FILED').locator('..').textContent();
  const nowFrames = await page.getByText(/frames archived/).textContent();
  const digits = (text: string | null) => (text ?? '').replace(/^0+(?=\d)/, '').match(/\d+/)?.[0];
  expect(digits(recordFrames)).toBe(digits(nowFrames));
});
```

Place the viewport tests inside the normal-motion describe; keep the 390px check in `mobile-layout.spec.ts` (add `[data-layout="static"]` there only if needed).

- [ ] **Step 3: Run the e2e story spec**

Run the local stack from `README.md` (migrations, `wrangler dev` on :8787), then:
`npx playwright test -c e2e/playwright.config.ts landing-interactions --project=chromium`
Expected: PASS. If `frames archived` is absent because the archive is empty, seed media or skip that assertion behind a `test.skip` on an empty response — do not weaken it to always pass.

- [ ] **Step 4: Update the two docs**

- `docs/baseline.md:49-54`: replace "The centre of the stage is empty by design for now — a new centrepiece is still to be chosen." with a two-line description of the record (three bands, left column, no canvas) and change "02 from the right and 03 from the left" to "all three enter from the right".
- `docs/production-cutover.md` §6: replace "StoryStages 01/02/03 with the stage centre as shipped in `StoryStages.tsx` (empty until the new centrepiece lands; no globe or canvas)" with "StoryStages 01/02/03 with the typed record panel (no globe or canvas)".

- [ ] **Step 5: Run the full gates**

Run: `npx tsc -b && npm run typecheck:site && npx tsc -p worker --noEmit && npx tsc -p e2e --noEmit && npm test && npm run build:all`
Expected: all pass; no new warnings.

- [ ] **Step 6: Commit**

```bash
git add e2e/landing-interactions.spec.ts docs/baseline.md docs/production-cutover.md
git commit -m "test(story): cover the record, breakpoints and failure states"
```

---

## Self-Review

- Spec coverage: record bands and data mapping → Tasks 2–4; `loadContent` fallback signal → Tasks 1 and 3; projects hoist → Task 3; breakpoint + static stack → Task 4; photo policy → unchanged code, documented in the spec; verification → Task 5.
- Type consistency: `StoryFacts`, `RecordBand`, `loadContent`, `imageItemCount`, `projectsErrorMessage` are defined once and consumed by name in later tasks.
- Review Focus tests: content failure (Task 5 step 2), short desktop (Task 5 step 2), zero vs unknown (Task 2), frame consistency (Task 5 step 2), 1024 collision (Task 5 step 2 pinned test; axe in CI covers overflow).
- Proportion: five tasks, one component and two small libs; no task restates a body the tests determine.
