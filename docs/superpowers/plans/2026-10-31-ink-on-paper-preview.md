# Ink-on-paper preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark editorial system on `site/` with the `design/` ink-on-paper kit without changing routes, data, auth, admin, search or accessibility.

**Architecture:** The kit is imported from repo-root `design/` by the Vite/Tailwind-3 app in `site/`. A fixed `RoomScene` (landing) or `PageScene` (other routes) owns the paper ground; pages are transparent compositions over it. Foundation (tokens, Tailwind, shell, chrome) lands first, then page and component work runs in parallel by file ownership.

**Tech Stack:** Vite 8, React 19, TypeScript strict, Tailwind 3, React Router 7, GSAP 3.15, kit CSS/components.

**Spec:** `docs/superpowers/specs/2026-10-31-ink-on-paper-preview-design.md`

## Global Constraints

- Palette: paper `#F2EEE3`, ink `#111110`, faint `#67635A`, seal `#B33C1B`, quiet `#5F5B53`, footer-muted `#98968F`, footer-accent `#DD7048`.
- Type: Bespoke Serif (`font-display`, `font-serif`), Switzer (`font-sans`), Geist Mono (`font-mono`, `.mono`).
- Seal ≤10% of any viewport. Never a large fill, never body copy.
- No shadows. Rounded corners only on genuinely interactive controls (2px).
- Transparent page/section backgrounds; the scene owns the ground.
- `prefers-reduced-motion` honoured everywhere.
- Do not touch `package.json`, `src/` (teaser app), `worker/`, `supabase/`, `e2e/` seeds.
- Shared files are frozen during parallel work: `site/tailwind.config.js`, `site/src/index.css`, `site/src/a11y-eggs.css`, `site/src/App.tsx`, `site/src/main.tsx`, `site/index.html`, `design/**`, `public/**`.

## Review Focus

- A route left with cream-on-cream text after the paper/ink inversion.
- Real archive/event media replaced by kit placeholders.
- Accessible names (`Archive photos`, `Next photo`, `Open the archive`) lost during re-skin.
- Contrast below AA for quiet/paper and seal/paper small text.
- Admin tables/forms unreadable or unusable in light mode.

---

## Shared contract for all tasks

### Class mapping

| Old | New |
|---|---|
| `bg-ink` (page ground) | `bg-paper` |
| `text-paper` (on paper) | `text-ink` |
| `text-paper/xx` (on paper) | `text-ink/xx` |
| `text-muted` (on paper) | `text-quiet` |
| `border-line` | `border` + `hairline` (or `border-[color:var(--hairline)]`) |
| `signal` (bg/text/border/ring/decoration) | `seal` |
| `label` | `mono` |
| `shell` | `wrap` |
| `font-display` on body/UI copy | `font-sans` |
| `font-display` on headings/statements | keep (now Bespoke Serif) |

Ink slabs (footer, announcement banner, primary buttons) keep `bg-ink text-paper`
and use `text-footer-muted` / `border-paper/20`.

### Kit imports

```ts
import { Header } from "../../../design/chrome/Header";
import { Footer } from "../../../design/chrome/Footer";
import { PageScene } from "../../../design/motifs/PageScene";
import { Row } from "../../../design/primitives/Row";
```

Adjust the relative depth per file. Never edit `design/**` (foundation already
adapted font URLs).

### Definition of done for every task

- Only the files assigned in the task were edited.
- `git diff --stat` shows no shared-file changes.
- Copy, data fetching, handlers, route params and accessible names preserved.
- Reduced motion still renders readable content.
- Return: summary + files changed + anything you had to leave.

---

## Task 0: Foundation (coordinator, do first)

**Files:**
- Modify: `site/tailwind.config.js`, `site/src/index.css`, `site/src/a11y-eggs.css`, `site/src/App.tsx`, `site/src/main.tsx`, `site/index.html`, `design/tokens.css`, `design/chrome/Header.tsx`
- Create: `site/src/components/HeaderActions.tsx`, `site/src/components/PreloaderGate.tsx`
- Delete: `site/src/tokens.css`
- Copy: `design/brand/*.png` → `public/brand/`; `design/fonts/*.woff2` → `public/fonts/`

- [x] Tailwind 3 preset with kit colours/fonts/utilities and `../design/**/*.{ts,tsx}` content.
- [x] `index.css` imports `design/tokens.css` + `design/components.css`, rewrites base and components for light.
- [x] `a11y-eggs.css` light.
- [x] Assets and stable-path fonts; `index.html` theme-color + preloads.
- [x] App shell: scene switch, kit Header (with `actions`), kit Footer, PreloaderGate, Cursor; remove Backdrop/ContextCursor/FullscreenMenu/FolioRail.
- [x] `npm run typecheck:site` passes.

