# NSDC Site Easter Eggs — Plan v2

> Status: planned, not started.
> Theme: “The Signal Trail” — a short discoverable chain plus a few independent, touch-friendly eggs.
> The existing hidden `/admin` door remains untouched. No egg may hint at it.

## Goals

- Reward curiosity without adding clutter or slowing the site.
- Work on desktop and touch devices.
- Respect `prefers-reduced-motion`.
- Never block navigation, overflow the layout, or steal focus.
- Keep eggs removable and centrally owned, not scattered through page components.

## Recommended set

| # | Egg | Trigger | Payoff | Effort |
|---|---|---|---|---|
| 1 | Console calling card | Page load | Styled console note: `BUILD · LEARN · SHIP` plus “Curious? Type nsdc in the command palette.” | S |
| 2 | Palette signal | Type `nsdc` in the ⌘K palette | A mono “SIGNAL FOUND” line: “BUILD → LEARN → SHIP. Type it, or tap here.” The line is tappable on mobile. | S–M |
| 3 | Ship sequence | Type `build` → `learn` → `ship` outside an input, or tap the palette line | Thin orange sweep across the page + toast “SHIPPED.” + marquee item briefly becomes `SHIPPED`. Reduced motion gets the toast only. | M |
| 4 | 404 field notes | Tap/click the “Error / Route not resolved” label on any 404 | Cycles deadpan lines: “We checked twice.” → “Definitely not here.” → “Try the menu.” Then resets. The `0` stays inert except on `/admin`. | S |
| 5 | Tab-away title | Switch tabs | Title becomes `Still building — NSDC`; restores on return. | S |
| 6 | Coordinates → map | Tap the coordinates in the full-screen menu | Opens the campus location in Maps, with cursor label `OPEN MAP →`. | S |

Estimated total: roughly one day including tests.

### Why this set

- Eggs 1 → 2 → 3 form a discoverable trail: console hint → palette secret → physical payoff.
- Eggs 4 and 6 work on touch and have no keyboard dependency.
- Egg 5 is cheap, classic, and does not interfere with anything.
- None of them modify content permanently or touch the admin disguise.
- The set stays small enough to feel intentional rather than noisy.

---

## Egg 1 — Console calling card

On page load, print a styled console message:

```text
NSDC — National Student Data Corps
BUILD · LEARN · SHIP

Curious? Type `nsdc` in the command palette (⌘K).
```

Notes:

- Use `console.log` with `%c` styles matching the site palette.
- Keep it text-only; no giant ASCII art.
- Do not mention `/admin`.
- Fires once per page load (not per route).
- Implementation: `site/src/main.tsx` or the central eggs controller.

---

## Egg 2 — Palette signal

Exact-match secret lines, case-insensitive. These are **not** search results; they render as a single mono line above the result list so normal search remains clean.

| Query | Line |
|---|---|
| `nsdc` | `SIGNAL FOUND — BUILD → LEARN → SHIP. Type it, or tap here.` |
| `42` | `Not the answer. Good question though.` |
| `hello` | `Hello, builder.` |
| `jadal` | `3rd place, IEEE-CIS Hackathon. See Projects.` |
| `ship` | `Almost. The trail is BUILD → LEARN → SHIP.` |
| `admin` | No secret line — keep the disguise intact. |

Implementation:

- `secretLineFor(query)` in `site/src/lib/easter-eggs.ts`.
- Only exact matches (trimmed, lowercased) trigger.
- `CommandPalette.tsx` renders the line when present.
- The `nsdc` line is a `<button>` so mobile users can tap it to trigger Egg 3.
- The line is announced politely, not focus-stolen.

---

## Egg 3 — The ship sequence

Sequence: `build` → `learn` → `ship`.

Detection:

- Maintain a rolling buffer of recent characters.
- Normalize to lowercase; trigger when the buffer ends with `buildlearnship`.
- Timeout: reset if the full sequence takes longer than ~8 seconds.
- Ignore when focus is in `input`, `textarea`, `select`, or `contenteditable`.
- Ignore when modifier keys are held.
- Trigger once per session via `sessionStorage` key `nsdc:shipped`.

Payoff:

1. A thin orange line sweeps across the viewport once.
2. A mono toast appears bottom-right: `SHIPPED.`
3. If the landing marquee is mounted, one `SHIP` item becomes `SHIPPED` for ~8 seconds.

Reduced motion:

- No sweep, no marquee movement; show the toast only.
- The toast itself uses a simple fade, disabled under reduced motion.

Mobile path:

- Tapping the `nsdc` palette line triggers the same payoff.
- No mobile-only hidden gestures required.

---

## Egg 4 — 404 field notes

Make the “Error / Route not resolved” label interactive.

Behavior:

- Render it as a `<button>` styled like the existing label.
- `aria-label="More about this error"`.
- On tap/click, cycle through:

```text
Error / Route not resolved
Error / We checked twice.
Error / Definitely not here.
Error / Try the menu.
```

- After the last line, return to the first.
- No animation required; an instant text swap is fine.
- The `404` digits themselves stay decorative.
- On `/admin`, the `0` remains the only secret entrance; the label egg does not affect it.

