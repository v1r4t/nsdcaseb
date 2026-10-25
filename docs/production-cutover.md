# Production cutover — club site

Status: **plan only. Not executed.** Audited 2026-10-25 against the live
Cloudflare account and staging (`https://preview.nsdcaseb.xyz`). Numbers for the
"before" state live in `docs/baseline.md`; nothing in this document has been run
against production.

Account facts (read-only, 2026-10-25):

| Item | Value |
| --- | --- |
| Account | `71c1c94f025bff6aaacce3cd9ab795b5` (`dhruvav0308@gmail.com`) |
| workers.dev subdomain | `dhruvav0308` |
| Zone | `nsdcaseb.xyz` = `ba13dfb1c8610b2e888ca08c0aefd526` |
| Wrangler | 4.152.0, OAuth token |

Cutover means: give the full-site worker its own production bindings, its own
D1, and the apex/`www` custom domains.

> **Resolved 2026-10-25 (pre-cutover, verified live on staging):** both first-pass
> blockers are fixed in code — origin-aware HTML metadata (`worker/meta.ts` +
> `worker/staging.ts`, with production fallbacks in `site/index.html`) and
> `POST /api/notify` on the site worker (`worker/notify.ts`, `NOTIFY_KV` bound in
> `wrangler.staging.jsonc`). Evidence in §0.4.

---

## 0. Current production state (verified 2026-10-25)

### 0.1 Workers and domains

| Surface | Worker | Config | Content |
| --- | --- | --- | --- |
| `nsdcaseb.xyz`, `www.nsdcaseb.xyz` | **`nsdcaseb`** (teaser) | `wrangler.jsonc`, `worker/index.ts`, `dist/` | coming-soon + `/api/notify` |
| `preview.nsdcaseb.xyz` | **`nsdcaseb-staging`** | `wrangler.staging.jsonc`, `worker/staging.ts`, `dist-site/` | full site |
| intended production | **`nsdcaseb-site`** | `wrangler.production.jsonc` (does not exist yet) | full site |

`npx wrangler deployments list --name nsdcaseb-site` → **"This Worker does not
exist on your account."** There is no production site worker today.

Current live versions (for rollback reference):

| Worker | Version | Created |
| --- | --- | --- |
| `nsdcaseb` | `59f799d0-8c03-4fe3-86fa-b95072b94e4c` | 2026-10-25T09:29:46Z |
| `nsdcaseb-staging` | `d5c48344-896d-4ada-9730-be66c33d51ba` | 2026-10-25T09:52:41Z |

Custom domains (from `GET /accounts/<id>/workers/domains`):

| Hostname | Service | Domain ID |
| --- | --- | --- |
| `nsdcaseb.xyz` | `nsdcaseb` | `f17b289f58047f02338756152c062a2de133ca81` |
| `www.nsdcaseb.xyz` | `nsdcaseb` | `4127924dd99cbc10eba8714b4c654f1530b7fc3d` |
| `preview.nsdcaseb.xyz` | `nsdcaseb-staging` | `45fee5efb3eca2d9d26f57baa000d44d2ce0f6f5` |

All three are Worker **custom domains**; Cloudflare owns their DNS records (zone
NS = `brodie.ns.cloudflare.com`, `nena.ns.cloudflare.com`).

### 0.2 Bindings inventory

| Resource | Exists | Name / ID | Used by |
| --- | --- | --- | --- |
| D1 | yes | `nsdc-auth` = `2c866704-7c1f-4556-b1b7-6bd9fc3d8709` | staging only |
| D1 | **no** | production DB (suggest `nsdc-auth-prod`) | — |
| KV | yes | `NOTIFY_KV` = `9b54a4a0c174444e8b64cb7a2a590d47` | teaser + staging (shared) |
| KV | yes | `nsdc-ratelimit` = `5535eca24d924115ad24c5b3d22af89f` | staging (`RATELIMIT_KV`) |
| KV | **no** | production `RATELIMIT_KV` | — |
| Secrets (staging) | yes | `ADMIN_ENTRY_CODE`, `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | — |
| Secrets (teaser) | none | `[]` (teaser needs none) | — |

### 0.3 Apex today is asset-served, not worker-served

`wrangler.jsonc` sets `run_worker_first: ["/api/*"]`, so `/` is served by the
**static asset layer** and the teaser worker's `withSecurityHeaders()` never
runs for HTML (§0.4). Do not baseline production HTML headers against the teaser.

### 0.4 Current live behaviour (curl, 2026-10-25)

| Check | Apex `nsdcaseb.xyz` | Staging `preview.nsdcaseb.xyz` |
| --- | --- | --- |
| `GET /` | `200 text/html` — **no CSP, no HSTS** | `200 text/html` + CSP + HSTS + nosniff |
| `GET /nope` | `200` (SPA fallback; teaser has no route logic) | `404` |
| `GET /admin` | `200` (teaser SPA) | `404` (camouflage) |
| `GET /api/notify` | `405` `Allow: POST` | `405` `Allow: POST` |
| `POST /api/notify {"email":"nope"}` | `400 invalid_email` | `400 invalid_email` |
| `GET /registrations` | `200 text/html` (teaser shell; the route does not exist) | `200` full site |
| canonical on `/registrations` | n/a (teaser shell) | `https://preview.nsdcaseb.xyz/registrations` |
| `GET /robots.txt` | `200 text/plain` from `dist/robots.txt`, `Sitemap: /sitemap.xml` (relative) | `200`, absolute staging origin |
| `GET /sitemap.xml` | `200 text/html` (SPA fallback — **not XML**) | `200 application/xml`, origin-aware |

