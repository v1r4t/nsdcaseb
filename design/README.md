# NSDC design system

The colour palette, the type system, the drawn scenes and the motion vocabulary
from the NSDC site, packaged to drop into another React front end. **No pages,
no content, no data layer, no router.** The host supplies those.

The folder is a copy-in template, not an npm package: copy it into the project,
import three stylesheets (two on Tailwind 3), and compose the pieces you want.

```
Design language: ink on paper. Three tones, one easing curve, no shadows.
```

## Install

1. **Copy the folder** into the host, for example `src/design/`.

2. **Copy the brand masks** into the host's public root, so they resolve at
   `/brand/nsdc-symbol.png`, `/brand/nsdc-lockup.png`,
   `/brand/favicon-512.png`, `/brand/apple-touch-icon.png`. `Logo` reads those
   paths directly.

3. **Import the stylesheets**, in this order, after the host's reset:

   ```css
   @import "tailwindcss";
   @source "../path/to/design";   /* only if design/ sits outside the scanned tree */
   @import "../design/tokens.css";
   @import "../design/tailwind-v4.css";
   @import "../design/components.css";
   ```

   `tokens.css` is framework-agnostic: font faces, variables, base rules, the
   reduced-motion guard. `components.css` carries the route-wipe keyframe and
   the Lenis bridge.

4. **Tailwind 3 instead of 4?** Skip `tailwind-v4.css` and use the preset:

   ```js
   // tailwind.config.cjs
   module.exports = {
     presets: [require("./design/tailwind-v3.cjs")],
     content: ["./src/**/*.{ts,tsx}", "./design/**/*.{ts,tsx}"],
   };
   ```

### Peers

| Package | Version | Needed for |
|---|---|---|
| `react` / `react-dom` | 18 or 19 | everything |
| `tailwindcss` | 4 (or 3 with the preset) | layout classes and the custom utilities |
| `gsap` | 3.15+ | the motion components listed below |
| `lenis` | 1.3+ | `lib/smooth.ts` only |

`gsap` and `lenis` are optional at runtime if you take only the static look: the
room, the motifs, the logo and the preloader run without either. TypeScript
still resolves the motion files, so either install both, or delete `motion/`,
`lib/gsap.ts` and `lib/smooth.ts` from the copy.

