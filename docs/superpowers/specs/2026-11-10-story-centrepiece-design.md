# Story centrepiece — design

> Status: shipped.
> Scope: the centre of the landing story stage (`site/src/components/StoryStages.tsx`)
> plus the data hoist it needs. No other page changes.

## Intent

The landing opens on a three-chapter story over an empty stage centre. The
previous centrepiece — a supplied sculpt, pre-rendered into 36 halftone frames
and scroll-scrubbed — was removed in `b791bf4` with the note that a new
centrepiece is still to be designed. The brief for the replacement is:
**explain the club, and prove it is serious.**

"Serious" here means specific: real names, real dates, real output. Not a mood
piece, not another photograph, not a diagram that could belong to any club.

## Goals

- Fill the stage centre with an object that carries facts about the Amrita
  Bengaluru chapter, not atmosphere.
- Make the facts legible at a glance on desktop and complete in the static
  (phone / reduced-motion) story.
- Keep the existing three-chapter copy and its editorial rhythm.
- Add no runtime dependencies, no canvas/WebGL, no new image weight.
- Degrade honestly when data is missing (never invent a number).

## Non-goals

- No new photography, and no photo in the centrepiece.
- No new admin CMS surface. Every fact comes from data the site already fetches.
- No change to `/archive`, `/projects`, event pages or the admin console.
- No scroll-jacking, no horizontal scroll, no pinned scroll added beyond the
  section's existing ~2.2 viewports.

## Anti-goals

- A generic network graph, globe, particle field or "data rain".
- A stats strip that reads like a dashboard.
- Numbers that could be stale, rounded or invented.
- A centrepiece that only works at 1440px.

## Constraints

- Ink-on-paper design language (`design/`), Bespoke Serif / Switzer / Geist
  Mono, three tones, one easing curve, no shadows.
- Pinned stage is desktop-only today (`min-width: 768px`); phones and
  `prefers-reduced-motion` get `StaticStory`.
- The section already pins for ~2.2 viewports; the centrepiece must not add
  scroll length.
- `Landing` already fetches content, events and media (one fetch each). Projects
  are fetched inside `LandingProjects`.
- Decorative and factual content must remain readable without motion.

## Approaches considered

| # | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | **The record** — a filed ledger in the stage centre, one band per chapter, populated from D1 | Type-only; cheap; facts are the argument. Risk: can read as a stats strip if composed weakly | **Chosen** |
| B | **The network** — an SVG node field of real people/projects/events, lit per chapter | Strong metaphor for chapter 02; needs layout work and an accessible text mirror. Risk: cliché graph, decorative if nodes are not meaningful | Rejected: more cost, weaker "explain" |
| C | **The contact sheet** — a halftone plate of real posters/photos | Strongest raw evidence | Rejected: the brief says fewer photos, and it repeats the imagery-first move that was just reverted |

A wins because the brief is explain-and-prove: specifics in the site's own
typographic register do that better than a diagram or another image plate, and
the mobile/reduced-motion version is the same object.

## The design

### Composition (desktop, motion allowed)

The stage becomes two columns on a 12-column grid:

- **Record (left, cols 1–5).** A single paper panel, top-aligned with the
  chapter area, bordered by hairlines. It holds three bands stacked vertically,
  one per chapter. The panel never moves and never re-mounts; only emphasis
  changes.
- **Chapters (right, cols 7–12).** The existing copy blocks, left-aligned, at
  roughly 12%, 36% and 52% down the stage. Chapter 02 is no longer
  right-aligned; all three share one reading edge.
- **Spine.** A single faint vertical hairline between the columns, running the
  full stage height. It is the only full-height mark; it ties the record to the
  copy without animation.