The staging CSP currently includes `https://zgsecmkbfaqrzfuzfzdj.supabase.co`
(derived from `SUPABASE_URL`) — proof the Supabase pair is set there.

**Consequence:** all header/404/canonical expectations in this document apply
**after** the flip. Apex will start returning `404` for `/nope` and `/admin`
only once `nsdcaseb-site` owns the domain.

---

## 1. What is different between the configs

| Binding / setting | Teaser (`wrangler.jsonc`) | Production site (needed) |
| --- | --- | --- |
| `name` | `nsdcaseb` | `nsdcaseb-site` (**new**) |
| `main` | `worker/index.ts` | `worker/staging.ts` |
| `assets.directory` | `./dist` | `./dist-site` |
| `assets.binding` | `ASSETS` | `ASSETS` |
| `assets.not_found_handling` | `single-page-application` | `single-page-application` |
| `run_worker_first` | `["/api/*"]` | `["/*"]` (SPA 404s + meta injection) |
| `d1_databases` `AUTH_DB` | — | production D1 + `migrations_dir: "worker/db/migrations"` |
| `kv_namespaces` `RATELIMIT_KV` | — | production KV namespace |
| `kv_namespaces` `NOTIFY_KV` | `9b54a4a0c174444e8b64cb7a2a590d47` (`sub:<email>`) | **same namespace id** (launch list carries over) |
| `triggers.crons` | — | `["*/15 * * * *"]` (email outbox) |
| `vars.MAIL_FROM` | — | `NSDC <noreply@mail.nsdcaseb.xyz>` |
| Worker secrets | none | `ADMIN_ENTRY_CODE`, `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

### 1.1 Required file: `wrangler.production.jsonc` (absent today)

This is **blocker #1**. Create exactly this file (it is deliberately separate
from both existing configs; do not repoint `wrangler.jsonc` at `dist-site`, and
do not deploy production over `nsdcaseb-staging`):

```jsonc
{
  "name": "nsdcaseb-site",
  "compatibility_date": "2026-09-30",
  "main": "worker/staging.ts",
  "workers_dev": true,
  "assets": {
    "directory": "./dist-site",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/*"]
  },
  "d1_databases": [
    {
      "binding": "AUTH_DB",
      "database_name": "nsdc-auth-prod",
      "database_id": "<D1_ID_FROM_STEP_2.1>",
      "migrations_dir": "worker/db/migrations"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "RATELIMIT_KV",
      "id": "<KV_ID_FROM_STEP_2.2>"
    },
    {
      "binding": "NOTIFY_KV",
      "id": "9b54a4a0c174444e8b64cb7a2a590d47"
    }
  ],
  "triggers": {
    "crons": ["*/15 * * * *"]
  },
  "vars": {
    "MAIL_FROM": "NSDC <noreply@mail.nsdcaseb.xyz>"
  }
}
```

Notes:

- No `routes`/`custom_domains` in phase 1. Domains are moved in §3 only after the
  worker is verified on `https://nsdcaseb-site.dhruvav0308.workers.dev`.
- `worker/staging.ts` is only named that — it is the full-site router; its
  `[staging]` log prefix is cosmetic.
- Keep the teaser worker deployed and untouched: it is the rollback target.
- `package.json` has **no** `deploy`, `deploy:prod`, or `migrate:prod` script
  (only `deploy:staging` / `migrate:staging`). All production commands below are
  explicit `npx wrangler … -c wrangler.production.jsonc`.
- Never let CI's `deploy-staging` job touch the apex; it only deploys
  `wrangler.staging.jsonc` on manual `workflow_dispatch`.

---

## 2. Pre-flight (T-1 day)

Order matters. Everything here is additive; nothing touches apex DNS.

### 2.0 Green gates on the exact commit to ship

```bash
git status --porcelain    # must be empty: build artifacts come from a known commit
git rev-parse HEAD        # record this SHA in the cutover notes
npm ci
npx tsc -b
npm run typecheck:site
npm run build          # teaser -> dist/
npm run build:site     # site   -> dist-site/
npm test               # vitest
```

Local e2e (the Playwright config has **no** `webServer`; it expects a worker on
`:8787`, so start one yourself). Install browsers once if this machine has never
run Playwright:

```bash
npx playwright install chromium
```

