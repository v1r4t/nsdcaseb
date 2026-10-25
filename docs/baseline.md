# Baseline — Phase 0 / 5A scaffolding

Date: 2026-10-22. Measured with Node v24.14.0, npm 11.9.0, Vite 8.3.1,
from a fresh `npm run build:site` (see staleness note below).

## site bundle (dist-site/, fresh build)

| Asset | Raw | Gzip |
| --- | --- | --- |
| `assets/index-35_sueNk.js` (main) | 356,165 B (347.8 KB) | 107,157 B (104.6 KB) |
| `assets/GlobeNarrative-DqNWW5kG.js` (lazy) | 543,402 B (530.7 KB) | 135,487 B (132.3 KB) |
| `assets/EventDetail-BVs2F4L1.js` (lazy) | 15,285 B | 3,995 B |
| `assets/AdminEvents-DzVNUd-v.js` (lazy) | 10,405 B | 2,962 B |
| `assets/Media-D6KfkgcX.js` (lazy) | 8,152 B | 2,850 B |
| `assets/AdminEmail-UyWaprGI.js` (lazy) | 5,808 B | 1,951 B |
| `assets/AdminRegistrations-DSyXV-b5.js` (lazy) | 4,659 B | 1,718 B |
| `assets/AdminOverview-BgaHjjZL.js` (lazy) | 4,593 B | 1,777 B |
| `assets/AdminContent-D9odaNZn.js` (lazy) | 4,342 B | 1,120 B |
| `assets/Projects-1uvsl6xJ.js` (lazy) | 4,065 B | 1,622 B |
| `assets/AdminAccounts-JOtuZNxr.js` (lazy) | 3,870 B | 1,230 B |
| `assets/Admin-u6aeKeKC.js` (lazy) | 3,392 B | 1,152 B |
| `assets/index-CaASgeV_.css` | 33,399 B (32.6 KB) | 7,371 B |
| `index.html` | 2.86 KB (vite report) | 0.98 KB |

Lazy chunks (route/component split): GlobeNarrative, EventDetail, Media,
Projects, Admin + AdminAccounts/AdminContent/AdminEmail/AdminEvents/
AdminOverview/AdminRegistrations. Entry `dist-site/index.html` loads only the
main chunk + CSS; the rest load on demand.

## three.js / WebGL probe (string search over dist-site/assets/*.js)

- `WebGLRenderer` / `BufferGeometry`: **absent from main chunk**,
  present only in `GlobeNarrative-DqNWW5kG.js`.
- Code-split already in place: `site/src/components/LazyGlobe.tsx` lazy-loads
  `GlobeNarrative`, which pulls `three` via `lib/narrative-globe.ts`.
  (The comment there says "~871KB"; current minified chunk is ~531KB raw /
  ~132KB gzip. The earlier ~871KB figure matches the *stale* dist-site below,
  where three was still in the main chunk.)

## Staleness note

The `dist-site/` tree present before this run was stale: main
`index-DiA-y40i.js` was 891,625 B raw / 240,839 B gzip **with three.js inside
it**, and the admin/Media chunk set was older/fewer. It did not match current
source. The table above is the fresh-build baseline; `dist-site/` is
gitignored, so the rebuild dirties nothing tracked.

## Test / gate status at baseline

- `npm test` (`vitest run`, jsdom): **42/42 pass** across 3 files
  (`site/src/lib/search.test.ts`: 23, `site/src/lib/events.test.ts`: 12,
  `site/src/components/StatusDot.test.ts`: 7).
- `npx tsc -b` (root): pass. `npm run typecheck:site`: pass at time of
  writing (a concurrent agent fixed two `AdminEvents.tsx` errors mid-run;
  see concerns).
- `npm run build` (root): pass. `npm run build:site`: pass with one
  pre-existing CSS warning (`@import './tokens.css'` after `@tailwind`
  in `site/src/index.css`, out of scope for this phase).
- CI: `.github/workflows/ci.yml` `quality` job runs install → typecheck root →
  typecheck site → build root → build site → unit tests. `e2e` job is a
  skeleton skipped via `hashFiles('e2e/**/*')` until e2e tests exist.

