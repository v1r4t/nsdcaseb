# Office-bearer deck — design

> Status: proposed, awaiting approval.
> Scope: the People section on the landing (`PeopleList` / `PeoplePreview`).
> Chosen approach: A, the restrained 3D paper deck.

## Intent

The office bearers are currently an editorial index paired with a sticky portrait
plate: readable, but static. The reference is `@cuedesign_space`'s card deck — a
fan of portrait cards tilted in isometric perspective; hovering lifts a card,
selecting rotates it flat and opens a small detail block.

The brief is that interaction, translated into ink-on-paper: a folio of portrait
plates you can pick from, not a game. It should make the board feel like people
you can meet, while keeping the section's existing factual register.

## Goals

- Make the six bearers the visual centre of the section, not a side plate.
- One card per bearer: portrait when one is on file, the drawn monogram when not.
- Pointer: hover lifts, click selects, detail block updates.
- Keyboard and screen readers keep a first-class path.
- No new runtime dependency, no canvas, no WebGL. Tests use the existing
  Vitest setup; no `@testing-library/react` is added.
- Mobile and reduced motion get a complete, calm version of the same content.

## Non-goals

- No Randomize/Shuffle. The order is the published roster.
- No card back/flip reveal with hidden content; the detail block is always the
  source of truth.
- No change to the content model, admin upload, or API.
- No new photography.

## Anti-goals

- A 3D effect that reads as a game or a gimmick.
- A fan that only works with exactly six cards or at 1440px.
- A pointer-only interaction that hides links from keyboard users.
- Hover as the only way to see a role or link.

## Constraints

- Ink-on-paper: paper fills, hairline borders, no shadows, three tones, one
  easing curve (`--ease-ink`).
- CSS 3D transforms only (`perspective`, `rotateX/Y/Z`, `translate`, `scale`).
- Portraits are optional; the monogram is the fallback and already exists in
  `PeoplePreview.tsx`.
- `prefers-reduced-motion` removes tilt and transitions; touch removes tilt.
- The detail block must show all links as real anchors.

## The design

### Composition (desktop ≥1024, motion allowed)

After the section heading and statement, the section becomes three stacked bands:

1. **The deck.** Full-width band, ~`clamp(340px, 38vw, 520px)` tall, centred.
   Six cards, each ~`190×270`, arranged around a centre point. The deck is
   tilted `rotateX(14deg) rotateZ(-8deg)` inside a `perspective: 1200px`
   container. Each card additionally rotates around its own z-axis by
   `spread = clamp(4, 16, 60 / n)` degrees, with x offsets stepping outward.
2. **The detail block.** A mono/serif block under the deck, aligned to the
   section's text column: `Viewing 03 / 05`, name, role · class, links. On
   ≥1024 it sits to the right of the deck, vertically centred, so the deck and
   the person's facts read as one composition.
3. **The roster.** The existing index, compacted to a two-column list below:
   number, name, role. It is the keyboard and screen-reader control set.

```
        ╭────╮
   ╭────╮│ 02 │╭────╮          deck (tilted paper cards)
   │ 01 │╰────╯│ 03 │
   ╰────╯      ╰────╯          ┌──────────────────────────┐
                               │ VIEWING 02 / 06          │
                               │ Aluvala Sai Vinya        │
                               │ Vice President · 2024    │
                               │ ↗ LinkedIn               │
                               └──────────────────────────┘

   01  Balcha V. Parswanadh   President
   02  Aluvala Sai Vinya      Vice President
   03  Dhruva Vura            Vice President
```

### Card anatomy

- Paper ground, 1px hairline border, no shadow.
- Top-left: mono ordinal (`01`). Top-right: a 6px seal square on the active card.
- Face: portrait (`object-cover`, `loading="lazy"`) or `MonogramPortrait`.
- Foot: name in Besler/serif, role in mono, truncated to two lines.
- Active card: `rotateX(0) rotateZ(0) translateY(-20px) scale(1.06)`, border
  seal, z-index above the fan. Inactive: `opacity: 0.72`.