```bash
# terminal 1
npx wrangler d1 migrations apply nsdc-auth --local -c wrangler.staging.jsonc
npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc
npx wrangler dev -c wrangler.staging.jsonc --port 8787 --var E2E_DISABLE_RATE_LIMIT:1

# terminal 2
npx playwright test -c e2e/playwright.config.ts
```

CI `quality` + `e2e` must be green on the branch. `E2E_DISABLE_RATE_LIMIT` is
test-only and must never appear in staging/production vars.

### 2.1 Production D1

```bash
npx wrangler d1 create nsdc-auth-prod
```

Paste the returned `database_id` into `wrangler.production.jsonc` (§1.1). Then
apply **all** migrations `0001`–`0019` in order:

```bash
npx wrangler d1 migrations apply nsdc-auth-prod --remote -c wrangler.production.jsonc
npx wrangler d1 migrations list  nsdc-auth-prod --remote -c wrangler.production.jsonc
# expect: "No migrations to apply!" on the second command
```

Migration facts (corrected):

- `0017_project_featured.sql`, `0018_bearer_links.sql`,
  `0019_recruitment.sql` are the three newest; all additive (`ALTER TABLE … ADD
  COLUMN … DEFAULT` / `CREATE TABLE` + indexes), no backfill or destructive step.
- `0006_content_demo.sql` seeds **demo** copy; `0009_content_real.sql` replaces
  it. `0010_projects_real.sql` seeds real projects. Do not describe `0006` as
  real content.
- `0004_media.sql` seeds a `[SAMPLE] Intro to ML Workshop` album with three
  `picsum.photos` placeholders. Delete that album after cutover (Admin → Media,
  or `DELETE` SQL) or it ships in the gallery.
- `0008_projects_site.sql` seeds `site_settings.recruitment_open = '1'`, so a
  fresh production DB opens recruitment by default. If applications are not
  open at launch, flip it **before** the flip:
  ```bash
  npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
    --command "UPDATE site_settings SET value='0', updated_at=datetime('now') WHERE key='recruitment_open';"
  ```

Verify seed/content state (read-only):

```bash
npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --command "SELECT (SELECT COUNT(*) FROM events) events, (SELECT COUNT(*) FROM projects) projects, (SELECT COUNT(*) FROM recruitment_applications) apps;"
npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --command "SELECT key, substr(title,1,40) FROM content_sections ORDER BY sort_order;"
npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --command "SELECT id, title FROM albums;"
```

Expect events/projects non-zero, no `[TODO`/`[DEMO` copy, and exactly one
`[SAMPLE]` album to remove. Fresh production has **zero** users.

### 2.2 Production `RATELIMIT_KV`

```bash
npx wrangler kv namespace create RATELIMIT_KV
```

Paste the id into `wrangler.production.jsonc`. (Rate limiting fails open, so a
missing namespace degrades rather than breaks — but bind it before launch so the
"6th register → 429" smoke check can pass.)

Do **not** reuse `nsdc-ratelimit` (`5535eca…`): staging canary traffic would
consume production budgets.

### 2.3 Validate the config without deploying

```bash
npx wrangler deploy -c wrangler.production.jsonc --dry-run
```

The D1/KV placeholders must be real ids before this passes. This catches typos
without creating or touching a worker.

### 2.4 First deploy — creates `nsdcaseb-site`, **no domains**

```bash
npx wrangler deploy -c wrangler.production.jsonc
```

Expected: `https://nsdcaseb-site.dhruvav0308.workers.dev` (workers.dev is enabled
by default; `workers_dev: true` is explicit in §1.1). Apex/preview are untouched.
The deploy is intentionally done before secrets so the worker exists and
`wrangler secret put` has a target:

```bash
npx wrangler secret put ADMIN_ENTRY_CODE          -c wrangler.production.jsonc
npx wrangler secret put RESEND_API_KEY            -c wrangler.production.jsonc
npx wrangler secret put SUPABASE_URL              -c wrangler.production.jsonc
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c wrangler.production.jsonc
npx wrangler secret list                          -c wrangler.production.jsonc
# expect exactly those four names — never print values
```

Each `secret put` publishes a new version. The Supabase pair is **not optional in
practice**: `worker/security-headers.ts` adds `SUPABASE_URL`'s origin to
`img-src`; without it, poster images are blocked by CSP. Staging already has all
four secrets (verified), so production must match.

`MAIL_FROM` is a **var**, not a secret (`wrangler.production.jsonc`). Confirm the
Resend sending domain is live — DNS currently has
`send.mail.nsdcaseb.xyz` SPF (`v=spf1 ip4:… ~all`) and a DKIM key at
`resend._domainkey.mail.nsdcaseb.xyz`. Actual proof is a real send
(Admin → Email → Send test email, or `/api/admin/email/test`), not an outbox row.
Without `RESEND_API_KEY` the mailer no-ops (`{ delivered: false }`) and the
outbox queues forever.

### 2.5 Cron and rate-limit safety