## Lighthouse — TODO (not run in this environment)

No headless Chrome / deployed URL available here; record real numbers before
claiming any perf win. Exact commands:

```bash
# Serve the fresh site build locally (port 4174; no wrangler dev — conflicts
# with parallel agents):
npx vite preview -c site/vite.config.ts --port 4174

# Desktop + mobile audits:
npx -y lighthouse http://localhost:4174/ --preset=desktop \
  --output=json --output-path=./lighthouse-desktop.json \
  --chrome-flags="--no-sandbox --headless"
npx -y lighthouse http://localhost:4174/ \
  --output=json --output-path=./lighthouse-mobile.json \
  --chrome-flags="--no-sandbox --headless"

# After a staging deploy, repeat against the worker URL and also audit a
# lazy route, e.g. /registrations/<id> and /media.
```

Capture on first run: LCP, TBT, CLS, SI, and the transferred size of the main
chunk + the GlobeNarrative chunk on a cold load.

## Lighthouse — 2026-10-23 (served staging stack)

Date: 2026-10-23. Measured with `lighthouse@13.5.0` against the live local
staging stack (`npx wrangler dev -c wrangler.staging.jsonc` on 127.0.0.1:8787,
read-only — no rebuild, no restart). Desktop = `--preset=desktop`, mobile =
default Moto-G-class emulation, `--chrome-flags="--no-sandbox --headless"`.
Detail route uses real id `evt-bug-to-breach` from `/api/events`. This is the
first real Lighthouse run (the 2026-10-22 baseline above was TODO), so there
is no earlier "before" row — treat this table as the before for the
skeleton/dead-code work below.

| Route | Mode | Perf | A11y | BP | SEO | LCP (ms) | CLS | TBT (ms) | FCP (ms) | Transfer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | desktop | 1.00 | 0.86 | 0.92 | 1.00 | 816 | 0.001 | 0 | 467 | 354 KiB |
| `/registrations` | desktop | 0.91 | 0.95 | 0.96 | 1.00 | 542 | **0.188** | 0 | 398 | 215 KiB |
| `/registrations/evt-bug-to-breach` | desktop | 1.00 | 1.00 | 0.96 | 1.00 | 666 | 0.009 | 0 | 442 | 220 KiB |
| `/media` | desktop | 1.00 | 1.00 | 0.92 | 1.00 | 667 | 0.006 | 0 | 443 | 218 KiB |
| `/` | mobile | 0.86 | — | — | — | 3711 | 0.003 | 139 | 2118 | 354 KiB |
| `/registrations` | mobile | 0.80 | 0.95 | 0.96 | 1.00 | 2645 | **0.310** | 9 | 1696 | 215 KiB |
| `/registrations/evt-bug-to-breach` | mobile | 0.93 | — | — | — | 2689 | 0.097 | 15 | 1799 | 220 KiB |
| `/media` | mobile | 0.93 | — | — | — | 2702 | 0.094 | 15 | 1805 | 218 KiB |

(A11y/BP/SEO on the three mobile detail rows were read but not recorded;
perf-relevant columns are complete.)

Diagnosis: `layout-shifts` on mobile `/registrations` attributes ~all of the
0.31 CLS to `<footer class="border-t border-line">` (score 0.310) — the list
popping in under the one-line "Loading events…" pushes the footer down. The
fix (same commit window): `site/src/pages/Registrations.tsx` loading state
now reserves the list area (`mt-12` section + `min-h-[480px]` skeleton with
the same hairline/py-5 row rhythm, `aria-hidden`, `animate-pulse`; the
"Loading events…" text keeps its `aria-live="polite"` home). Measured CLS
above is pre-fix (server serves the pre-existing build — read-only, not
rebuilt); re-run after the next `deploy:staging` to confirm ~0.

