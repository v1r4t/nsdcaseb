# NSDC Website — Master Plan

> **Markers:** `idea-me` = idea given by the club · `idea-oc` = idea suggested by the build agent.
> Phases are a suggested order, not a contract — reprioritize freely.

## Current state (live)

- Coming Soon teaser on `nsdcaseb.xyz` + `www.nsdcaseb.xyz` — particle data-globe, loader, socials
- Notify-me launch list → Cloudflare KV (`POST /api/notify`)
- Worker (static assets + API), GitHub `v1r4t/nsdcaseb`
- Standing rules: commit + push after every major build (idea-me) ·
  apex keeps the teaser until launch flip (idea-me)

## Phase 1 — Auth & accounts

- Login page: email + password (idea-me)
- Register page: email, executive-or-not, password, confirm password (idea-me)
- Executive status is **self-declared** at registration (idea-me)
- Roles: member / executive / admin (idea-me)
- Every privileged action re-checked server-side; frontend flags never trusted (idea-oc)
- Password hashing + password strength rules; no plaintext ever (idea-oc)
- Email verification on signup (idea-oc)
- Password reset via email (idea-oc)
- Rate limiting / brute-force protection on auth endpoints (idea-oc)
- Admin 2FA (idea-oc — recommended before launch)
- Session expiry + "remember me" (idea-oc)

## Phase 2 — Landing page (Home)

Minimal single-scroll journey (idea-me):

- About club (idea-me)
- How did we start — origin story (idea-me)
- Achievements (idea-me)
- Current club office bearers (idea-me)
- Extensible: more sections added over time (idea-me)

Enrichments (idea-oc):

- All content stored in D1 — edits without code deploys (idea-oc)
- Scroll-triggered reveal animations matching the teaser's cinematic feel (idea-oc)
- Next-event banner / countdown when a registration is live (idea-oc)
- Testimonials from members (idea-oc)
- FAQ accordion (idea-oc)
- Sponsor / partner strip (idea-oc)
- Newsletter signup reusing the launch-list infrastructure (idea-oc)
- Admin-toggleable announcement banner (idea-oc)

## Phase 3 — Registrations page

- Page active only while an event is ongoing; otherwise "no active registrations" (idea-me)
- Visible nav entry point among the site's main pages (idea-me)
- Server-side gating: closed events reject submissions even via direct URL (idea-oc)
- One-click register for logged-in users; guests prompted to log in (idea-oc)
- Per-event capacity limit + waitlist (idea-oc)
- Per-event custom questions (e.g. food preference, t-shirt size) (idea-oc)
- Confirmation email on successful registration (idea-me — part of automated emails)
- Reminder email ~24h before event (idea-oc)
- Calendar file (.ics) attached to confirmation (idea-oc)
- QR check-in at the event door (idea-oc)
- Payment support for paid events (idea-oc — only if such events happen)
- Past-events archive with outcomes (idea-oc)

## Phase 4 — Media page

- Showcase previous contributions and events (idea-me)
- Albums grouped by event (idea-oc)
- Lightbox viewer + lazy loading (idea-oc)
- Video embeds for event recaps (idea-oc)
- Admin uploads to object storage (R2) (idea-oc)

## Phase 5 — Admin dashboard & email automation

- Start / stop registration windows per event (idea-me)
- Roster: who registered, at a glance (idea-me)
- Automated emails to registered students (idea-me)
  - Sender: `bl.sc.u4cse25155@bl.students.amrita.edu` via Microsoft 365 (idea-me)
- Broadcast composer: email all members or a filtered subset (idea-oc)
- CSV export of registration lists (idea-oc)
- Dashboard stats: signups over time, most popular events (idea-oc)
- Audit log of admin actions (idea-oc)
- Email template editor (idea-oc)
- Post-event certificates to attendees (idea-oc)

## Backlog — beyond the five phases (all idea-oc)

- SEO: meta tags, OpenGraph share cards, sitemap, robots.txt
- Cloudflare Web Analytics — privacy-first, no cookie banner needed
- Custom 404 page
- Security headers (CSP, HSTS) at launch
- PWA: installable, offline fallback for the landing page
- Accessibility pass (WCAG AA — teaser already honors reduced-motion)
- Opportunities board (internships, hackathons, open calls)
- Resource hub (workshop slides, recordings, datasets)
- Member spotlights / project showcases on the landing page
- Seasonal membership applications (open/close like event registrations)

## Environments & launch

- Staging on `preview.nsdcaseb.xyz` — same Worker, host-based routing;
  apex untouched while building (mechanism idea-oc, protects the idea-me requirement)
- Launch flip: apex points at the full site when ready; teaser preserved as a fallback route (idea-me)
- Auto-deploy on push via Workers Builds — config prepped by idea-oc,
  one-time dashboard GitHub connect still pending (idea-me action)

## Locked decisions

| Decision | Value |
| --- | --- |
| Executive status | Self-declared at registration |
| Email sender | `bl.sc.u4cse25155@bl.students.amrita.edu` (Microsoft 365) |
| Stack | Vite + React + TS · Cloudflare Worker + D1 + KV |
| Domains | `nsdcaseb.xyz`, `www.nsdcaseb.xyz` |

## Suggested first build

Phase 1 (auth + roles) — every other phase leans on identity. Staging
hostname gets wired first so production stays on the teaser throughout.
