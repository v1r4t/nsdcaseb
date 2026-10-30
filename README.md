# NSDC — National Student Data Corps

The club site for NSDC at Amrita Vishwa Vidyapeetham, Bengaluru.

Two surfaces live in this repo:

| Surface | Worker | Content |
| --- | --- | --- |
| `nsdcaseb.xyz`, `www.nsdcaseb.xyz` | `nsdcaseb` (teaser) | coming-soon page + launch-list signup |
| `preview.nsdcaseb.xyz` | `nsdcaseb-staging` | the full club site |
| production site (prepared) | `nsdcaseb-site` | full site, deployed but not yet attached to the apex |

Production cutover (moving the apex/`www` domains from the teaser to
`nsdcaseb-site`) is planned and rehearsed in
[`docs/production-cutover.md`](docs/production-cutover.md). Until that flip, the
apex intentionally still serves the teaser.

## Stack

- Vite 6 + React 19 + TypeScript (strict)
- Tailwind CSS 3, ink-on-paper design system (`design/README.md`)
- Three.js teaser globe; GSAP-driven room scene and motion on the preview site
- Cloudflare Workers + D1 (SQLite) + KV
- Supabase Storage for event posters and gallery photos
- Resend for outbound email (queued through an outbox + cron sweep)
- Vitest + Playwright (Chromium, Firefox, WebKit) + axe

## Structure

```text
src/                  teaser app (apex until cutover)
  components/Hero.tsx, Loader.tsx, NotifyForm.tsx, …
  three/DataGlobe.ts
site/                 full club site app (builds to dist-site/)
  src/pages/          Landing, Registrations, EventDetail, Recruit, Archive,
                      Projects, ProjectDetail, Media→Archive, Login, Register, Admin
  src/components/     header, palette, room/story sections, archive carousel,
                      admin panels
  src/lib/            typed API clients, auth, search, image variants, eggs
  index.html
worker/               Cloudflare Workers
  index.ts            teaser worker
  staging.ts          full-site router (also used by production config)
  auth*.ts            auth, sessions, rate limits, PBKDF2, email tokens
  events.ts           events, registrations, waitlist, posters
  media.ts            albums, items, photo uploads
  projects.ts         projects, testimonials, site settings
  recruitment.ts      applications + admin decisions
  admin.ts            admin APIs, broadcasts, outbox, audit log
  notify.ts           shared POST /api/notify
  meta.ts             origin-aware metadata, sitemap, known routes
  email.ts/mailer.ts  templates, outbox, Resend sender
e2e/                  Playwright specs, fixtures, seed SQL
worker/db/migrations/ D1 schema + seed content
docs/                 runbook, baselines, cutover checklist
public/               logo, fonts, OG image, robots.txt
```

## Local development

Full stack (site + API on one port):

```bash
npm ci
npm run build:site
npx wrangler d1 migrations apply nsdc-auth --local -c wrangler.staging.jsonc
npx wrangler dev -c wrangler.staging.jsonc --port 8787 --var E2E_DISABLE_RATE_LIMIT:1
```

- Site: <http://127.0.0.1:8787>
- Teaser only: `npm run dev` (Vite, root app)
- Site with hot reload + API proxy: `npm run dev:site` (Vite on :5174 → :8787)

`wrangler dev` reads local secrets from `.dev.vars` (gitignored). Required for
poster/gallery uploads: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Resend
(`RESEND_API_KEY`) and `ADMIN_ENTRY_CODE` are only needed to exercise admin/email
flows. Scheduled cron does **not** fire automatically in local dev; run it with:

```bash
curl http://127.0.0.1:8787/cdn-cgi/local/scheduled
```

## Environment and secrets

Worker variables:

| Name | Kind | Purpose |
| --- | --- | --- |
| `AUTH_DB` | D1 binding | users, sessions, events, registrations, content, outbox |
| `RATELIMIT_KV` | KV binding | auth/registration rate limits (fail-open) |
| `NOTIFY_KV` | KV binding | launch-list subscribers (`sub:<email>`) |
| `ASSETS` | Assets binding | `dist/` (teaser) or `dist-site/` (site) |
| `MAIL_FROM` | var | sender, e.g. `NSDC <noreply@mail.nsdcaseb.xyz>` |
| `ADMIN_ENTRY_CODE` | secret | shared code required when an `ob` logs in |
| `RESEND_API_KEY` | secret | outbound email |
| `SUPABASE_URL` | secret | storage origin (also used in CSP `img-src`) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | storage writes |

Never commit secret values. `wrangler secret list -c <config>` shows names only.

## Data and media

- **D1**: schema and real content seeds live in `worker/db/migrations/`
  (apply with `npm run migrate:staging`, or `wrangler d1 migrations apply`).
- **Poster variants**: event uploads write `events/{id}/poster.webp` plus
  `poster-thumb.webp` (640w) and `poster-full.webp` (1600w), all WebP.
- **Gallery photos**: Admin → Gallery accepts a photo file (photos only, one at a
  time, 10 MB cap with automatic browser-side compression when larger). Uploads
  write `gallery/{itemId}/photo.webp` plus thumb/full variants. Deleting an item
  or album also removes its storage objects.
- **Bucket**: `event-posters` (public reads, 10 MB cap) in Supabase.
- Existing URL-based gallery items still render unchanged.

## Routes

Public:

```text
/                     landing
/registrations        event index (featured next event, upcoming, archive by year)
/registrations/:id    event detail + registration flow
/recruit              recruitment application + status lookup
/archive              photo/event archive grid (lightbox)
/media                → 301 → /archive (merged)
/projects             project index (featured, filters)
/projects/:id         project detail
/login /register /verify-* /reset-password
```

`/admin` is deliberately a **404** until the middle `0` of the `404` is clicked,
which unlocks the admin console in place. Auth and role checks run server-side.

Admin tabs: Overview, Events, Registrations, Recruitment, Email, Projects,
Gallery, Content, Accounts.

## API overview

Public reads: `/api/events`, `/api/events/:id`, `/api/projects`,
`/api/testimonials`, `/api/content`, `/api/media`, `/api/site`, `/sitemap.xml`,
`/robots.txt`, `POST /api/notify`, `POST /api/recruit`,
`GET /api/recruit/status`.

Auth: `/api/auth/{register,login,logout,me,verify-email,forgot-password,reset-password,...}`.

Admin (`ob` only): `/api/admin/*` (stats, users, outbox retry, broadcast, email
test, audit log), plus content, events, media and project mutations.

Registration rules: college addresses only (`@bl.students.amrita.edu`), 10+
character password with a letter and a digit, one live registration per
event/user, guests identified by registration number, waitlist auto-promotion on
cancellation.

## Email

- Outbound mail goes through `worker/mailer.ts` → Resend. With no
  `RESEND_API_KEY`, messages stay `pending` in `email_outbox` and increment
  attempts until `failed` (max 5).
- The worker cron (`*/15 * * * *`) drains the queue and enqueues day-before
  reminders.
- Admin → Email exposes the outbox, retry, broadcast, audit log, and a
  **Send test email** probe that reports `delivered`, `not-configured`, or a
  provider error.

## Testing

```bash
npm test                 # Vitest unit tests
npm run typecheck:site   # strict TS for the site
npx tsc -b               # root + worker typecheck
npm run build:all        # teaser + site builds

# e2e (needs a worker on :8787; see Local development)
npm run test:e2e                                     # chromium by default
BROWSERS=all npm run test:e2e                        # chromium + firefox + webkit
```

E2E setup notes:

- Install browsers once: `npx playwright install chromium firefox webkit`.
- Rate limits are disabled on the dev server via `--var E2E_DISABLE_RATE_LIMIT:1`
  (test-only; never set this in staging or production).
- Specs seed their own data; `e2e/seed.sql` provides deterministic events.
- Re-runs on the same local database may need cleanup of `rl:` KV buckets and
  test rows — documented in `docs/baseline.md`.

CI (`.github/workflows/ci.yml`): `quality` runs typecheck, both builds and unit
tests; `e2e` builds, migrates/seeds a local D1, starts `wrangler dev`, and runs
Playwright on all three browsers. A manual `deploy-staging` job deploys staging
after e2e succeeds.

## Deploy

Staging:

```bash
npm run migrate:staging                         # remote D1 migrations
npm run deploy:staging                          # build site + deploy nsdcaseb-staging
```

Production site (prepared; domains still on the teaser):

```bash
npx wrangler d1 migrations apply nsdc-auth-prod --remote -c wrangler.production.jsonc
npx wrangler deploy -c wrangler.production.jsonc
```

Production secrets are set with `wrangler secret put <NAME> -c wrangler.production.jsonc`.
The full pre-flight, domain-flip, verification and rollback sequence is in
[`docs/production-cutover.md`](docs/production-cutover.md).

## Content and admin workflows

- **Events**: create with poster + schedule + registration window; edit details,
  questions, capacity, poster; close/reopen; archive/unarchive. Registration
  dates are displayed in IST.
- **Projects**: create/edit/delete, author, stack, links, event association,
  featured flag (featured projects render large; others stay text rows).
- **Gallery**: albums + photos (file upload or legacy URLs), captions, event
  association, ordering.
- **Recruitment**: live open/closed state from `site_settings`, application form,
  admin decision (selected/rejected) with queued email, public status lookup, CSV
  export.
- **Content**: office bearers (with optional professional links), achievements,
  testimonials.
- **Accounts**: roles, verification, CSV/broadcast tooling.

Operational details live in [`docs/runbook.md`](docs/runbook.md). Performance and
accessibility baselines live in [`docs/baseline.md`](docs/baseline.md).

## Licensing

- **Code**: MIT — see [`LICENSE`](LICENSE).
- **Content**: site copy, photography, logo, member details and testimonials are
  © NSDC and excluded from the code licence — see
  [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md).
- **Third-party software**: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
  GSAP is under its own standard licence, not MIT.
- **Fonts**: Bespoke Serif and Switzer (Indian Type Foundry / Fontshare) are
  under the ITF Free Font License; Geist Mono (Vercel) is SIL OFL 1.1. The
  notices are in
  [`public/fonts/FONTSHARE-LICENSE.txt`](public/fonts/FONTSHARE-LICENSE.txt) and
  [`public/fonts/OFL.txt`](public/fonts/OFL.txt). The ITF licence permits
  self-hosting but not modifying or redistributing the font files.

Publishing photos or testimonials requires permission from the people shown or
quoted; keep an internal record of approvals.

## Socials

- Instagram: <https://www.instagram.com/nsdc_avvb/>
- LinkedIn: <https://www.linkedin.com/company/nsdc-avv-b>
- Discord: <https://discord.gg/XeGgzAu93Z>