Dead-code removals (same window, `tsc -p site` clean, `npm test` 47/47 green):
`updateSection` (`site/src/lib/admin.ts`, zero repo-wide refs — section copy
has no admin UI and is updated via direct `PUT /api/content/sections/:key`),
`mediaErrorMessage` (`site/src/lib/media.ts`, zero repo-wide refs). Kept:
`gsap` (still imported by the production root app `src/components/Hero.tsx`,
built by `npm run build` and served from `wrangler.jsonc`), all
variant/COPY_TODO comments (image pipeline is deferred — do not touch),
`getSite`/`getTestimonials` (used internally by the `load*` wrappers),
`EMPTY_SITE_STATE` (used in `site.ts` normalizers).

## E2E (Playwright) — Phase 5B/5C

- Runner: `@playwright/test ^1.64.1` (devDep), config `e2e/playwright.config.ts`,
  script `npm run test:e2e` (`playwright test -c e2e/playwright.config.ts`).
  No `@axe-core/playwright` — no axe specs were added, so it stays out.
- Specs (7 files, role/label selectors only, no CSS internals):
  `admin-door` (locked 404 -> zero-button unlocks Admin in place, URL stays
  /admin, reload re-locks), `not-found` (/nope plain 404, zero inert),
  `auth` (register -> logout -> login with a unique address per run),
  `guest-registration` (logged-out name + reg_number -> confirmed/waitlisted),
  `required-questions` (empty required answer cannot leave step 2; filled
  answer completes), `capacity-waitlist` (capacity-1: first confirmed, second
  waitlisted, first cancels -> second promoted; two isolated contexts),
  `mobile-layout` (390px: no horizontal overflow, titles span the row),
  `http-status` (/nope + /admin -> 404, / + /media -> 200, HTML shell),
  axe (5 scans, zero critical/serious), hash-navigation, history.
- Hermetic seeding: specs needing D1 data use fixtures in `e2e/fixtures.ts`
  (`plainOpenEvent` / `qEvent` / `tinyEvent`) that discover a matching open
  event via `/api/events` and `test.skip()` with a pointer to the seed when
  none exists — the suite passes on an empty dev DB (seeded specs skip).
  `e2e/seed.sql` creates three deterministic local-only events
  (`e2e-open-plain`, `e2e-open-questions`, `e2e-tiny-cap1`, windows
  2020 -> 2035); never apply to staging/prod.
- Run locally (do NOT start wrangler dev while a sibling owns :8787):
  ```bash
  npm run build:site
  npx wrangler d1 migrations apply nsdc-auth --local -c wrangler.staging.jsonc
  npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc
  npx wrangler dev -c wrangler.staging.jsonc --port 8787 --var E2E_DISABLE_RATE_LIMIT:1
  # in another shell:
  npm run test:e2e            # or: BASE_URL=http://127.0.0.1:8787 npm run test:e2e
  npx playwright test -c e2e/playwright.config.ts --list   # enumerate only
  npx tsc --noEmit -p e2e/tsconfig.json                   # typecheck e2e
  ```
- Re-runs on the SAME local state need cleanup first — local KV rate-limit
  buckets persist (`register:ip` allows 5/hr, event-register 10/15min per
  event) and seed-event registrations fill capacity (e2e-tiny-cap1 has 1 seat):
  ```powershell
  # clear rate-limit buckets
  npx wrangler kv key list --binding RATELIMIT_KV --local --prefix "rl:" -c wrangler.staging.jsonc
  npx wrangler kv key delete --binding RATELIMIT_KV --local "<name>" -c wrangler.staging.jsonc
  # clear e2e test data (seed rows stay; e2e users use college-domain addresses)
  npx wrangler d1 execute nsdc-auth --local --command "DELETE FROM registrations WHERE event_id LIKE 'e2e%'; DELETE FROM users WHERE email LIKE 'auth-%' OR email LIKE 'questions-%' OR email LIKE 'cap-first-%' OR email LIKE 'cap-second-%';" -c wrangler.staging.jsonc
  ```
  CI never needs this (every run starts from cold local state).
