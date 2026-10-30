# NSDC — Design Reference

The brand, the voice and the rules that do not change. The implementation
details live in the design system itself, not here.

## BRAND

- **NSDC** — National Student Data Corps
- A student technology community at **Amrita Vishwa Vidyapeetham, Bengaluru**
- Publisher voice: editorial, technical, human. Confident, never hyped.

## PERSONALITY

Experimental · Editorial · Technical · Youthful · Confident · Human

## DO NOT LOOK LIKE

- Corporate SaaS
- College club template
- AI-startup landing page ("Building the future…", "Where data meets…", "Unlock your potential", "The next generation…", "Revolutionizing…")
- Generic glassmorphism / bento grids
- Generic cyberpunk (neon-blue-on-black gradient soup)
- Excessive rounded cards (rounded containers only for genuinely interactive things: buttons, inputs, dialogs, registration controls)

## CURRENT SYSTEM

Ink on paper. Three tones and nothing else — **paper** `#F2EEE3`, **ink**
`#111110`, **seal** `#B33C1B`; every mid-tone is one of these thinned, never a
fourth hue. Type is **Bespoke Serif** for display, **Switzer** for text,
**Geist Mono** for data (indices, clocks, statuses, counts). Motion uses one
easing curve, `cubic-bezier(0.16, 1, 0.3, 1)`. The landing is a drawn room
(`RoomScene` + `RoomInstrument`); every other route sits on a static drawn sheet
(`PageScene` motif). No shadows, no dark theme.

Source of truth:

- [`README.md`](./README.md) — components, mounts, the four porting contracts
- [`tokens.css`](./tokens.css) — palette, fonts, base type, reduced-motion guard
- [`tailwind-v3.cjs`](./tailwind-v3.cjs) — Tailwind preset, colours and utilities

The retired dark-editorial mockups are kept for reference in
[`docs/archive/`](../docs/archive/README.md) and are not part of the built site.

## COPY

Real NSDC content only — real events, projects, people, numbers. No fictional
history, no invented achievements, no futurist filler. Banned phrases are listed
under DO NOT LOOK LIKE. When a fact is missing, the site shows less, not fiction.

## ACCESSIBILITY

- Single `h1`; `h2` per section; semantic lists for timelines/people
- Never rely on seal alone for state — pair it with text or shape
- Visible focus rings, keyboard-operable lightbox and menu
- `prefers-reduced-motion` honoured everywhere