```bash
# Cloudflare API: prove the schedule exists (same read-only shape as staging).
# $CF_API_TOKEN is the token described in §3.3 (Wrangler's local OAuth token
# works for this endpoint too if you export it, but keep tokens out of the repo).
curl -sS "https://api.cloudflare.com/client/v4/accounts/71c1c94f025bff6aaacce3cd9ab795b5/workers/scripts/nsdcaseb-site/schedules" \
  -H "Authorization: Bearer $CF_API_TOKEN"
# {"result":{"schedules":[{"cron":"*/15 * * * *",...}]}}
```

`wrangler deployments status` does **not** show cron triggers — use the API above
or the dashboard (Worker → Triggers → Cron). Staging currently has exactly one
schedule, `*/15 * * * *`.

- `triggers.crons: ["*/15 * * * *"]` in `wrangler.production.jsonc` drains the
  email outbox (`handleScheduled` → `processOutbox`).
- `E2E_DISABLE_RATE_LIMIT` must be **absent** from production vars. It exists
  only for local/CI.

### 2.6 Bootstrap the first `ob` account on the fresh DB

A new D1 has no users, and every admin smoke test needs an `ob` session. Register
through the worker with the shared entry code (no SQL backdoor needed), after
`ADMIN_ENTRY_CODE` is set:

```bash
curl -sS -X POST https://nsdcaseb-site.dhruvav0308.workers.dev/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"ops@bl.students.amrita.edu","name":"Cutover Ops","mobile":"9999999999","password":"<at-least-10-chars>","admin_code":"<ADMIN_ENTRY_CODE>"}'
# 201 {"user":{...,"role":"ob"},"verify_pending":true}
```

Rules enforced by `worker/auth.ts`: email must end `@bl.students.amrita.edu`,
`name` + `mobile` required, password min 10, rate limit 5 registrations/hour/IP
(all attempts count, including failures).

If Resend is not live yet, mark the account verified directly (the verification
link would otherwise arrive by mail):

```bash
npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --command "UPDATE users SET email_verified=1 WHERE email='ops@bl.students.amrita.edu';"
```

Because the link is built from `new URL(request.url).origin`, an account created
on the workers.dev host gets a workers.dev verification link. That is harmless
before cutover; links issued after cutover use the apex.

### 2.7 Content decisions before the flip

- **`www` vs apex canonicalisation (open decision).** The worker derives
  `canonical`/`og:url` from the request origin, so after the flip
  `https://www.nsdcaseb.xyz/registrations` canonicalises to **www**, while the
  apex canonicalises to the apex. Two hostnames with self-canonicals = duplicate
  SEO surface. Either accept it for launch or add a `www` → apex 301 in
  `worker/staging.ts` before attaching domains (a code change not present today).
  Do not use a Page Rule.
- `/api/events`, `/api/projects`, `/api/content`, `/api/media`, `/api/site` must
  be non-empty and must not show the 0006 demo copy.
- Delete the `[SAMPLE]` media album.
- **Decide what staging data ships.** A fresh `nsdc-auth-prod` contains only the
  migration-seeded rows. Anything created through the admin UI on staging —
  edited events, posters, media albums, recruitment applications, users — does
  **not** carry over. Re-enter it after cutover (recommended) or copy selected
  tables before the flip (`wrangler d1 export` → `wrangler d1 execute --file`).
  If you copy, exclude `users`, `sessions`, and `email_tokens` unless staging
  accounts should become production accounts; poster keys are safe because the
  Supabase project/bucket is shared.

### 2.8 Backups before any production write

```bash
npx wrangler d1 export nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --output=./tmp-d1-prod-initial.sql
# tmp-* is gitignored; never commit a dump
```

Take a second export immediately before the flip (§3). Cloudflare D1 also keeps
Time Travel bookmarks; confirm the retention window in the dashboard before
relying on it for restore.

### 2.9 Resolved pre-flight items (keep as regression checks)

0. **Origin strings in the HTML shell — verified live.** `site/index.html`
   static fallbacks point at `https://nsdcaseb.xyz/` (canonical, `og:url`,
   `og:image`, `twitter:image`, Organization JSON-LD). `worker/meta.ts`
   (`injectDefaultMeta`) rewrites those tags to
   `new URL(request.url).origin + pathname` for GET HTML navigation responses;
   `worker/staging.ts` applies it in `serveAppRoute` and the HTML 404 fallback.
   `injectEventMeta` owns `/registrations/:id` and keeps exactly one canonical.
   Live check: staging `/registrations` returns
   `canonical = https://preview.nsdcaseb.xyz/registrations`; sitemap and robots
   use the staging origin (they will automatically use the apex once requests
   arrive on the apex). No apex-specific origin is baked into the shell.
8. **`/api/notify` — verified live on staging.** `worker/notify.ts` is mounted by
   both workers before their auth router: same length/JSON/email validation,
   honeypot, `sub:<email>` KV key, dedupe (`{ok:true,already:true}`), and JSON
   envelopes. Live: `GET` → `405` + `Allow: POST`; `{"email":"nope"}` → `400
   invalid_email`. `NOTIFY_KV` is bound to the teaser namespace
   (`9b54a4a0…`), so the launch list carries over untouched. `503
   notify_unavailable` means the binding is missing. Other unknown `/api/*`
   paths still return `404 {"error":"not_found"}`.