```
┌──────────────────────────────────────────────────────────────┐
│  Our story                              Scroll — 02 / 03     │
├───────────────────────────┬──────────────────────────────────┤
│ 02 / THE RECORD           │ 02 / STUDENTS, CONNECTED         │
│ ───────────────────────── │ Members, mentors, projects —     │
│ AUG 2024                  │ one network.                     │
│ Chapter founded at        │                                  │
│ Amrita, Bengaluru.        │ Every node is a person doing     │
│ MENTOR          01        │ the work, linked to the people   │
│                           │ beside them.                     │
│ ───────────────────────── │                                  │
│ 2024—26                   │ 12.894702° N, 77.675574° E       │
│ The network.              │                                  │
│ OFFICE BEARERS  05        │                                  │
│ PROJECTS        04        │                                  │
│ ───────────────────────── │                                  │
│ NOW                       │                                  │
│ In the open.              │                                  │
│ EVENTS          11        │                                  │
│ FRAMES FILED    38        │                                  │
└───────────────────────────┴──────────────────────────────────┘
```

All three bands are always visible; the active band is ink and seal, the other
two sit at `text-faint`. This is the "explain" part: a visitor can read the
whole record without scrolling chapter by chapter.

### Bands and data

| Band | Kicker | Claim | Rows | Source |
|---|---|---|---|---|
| 01 | `AUG 2024` | Chapter founded at Amrita, Bengaluru. | `MENTOR` count | the date is constant (`CLUB.founded`); mentor count from fresh `content.bearers` where role matches `/mentor/i`. No `FOUNDERS` row: no structured field holds it, and hand-typing a 4 would re-invent a fact that only lives in prose |
| 02 | `2024—26` | The network. | `OFFICE BEARERS` count · `PROJECTS` count | fresh `content.bearers` **excluding mentors** (so band 01's mentor is not counted twice); projects from the hoisted `listProjects()` |
| 03 | `NOW` | In the open. | `EVENTS` count · `FRAMES FILED` count | events from the existing `listEvents()`; frames = image items across albums (`type === 'image'`), the same total NOW reports |

`FRAMES FILED` must equal the number the NOW section already shows. `Landing`
computes it once (`imageItems(albums).length`) and passes it to both `NowSection`
(replacing `photos.length`) and the record; `NowSection` itself is unchanged.
The archive strip keeps using `archiveSlides(albums, 6)`, because it intentionally
shows at most six frames per album.

Labels are counts, not claims of activity: "EVENTS" is every event on file
(upcoming + past), "FRAMES FILED" is every archive item. Do not label a count
"events run" unless it is filtered to past events.

Each band ends with one link: 01 → `/recruit` ("Join the corps →"), 02 →
`/projects` ("All projects →"), 03 → `/archive` ("Open the archive →"). The
story explains; the links are where the proof lives.

### Data hoist

`Landing` already shares one events fetch between NOW and EVENTS, and one media
fetch between NOW and ARCHIVE. Projects are the exception: `LandingProjects`
fetches them itself. Hoist `listProjects()` into `Landing` the same way and pass
the result to both `LandingProjects` and the story record. One fetch, one error
state, no prop drilling beyond `StoryStages`.

Content needs one more change. `fetchContent()` never rejects: on any failure it
resolves with `FALLBACK_CONTENT`, which is a real-looking six-person roster, so
`Landing` cannot distinguish fresh data from fallback. Add
`loadContent(): Promise<{ content: SiteContent; fallback: boolean }>` to
`site/src/lib/content.ts` and keep `fetchContent` as a thin wrapper over it
(`site/src/lib/search.ts` still calls `fetchContent`). `Landing` uses
`loadContent` and passes `fallback ? null : content.bearers`.

`StoryStages` gains one prop:

```ts
interface StoryFacts {
  bearers: OfficeBearer[] | null;
  events: EventSummary[] | null;
  projects: Project[] | null;
  frames: number | null;
}
```

`null` means "not loaded or failed" and renders `—`. An empty array (or `0`) is
a real zero and renders `0`. The component never fetches.

### States

- **Loading / failed:** rows whose source is null show `—`. Events, projects and
  frames start null. Content is different: `fetchContent` resolves fallback copy
  on failure, so `Landing` must use the new `loadContent()` status; when
  `fallback` is true, `bearers` is passed as null and both roster-derived rows
  show `—`. The bands and claims remain.
- **Empty:** `0` is displayed only when the array is present and empty.
- **Long roster:** band 02 shows counts, never the full roster; the People
  section below already carries the names.
- **Placeholder rows:** the count is every real row the API returns. The
  `[SAMPLE]` event is deleted by migration `0011`; the `[SAMPLE]` media album is
  deleted by the cutover checklist (`docs/production-cutover.md` §2.1). No
  title-pattern filtering in the component.

### Mobile and reduced motion

`StaticStory` keeps the three chapters in order and adds the same record once,
after chapter 03, as a full-width panel with all three bands stacked. No
emphasis animation: every band is fully legible at rest. The spine is omitted
below `lg`.

Because the two-column layout needs width and the record needs height, the
pinned stage moves from `min-width: 768px` to
`(min-width: 1024px) and (min-height: 760px)`. The measured record needs a
707px stage bottom, and 760px leaves room for the serif swap; a short desktop
(1024×640, or 1280×720 with browser chrome) cannot hold three bands plus links
inside `100svh`, so below either threshold the static stack is used. The stage
keeps its existing `overflow-hidden`; the height rule is the only overflow
policy — nothing clips.

### Motion

No scroll-linked drawing. The panel is static; on chapter change the active
band's text colour and its hairline transition over 200ms with the existing
`--ease-ink` curve. Under reduced motion the transition is removed (the
existing global guard already handles this).

### Accessibility

- The stage keeps `aria-label="Our story"`; the record is a real `<section>`
  with an accessible name (`The record`).
- Bands are an ordered list; each band is a `<li>` with a `<p>` kicker, an
  `<h3>` claim and a `<dl>` of label/value rows. Reading order = 01, 02, 03.
- Emphasis is never the only carrier of meaning: all facts are present and
  readable when inactive.
- Decorative marks (seal square, spine) are `aria-hidden`.
- No `aria-live`; chapter changes are driven by scroll and are not a live
  status update.
- Contrast: inactive bands use the existing `text-faint` token, which already
  meets AA on paper for non-body metadata; counts use `text-ink` regardless of
  active state so numbers never drop below AA.

### Photo policy (my call — correct it if wrong)

The earlier reading of "photos should only exist in the events and archive
page" would have removed the bearer portrait plate. I am **not** doing that in
this design, for two reasons: member portraits are the only place a shipped
admin upload (`worker/portraits.ts`, Admin → Content) surfaces, and removing
the display would orphan that feature; and "photos" in this conversation reads
as event photography, not faces. The rule as applied here:

- Archive strip on the landing: **stays** (explicit).
- Bearer portrait plate: **stays**.
- Project covers: **stay** (artefacts, not photography).
- The centrepiece: **no photography at all**.

If portraits should also go, that is a separate change that must also retire
the admin upload; say so and it moves out of this design.

## What is left to the builder

- Exact type sizes and column gutters, within the existing tokens.
- The precise vertical offsets of the three chapter blocks at 1024/1280/1440.
- Whether the spine is a 1px border or a background rule (either is fine).
- Copy for the three claims (the table above sets intent, not final wording).
- The link labels, within the mono style already used on the page.

## Verification

- Unit: a pure `buildRecord(facts)` helper — count/null/empty mapping, mentor
  exclusion from the office-bearer count, image-only frame sum — so the
  component carries no arithmetic.
- Component/e2e:
  - Desktop 1440: all three bands visible; active band follows scroll
    (01 → 02 → 03); no canvas; no horizontal overflow.
  - 1024×800: pinned layout; no overlap between record and chapter copy.
  - 1024×600 and 1280×720: static stack (short-viewport rule), all three bands
    complete, nothing clipped.
  - 900 and 390: static stack, no overflow, numbers readable.
  - Reduced motion: static stack, no transitions.
  - Content API failure: roster rows `—`, events/projects/frames intact.
  - Projects API failure: projects row `—`, other rows intact.
  - Frames: the record and the NOW section show the same number.
  - `axe`: no new violations on `/`.
- Visual: update the story acceptance line in `docs/production-cutover.md`
  §6 (it currently describes the stage centre as empty) once this ships.

## Rollout

One commit for the data hoist + `buildRecord` tests, one for the component.
No migration, no API change, no admin change.