Tailwind 4 hosts must scan the folder (step 3's `@source`) or the utility
classes used inside the components will not be generated.

## Mount the scene

```tsx
import { RoomScene } from "./design/room/RoomScene";
import { RoomInstrument } from "./design/room/RoomInstrument";
import { PageScene } from "./design/motifs/PageScene";
import { motifFor } from "./design/motifs/motifs";

const motif = motifFor(pathname);

{motif === "room" ? (
  <>
    <RoomScene />
    <RoomInstrument />
  </>
) : (
  <PageScene motif={motif} />
)}
```

`motifFor` is an example route map. Replace it with the host's own mapping, or
pass `motif` directly to `PageScene`.

## Mount the chrome

```tsx
<Header
  nav={[
    { label: "Events", href: "/events" },
    { label: "Recruit", href: "/recruit" },
  ]}
  pathname={pathname}
  dossier="INSIDE · NSDC AMRITA BENGALURU · IST"
/>

<Footer
  club={{
    name: "NSDC - National Student Data Corps",
    chapter: "Amrita Vishwa Vidyapeetham, Bengaluru",
    email: "hello@example.org",
    instagram: "nsdc_avvb",
    linkedin: "nsdc-avv-b",
    discord: "https://discord.gg/nsdc-avv",
    founded: "August 2024",
  }}
/>
```

`Header` and `Row` default to plain `<a>` elements. To use a router link, pass a component
that accepts `href`, `className`, `children`, and the optional `aria-current` /
`data-cursor` attributes:

```tsx
import { Link } from "react-router-dom";

const RouterLink = ({ href, ...props }: { href: string } & Record<string, unknown>) => (
  <Link to={href} {...props} />
);

<Header nav={nav} pathname={pathname} linkComponent={RouterLink} />
```

The header's skip link targets `#main`; render `<main id="main">` around the host's
page content or the link goes nowhere. `Footer` takes no `linkComponent`: its
links are `mailto:` and external URLs.

## Mount the motion

```tsx
<Cursor />        {/* once, at the app root */}
<Preloader />     {/* once, at the app root */}
<Reveal>…</Reveal>
<Marquee items={["BUG TO BREACH", "NEXTMIND 2.0"]} />
<Scramble text="Registrations" />
<Magnetic>…</Magnetic>
<InkUnderline />
```

The headline entrance is its own component:

```tsx
<RisingText
  lines={[
    [{ text: "Data," }],
    [{ text: "drawn", className: "italic text-seal" }, { text: "by" }, { text: "hand." }],
  ]}
/>
```

`RisingText` takes **words**, not React nodes: each word is split into glyphs,
so the text has to be plain strings. It renders an `h1` by default; pass
`as="h2"` for a smaller heading.

Rows and status:

```tsx
<Row index="01" title="Bug to Breach" meta="Mar 2025" href="/events/bug-to-breach" />
<StatusPill phase="OPEN" />
<CapacityMeter registered={412} capacity={960} />
```

## Tree

```
design/
  tokens.css            palette, fonts, base type, reduced-motion guard
  components.css        route wipe, Lenis bridge
  tailwind-v4.css       Tailwind 4 theme + the nine custom utilities
  tailwind-v3.cjs       Tailwind 3 preset and plugin
  fonts/                6 woff2 (Bespoke Serif, Switzer, Geist Mono)
  brand/                logo masks + favicons
  identity/             Logo, Preloader, mark path, morph maths
  room/                 the landing dolly and its readout
  motifs/               the static sheet behind every other route
  chrome/               Header, Footer, ClubClock, RouteWipe
  motion/               Reveal, RisingText, Scramble, Marquee, Magnetic,
                        Cursor, HoverPreview, InkPath, InkUnderline
  primitives/           Row, Field, Dialog, Lightbox, PlateSlider,
                        CapacityMeter, StatusPill, DrawnPlaceholder,
                        SectionIndex
  hooks/                clock, in-view, media query, reduced motion,
                        scroll progress, scroll draw
  lib/                  cn, gsap, smooth, motion, pointer, time
```

## The four contracts

These are the only things that break the port, and they are not optional.

1. **The scene owns the page ground.** `RoomScene` paints `--color-paper` on its
   canvas. A page that paints its own opaque background hides the dolly. Page
   backgrounds must be transparent, or that page gets `PageScene` instead. The
   package ships one ground; the room is light-only by design.

2. **One scroll source.** The engine reads `window.scrollY` by default. If the
   page scrolls inside a nested container, pass that element to both
   `RoomScene` and `RoomInstrument` as `scrollElement` or the camera freezes.

3. **No route transitions.** The dolly *is* the transition. If the router
   animates between routes, cut mid-move and the room breaks. `RouteWipe` is a
   1px header stroke, not a page transition.

4. **Three tones, and nothing else.** `#F2EEE3`, `#111110`, `#B33C1B`. The
   supplied logo is blue; here it is ink on paper and paper on ink. Blue cannot
   enter without becoming a fourth tone.

## Dependencies at a glance

| Export | GSAP | Lenis | Notes |
|---|---|---|---|
| `RoomScene`, `RoomInstrument`, `motifs/*` | — | — | canvas 2D / inline SVG |
| `Logo`, `Preloader` | — | — | rAF only |
| `PageScene` | — | — | |
| `Header`, `Footer`, `ClubClock`, `RouteWipe` | — | — | CSS animation for the wipe |
| `Reveal`, `RisingText`, `Scramble` | yes | — | |
| `Marquee`, `Magnetic`, `HoverPreview` | yes | — | |
| `Cursor` | yes | — | reads `lib/pointer` |
| `PlateSlider` | — | — | transforms, no library |
| `Field`, `Dialog`, `Lightbox`, `Row`, `SectionIndex`, `CapacityMeter`, `StatusPill`, `DrawnPlaceholder`, `InkPath`, `InkUnderline` | — | — | |
| `lib/smooth.ts` | yes | yes | only if the host wants smooth scroll |

## Reduced motion

`RoomScene` renders one still frame, `Preloader` returns `null`, `RisingText`
skips the entrance, `RouteWipe` returns `null`, the scroll-draw hooks report
`1`, and `tokens.css` collapses every transition. Nothing animates for a reader
who asked it not to.

## Deliberately not included

- **Pages and content.** No landing page, event pages, archive, projects,
  recruitment, auth or 404.
- **Routing.** No `react-router`, no `useLocation`, no route transitions.
- **Data.** No content model, seeded records, seat/waitlist logic, store or
  registration IDs.
- **SEO and build.** No route metadata, OG generation, prerender or scripts.
- **Theme switch and sound.** No alternate grounds, no theme transition, no
  audio. The package is one ground and silent.
- **Tests.** The site's test suite stayed with the site.

## Cost

- Canvas: ~200 strokes a frame, 30 fps cap, DPR capped at 1.75, parked when the
  camera settles and on a hidden tab.
- Motifs: inline SVG, no JS, no animation.
- Assets: 6 fonts (~105 kB) + 4 PNG masks (~200 kB).