### 2.10 Pre-flight blocker checklist

- [ ] `wrangler.production.jsonc` created (§1.1) — **file does not exist**
- [ ] production D1 `nsdc-auth-prod` created, id pasted, migrations `0001`–`0019`
      applied, content verified — **no production D1 exists**
- [ ] production `RATELIMIT_KV` created and id pasted — **no production KV exists**
- [ ] `npx wrangler deploy --dry-run` passes
- [ ] `nsdcaseb-site` deployed to workers.dev — **worker does not exist**
- [ ] four secrets set on `nsdcaseb-site` (names only); `secret list` shows four
- [ ] `MAIL_FROM` var + Resend domain verified by a real send
- [ ] `triggers.crons` present; `E2E_DISABLE_RATE_LIMIT` absent
- [ ] first `ob` account bootstrapped and email verified
- [ ] `recruitment_open` set intentionally (`0008` defaults to `'1'`)
- [ ] `[SAMPLE]` media album deleted
- [ ] `www` canonical/redirect decision made
- [ ] fresh D1 export taken
- [ ] CI `quality` + `e2e` green on the exact commit

---

## 3. Cutover (T-0, 1–3 min of actual change)

### 3.1 Pre-attach verification on workers.dev

```bash
B=https://nsdcaseb-site.dhruvav0308.workers.dev
curl -sSI "$B/" | grep -iE '^(HTTP/|content-type:|content-security-policy:|strict-transport-security:)'
curl -sS  -o /dev/null -w '%{http_code}\n' "$B/nope"        # 404
curl -sS  -o /dev/null -w '%{http_code}\n' "$B/admin"       # 404
curl -sS  -o /dev/null -w '%{http_code}\n' "$B/api/events"  # 200
```

On workers.dev the canonical/OG values are the workers.dev origin by design —
they become the apex the moment the custom domain is attached.

### 3.2 Freeze writes (optional, recommended)

Ask admins not to create events/registrations for the window. Migrations are
already applied and additive, so this is about data-merge sanity, not schema.

### 3.3 Move the domains — apex first, then `www`

Use **either** the dashboard or the API. Never have the same hostname attached to
two workers: detach from `nsdcaseb` before attaching to `nsdcaseb-site`.

Dashboard: Workers & Pages → `nsdcaseb` → Settings → Domains & Routes → remove
`nsdcaseb.xyz`, then immediately add it to `nsdcaseb-site`; repeat for
`www.nsdcaseb.xyz`. Keep `nsdcaseb` deployed; leave `preview.nsdcaseb.xyz` on
`nsdcaseb-staging`.

API (requires an API token with **Workers Routes:Edit**, **Zone:Edit**, **Cache
Purge:Purge** — the local Wrangler OAuth token has workers routes + ssl scope but
not cache purge):

```bash
ACC=71c1c94f025bff6aaacce3cd9ab795b5
ZONE=ba13dfb1c8610b2e888ca08c0aefd526
TOKEN=...   # export CF_API_TOKEN, never commit

# 0. confirm current ids (they change after every attach)
curl -sS "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains" \
  -H "Authorization: Bearer $TOKEN"

# 1. detach apex from the teaser (id verified 2026-10-25)
curl -sS -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains/f17b289f58047f02338756152c062a2de133ca81" \
  -H "Authorization: Bearer $TOKEN"

# 2. attach apex to the site worker
curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"hostname\":\"nsdcaseb.xyz\",\"service\":\"nsdcaseb-site\",\"environment\":\"production\",\"zone_id\":\"$ZONE\"}"

# 3. repeat 1-2 for www (teaser id 4127924dd99cbc10eba8714b4c654f1530b7fc3d)

# 4. purge cached teaser HTML at the apex/www
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"purge_everything":true}'
```

Timing: detach <5 s per hostname; attach 5–15 s; DNS record is recreated by
Cloudflare automatically; cert is usually reused/reissued in <60 s. Expect a
**few seconds of non-resolution between detach and attach** — do one hostname
end-to-end at a time, apex first.

### 3.4 Verify immediately (before announcing)

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://nsdcaseb.xyz/          # 200
curl -sSI https://nsdcaseb.xyz/ | grep -iE '^(content-security-policy|strict-transport-security):'
curl -sS  -o /dev/null -w '%{http_code}\n' https://nsdcaseb.xyz/nope     # 404
curl -sS  -o /dev/null -w '%{http_code}\n' https://www.nsdcaseb.xyz/     # 200
```

If apex still returns the teaser, it is cached HTML (`max-age=0,
must-revalidate`): purge again and retry with `-H 'cache-control: no-cache'`.

---

## 4. Post-cutover smoke checklist

All of these are **post-flip** expectations. `curl.exe` on PowerShell, bare
`curl` in Git Bash/WSL. Use `-H 'cache-control: no-cache'` for the first 10
minutes. Every command is read-only except the two marked **[writes]** (notify
and registration); use data you intend to keep.

### 4.1 Shell, headers, routing

```bash
BASE=https://nsdcaseb.xyz

