# Production cutover — club site

Status: **plan only. Not executed.** Prepared 2026-10-25 against staging
(`https://preview.nsdcaseb.xyz`). Numbers for the "before" state live in
`docs/baseline.md`; nothing here has been run against production.

Today production (`nsdcaseb.xyz`, `www.nsdcaseb.xyz`) serves the **teaser**
from `worker/index.ts` via `wrangler.jsonc` (static `dist/` + `POST
/api/notify` on `NOTIFY_KV`). The full site lives in `worker/staging.ts` and
`dist-site/`, deployed as **`nsdcaseb-staging`** on
`preview.nsdcaseb.xyz` via `wrangler.staging.jsonc`.

Cutover means: give the full-site worker its own production bindings, its own
D1, and the apex/`www` custom domains.

---

## 0. What is different between the two configs (the real work)

`wrangler.jsonc` (production teaser) has only `NOTIFY_KV` + `ASSETS`.
`wrangler.staging.jsonc` (site) needs all of:

| Binding / setting | Teaser (`wrangler.jsonc`) | Site (needs on production) |
| --- | --- | --- |
| `main` | `worker/index.ts` | `worker/staging.ts` |
| `assets.directory` | `./dist` | `./dist-site` |
| `run_worker_first` | `["/api/*"]` | `["/*"]` (SPA 404s + meta injection) |
| `d1_databases` `AUTH_DB` | — | production D1 + `worker/db/migrations` |
| `kv_namespaces` `RATELIMIT_KV` | — | production KV namespace |
| `triggers.crons` | — | `*/15 * * * *` (email outbox) |
| `vars.MAIL_FROM` | — | `NSDC <noreply@mail.nsdcaseb.xyz>` |

Worker secrets required by the site (`worker/auth-helpers.ts` `Env`):
`ADMIN_ENTRY_CODE`, `RESEND_API_KEY`. Optional, for poster/media uploads:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **not set on staging today**
(`wrangler secret list -c wrangler.staging.jsonc` returns only
`ADMIN_ENTRY_CODE` and `RESEND_API_KEY`), so uploads are disabled there.
Decide whether production goes live without uploads or with the Supabase pair.

Recommended shape (requires a config/code-adjacent change, deliberately not
done here): add `wrangler.production.jsonc` mirroring the staging file with a
**new** worker name (e.g. `nsdcaseb-site`), a production D1 and KV, and
`compatibility_date` `2026-09-30`. (`worker/staging.ts` is only named that —
it is the full-site router; its `[staging]` log prefix is cosmetic.) Do **not**
reuse the name `nsdcaseb-staging` for production, and do not repoint
`wrangler.jsonc` at `dist-site` — the teaser worker should stay deployable for
rollback.

> Keep `npm run deploy` (teaser) and `npm run deploy:staging` (site) as they
> are. A production site deploy is a third, explicit command. Never let CI's
> `deploy-staging` job touch the apex.

---

## 1. Pre-flight (T-1 day)

Order matters; all steps are additive and safe to rehearse on staging first.

0. **Blocker — origin strings in the HTML shell.** `site/index.html` hardcodes
   `https://preview.nsdcaseb.xyz/` in `<link rel="canonical">`, `og:url`,
   `og:image`, `twitter:image` and the Organization JSON-LD (`url`, `logo`).
   Served as-is on the apex, every non-home page canonicalises to the staging
   homepage (this is the whole Lighthouse SEO 0.92 gap in
   `docs/baseline.md`) and every share card points at preview. Fix before
   cutover, either:
   - build-time origin (e.g. a `VITE_SITE_ORIGIN` consumed by
     `site/index.html`/`main.tsx`), or
   - per-request rewrite in `worker/staging.ts` `serveAppRoute`, mirroring how
     `worker/meta.ts` already rewrites canonical/OG for `/registrations/:id`.
   Keep `worker/meta.ts`'s per-event injection working — it derives the origin
   from the request already.
1. **Green gates on the exact commit to ship**
   - `npm ci`
   - `npx tsc -b` and `npm run typecheck:site`
   - `npm run build` (teaser) and `npm run build:site`
   - `npm test` (unit)
   - `npx playwright test -c e2e/playwright.config.ts` against a local worker
     (CI `quality` + `e2e` jobs must be green on the branch)
2. **Production D1**
   - Create the production D1 database, take the `database_id`, put it in the
     production config under `AUTH_DB` with
     `migrations_dir: "worker/db/migrations"`.
   - Apply **all** migrations `0001`–`0019` in order:
     `npx wrangler d1 migrations apply <prod-db-name> --remote -c <prod config>`
   - `0017_project_featured.sql`, `0018_bearer_links.sql`,
     `0019_recruitment.sql` are the three new ones since the last content
     freeze. All three are additive (`ALTER TABLE … ADD COLUMN DEFAULT` /
     `CREATE TABLE` + indexes) — no backfill, no destructive step.
   - Migrations `0006`–`0012` carry the real content/projects/people seed
     rows; verify `/api/projects`, `/api/content`, `/api/events` are non-empty
     after applying, or load content through the admin API.