- Member e2e flows verify via local D1, not email: `registerViaApi` registers,
  flips `email_verified` with `wrangler d1 execute --local`, then logs in for
  real — so registration gating, verify-pending redirect, and login all run
  through production code paths. Requires cwd = repo root and the 5/hr local
  register budget shared across re-runs (see cleanup above). Registration
  requires `@bl.students.amrita.edu` addresses (server-side college gate).
- CI: `quality` job unchanged (typecheck root/site, build root/site, 42 unit
  tests). `e2e` job (needs quality): npm ci -> cache `~/.cache/ms-playwright`
  -> `playwright install --with-deps chromium` -> build site -> local D1
  migrations -> `e2e/seed.sql` -> `wrangler dev --port 8787` (readiness loop)
  -> `npm run test:e2e`; worker log dumped on failure. On a cold browser
  cache the install step downloads browsers (~1-2 min) — expected, not a
  failure.
- 2026-10-23 (plan #64/#69/#51/#52): `deploy-staging` job added — manual ONLY
  (`workflow_dispatch`, `needs: e2e`, `if: github.event_name ==
  workflow_dispatch`); steps are the repo's own commands: `npm run build:site`
  -> `npm run migrate:staging` (`wrangler d1 migrations apply nsdc-auth
  --remote -c wrangler.staging.jsonc`) -> `npx wrangler deploy -c
  wrangler.staging.jsonc` (worker `nsdcaseb-staging`, host
  `preview.nsdcaseb.xyz`). Production (apex teaser) untouched — no job, no
  step deploys it.
- Browser matrix (same date): `e2e/playwright.config.ts` selects projects from
  `BROWSERS` — default `chromium` locally, `all` (chromium + firefox + webkit)
  when `BROWSERS=all` or `CI` is set. CI installs all three (`playwright
  install --with-deps chromium firefox webkit`) and runs with `BROWSERS: all`.
  Local firefox/webkit download attempted 2026-10-23 but timed out mid-fetch
  (~124 MB firefox at 40% after 10 min) — environment bandwidth, not a config
  error; CI installs them instead. New specs verified on chromium locally.
- Axe gate (same date): `@axe-core/playwright` devDep; `e2e/axe.spec.ts`
  scans `/`, `/registrations`, `/media`, `/admin` (locked 404) + first
  `/projects/:id` (skips when no projects). Threshold: zero
  critical/serious violations EXCEPT five pre-existing product-code rules
  excluded via `disableRules` (site/* frozen this plan): `color-contrast`,
  `label-content-name-mismatch`, `aria-prohibited-attr`, `definition-list`,
  `dlitem` (observed counts documented in the spec header). Any NEW
  critical/serious rule still fails the build.
- New navigation specs (same date): `e2e/hash-navigation.spec.ts` (`/#about`,
  `/#people`, `/registrations#archive` land + reveal target sections),
  `e2e/history.spec.ts` (back/forward `/` <-> `/registrations` keeps URL +
  content in sync). All role/label selectors, no CSS internals.

## Concerns / follow-ups

1. `typecheck:site` was red at the start of this run (`AdminEvents.tsx`:
   `Property 'archived' does not exist on type 'EventDetail'` + unused `verb`).
   A concurrent agent fixed it mid-run (now `e.archived` / inlined confirm
   text). Coordinate before touching admin event types.
2. Untestable-as-is pure logic (module-private, no refactor allowed this
   phase): `statusOf` + `readableDate` (`EventRows.tsx`), `formatDate` +
   `formatTimeRange` (`EventDetail.tsx`), `formatEventDate` +
   `eventStatusWord` (`search.ts`, covered indirectly via `ensureRemoteIndex`
   sublabel assertions). Follow-up: extract to exported `site/src/lib/`
   helpers and unit-test directly.
3. `statusFor` ignores `mine.status === 'cancelled'` (falls through to
   open/closed); pinned as current behavior — confirm it is intended.
4. Pre-existing build warning: `@import` order in `site/src/index.css`
   (tokens.css after @tailwind). Harmless today; fix when CSS is next touched.
5. `@testing-library/react` / `@testing-library/jest-dom` deliberately NOT
   installed (deps kept minimal — pure-logic tests only). Add when component
   render tests land.

## Recruitment e2e — 2026-10-24

- New specs (3 tests; suite now 20 tests / 13 spec files):
  - `e2e/recruitment.spec.ts` (2): `/recruit` open state renders the heading +
    form; client validation rejects a bad college email and short phone
    (`aria-invalid` + inline copy, no request); a real submit yields
    "Application received" + a UUID reference; status lookup shows
    "Under review"; a second submit on a fresh page gets HTTP 409
    `already_applied` and the page renders "already applied" copy.
  - `e2e/recruitment-admin.spec.ts` (1): registers an `ob` through the real
    API, verifies via local D1 (`verifyUserEmail`), promotes with a local D1
    `UPDATE users SET role='ob'`, logs in through the API, unlocks `/admin`,
    finds the pending application in the Recruitment tab, accepts the confirm
    dialog and clicks Select, asserts the row leaves `pending` and appears
    under `selected`, checks `GET /api/recruit/status` (200, `selected`,
    non-null `decided_at`) and the public page ("Selected"), then verifies
    `GET /api/admin/recruitment.csv?status=selected` (content type,
    attachment filename, header row, applicant row).
- Fixture helpers added (additive only; `registerViaApi` unchanged):
  `setUserRole`, `registerObViaApi`, `deleteRecruitmentApplication`,
  `deleteUserByEmail`. They write via `wrangler d1 execute --local` to the
  same staging DB the dev server uses, validate emails before interpolation,
  and retry three times for SQLITE_BUSY.
- Isolation: one application per spec with unique emails; both specs clean up
  in `finally` (application + decision email; admin spec also removes its
  throwaway `ob` user, sessions, tokens and audit rows). Local DB was verified
  back to its pre-run recruitment row count after the focused run.
- Verified: `npx tsc --noEmit -p e2e/tsconfig.json` clean;
  `npx playwright test -c e2e/playwright.config.ts recruitment` → 3 passed;
  full `npm run test:e2e` → **20 passed** (chromium, 2 workers, 31.2 s).
- Rate-limit note from verification: the first full run was 17 passed / 3
  failed — `capacity-waitlist` (second `registerViaApi`), `recruitment-admin`,
  and `required-questions`, all HTTP 429 `rate_limited` from
  `POST /api/auth/register`. The 5/hr/IP register budget had already absorbed
  3 hits from the focused runs earlier in the same hour, and the suite needs 5
  (auth, capacity ×2, required-questions, recruitment-admin). No spec was
  weakened. After clearing `rl:*` KV buckets and re-applying `e2e/seed.sql`
  (which also frees `e2e-tiny-cap1`), the full suite passed 20/20.
- Cleanup used (local only):
  ```powershell
  # all rate-limit buckets
  $keys = npx wrangler kv key list --binding RATELIMIT_KV --local --prefix "rl:" -c wrangler.staging.jsonc | ConvertFrom-Json
  $keys | ForEach-Object { npx wrangler kv key delete --binding RATELIMIT_KV --local $_.name -c wrangler.staging.jsonc }
  # deterministic event/registration state
  npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc
  # accounts left by account-creating specs
  npx wrangler d1 execute nsdc-auth --local --command "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'auth-%' OR email LIKE 'questions-%' OR email LIKE 'cap-first-%' OR email LIKE 'cap-second-%' OR email LIKE 'recruit-ob-%'); DELETE FROM email_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'auth-%' OR email LIKE 'questions-%' OR email LIKE 'cap-first-%' OR email LIKE 'cap-second-%' OR email LIKE 'recruit-ob-%'); DELETE FROM users WHERE email LIKE 'auth-%' OR email LIKE 'questions-%' OR email LIKE 'cap-first-%' OR email LIKE 'cap-second-%' OR email LIKE 'recruit-ob-%';" -c wrangler.staging.jsonc
  Remove-Item -Recurse -Force test-results -ErrorAction SilentlyContinue
  ```
- Not covered by e2e: the closed state. `site_settings.recruitment_open` is
  global, so toggling it mid-run would race the admin spec's submit; the
  runbook documents the close/open procedure instead.