curl -sSI "$BASE/" | tr -d '\r' | grep -iE \
  '^(HTTP/|content-type:|content-security-policy:|strict-transport-security:|x-content-type-options:|referrer-policy:)'
# HTTP/1.1 200 OK
# content-type: text/html
# content-security-policy: ... (must contain https://zgsecmkbfaqrzfuzfzdj.supabase.co)
# strict-transport-security: max-age=31536000; includeSubDomains
# x-content-type-options: nosniff
# referrer-policy: strict-origin-when-cross-origin

for p in / /login /register /verify-pending /reset-password /registrations \
         /recruit /archive /projects /media; do
  printf '%-18s %s\n' "$p" "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")"
done
# every line 200

for p in /nope /admin; do
  printf '%-18s %s\n' "$p" "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")"
done
# both 404 (camouflaged admin door)
```

Known quirk, by design: `/registrations/<unknown-id>` returns **200** with
default metadata; the client renders its own 404. Do not assert 404 there.

### 4.2 Canonical / OG / sitemap

```bash
for p in /registrations /recruit /projects /media /archive; do
  echo "$p"
  curl -sS "$BASE$p" | grep -oE '(rel="canonical" href="[^"]*"|property="og:url" content="[^"]*")'
done
# every value is https://nsdcaseb.xyz/<path>; zero "preview." strings

curl -sS "$BASE/sitemap.xml" | grep -c '<loc>https://nsdcaseb.xyz'   # >= 6
curl -sS "$BASE/sitemap.xml" | grep -c 'preview.nsdcaseb.xyz' || true  # 0 (grep exits 1 on no match)
curl -sSI "$BASE/sitemap.xml" | grep -i '^content-type:'             # application/xml
curl -sSI "$BASE/robots.txt"  | grep -iE '^(HTTP/|content-type:)'    # 200, text/plain
```

Event page (use a real id):

```bash
EVENT_ID=$(curl -sS "$BASE/api/events" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const e=j.events??j;console.log(e[0].id)})")
curl -sS "$BASE/registrations/$EVENT_ID" | grep -oE '(<title>[^<]*</title>|property="og:(title|image)" content="[^"]*")'
# exactly one canonical, event title in <title>, og:image an absolute https apex URL
```

### 4.3 `/api/notify` **[writes]** (shared launch list)

```bash
curl -sS -X POST "$BASE/api/notify" -H 'content-type: application/json' \
  -d '{"email":"cutover-smoke@yourdomain.tld"}' -w '\n%{http_code}\n'
# 200 {"ok":true}

# wait >= 10 s (KV is eventually consistent), then repeat the same address:
# 200 {"ok":true,"already":true}

curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/notify"                  # 405
curl -sS -X POST "$BASE/api/notify" -H 'content-type: application/json' \
  -d '{"email":"nope"}' -w '\n%{http_code}\n'                                 # 400 invalid_email
curl -sS -X POST "$BASE/api/notify" -H 'content-type: application/json' \
  -d '{"email":"whatever@example.com","company":"bot"}' -w '\n%{http_code}\n' # 200 {"ok":true}, no KV write
```

`503 notify_unavailable` = `NOTIFY_KV` not bound. If the repeat is not
`already:true` within ~60 s, it is KV propagation, not a failure.

### 4.4 Data APIs (production rows, not demo)

```bash
for p in /api/events /api/projects /api/content /api/media /api/site; do
  printf '%-16s %s\n' "$p" "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")"
done
# all 200; inspect bodies: no "[TODO", no 0006 demo copy
curl -sS "$BASE/api/site"   # {"announcement":...,"recruitment_open":true|false}
```

```bash
npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --command "SELECT COUNT(*) AS n FROM recruitment_applications;"
```

### 4.5 Auth

- [ ] Register a college address (`@bl.students.amrita.edu`):
      `POST /api/auth/register` → `201`, **no** `Set-Cookie`, page shows
      "verify pending". **Counts against 5/hour/IP** — see 4.7.
- [ ] Verification email arrives from `MAIL_FROM`; the link lands on
      `/verify-email` and flips the account to verified.
- [ ] Log in → `nsdc_session` cookie is `HttpOnly` → reload keeps you in;
      logout clears it and `GET /api/auth/me` returns `401`.

```bash
curl -sS -D - -o /dev/null -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"ops@bl.students.amrita.edu","password":"<password>"}' | grep -i 'set-cookie'
# nsdc_session=...; HttpOnly; Secure; SameSite=Lax; Path=/
```

- [ ] Forgot-password → reset link → new password works, old one fails.

### 4.6 Admin door and admin APIs

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/admin/_ping"   # 403 without a session
# with an ob cookie: 200 {"ok":true}
curl -sS -o /dev/null -w '%{http_code}\n' -b "nsdc_session=$OB_COOKIE" "$BASE/api/admin/_ping"
```