3. **Production KV** — create `RATELIMIT_KV` and put its id in the config.
   (Rate limiting fails open, so a missing namespace degrades rather than
   breaks — but it must exist before launch.)
4. **Secrets** (only the names; values never in this repo, chat, or CI logs)
   ```bash
   npx wrangler secret put ADMIN_ENTRY_CODE -c <prod config>
   npx wrangler secret put RESEND_API_KEY   -c <prod config>
   # optional uploads:
   npx wrangler secret put SUPABASE_URL             -c <prod config>
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c <prod config>
   ```
   Verified staging state (`npx wrangler secret list -c wrangler.staging.jsonc`,
   read-only, 2026-10-25): `ADMIN_ENTRY_CODE`, `RESEND_API_KEY`. No Supabase
   pair — poster upload will report storage unconfigured until it is added.
5. **Vars** — `MAIL_FROM` in the config (`NSDC <noreply@mail.nsdcaseb.xyz>`).
   Confirm the Resend sending domain (`mail.nsdcaseb.xyz`) is verified and can
   send to a real inbox; without `RESEND_API_KEY` the mailer no-ops
   (`{ delivered: false }`) and the outbox queues forever.
6. **Cron** — `triggers.crons: ["*/15 * * * *"]` in the production config so
   the outbox drains (`handleScheduled`).
7. **Rate-limit safety** — confirm `E2E_DISABLE_RATE_LIMIT` is **absent** from
   production vars. It exists only for local/CI.
8. **Decide `/api/notify`** — the teaser exposes `POST /api/notify` writing
   `NOTIFY_KV`; the site worker returns `404 not_found` for it (verified on
   staging). If the launch-list endpoint must survive the flip, either keep a
   redirect/subdomain for it or add the handler before cutover. Existing
   `NOTIFY_KV` data is untouched either way (keys `sub:<email>`).
9. **Enable D1 backups / note the restore path** (`wrangler d1 export`) before
   any production write.

---

## 2. Cutover (T-0, ~15 min)

1. Deploy the site worker **without** domains first:
   ```bash
   npm run build:site
   npx wrangler deploy -c <prod config>
   ```
   Confirm the `*.workers.dev` URL serves `/` and `/api/events` (200) and
   `/nope` (404) before touching DNS.
2. Freeze writes (optional, recommended): put up a short maintenance note or
   ask admins not to create events for the window. D1 migrations are additive,
   so a freeze is about data merge sanity, not schema.
3. **Move the custom domains** in the Cloudflare dashboard → Workers &
   Pages → the teaser worker → Settings → Domains & Routes: remove
   `nsdcaseb.xyz` and `www.nsdcaseb.xyz`; add the same two to the site worker.
   - `nsdcaseb.xyz` and `www.nsdcaseb.xyz` are both Worker custom domains, so
     the DNS records are managed for you; expect a short propagation window
     (seconds to a few minutes).
   - Keep the teaser worker **deployed** — it is the rollback target.
   - `preview.nsdcaseb.xyz` stays on `nsdcaseb-staging`.
4. Verify certificates and HTTPS for apex and `www` (Cloudflare issues the
   cert on domain attach; usually <1 min).
5. Canonicalisation stays as-is (apex + `www` both served). If you later
   redirect `www` → apex, do it in a Worker route, not a page rule.

---

## 3. Smoke tests (must all pass before announcing)

Run from a clean browser profile; use a real inbox you can read.

**Static + routing / SEO**
- [ ] `curl -sI https://nsdcaseb.xyz/` → `200`, `text/html`,
      `content-security-policy`, `strict-transport-security`.
- [ ] `curl -s -o /dev/null -w '%{http_code}' https://nsdcaseb.xyz/nope` → `404`
      (and `https://nsdcaseb.xyz/admin` → `404` while locked).
- [ ] `/`, `/registrations`, `/recruit`, `/archive`, `/projects`,
      `/media` → `200`. `/registrations/<real id>` → `200` with the event title
      in `<title>` and `og:*` tags (server-side meta injection).
- [ ] `https://nsdcaseb.xyz/sitemap.xml` → `200 application/xml`, contains
      `/`, `/registrations`, `/recruit`, `/media`, `/archive`, `/projects`
      plus event URLs; no `preview.` origin leaks.
- [ ] `https://nsdcaseb.xyz/robots.txt` → `200`.
- [ ] Share one event URL into a link preview (or read `og:title`/`og:image`
      directly) — image must be an absolute https URL on the apex.
- [ ] `curl -s https://nsdcaseb.xyz/registrations | grep canonical` → must be
      `https://nsdcaseb.xyz/registrations`, **not** `preview.nsdcaseb.xyz`
      (and `og:url` likewise). Same for `/recruit`, `/projects`, `/media`.

**Auth**
- [ ] Register a college address (`@bl.students.amrita.edu`): `POST
      /api/auth/register` → `201`, no session cookie, page goes to
      "verify pending".
