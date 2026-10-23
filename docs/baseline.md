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
  `http-status` (/nope + /admin -> 404, / + /media -> 200, HTML shell).
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
  npx wrangler dev -c wrangler.staging.jsonc --port 8787
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
  # clear e2e test data (seed rows stay)
  npx wrangler d1 execute nsdc-auth --local --command "DELETE FROM registrations WHERE event_id LIKE 'e2e%'; DELETE FROM users WHERE email LIKE '%@e2e.example.com';" -c wrangler.staging.jsonc
  ```
  CI never needs this (every run starts from cold local state).
- CI: `quality` job unchanged (typecheck root/site, build root/site, 42 unit
  tests). `e2e` job (needs quality): npm ci -> cache `~/.cache/ms-playwright`
  -> `playwright install --with-deps chromium` -> build site -> local D1
  migrations -> `e2e/seed.sql` -> `wrangler dev --port 8787` (readiness loop)
  -> `npm run test:e2e`; worker log dumped on failure. On a cold browser
  cache the install step downloads browsers (~1-2 min) — expected, not a
  failure.

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