- [ ] `/admin` while locked → camouflage 404, no admin nav.
- [ ] Unlock with the zero-button + `ADMIN_ENTRY_CODE` → tabs render in place
      (URL stays `/admin`); reload re-locks; a member session gets `403`.
- [ ] Roster shows registrations; CSV download works.
- [ ] Recruitment row visible; Select/Reject writes `decided_at`, queues the
      decision email; `/api/admin/recruitment.csv?status=...` downloads.

Note: `/api/admin/_ping` is `ob`-only, so an unauthenticated uptime monitor gets
`403`, not `200`. That is still a valid liveness probe (it exercises the worker
and D1); assert `403` or use an authenticated check.

### 4.7 Event registration and rate limit

- [ ] Signed-in user registers for an open event → confirmed (or waitlisted when
      full); `/registrations/<id>` shows "registered".
- [ ] Guest registration works where enabled.
- [ ] Cancel → seat frees / waitlist promotes (low-capacity test event).
- [ ] **Do this last, or from a different IP:** the 6th register attempt from one
      IP in an hour → `429` (proves `RATELIMIT_KV`). Earlier successful and
      failed registrations count against the same 5/hour budget.

### 4.8 Cron, secrets, and no-debug checks

```bash
npx wrangler secret list -c wrangler.production.jsonc   # exactly 4 names
npx wrangler deployments status -c wrangler.production.jsonc
npx wrangler d1 execute nsdc-auth-prod --remote -c wrangler.production.jsonc \
  --command "SELECT status, COUNT(*) FROM email_outbox GROUP BY status;"
# after a cron cycle: pending drops to 0, or attempts increments if Resend is off
```

- [ ] No `E2E_DISABLE_RATE_LIMIT` in page source or vars.
- [ ] No `preview.nsdcaseb.xyz` anywhere in apex HTML/sitemap.
- [ ] CSP contains the Supabase origin (posters render).
- [ ] `[SAMPLE]` album deleted.
- [ ] `wrangler d1 execute` against the prod DB works (proves `AUTH_DB`).

---

## 5. Rollback

### 5.1 Fastest: move the domains back to the teaser (<2 min, no deploy)

The teaser worker is left deployed and untouched precisely for this. Nothing in
D1 needs undoing: `0017`–`0019` are additive and the teaser ignores the site
schema entirely (it has no `AUTH_DB` binding).

```bash
ACC=71c1c94f025bff6aaacce3cd9ab795b5
ZONE=ba13dfb1c8610b2e888ca08c0aefd526
TOKEN=...

# 1. find the CURRENT domain ids (they change on every attach)
curl -sS "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains" \
  -H "Authorization: Bearer $TOKEN"
# 2. detach apex + www from nsdcaseb-site (replace the <…> placeholders with
#    the ids returned above — do not paste angle brackets into a shell)
curl -sS -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains/<SITE_APEX_ID>" \
  -H "Authorization: Bearer $TOKEN"
curl -sS -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains/<SITE_WWW_ID>" \
  -H "Authorization: Bearer $TOKEN"
# 3. re-attach to the teaser
for h in nsdcaseb.xyz www.nsdcaseb.xyz; do
  curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains" \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d "{\"hostname\":\"$h\",\"service\":\"nsdcaseb\",\"environment\":\"production\",\"zone_id\":\"$ZONE\"}"
done
# 4. purge cached site HTML
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"purge_everything":true}'
```

Expected timing:

| Step | Time |
| --- | --- |
| detach 2 hostnames | <10 s |
| attach to `nsdcaseb` | 10–30 s |
| DNS record recreation / propagation | seconds–2 min |
| cert reuse (existing apex cert) | usually instant, worst case <60 s |
| cache purge | immediate |
| **total to teaser serving again** | **30–120 s** |

Do **not** delete `nsdcaseb-site` during an incident — keeping it deployed makes
re-cutover a domain move, not a redeploy.

Verify rollback:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://nsdcaseb.xyz/   # 200 teaser
curl -sS https://nsdcaseb.xyz/ | grep -i 'coming soon'            # teaser copy
curl -sS -o /dev/null -w '%{http_code}\n' https://nsdcaseb.xyz/api/notify  # 405
curl -sS -o /dev/null -w '%{http_code}\n' https://preview.nsdcaseb.xyz/    # 200 staging
```

### 5.2 Keep domains, roll the site worker back one version (10–30 s)

Use this when the flip worked but the new code is bad. The positional argument
is a **version ID**, not a deployment ID (verified with `wrangler rollback
--help`; `deployments list` prints these under "Version(s)"):

```bash
npx wrangler versions list -c wrangler.production.jsonc
npx wrangler rollback <version-id> -c wrangler.production.jsonc \
  -m "rollback: <reason>" -y