- Cards are rendered in roster order, so DOM order is reading order.

### Interaction

- **Pointer:** `onPointerEnter` sets the active card and updates the detail block
  silently. Click also selects and is the pointer path that updates the polite
  status line.
- **Keyboard:** the roster buttons are the controls. Arrow keys move the active
  bearer and focus follows; Enter/Space keep today's behaviour (advance to the
  next bearer), so the existing wrap-around and its tests survive. The deck
  mirrors the active bearer and is not a second tab stop (`aria-hidden`
  container, cards `tabIndex={-1}`); the roster is the accessible equivalent.
- **Status:** a polite `role="status"` line announces the viewed bearer only
  for focus/keyboard and click changes — never on pointer hover, so sweeping
  across the deck does not chatter.
- **Links:** the detail block's links are real anchors with the existing
  `aria-label="… (opens in a new tab)"` pattern.

### Responsive and motion

| Viewport | Behaviour |
|---|---|
| ≥1024, motion allowed | Tilted deck + detail block beside it + roster below |
| 768–1023 | Tilted deck, detail block below, roster below |
| <768 or touch | No tilt: horizontal scroll-snap rail of flat cards; tap selects; detail below |
| `prefers-reduced-motion` | No tilt, no transitions: a flat 2/3-column grid of cards; detail block below; roster unchanged |

The rail uses `overflow-x-auto`, `snap-x snap-mandatory`, each card
`snap-center shrink-0 w-[72vw] max-w-[280px]`. No horizontal page overflow.

### Data and fallbacks

`bearers` comes from the existing `PeopleList` prop. An empty roster keeps the
current "board has not been published yet" line. A missing `photo_url` renders
the monogram; a broken image (`onError`) falls back to it, as today.

The fan shows at most **eight** cards. If the active bearer is outside the first
eight, it replaces the last visible slot, so the selected person is always on
the deck; the roster below always lists everyone. `visibleCards(bearers,
active, 8)` owns that rule and is unit-tested.

### Accessibility

- The roster is the only focusable control set; deck cards are pointer shortcuts.
- The active change is announced once via the existing polite status line.
- Colour is never the only signal: the active card also changes border and
  lift; the detail block names the viewed person.
- Reduced motion and touch users never see a tilted or animated deck.
- Contrast: card foot text uses `text-ink` on paper; role uses `text-quiet`.

### Files

- `site/src/components/BearerDeck.tsx` (new) — deck, cards, detail block;
  exports `fanTransform()` and `visibleCards()`.
- `site/src/components/BearerDeck.test.ts` (new) — unit tests for those two
  helpers; no render tests, since rendering is covered by e2e.
- `site/src/components/PeopleList.tsx` — keep the roster/keyboard logic, mount
  the deck, drop the old plate column.
- `site/src/components/PeoplePreview.tsx` — becomes `BearerDetail`, exports
  `MonogramPortrait`; the "Next" button moves to the roster (or stays in the
  detail block as a secondary control).

## What is left to the builder

- Exact card size and spread at 1024/1280/1440; the transform helper owns the
  numbers.
- Whether the detail block sits right of the deck or below it at 1024–1279.
- The card foot's type sizes, within the existing scale.
- Micro-copy for the "Viewing" line.

## Verification

- Unit: `fanTransform(index, active, total)` — spread shrinks as `n` grows, the
  active card is flat and lifted, inactive cards keep their angle.
- Unit: `visibleCards(bearers, active, 8)` — eight or fewer returns all; a
  ninth active bearer replaces the last slot; the returned list keeps roster
  order.
- E2E (1440): hover/click card 02 updates the detail name; keyboard arrows on
  the roster update the deck; no horizontal overflow.
- E2E (390): rail scrolls, tap selects, no page overflow.
- Reduced motion: no `rotateX`/`rotateZ` in the computed transform.
- `axe`: zero new critical/serious violations on `/`.

## Rollout

One commit for the transform helper + tests, one for the component and the
PeopleList integration. No API, migration or admin changes.