## Parallel tasks (independent file ownership)

### Task 1: Landing
Files: `site/src/pages/Landing.tsx`, `site/src/components/StorySequence.tsx` (new), `site/src/components/DossierStages.tsx` (new)
- Room is mounted globally; landing sections transparent.
- Adapt origin copy (`StorySequence`) and globe stages (`DossierStages`) exactly per spec.
- Keep `fetchContent`, `listEvents`, `listMedia`, `loadSiteState`, `useDocumentMeta`, empty states.
- Use `RisingText`, `Reveal`, `SectionIndex`, `StatusDot`, host media components.

### Task 2: Events list
Files: `site/src/pages/Registrations.tsx`, `site/src/components/EventRows.tsx`, `site/src/components/SeatMeter.tsx`, `site/src/components/StatusDot.tsx`
- Keep `statusFor` semantics, FILLING FAST / REGISTERED / WAITLISTED, filters, empty states.
- Kit `Row` / `SectionIndex`; seal dot + text.

### Task 3: Event detail
Files: `site/src/pages/EventDetail.tsx`, `site/src/components/ShareEvent.tsx`
- Keep registration flow, waitlist, capacity, lightbox, share, seats logic.

### Task 4: Archive
Files: `site/src/pages/Archive.tsx`, `site/src/components/ArchiveTeaser.tsx`
- Keep real Supabase media, `srcSet`, video, carousel, lightbox.
- Preserve names: `Archive photos`, `Next photo`, `Open the archive`.

### Task 5: Projects
Files: `site/src/pages/Projects.tsx`, `site/src/components/ProjectStrip.tsx`

### Task 6: Project detail
Files: `site/src/pages/ProjectDetail.tsx`

### Task 7: Recruit
Files: `site/src/pages/Recruit.tsx`

### Task 8: Auth entry
Files: `site/src/pages/Login.tsx`, `site/src/pages/AdminDoor.tsx`, `site/src/components/PasswordField.tsx`

### Task 9: Auth + edge pages
Files: `site/src/pages/Register.tsx`, `site/src/pages/ResetPassword.tsx`, `site/src/pages/VerifyEmail.tsx`, `site/src/pages/VerifyPending.tsx`, `site/src/pages/NotFound.tsx`

### Task 10: Command palette
Files: `site/src/components/CommandPalette.tsx`
- Keep ⌘K/Ctrl-K, events, focus trap, search index, result labels; light panel.

### Task 11: Eggs and signals
Files: `site/src/components/EasterEggs.tsx`, `site/src/components/SignalToast.tsx`, `site/src/components/SignalSweep.tsx`

### Task 12: Announcement, social, stat, testimonials
Files: `site/src/components/AnnouncementBanner.tsx`, `site/src/components/SocialLinks.tsx`, `site/src/components/Stat.tsx`, `site/src/components/Testimonials.tsx`

### Task 13: Landing section components
Files: `site/src/components/NowSection.tsx`, `site/src/components/PeopleList.tsx`, `site/src/components/PosterBand.tsx`, `site/src/components/CornerMarks.tsx`, `site/src/components/Reveal.tsx`
- `Reveal` may delegate to kit `Reveal`; keep the existing import surface used by pages.

### Task 14: Admin I
Files: `site/src/components/admin/AdminAccounts.tsx`, `AdminOverview.tsx`, `AdminRegistrations.tsx`

### Task 15: Admin II
Files: `site/src/components/admin/AdminContent.tsx`, `AdminProjects.tsx`, `AdminRecruitment.tsx`

### Task 16: Admin III
Files: `site/src/components/admin/AdminEvents.tsx`, `AdminEmail.tsx`

### Task 17: Admin IV
Files: `site/src/components/admin/AdminMedia.tsx`, `site/src/components/admin/RichTextEditor.tsx`

### Task 18: Admin shell
Files: `site/src/pages/Admin.tsx`

## Task 19: Integration and verification (coordinator)

- [ ] Full class sweep for leftovers: `rg 'bg-ink|text-paper|text-muted|border-line|signal|font-display' site/src`
- [ ] `npm run typecheck:site`
- [ ] `npm run build:site`
- [ ] `npm test`
- [ ] `npm run test:e2e` against wrangler dev
- [ ] Manual route pass (all routes, 320px, reduced motion, keyboard, contrast)
- [ ] Remove unused components/fonts; update README stack line; retire `design/design.md`