```

This repoints 100% of traffic in ~10–30 s with no DNS/cert change and keeps
bindings, vars, crons, and secrets. Caveat: a rollback does **not** revert a
secret/vars change — if the incident was caused by a wrong secret, re-put the
correct value (or `wrangler versions secret put`), which publishes a new version.

### 5.3 Teaser itself is stale (redeploy only if needed)

```bash
npm run build && npx wrangler deploy -c wrangler.jsonc   # worker nsdcaseb, dist/
```

There is **no** `npm run deploy` script (corrected); `wrangler deploy` without
`-c` happens to pick `wrangler.jsonc`, but be explicit.

### 5.4 Data

- Do not run destructive SQL during an incident.
- Do not roll back schema: the previous site worker ignores the new
  columns/tables.
- If a bad write is suspected, export first and restore into a **new** DB:

  ```bash
  npx wrangler d1 export nsdc-auth-prod --remote -c wrangler.production.jsonc \
    --output=./tmp-d1-incident.sql
  ```

  Point `database_id` at the restored DB and redeploy only after verification.
- Media (`event-posters`) is in Supabase Storage and is unaffected by worker
  rollback.

### 5.5 After any rollback

Re-run §4.1 (headers/routing), §4.3 (`/api/notify`), and §4.4 (`/api/events`),
then confirm the teaser/site decision with the club before trying again.

---

## 6. Post-cutover verification (T+1h, T+1d)

```bash
npx -y lighthouse@latest https://nsdcaseb.xyz/registrations \
  --output=json --output-path=./lh-prod-registrations-mobile.json \
  --chrome-flags="--no-sandbox --headless"
npx -y lighthouse@latest https://nsdcaseb.xyz/registrations --preset=desktop \
  --output=json --output-path=./lh-prod-registrations-desktop.json \
  --chrome-flags="--no-sandbox --headless"
# repeat for /, /recruit, /archive, /projects/<id>
```

Acceptance vs the staging table appended to `docs/baseline.md` (2026-10-25):

- No route regresses below staging; mobile `/registrations` CLS < 0.1.
- **SEO should rise to 1.00 on every route.** Staging's 0.92 came from the
  shell's hardcoded `preview.` canonical, which `worker/meta.ts` now rewrites. A
  0.92 on production means meta injection did not ship (or the canonical/sitemap
  check in §4.2 failed) — investigate before announcing.
- `/recruit` desktop must be CLS < 0.01 and perf >= 0.94 (local post-fix:
  1.00 / 0.0006); `/archive` and `/projects/:id` mobile should be ~0.01. If
  `/recruit` desktop is still ~0.36, the deploy predates the `App.tsx` fallback.

```bash
BASE_URL=https://nsdcaseb.xyz npx playwright test -c e2e/playwright.config.ts axe --project=chromium
BASE_URL=https://nsdcaseb.xyz npx playwright test -c e2e/playwright.config.ts http-status
```

Axe specs navigate + scan (read-only); zero critical/serious required. The
`http-status` sweep now asserts `/nope` and `/admin` are 404 on production.

Ongoing:

- Uptime: `GET /api/admin/_ping` (expect `403` unauthenticated, `200` with an
  `ob` cookie; it is not a public `/health`).
- Email outbox depth (Admin → Email) for two cron cycles; failed rows retry.
- D1 exports/backup schedule; confirm the Time Travel window in the dashboard.
- Cloudflare analytics: 5xx and `/api/*` errors over the first hour.
- Delete the `[SAMPLE]` media album if not already done.
- Optional cleanup: after cutover is stable, set `workers_dev: false` in
  `wrangler.production.jsonc` and redeploy so the full site is not also
  indexable at `nsdcaseb-site.dhruvav0308.workers.dev` (its `robots.txt` allows
  crawling and its sitemap advertises that origin). This does not affect the
  custom domains or rollback.

---

## Appendix — audit corrections (2026-10-25)

- Apex `wrangler.jsonc` uses `run_worker_first: ["/api/*"]`, so the teaser's
  CSP/HSTS helper **does not run** for `/`. The old smoke check would have failed
  against the pre-cutover teaser. Header expectations now explicitly post-flip.
- `package.json` has no `deploy` script; replaced `npm run deploy` with
  `npx wrangler deploy -c wrangler.jsonc`.
- `wrangler rollback` takes a **version ID**, not a deployment ID.
- Staging has **four** secrets, including `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` (the old doc said the pair was absent and then
  contradicted itself). Production now lists all four as required, and notes the
  CSP dependency on `SUPABASE_URL`.
- Production resources did not exist at audit time: no `nsdc-auth-prod` D1, no
  production `RATELIMIT_KV`, no `nsdcaseb-site` worker. The old "recommended
  shape" is now a required, copy-paste config.
- `0006_content_demo.sql` is demo copy replaced by `0009`; not "real content".
  `0004` seeds a `[SAMPLE]` album; `0008` defaults `recruitment_open` to `'1'`.
- `/api/admin/_ping` requires an `ob` session (403 unauthenticated), not a public
  health endpoint.
- API-key/secret values must never appear in this repo, chat, or CI logs; only
  names are listed.
