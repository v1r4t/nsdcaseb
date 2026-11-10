# Office-bearer deck — design

> Status: shipped.

## Intent

The board is a deck of portrait cards, and nothing else. There is no roster list
underneath: the cards are real buttons, so every bearer is reachable by Tab, and
selecting one enlarges it over a dimmed page. The reference is
`@cuedesign_space`'s card deck, translated into ink-on-paper.

## Goals

- One card per bearer, with the deck as the whole section.
- Click/tap or Enter/Space opens the card enlarged, front and centre, with the
  page dulled behind it.
- Clicking outside the card, pressing Escape, or Close returns to the deck and
  restores focus to the card that opened it.
- No new runtime dependency, no canvas, no WebGL.
- Mobile and reduced motion keep the same content and the same dialog.

## Non-goals

- No randomize/shuffle.
- No roster or separate detail panel; the enlarged card carries the facts.
- No change to the content model, admin upload, or API.
- No new photography.

## Composition

After the section heading and statement:

1. **The deck.** A tilted fan of portrait cards on a fine-pointer desktop
   (≥1024px), a horizontal scroll-snap rail on touch/narrow screens, and a flat
   grid under `prefers-reduced-motion`.
2. **The caption.** One mono line: `Select a card`.
3. **The dialog.** Only while a card is open: a dimmed full-viewport backdrop
   and one enlarged card, with the index, portrait, name, role/class, links and
   a Close control.

```
        ╭────╮
   ╭────╮│ 02 │╭────╮          click 02
   │ 01 │╰────╯│ 03 │   ──►    ┌──────────────────┐
   ╰────╯      ╰────╯          │ 02 / 06          │
                               │ [ portrait ]     │
                               │ Aluvala Sai V.   │
                               │ Vice President   │
                               │ ↗ LinkedIn Close │
                               └──────────────────┘
```

### Card anatomy

- A `<button>`; the visual card is an inner layer, so hover/focus styling never
  changes the hit area.
- Paper ground, hairline border, no shadow. Top-left mono ordinal; a seal
  square appears on hover/focus.
- Face: portrait (`object-cover`, `loading="lazy"`) or the drawn monogram.
- Foot: name in the serif face, role in mono.
- The fan slot is fixed: opening or focusing a card never moves a neighbour.

### Dialog

- `role="dialog"`, `aria-modal="true"`, labelled by the bearer's name and role.
- Backdrop: `bg-ink/45` over the whole viewport; clicking it closes.
- The panel stops click propagation, so clicking the card, links or Close does
  not dismiss it.
- Close is the initial focus; `useFocusTrap` keeps Tab inside the panel.
- Escape closes. Body scroll is locked while open.
- The card flips 180° on open: the front is the portrait plate, the back
  carries the name, role/class, links and Close. 700ms; removed under
  `prefers-reduced-motion`.
- Cards are larger on the fan (220×370) and lift on hover; the fan slot itself
  never changes.

## Accessibility

- Cards are real buttons with `aria-label="<name> — <role>"` and
  `aria-haspopup="dialog"`; Tab reaches every card, Enter/Space opens.
- The dialog is the reading surface: portrait, name, role, class and links are
  plain text/anchors, not images of text.
- Closing restores focus to the opener. The backdrop click is a pointer
  convenience; Escape and Close are the accessible paths.
- Card names/roles use ink/quiet on paper; the dimmed backdrop never sits over
  the dialog panel.

## Responsive

| Viewport | Behaviour |
|---|---|
| ≥1024, fine pointer, motion allowed | Tilted fan; click opens the dialog |
| <1024 or coarse pointer | Horizontal snap rail; tap opens the dialog |
| `prefers-reduced-motion` | Flat 2/3-column grid; click opens the dialog with no entrance animation |

## Data

`bearers` comes from `PeopleList`'s prop (the landing content fetch). An empty
roster keeps the "board has not been published yet" line. A missing portrait
renders the monogram; a broken image falls back to it. All bearers render, so
no one is hidden behind a fan cap.

## Files

- `site/src/components/PeopleList.tsx` — open index, opener ref, focus restore.
- `site/src/components/BearerDeck.tsx` — fan/rail/grid of buttons,
  `fanSpread`/`fanTransform`.
- `site/src/components/BearerDialog.tsx` — backdrop, enlarged card, links,
  Close, focus trap, Escape, scroll lock.
- `site/src/components/BearerPortrait.tsx` — real photo or monogram fallback.
- `site/src/lib/focus-trap.ts` — existing shared Tab trap.

## Verification

- Unit: `fanSpread`/`fanTransform` (angle shrinks with count, slot is stable).
- E2E: no `<ol>` roster; every card exposes a clickable point; click opens the
  dialog with that bearer; backdrop click closes and restores focus; keyboard
  Enter opens, Escape closes, focus returns; phone rail opens a card; reduced
  motion grid opens a card; no horizontal overflow; axe on the open dialog has
  no critical/serious findings.