- [ ] Verification email arrives from `MAIL_FROM`; the link lands on
      `/verify-email` and flips the account to verified.
- [ ] Log in → session cookie `nsdc_session` (HttpOnly) → reload keeps you in;
      logout clears it.
- [ ] Forgot-password → reset link → new password works, old one fails.
- [ ] Rate limits: 6th register attempt from one IP in an hour → `429`
      (proves `RATELIMIT_KV` is bound).

**Event registration**
- [ ] Signed-in user registers for an open event → confirmed (or waitlisted
      when full); appears in `/registrations/<id>` as "registered".
- [ ] Guest registration path still works where enabled.
- [ ] Cancel → seat frees / waitlist promotes (use a low-capacity test event,
      then archive it).
- [ ] Admin → Roster shows the registration; CSV download works.

**Recruitment**
- [ ] `/recruit` shows the form with `recruitment_open` on.
- [ ] Submit a real application → "Application received" + UUID reference;
      duplicate submit → "already applied".
- [ ] `/recruit` status lookup with matching email + register number → "Under
      review"; wrong pair → `404 not_found` (no field disclosure).
- [ ] Admin → Recruitment: row visible, Select/Reject writes `decided_at`,
      queues the decision email, and `/api/admin/recruitment.csv?status=...`
      downloads.
- [ ] Confirm the applicant decision email (or the outbox row, if Resend is
      not live yet).

**Admin door**
- [ ] `/admin` while locked → the camouflage 404 page, no admin nav.
- [ ] Unlock with the zero-button + `ADMIN_ENTRY_CODE` → tabs render in place
      (URL stays `/admin`); reload re-locks; member session gets 403.

**Data integrity**
- [ ] `/api/events`, `/api/projects`, `/api/content`, `/api/media`,
      `/api/site` return the expected production rows (not demo/fallback).
- [ ] `wrangler d1 execute <prod db> --remote --command "SELECT COUNT(*) FROM recruitment_applications"` works (proves the prod DB binding).
- [ ] Debug banner absent: no `E2E_DISABLE_RATE_LIMIT`, no staging origin in
      page source.

---

## 4. Rollback

Fast (<2 min), because the teaser worker is left deployed and untouched:

1. Cloudflare dashboard → site worker → Domains & Routes → remove
   `nsdcaseb.xyz` and `www.nsdcaseb.xyz`.
2. Re-add both to the `nsdcaseb` teaser worker. Apex returns the
   coming-soon page as soon as the domain reattaches.
3. Optionally point `preview.nsdcaseb.xyz` back at `nsdcaseb-staging` if it was
   moved in error.

Worker-level rollback (if domains should stay on the site worker):
```bash
npx wrangler deployments list -c <prod config>
npx wrangler rollback <deployment-id> -c <prod config>
```
Rollback of code does **not** need a schema rollback: `0017`–`0019` are
additive, and the previous worker version ignores the new columns/tables.
Do not run destructive SQL during an incident. If a bad write is suspected,
export first (`npx wrangler d1 export`) and restore into a new DB.

Teaser fallback command (only if the teaser build itself is stale):
```bash
npm run build && npx wrangler deploy   # wrangler.jsonc, worker/index.ts
```

Post-rollback: re-check `/`, `/registrations`, `/recruit` for 200/404 as
expected, and confirm `/api/notify` behaves as before (it is teaser-only).

---

## 5. Post-cutover verification (T+1h, T+1d)

Run against the apex exactly as in `docs/baseline.md`:

```bash
npx -y lighthouse@latest https://nsdcaseb.xyz/registrations \
  --output=json --output-path=./lh-prod-registrations-mobile.json \
  --chrome-flags="--no-sandbox --headless"
npx -y lighthouse@latest https://nsdcaseb.xyz/registrations --preset=desktop \
  --output=json --output-path=./lh-prod-registrations-desktop.json \
  --chrome-flags="--no-sandbox --headless"
# repeat for /, /recruit, /archive, /projects/<id>
```

Acceptance: no route regresses below the staging numbers appended to
`docs/baseline.md` (2026-10-25), and mobile `/registrations` CLS stays < 0.1.
Caveat: that table predates the `/recruit` Suspense-fallback CLS fix, so
`/recruit` desktop must land at CLS < 0.01 and perf >= 0.94 (local post-fix:
1.00 / 0.0006); `/archive` and `/projects/:id` mobile should follow to ~0.01.
If `/recruit` desktop still shows ~0.36, the deploy did not include the
`App.tsx` fallback change.

```bash
BASE_URL=https://nsdcaseb.xyz npx playwright test -c e2e/playwright.config.ts axe --project=chromium
```

Axe specs are read-only (navigate + scan). Zero critical/serious required.
Then run the full read-only route sweep (`npx playwright test -c
e2e/playwright.config.ts http-status`) and check Cloudflare analytics for
5xx/`/api/*` errors over the first hour.

Ongoing: `/api/admin/_ping` from the ops uptime check; email outbox queue
depth (Admin → Email) for two cron cycles; D1 backup schedule.
