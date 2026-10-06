# NSDC — Design System

> Source of truth for the club site. Every build follows this file. Shared design
> context exists so agents produce one consistent visual language instead of
> improvising per page.

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

## TOKENS

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#080808` | page background |
| `--text` | `#F5F5F2` | primary text |
| `--muted` | `#777777` | secondary text, metadata |
| `--border` | `#242424` | 1px hairlines |
| `--accent` | `#FF5A36` | signal orange — CTAs, active states, tiny indicators, hover details |

**Accent discipline:** the accent occupies ≤10% of any viewport. If orange appears
everywhere, it has been overused. Never as a large fill, never in body copy.

## TYPOGRAPHY

- **Display:** Space Grotesk — headlines, statements, nav, major UI
- **Metadata:** Geist Mono — numbers, coordinates, timestamps, `SYSTEM.STATUS` labels, section indices (`01 / ABOUT`)

Both from Google Fonts (self-hosted via the site `<link>`). Two families, no more.

Hierarchy:
- Statements: display, tight tracking (`-0.03em` at large sizes), near-viewport width, left-aligned or deliberately broken — **never centred as a stack of centred lines**
- Section labels: mono, uppercase, `0.2em` tracking, 11–12px, muted
- Body: Space Grotesk, 16–18px, `#F5F5F2` at 70% opacity

## LAYOUT

- 12-column grid, ~1440px max content width, generous gutters
- **Controlled asymmetry is the signature.** Deliberately break alignment; do not
  default to centred stacks or evenly spaced card rows.
- Hairlines (1px `--border`) instead of boxes. Whitespace instead of containers.
- Mobile is designed separately, not a shrunk desktop.

## MOTION

| Tier | Duration | Use |
| --- | --- | --- |
| micro | 150–250ms | buttons, icons, hover |
| ui | 350–500ms | menus, dialogs, image transitions |
| cinematic | 700–1200ms | hero, page-level reveals |

- Consistent easing: `cubic-bezier(0.16, 1, 0.3, 1)` for entrances
- Transform/opacity only. Never `transition: all`.
- Animate intentionally, not decoratively.
- `prefers-reduced-motion: reduce` → all motion collapses to instant/opacity-only

## NAVIGATION

- Full-screen MENU overlay replacing a classic navbar. Large type, index numbers
  (`01 ABOUT`, `02 EVENTS`, `03 MEDIA`, `04 PEOPLE`, `05 ARCHIVE`), hover reveals
  a one-line description.
- Header is minimal: NSDC mark left, `26—27` centre, `MENU` right.

## FOOTER

Tiny. NSDC / Amrita Vishwa Vidyapeetham / Bengaluru, social links, `© 2026`,
`BUILT BY STUDENTS.` No columns of links, no newsletter pitch.

## DATA LANGUAGE

The site speaks data: section indices (`01 / ABOUT`), coordinates
(`12.9716° N, 77.5946° E`), timestamps, statuses (`SYSTEM.STATUS · ONLINE`),
counts (`084 MEMBERS`). This creates identity without extra graphics.

## COPY

Real NSDC content only — real events, projects, people, numbers. No fictional
history, no invented achievements, no futurist filler. Banned phrases are listed
under DO NOT LOOK LIKE. When a fact is missing, the site shows less, not fiction.

## COMPONENTS

- Buttons: sharp (2px radius), accent fill for primary, hairline ghost for secondary
- Forms: dark fields, 1px borders, accent focus ring, mono labels
- Event rows: date + title + type + status dot (`● OPEN`, `● FILLING FAST`,
  `● WAITLIST`, `○ CLOSED`) — no gradients, no cards
- Media: asymmetric grid, varied image sizes, hover growth, immersive lightbox
- Numbers: mono, large, animate 000 → value **once** on first view

## ACCESSIBILITY

- Single `h1`; `h2` per section; semantic lists for timelines/people
- Contrast: never rely on orange alone for state — pair with text
- Visible focus rings (accent), keyboard-operable lightbox and menu
- `prefers-reduced-motion` honoured everywhere