This keeps the egg accessible and touch-friendly without turning the decorative `404` into a button.

---

## Egg 5 — Tab-away title

- Listen to `document.visibilitychange`.
- When hidden: `document.title = 'Still building — NSDC'`.
- When visible again: restore the previous title.
- Preserve any route-specific title set by `useDocumentMeta` (future SEO work).
- No motion, no storage, no visible UI.

---

## Egg 6 — Coordinates → map

In `FullscreenMenu.tsx`, the coordinates line:

```text
12.9716° N, 77.5946° E
```

becomes a link to the campus location in Google Maps.

- `target="_blank"` and `rel="noopener noreferrer"`.
- Cursor label: `OPEN MAP →`.
- Keep the same mono label styling.
- Works on mobile and desktop.
- This is a hidden utility, not a joke; it should always be honest about where it goes.

---

## Optional bigger egg (not included by default)

**Konami data rain**

- Trigger: `↑ ↑ ↓ ↓ ← → ← → B A`.
- Payoff: 5–6 seconds of drifting mono glyph columns in signal orange over the backdrop, then clear.
- Requirements:
  - Cap at ~30fps.
  - No Three.js; use a small canvas or CSS transforms.
  - Respect `prefers-reduced-motion` (toast only).
  - Once per session.
- Why deferred: it is a generic egg, adds a render loop, and competes with the site’s restrained editorial style. Add only if a spectacle egg is explicitly wanted.

---

## Architecture

Keep all egg logic out of page components.

### `site/src/lib/easter-eggs.ts`

- `secretLineFor(query: string): SecretLine | null`
- `SHIP_SEQUENCE`, `SHIP_EVENT = 'nsdc:ship'`
- `useShipSequence()` or a framework-free detector mounted by the controller
- session helpers:
  - `hasShipped()`
  - `markShipped()`
- no DOM writes outside the helpers

### `site/src/components/EasterEggs.tsx`

Headless controller mounted once inside `BrowserRouter`:

- installs the key-sequence listener,
- installs the visibility title listener,
- renders `<SignalToast />` and `<SignalSweep />`,
- removes all listeners on unmount.

### `site/src/components/SignalToast.tsx`

- Fixed bottom-right, mono, signal-orange accent.
- `aria-live="polite"`.
- Auto-dismiss after ~4s.
- `pointer-events-none`.
- No layout impact.
- Reduced-motion safe.

### `site/src/components/SignalSweep.tsx` (or CSS in `index.css`)

- Fixed, full-width 1px orange line.
- One transform animation, then unmount.
- `aria-hidden="true"`, `pointer-events-none`.
- Skipped under reduced motion.

### `site/src/App.tsx`

Mount `<EasterEggs />` once, inside `BrowserRouter`, so palette events and navigation are available.

### `site/src/lib/search.ts` + `site/src/components/CommandPalette.tsx`

- Add `secretLineFor` call.
- Render the line above results.
- Keep normal matching untouched.
- Ensure no secret line appears for partial queries.

### `site/src/pages/NotFound.tsx`

- Convert the error label into a button with a small message index.
- Keep the existing `onZero` behavior unchanged.

### `site/src/components/FullscreenMenu.tsx`

- Convert the coordinates `<p>` into an `<a>`.

---

## Guardrails

- Ignore the key sequence in form fields and contenteditable regions.
- Respect `prefers-reduced-motion` for every animated payoff.
- No permanent mutations; only `sessionStorage` flags.
- No new network requests.
- No Three.js, no heavy canvas work in the default set.
- No toast or sweep may cover navigation or capture pointer events.
- The 404 egg must never mention or reveal `/admin`.
- Secret palette lines must be exact matches and must not pollute normal results.
- All eggs must be inert on repeat visits within the same session where specified.

---

## Verification

### Unit tests

- `secretLineFor`:
  - exact matches work,
  - case/whitespace normalized,
  - partial matches do not trigger,
  - `admin` returns nothing.
- Ship detector:
  - correct sequence triggers,
  - wrong key resets,
  - timeout resets,
  - input/textarea/contenteditable focus is ignored.
- 404 label cycles and wraps.

### Component tests

- Command palette shows the signal line only for exact matches.
- `nsdc` line is a button and triggers the ship event.
- Toast appears and auto-dismisses.
- Reduced-motion mode renders no sweep.

### E2E

- Console message exists on load.
- `nsdc` in ⌘K shows the line.
- Keyboard sequence shows `SHIPPED.`.
- Tapping the palette line shows `SHIPPED.`.
- 404 label cycles through all four lines.
- Tab title changes and restores.
- Coordinates link opens the correct map URL.
- Mobile 390px: palette line tappable, 404 label tappable, no layout shift.
- Refresh does not replay one-shot payoffs that are session-flagged.

---

## Out of scope

- Any change to the `/admin` disguise.
- Adding secrets to the admin dashboard.
- Analytics or tracking of egg usage.
- Sound effects.
- Persistent cross-session unlocks beyond `sessionStorage`.
- Changes to event, registration, email, or SEO plans in `plan_v1.md`.
