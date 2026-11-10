# Cutover readiness audit — 2026-11-10

Read-only audit of `C:\Amrita\nsdcaseb` at branch `main`, HEAD
`b791bf4ac0b21544a2cc0a70793cd3e2d00e8e01` ("revert(site): remove the story
bearer until a new centrepiece is chosen", 2026-11-01 01:19 +0530).
Working tree clean (`git status --porcelain` → empty).

Question: is the repo **as committed today** ready for the production cutover in
`docs/production-cutover.md`, and where has that document drifted from the code
and config?

> **Status 2026-11-10:** all twelve drifts below were fixed after this audit in
> `docs/production-cutover.md`, `docs/runbook.md` and `public/robots.txt`. The
> findings are kept unchanged as the audit record; the verdict and counts
> describe HEAD `b791bf4`, not the fixed tree.

No product code, config, migration or test was modified. The only file written
is this report. No remote state was touched: `wrangler` was invoked only as
`--help` and the backup script only as `--help` / `--dry-run` (nothing written).

---

## Verdict

**READY WITH CAVEATS** — every committed config, binding id, migration, route
contract, header value and CI gate that the cutover document relies on matches
the code, so the flip is technically executable; but eight documented statements
are now wrong at HEAD (three of them would cause an operator to mis-diagnose a
healthy cutover), and the five hard pre-conditions that remain are all remote
state that this audit cannot see (migrations 0020/0021 applied, `RESEND_API_KEY`,
first `ob` account, `recruitment_open`, `[SAMPLE]` album).

---

## Summary table

| # | Checklist item | Status | Evidence |
| --- | --- | --- | --- |
| 1.1 | Prod worker `name: nsdcaseb-site` | PASS | `wrangler.production.jsonc:2` |
| 1.2 | Prod `main: worker/staging.ts` | PASS | `wrangler.production.jsonc:4` |
| 1.3 | Prod assets `./dist-site`, binding `ASSETS`, SPA fallback | PASS | `wrangler.production.jsonc:7-10` |
| 1.4 | Prod `run_worker_first: ["/*"]` | PASS | `wrangler.production.jsonc:11` |
| 1.5 | Prod D1 `AUTH_DB` = `nsdc-auth-prod` / `1cf53797-…` | PASS | `wrangler.production.jsonc:13-19` |
| 1.6 | Prod `RATELIMIT_KV` = `bb4737aa…`, distinct from staging | PASS | `wrangler.production.jsonc:23-24` vs `wrangler.staging.jsonc:22` |
| 1.7 | `NOTIFY_KV` = shared teaser namespace `9b54a4a0…` | PASS | `wrangler.production.jsonc:26-29`, `wrangler.jsonc:12-15` |
| 1.8 | `triggers.crons: ["*/15 * * * *"]` | PASS | `wrangler.production.jsonc:31-33` |
| 1.9 | `vars.MAIL_FROM` (var, not secret) | PASS | `wrangler.production.jsonc:34-36` |
| 1.10 | `workers_dev: true`, `preview_urls: false` | PASS | `wrangler.production.jsonc:5-6` |
| 1.11 | No `routes`/`custom_domains` in prod config (doc says none yet) | PASS | `wrangler.production.jsonc` (whole file) |
| 1.12 | Production worker / D1 / KV actually exist on the account | OPERATOR | remote; §0.5 claims only |
| 2.1 | 21 migrations, contiguous `0001`–`0021`, latest `0021` | PASS | `worker/db/migrations/` listing |
| 2.2 | `0020` adds `email_outbox.kind`, backfills by subject, deletes only pending confirmation/reminder rows | PASS | `0020_email_kind.sql:8-25` |
| 2.3 | `0021` adds nullable `events.venue` | PASS | `0021_event_venue.sql:5` |
| 2.4 | No destructive schema step in any migration | PASS | only `ALTER TABLE … ADD COLUMN` / `CREATE TABLE`; data deletes only in 0007/0009/0010/0011/0020 |
| 2.5 | `0006` is demo, `0009` real, `0010` real projects | PASS | `0009_content_real.sql:1-3` |
| 2.6 | `0004` seeds one `[SAMPLE]` album, 3 `picsum.photos` items | PASS | `0004_media.sql:49-66` |
| 2.7 | `0008` seeds `recruitment_open = '1'` | PASS | `0008_projects_site.sql:49` |
| 2.8 | Doc's `migrations list` expected output | **DRIFT** | DRIFT-01 |
| 2.9 | Prod D1 is at `0001`–`0019` (so 0020/0021 pending) | OPERATOR | remote |
| 3.1 | `POST /api/notify` contract (405/400/200/`already`, honeypot, `sub:<email>`, 503) | PASS | `worker/notify.ts:29-74` |
| 3.2 | `/` , `/login`, `/register`, `/verify-pending`, `/reset-password`, `/registrations`, `/recruit`, `/archive`, `/projects` → 200 | PASS | `worker/meta.ts:11-22`, `worker/staging.ts:209-214` |
| 3.3 | `/media` → 301 `/archive` | PASS | `worker/staging.ts:227-229` |
| 3.4 | `/nope` → 404 | PASS | `worker/meta.ts:112-118` → `toNotFound` `worker/staging.ts:95-100,212` |
| 3.5 | `/admin` → 404 (camouflage) | PASS | `worker/meta.ts:114` (`if (path === '/admin') return false;`) |
| 3.6 | `/api/events|projects|content|media|site` → 200 | PASS | `events.ts:281`, `projects.ts:125`, `content.ts:82`, `media.ts:551-553`, `projects.ts:397-408` |
| 3.7 | `/registrations/<unknown-id>` → 200 with default metadata | PASS | `worker/staging.ts:149-155`, `meta.ts:605-637` |
| 3.8 | `www` → apex 301 (doc says this code does not exist) | **DRIFT** | DRIFT-02 |
| 4.1 | CSP present on HTML, includes Supabase origin from `SUPABASE_URL` | PASS | `worker/security-headers.ts:8-16,18-37,50` |
| 4.2 | HSTS `max-age=31536000; includeSubDomains` | PASS | `worker/security-headers.ts:51` |
| 4.3 | `x-content-type-options: nosniff` | PASS | `worker/security-headers.ts:52` |
| 4.4 | `referrer-policy: strict-origin-when-cross-origin` | PASS | `worker/security-headers.ts:53` |
| 4.5 | CSP header only on `text/html`; JSON/XML untouched | PASS | `worker/security-headers.ts:47-48` |
| 5.1 | Canonical/OG follow request origin (no hard-coded preview origin) | PASS | `site/index.html:13,39-40,54,61-92` (apex fallbacks), `worker/meta.ts:705-822` |
| 5.2 | Event meta injection owns `/registrations/:id`, single canonical | PASS | `worker/meta.ts:530-638`, `worker/staging.ts:293-294` |
| 5.3 | Project meta injection owns `/projects/:id` | PASS | `worker/meta.ts:651-680`, `worker/staging.ts:296-297` |
| 5.4 | Sitemap `application/xml; charset=utf-8`, origin-aware | PASS | `worker/staging.ts:113-119` |
| 5.5 | Sitemap has ≥5 apex `<loc>` (5 static routes) | PASS | `worker/meta.ts:25,851-853` |
| 5.6 | Event `og:image` is always an apex URL | **DRIFT** | DRIFT-03 |
| 6.1 | Every env key the code reads is documented | PASS | `auth-helpers.ts:15-30` vs doc §0.2/§1/§2.4 — full match (see §"Env inventory") |
| 6.2 | Doc lists nothing the code does not read | PASS | same |
| 7.1 | `nsdc_session` = HttpOnly, SameSite=Lax, Path=/, Secure on https | PASS | `auth-helpers.ts:245-250`, `auth.ts:199-204` |
| 7.2 | Session expiry (12 h default / 30 d remember, server-side + Max-Age) | PASS | `auth-helpers.ts:74-75,267-283` (doc asserts nothing contradictory) |
| 7.3 | Doc's login smoke works for the `ob` account it bootstraps | **DRIFT** | DRIFT-04 |
| 7.4 | Register → 201, no `Set-Cookie` | PASS | `auth.ts:135-142` |
| 7.5 | Register password rule = "min 10" | **DRIFT** | DRIFT-05 |
| 7.6 | 5 registrations/hour/IP, all attempts counted | PASS | `auth.ts:74-85` (limit applied before body parsing), `auth-helpers.ts:79` |
| 7.7 | 6th attempt in the hour → 429 | PASS | `auth-helpers.ts:229-233` |
| 8.1 | Cron schedule `*/15 * * * *` | PASS | `wrangler.production.jsonc:32` |
| 8.2 | No key → `{delivered:false}`, no throw, retries, `failed` at 5 | PASS | `mailer.ts:28-36`, `email.ts:129,210-228` |
| 8.3 | Doc's "outbox queues forever" | **DRIFT** | DRIFT-06 |
| 8.4 | Schedule actually exists on the deployed worker | OPERATOR | Cloudflare API |
| 9.1 | `scripts/backup-d1.mjs --env production` exists with documented flags | PASS | ran `--help`; `backup-d1.mjs:60-86` |
| 9.2 | Output name `nsdc-auth-prod-production-<stamp>-<label>.sql` | PASS | ran `--dry-run`; `backup-d1.mjs:151-159` |
| 9.3 | Keeps newest 10 dumps, prints size + SHA-256 | PASS | `backup-d1.mjs:70,225-226,335-353,389-393` |
| 9.4 | Same routine CI runs before staging deploys | PASS | `ci.yml:195-199` |
| 9.5 | Rollback flags (`versions list`, `rollback <version-id> -m -y`) exist | PASS | `wrangler rollback --help` output |
| 9.6 | Rollback section's "`0017`–`0020` are additive" | DRIFT (minor) | DRIFT-07 |
| 9.7 | Time Travel 30-day window, D1 restore drill | OPERATOR | remote |
| 10.1 | CI `quality` + `audit` + `e2e` gates exist and run on push/PR | PASS | `ci.yml:30-52,58-68,92-137` |
| 10.2 | Deploy is manual-only (`workflow_dispatch` + `deploy_staging: true`) | PASS | `ci.yml:146-148` |
| 10.3 | No production deploy path anywhere in CI/scripts | PASS | grep: only comments + `backup-d1.mjs:51` |
| 10.4 | Doc's local green-gate list equals the CI gate | **DRIFT** | DRIFT-08 |
| 10.5 | CI green on this exact commit | OPERATOR | Actions |
| 11.1 | Dated statements (`2026-10-25`, `2026-10-31`, version/domain ids) | See §Stale | mostly harmless; three misleading |
| 11.2 | `[SAMPLE]` album state across the doc | **DRIFT** | DRIFT-09 |
| 11.3 | §6 visual acceptance (SVG bearer plate) matches HEAD | **DRIFT** | DRIFT-10 |
| 11.4 | §6 Lighthouse/CLS acceptance is backed by `docs/baseline.md` | **DRIFT** | DRIFT-11 |
| 12.x | Secrets set, domains, Resend DNS, prod rows, Preview URLs | OPERATOR | §Operator actions |

Counts: **PASS 47 · DRIFT 11 · UNVERIFIABLE 4 · OPERATOR 9** (some rows bundle
closely related checks; the drift list is one entry per distinct
document/reality conflict).

---

## Drift details

### DRIFT-01 — `d1 migrations list` expectation is inverted (§2.1)

Doc (`docs/production-cutover.md:238-242`):

> ```bash
> npx wrangler d1 migrations apply nsdc-auth-prod --remote -c wrangler.production.jsonc
> npx wrangler d1 migrations list  nsdc-auth-prod --remote -c wrangler.production.jsonc
> # expect: 0020_email_kind.sql and 0021_event_venue.sql listed as applied, then "No migrations to apply!"
> ```

`wrangler d1 migrations list --help` on the pinned CLI (`wrangler` 4.156.0,
`package.json:51`) prints:

```
View a list of unapplied migration files
```

So the command never lists *applied* migrations. After a successful apply it
prints only "No migrations to apply!". An operator following the comment
literally will see no `0020`/`0021` lines and may conclude the apply failed and
re-run it mid-cutover. Correct expectation: run `list` **before** `apply` and
expect `0020` + `0021` (and nothing else); afterwards expect
"No migrations to apply!".

### DRIFT-02 — the `www` → apex 301 already exists in code (§2.7, §2.10)

Doc (`docs/production-cutover.md:395-399`):

> Either accept it for launch or add a `www` → apex 301 in
> `worker/staging.ts` before attaching domains (**a code change not present
> today**). Do not use a Page Rule.

Code (`worker/staging.ts:220-224`):

```ts
// One canonical origin: www permanently redirects to the apex. Applies only
// to the production hostname; preview/workers.dev are untouched.
if (url.hostname === 'www.nsdcaseb.xyz') {
  return Response.redirect(`https://nsdcaseb.xyz${pathname}${url.search}`, 301);
}
```

Committed in `bb3d870` (2026-10-31), i.e. *before* the doc's last edit
`b3de383` (2026-11-01). Consequences: the "open decision" framing is stale, the
unchecked `- [ ] www canonical/redirect decision made` item
(`production-cutover.md:477`) is already satisfied, and an operator who
"implements the open decision" would duplicate the redirect. Site-behaviour
consequence is good: `www` never self-canonicalises, so the §4.2 duplicate-SEO
concern is resolved.

### DRIFT-03 — event `og:image` is the Supabase poster URL, not an apex URL (§4.2)

Doc (`docs/production-cutover.md:631-632`):

> ```bash
> curl -sS "$BASE/registrations/$EVENT_ID" | grep -oE '(<title>[^<]*</title>|property="og:(title|image)" content="[^"]*")'
> # exactly one canonical, event title in <title>, og:image an absolute https apex URL
> ```

Code (`worker/meta.ts:614-615`):

```ts
const defaultImage = !meta?.posterUrl;
const image = meta?.posterUrl ?? `${base}${DEFAULT_OG_IMAGE_PATH}`;
```

and `posterUrl()` returns a Supabase Storage public URL
(`worker/supabase-storage.ts`, bucket `event-posters`). For any event with a
poster — which §0.5 says production has ("poster upload + variants 200") — the
`og:image` is an absolute **Supabase** URL, not the apex. The assertion only
holds for poster-less events (`/og-default.png`). The cutover smoke will look
like a failure on a correct deploy. Fix the wording to "absolute https URL; the
Supabase poster when the event has one, else the apex `/og-default.png`".

### DRIFT-04 — the documented login smoke fails for the `ob` account the doc bootstraps (§4.5)

Doc bootstraps an office-bearer account in §2.6 (`production-cutover.md:369-373`,
"`role: "ob"`"), then documents login as (`production-cutover.md:681-685`):

> ```bash
> curl -sS -D - -o /dev/null -X POST "$BASE/api/auth/login" \
>   -H 'content-type: application/json' \
>   -d '{"email":"ops@bl.students.amrita.edu","password":"<password>"}' | grep -i 'set-cookie'
> # nsdc_session=...; HttpOnly; Secure; SameSite=Lax; Path=/
> ```

Code (`worker/auth.ts:191-196`):

```ts
if (normalizeRole(row.role) === 'ob' && env.ADMIN_ENTRY_CODE) {
  const adminCode = typeof body.value.admin_code === 'string' ? body.value.admin_code : '';
  if (adminCode !== env.ADMIN_ENTRY_CODE) {
    return json({ error: 'invalid_admin_code' }, 403);
  }
}
```

This runs **before** `createSession` (`auth.ts:200-205`), so the documented curl
returns `403 {"error":"invalid_admin_code"}` and **no** `Set-Cookie` for the only
account the checklist creates. The body must include
`"admin_code":"<ADMIN_ENTRY_CODE>"` — satisfied by the README
(`README.md:94` "shared code required when an `ob` logs in") but missing from the
cutover doc. §4.6's "Unlock with the zero-button + `ADMIN_ENTRY_CODE`" does not
cover this: that is the `/admin` door, a second, separate check.

### DRIFT-05 — the registration password rule is stronger than "min 10" (§2.6)

Doc (`docs/production-cutover.md:376-377`):

> `name` + `mobile` required, password min 10, rate limit 5
> registrations/hour/IP

Code (`worker/auth-helpers.ts:150-158`):

```ts
export function isStrongPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= PASSWORD_MIN &&   // 10
    password.length <= PASSWORD_MAX &&   // 200
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}
```

A compliant-looking `<at-least-10-chars>` value with no digit (or no letter)
returns `400 {"error":"weak_password"}`, and the doc's §2.6 sample therefore is
not a guaranteed success. Also missing: the 200-char cap.

### DRIFT-06 — "outbox queues forever" is false; rows fail after 5 attempts (§2.4)

Doc (`docs/production-cutover.md:339-340`):

> Without `RESEND_API_KEY` the mailer no-ops (`{ delivered: false }`) and the
> outbox queues forever.

Code (`worker/email.ts:129,216-223`):

```ts
const MAX_ATTEMPTS = 5;
...
const attempts = row.attempts + 1;
await env.AUTH_DB.prepare(
  `UPDATE email_outbox SET attempts = ?, status = ? WHERE id = ?`,
).bind(attempts, attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', row.id).run();
```

With the 15-minute cron that is ~75 minutes to `failed`, not "forever". The
runbook states it correctly (`docs/runbook.md:132-133`, "eventually move to
`failed` after five attempts"), so the two docs disagree. Practical impact: a
cutover that starts with no key does not "just wait"; the first verification /
recruitment mails become permanently `failed` and must be retried from Admin →
Email after the key is set.

### DRIFT-07 — rollback section still says "0017–0020" (§5.1)

Doc (`docs/production-cutover.md:741-745`):

> Nothing in D1 needs undoing: `0017`–`0020` are additive [...]

There are 21 migrations; `0021_event_venue.sql` is also purely additive
(`0021_event_venue.sql:5`), so the *conclusion* (no schema rollback needed) is
still correct, but the range is one migration short and `0021` is never named in
§5. The same omission is worse in the runbook: `docs/runbook.md:135` is titled
"Migration 0020 and deploy order" and `docs/runbook.md:158-162` tells production
to "apply `0020` to `nsdc-auth-prod` **before** deploying the production site
worker". An operator who follows the runbook instead of §2.1 would deploy a
worker whose event-create path writes `venue`
(`worker/events.ts:375`, `INSERT INTO events (… poster_key, venue)`) against a
schema without the column — `POST`/`PATCH /api/events` would 500 (the public
read path degrades gracefully: `worker/meta.ts:167-173`).

### DRIFT-08 — the local "green gates" list is weaker than the CI gate (§2.0)

Doc (`docs/production-cutover.md:187-197`) lists `npm ci`, `npx tsc -b`,
`npm run typecheck:site`, `npm run build`, `npm run build:site`, `npm test`,
`npm audit --omit=dev --audit-level=high`.

CI additionally runs `npx tsc -p worker --noEmit` and `npx tsc -p e2e --noEmit`
(`.github/workflows/ci.yml:43-46`), and that matters here: the root project graph
is `"include": ["src"]` (`tsconfig.json`), so `npx tsc -b` **does not typecheck
`worker/`** (`docs/baseline.md:233` says the same). Running only the doc's list
can certify a commit locally that CI would reject.

### DRIFT-09 — `[SAMPLE]` album is simultaneously "deleted" and "to delete" (§0.5 vs §2.1/§2.10)

Doc (`docs/production-cutover.md:27`):

> | Content | 4 events, 6 projects, real copy; `[SAMPLE]` album deleted; 0 users |

Doc (`docs/production-cutover.md:262-264`):

> `0004_media.sql` seeds a `[SAMPLE] Intro to ML Workshop` album with three
> `picsum.photos` placeholders. **Delete that album after cutover** [...]

Doc (`docs/production-cutover.md:476`): `- [ ] [SAMPLE] media album deleted`.

No migration removes it (`0004_media.sql:49-66` is the only writer; `0011` only
deletes the sample *event*), so a fresh `nsdc-auth-prod` definitely has it. The
two statements cannot both be true of the same database. Operator must decide
which database §0.5 is describing; the checklist item is the safe one.

### DRIFT-10 — §6 visual acceptance still requires the SVG bearer plate that HEAD removed (§6)

Doc (`docs/production-cutover.md:865-869`):

> **Visual parity with `preview.nsdcaseb.xyz`:** paper `#F2EEE3` ground, ink
> `#111110` type, kit header/footer, seal accent ≈10% of a viewport, [...]
> StoryStages 01/02/03 with the SVG bearer plate (no globe or canvas), and
> reduced motion serving a static stack.

HEAD (`b791bf4`, "revert(site): remove the story bearer…", 2026-11-01) deleted
`site/src/components/StoryFigure.tsx` and `public/story/turntable/*`, and
`site/src/components/StoryStages.tsx:16-17` now reads:

```
 * The centre of the stage is intentionally empty for now: a new centrepiece is
 * still to be designed.
```

The cited reference `docs/baseline.md:49-54` agrees with the code ("The centre of
the stage is empty by design for now … no globe, no canvas and no `three`
request"). Only the cutover doc is stale — and this is the one criterion that
says "a production page that looks like the old dark editorial site means the
wrong build shipped — stop and redeploy". An operator applying it literally will
see a missing bearer and roll back a correct deploy.

### DRIFT-11 — §6 numeric acceptance is not in the baseline it cites (§6)

Doc (`docs/production-cutover.md:862`):

> Acceptance vs the staging table in `docs/baseline.md` (2026-10-31, ink-on-paper):

Doc (`docs/production-cutover.md:870-876`): "**SEO should rise to 1.00 on every
route.** Staging's 0.92 …", "`/recruit` desktop must be CLS < 0.01 and perf >=
0.94 (local post-fix: 1.00 / 0.0006) … If `/recruit` desktop is still ~0.36, the
deploy predates the `App.tsx` fallback."

`docs/baseline.md:214-228` calls "the 2026-10-23 / 2026-10-25 Lighthouse or CLS
tables" retired history and says "Re-measure before citing performance numbers";
`docs/baseline.md:239-242` says E2E "was **not run**" and "Lighthouse was **not
run**". So the 2026-10-31 baseline contains no staging SEO/CLS table and cannot
be the comparison target. The 0.92 / 0.36 figures are the superseded numbers the
baseline tells you not to cite. §6 is therefore not executable as written.

### DRIFT-12 (minor) — `/robots.txt` is not "relative" on the teaser (§0.4)

Doc (`docs/production-cutover.md:119`):

> | `GET /robots.txt` | `200 text/plain` from `dist/robots.txt`, `Sitemap: /sitemap.xml` (relative) | [...]

File (`public/robots.txt:5`):

```
Sitemap: https://preview.nsdcaseb.xyz/sitemap.xml
```

`public/` is copied into `dist/`, so the pre-flip teaser advertises the **preview**
sitemap. Harmless after the flip (the site worker overrides `/robots.txt` with an
origin-aware body, `worker/staging.ts:244-262`), but the row is wrong for the
current repo and would hide a real teaser regression.

---

## Env inventory (verified complete)

Every key the runtime reads, and where it is documented:

| Key | Kind | Read at | Documented |
| --- | --- | --- | --- |
| `AUTH_DB` | D1 binding | `auth-helpers.ts:16` | §1 table, §0.2 |
| `RATELIMIT_KV` | KV binding | `auth-helpers.ts:17,230-232` | §1, §2.2 |
| `NOTIFY_KV` | KV binding | `worker/notify.ts:57` | §1, §2.9 |
| `ASSETS` | Assets binding | `staging.ts:52` | §1 table |
| `ADMIN_ENTRY_CODE` | secret | `auth.ts:109,191-193` | §0.2, §2.4 |
| `RESEND_API_KEY` | secret | `mailer.ts:28` | §0.2, §2.4 |
| `SUPABASE_URL` | secret | `security-headers.ts:10`, `supabase-storage.ts:48` | §0.2, §2.4 |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | `supabase-storage.ts:54,59,65` | §0.2, §2.4 |
| `MAIL_FROM` | var | `mailer.ts:29` | §1.1, §2.4 |
| `E2E_DISABLE_RATE_LIMIT` | test-only var | `auth-helpers.ts:227` | §2.0, §2.5, §4.8 |

Nothing read, nothing undocumented, no extra secret. Secrets were **not** read;
`.dev.vars` was not opened.

Also verified: `the four "production secrets" list in §2.4 exactly matches the four
code reads` (no `BROADCAST_*`, no `TURNSTILE_*`, no R2/Analytics token).

---

## Operator actions (Cloudflare / remote, in run order)

Grouped, ordered as the cutover would execute them. Nothing here is a repo bug.

**A. Before the flip (T-1 day)**

1. `npx wrangler d1 migrations list nsdc-auth-prod --remote -c wrangler.production.jsonc`
   — confirm only `0020_email_kind.sql` and `0021_event_venue.sql` are pending.
2. Take the restore point **before** writing:
   `node scripts/backup-d1.mjs --env production --label pre-cutover --supabase`
   (script verified: `--help` and `--dry-run` output above).
3. Apply: `npx wrangler d1 migrations apply nsdc-auth-prod --remote -c wrangler.production.jsonc`,
   then re-run `list` → expect "No migrations to apply!". **Do not deploy the
   site worker first** (§2.1 is correct about this; `events.ts:375` writes
   `venue`, so 0021 is not optional).
4. Content/state checks that only the account can answer:
   `SELECT COUNT(*) FROM events/projects/registration_applications`;
   `SELECT id,title FROM albums` (is the `[SAMPLE]` album there?);
   `SELECT key,value FROM site_settings WHERE key='recruitment_open'` (0008
   defaults to `'1'` — flip it with the documented `UPDATE` if the round is not
   open).
5. Secrets: `wrangler secret list -c wrangler.production.jsonc` → currently
   expected **3 of 4**; set `RESEND_API_KEY`. Never print values.
6. Resend domain: prove `mail.nsdcaseb.xyz` with a real send
   (`/api/admin/email/test`), not by an outbox row.
7. Bootstrap the `ob` account (§2.6), then set `email_verified=1` by SQL if
   Resend is not live yet.
8. Cron: `GET /accounts/71c1c94f025bff6aaacce3cd9ab795b5/workers/scripts/nsdcaseb-site/schedules`
   → expect exactly one `*/15 * * * *`; confirm no `E2E_DISABLE_RATE_LIMIT`.
9. Pre-attach smoke on `https://nsdcaseb-site.dhruvav0308.workers.dev` (§3.1).
10. Time Travel: confirm the 30-day window in the dashboard before relying on it.

**B. The flip**

11. Record the exact domain ids from
    `GET /accounts/<acc>/workers/domains` (`f17b289f…` / `4127924d…` were
    verified 2026-10-25 only).
12. Apex: detach from `nsdcaseb` → attach to `nsdcaseb-site`; then `www`; then
    `purge_cache`. One hostname end-to-end at a time.
13. Verify §3.4 (`/` 200, CSP/HSTS, `/nope` 404, `www` 200-or-301) and spot-check
    `/admin` → 404.

**C. After the flip**

14. Second D1 export (`--label post-flip`) plus a byte copy of Storage if the
    manifest is to be drillable.
15. Confirm the cron produced `sent`/`pending` movement in `email_outbox`.
16. Optional, per §6.1: `workers_dev: false` + redeploy.

**Unverifiable without credentials (4):** §0.5 "verified on workers.dev" results;
§0.1 live version ids (`59f799d0…`, `d5c48344…`, recorded 2026-10-25, and staging
has certainly been redeployed since — `bb3d870`, `b791bf4`); §0.5 content counts;
the staging CSP's Supabase project ref (`zgsecmkbfaqrzfuzfzdj`) as the production
value.

---

## Recommended repo changes before the flip

Only what would actually block or mislead the flip. All doc-only; no runtime
change is required.

1. **`docs/production-cutover.md` §2.1** — invert the `migrations list`
   expectation (DRIFT-01). This is the one that can make an operator re-run a
   migration mid-cutover.
2. **§2.7 / §2.10** — replace the "www decision open, code change not present
   today" paragraph with "implemented in `worker/staging.ts:220-224`; verify with
   `curl -sSI https://www.nsdcaseb.xyz/` → 301" and tick the checklist item
   (DRIFT-02).
3. **§4.5** — add `"admin_code":"<ADMIN_ENTRY_CODE>"` to the login body, or
   state explicitly that `ob` logins need it (`auth.ts:191-196`) (DRIFT-04).
4. **§6** — drop "with the SVG bearer plate" (or restate the acceptance as
   "empty stage centre, per `StoryStages.tsx:16-17` / `baseline.md:49-54`"), and
   either delete the 0.92/0.36/0.94 numbers or re-measure and record them in the
   baseline (DRIFT-10, DRIFT-11). As written, §6 tells the operator to roll back
   a correct deploy.
5. **§2.4** — "queues forever" → "rows stay `pending`, then become `failed`
   after 5 attempts (~75 min)" (DRIFT-06).
6. **`docs/runbook.md:135-162` (and §2.10/§5.1)** — name `0021_event_venue.sql`
   alongside `0020`, so the runbook-only path cannot deploy a worker whose
   event-create writes a column that is not there (DRIFT-07).

Non-blocking wording fixes (do them in the same pass if cheap): §4.2 `og:image`
wording (DRIFT-03), §2.6 password rule (DRIFT-05), §0.5 vs §2.1 `[SAMPLE]`
(DRIFT-09), §2.0 add `npx tsc -p worker --noEmit` (DRIFT-08), §0.4 robots row
(DRIFT-12).

---

## Stale but harmless

- §0 header "Audited 2026-10-25" vs §2.10 "State as of 2026-10-31" and the
  `docs/baseline.md` 2026-10-31 reference — mixed dates, no operational effect.
- §0.1 "Current live versions" — a rollback target must be re-listed with
  `wrangler versions list` anyway (§5.2 already says so). Expect these ids to be
  wrong; the procedure is right.
- §2.9's list restarts at 0 then jumps to 8 — cosmetic.
- §2.5's "`wrangler deployments status` does not show cron triggers" — a CLI
  behaviour claim, not something the repo can confirm, and the API workaround it
  recommends is correct.
- §6.1's "its `robots.txt` allows crawling and its sitemap advertises that
  origin" (workers.dev) — true, but incomplete: HTML on
  `nsdcaseb-site.*.workers.dev` already carries `X-Robots-Tag: noindex, nofollow`
  (`worker/staging.ts:34-36,59-66,73-85`), so the workers.dev surface is already
  de-indexed for HTML. Makes the optional cleanup look more urgent than it is.
- `README.md:20` says "Vite 6"; `package.json:49` pins `vite ^8.3.1` and
  `docs/baseline.md:3` records Vite 8.3.1. Unrelated to cutover; worth a
  one-line fix when the README is next touched.
- `docs/baseline.md` contradicts itself on the globe: line 12 says "the WebGL
  globe is **back on the landing page as a lazy-only chunk**" (and lines
  177/216-222 describe a `GlobeNarrative` chunk), while line 53 says "no globe,
  no canvas and no `three` request" and line 136 says "no globe or `three` chunk
  on any preview route". At HEAD there is no `three`/`Globe*` import under
  `site/src` (grep), so the "back on the landing page" sentences are the stale
  ones. Doesn't affect the flip, but §6 cites this file as its reference.

---

## Appendix — verification performed

Read-only commands actually executed in the repo:

- `git log --oneline -5`, `git status --porcelain`, `git rev-parse HEAD`
  (HEAD `b791bf4…`, tree clean)
- `git log -1 -- docs/production-cutover.md worker/staging.ts wrangler.production.jsonc`
- `git show --stat HEAD` (confirms the bearer/`StoryFigure` revert touched
  `docs/baseline.md`, not `docs/production-cutover.md`)
- `node scripts/backup-d1.mjs --help`
- `node scripts/backup-d1.mjs --env production --label test --dry-run`
  (printed the `d1 export nsdc-auth-prod --remote -c wrangler.production.jsonc`
  command; wrote nothing)
- `node node_modules/wrangler/bin/wrangler.js rollback --help`
- `node node_modules/wrangler/bin/wrangler.js d1 export --help`
- `node node_modules/wrangler/bin/wrangler.js d1 migrations list --help`

No `wrangler deploy`, no `d1 … --remote`, no `secret put`, no domain attach, no
`.dev.vars` read.
