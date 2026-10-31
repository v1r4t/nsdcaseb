# Content runbook

How to update what visitors see, what to do when fallback copy shows, how to
back the site up, watch it, and ship. Baseline numbers live in
`docs/baseline.md`.

## Surfaces

| Surface | Worker / config | Content |
| --- | --- | --- |
| `preview.nsdcaseb.xyz` | `nsdcaseb-staging` / `wrangler.staging.jsonc` | Full club site, **ink-on-paper** design (paper `#F2EEE3`, ink `#111110`, seal `#B33C1B`). This is the current build target for all site work. |
| `nsdcaseb.xyz`, `www.nsdcaseb.xyz` | `nsdcaseb` / `wrangler.jsonc` | Coming-soon teaser + launch list, until the cutover in `docs/production-cutover.md`. |
| production site (prepared) | `nsdcaseb-site` / `wrangler.production.jsonc` | Full site deployed on workers.dev only; apex/`www` are still on the teaser. |

Everything below that says "the site" means the ink-on-paper app on
`preview.nsdcaseb.xyz`. The teaser has no admin, auth or D1 binding.

## Admin console (`/admin`, sign in as `ob`)

Unlock via the AdminDoor, then use the tabs. Every tab needs an `ob` session;
members get 403.

| Tab | Path in UI | What it does |
| --- | --- | --- |
| Overview | Admin → Overview | Read-only stats (members, events, registrations, email queue). |
| Events | Admin → Events | Create / edit events: title, description, schedule, registration window, capacity (blank = unlimited), force-closed flag, poster upload, up to 20 registration questions. "Show archived" reveals soft-archived events; Archive/Unarchive toggles them. Registration Open/Close flips `force_closed`. |
| Registrations | Admin → Registrations | Pick an event → roster table (search by email/name, status filter), "Download CSV (server)" for the full export. Each registered/waitlisted row has a **Cancel** action; a confirmed seat promotes the oldest waiter. Guest rows show as "Guest registration" with their name and register number. |
| Recruitment | Admin → Recruitment | Review applications (newest first), filter by status, expand "Answers", Select/Reject with a final-decision confirm, Download CSV. |
| Gallery | Admin → Gallery | Create albums, then add event photos with a file picker: photos only, one at a time. The browser compresses the image and prepares WebP variants before upload. |
| Email | Admin → Email and audit | **Send test email** (one click, proves delivery), rich broadcast to all or one event (bold/lists/links, optional image), "What we send" policy panel, outbox queue with pending/sent/failed + mail-kind filters, retry failed, audit-log table. |
| Content | Admin → Content | Office bearers (name, role, links as `Label https://…` one per line) and Achievements (title, description) — add / edit inline / delete with confirm. |
| Accounts | Admin → Accounts and roles | Search users, change role (member/executive/ob), toggle email-verified, resend verification, delete an account with a typed-email confirmation. |

## Cancelling a registration (Admin → Registrations)

1. Sign in as `ob`, unlock `/admin`, open **Registrations**, and pick the
   event (archived events are listed too, so old rosters stay inspectable).
2. Find the row and press **Cancel**. The browser asks for confirmation; a
   guest is named by their registration name, not a missing email.
3. The row stays in the database as `cancelled` — nothing is deleted, so the
   answers and the audit trail remain. Cancelled rows have no cancel action.

**Promotion.** Cancelling a `registered` row frees one seat and, in the same
database batch, promotes the oldest `waitlisted` row for that event
(`created_at ASC`). If that person has an account, a **Waitlist promotion**
mail is queued to their account address; guest rows have no address and are
promoted silently. Cancelling a `waitlisted` row frees no seat and therefore
promotes nobody, so the event cannot overbook. The API response carries
`promoted_email` and the action is audited as `registration_cancel_admin`.

## Deleting an account (Admin → Accounts)

Delete is for accounts that should disappear entirely, not for a single event
registration (use **Registrations → Cancel** for that).

1. Search the account by email or name, press **Delete**, then type the
   account's exact email into the panel. Surrounding whitespace does **not**
   satisfy the confirmation, and the destructive button stays disabled until
   the strings match exactly.
2. The panel shows how many registration rows the account owns. On success the
   row leaves the list and the notice reports the removed/promoted counts.

**Guards.** The action is not rendered for your own signed-in account, and the
API refuses it with `400 cannot_delete_self` even if called directly. Deleting
the last remaining `ob`/`admin` is refused with `400 last_ob`; the guard is
evaluated inside the deleting statement, so concurrent demotions cannot leave
the club with zero office bearers.

**What is removed.** In one batch: the account, every registration row it owns
(registered, waitlisted or cancelled), its sessions and email tokens, pending
`email_outbox` rows addressed to it, recruitment applications with that email,
and audit rows it authored. Sent outbox history is kept. Events themselves are
never deleted.

**What is promoted.** For every event that has not ended (`ends_at` in the
future) where the account held a `registered` seat, the oldest waitlisted row
is promoted and a **Waitlist promotion** mail is queued when that person has an
account. Ended events and their waitlists are left alone. The action is audited
as `user_delete`.

## Email policy and outbox kinds

The site no longer mails everything it used to. The **What we send** panel in
**Admin → Email** is the live summary; this is the policy behind it.

| Kind | Sent? | When / notes |
| --- | --- | --- |
| `verification` | Yes | Sent immediately by registration or "resend verification". **Admin → Accounts → Send verification to unverified** queues the same kind for the 15-minute sweep. |
| `password_reset` | Yes | Sent immediately by the forgot-password flow. |
| `waitlist` | Yes | Two cases: joining a waitlist (`Waitlisted: …`) and promotion (`You're in: …`). |
| `recruitment_decision` | Yes | Queued when an application is selected or rejected. |
| `broadcast` | Yes | Admin composer, queued per recipient; may carry HTML and an optional image. |
| `test` | Yes | The delivery probe sends synchronously and bypasses `email_outbox`. |
| `registration_confirmation` | No | Confirmed registrations are deliberately silent; the confirmation screen and roster say everything. |
| `event_reminder` | No | No reminder job generates these any more. |
| `other` | — | Fallback for old rows; new sends always tag a real kind. |

The retired "Welcome" mail is not queued at all. Verification and password
reset are the only **immediate** auth sends; admin bulk verification is queued.
The outbox stores the kind per row, so **Email → Outbox → Email type filter**
and `GET /api/admin/outbox?kind=…` work on history as well as new mail.

## Broadcasts and the optional image

**Compose.** In **Admin → Email**, choose **All members** or **Per-event**
(per-event reaches only accounts registered or waitlisted for that event),
enter a subject (≤ 200 characters), and write the body in the rich editor.
The editor supports bold, italic, headings, bulleted/numbered lists, links
(`http://`, `https://`, `mailto:`), block quotes and horizontal rules. The
worker re-sanitises the HTML against a strict allow-list before queueing it,
keeps a plain-text mirror, and rejects an empty body or an over-large request
(the shared admin JSON cap is 32 KB).

**Optional image.** The picker accepts JPEG/PNG/WebP up to 10 MB. Before
upload the browser decodes it, caps the width at **1200 px** (never upscaling),
and re-encodes it as **JPEG at quality 0.82**. The worker then accepts only
JPEG/PNG up to 8 MB and stores the bytes in the public **`email-assets`**
bucket (`email/{uuid}.jpg` or `.png`). The returned URL is the only image host
the broadcast endpoint accepts — it must be the configured `SUPABASE_URL` and
an `/storage/v1/object/public/email-assets/` object. The plain-text mirror gets
`[Image: <alt or URL>]` plus the URL for clients that block images. Without
storage configured the upload answers `503 storage_not_configured` and **no
mail is queued** (there is no silent text-only fallback). There is no product
delete endpoint; `e2e/admin-email.spec.ts` uploads through the real composer and
then deletes the returned object directly through Supabase Storage in a
`finally` block whenever `.dev.vars` has the project URL and service-role key,
so a configured local run leaves no new bucket object behind. Manual cleanup is
only needed after an interrupted run.

**Delivery.** Queueing writes one `pending` row per recipient (`kind =
broadcast`); the scheduled sweep drains the queue every 15 minutes. On a worker
without `RESEND_API_KEY` the rows simply stay pending (and eventually move to
`failed` after five attempts), which is the normal local/CI state.

## Migration 0020 and deploy order

`worker/db/migrations/0020_email_kind.sql` adds `email_outbox.kind` (default
`other`) and backfills history by subject: `verification`, `waitlist` for
`Waitlisted:%` joins only (promotion `You're in:` subjects are **not**
backfilled), `registration_confirmation`, `event_reminder`,
`recruitment_decision` and `test`. It also deletes **pending** rows for the
retired confirmation/reminder kinds so the next sweep cannot deliver them after
the policy change.

The worker selects `kind`, so apply the migration **before** deploying the new
worker. Never the other way round: an old database without the column makes
every outbox query fail.

```bash
# Local (what e2e/CI use)
npx wrangler d1 migrations apply nsdc-auth --local -c wrangler.staging.jsonc

# Staging
npm run migrate:staging
npm run deploy:staging
```

Production follows the same ordering: apply `0020` to `nsdc-auth-prod`
(`npx wrangler d1 migrations apply nsdc-auth-prod --remote -c wrangler.production.jsonc`)
**before** deploying the production site worker (`nsdcaseb-site`). The apex
teaser worker has no `AUTH_DB` binding and ignores the new column, so it is not
part of this flow. See `docs/production-cutover.md` §2.1.


## Email delivery test

Resend is the delivery seam (`worker/mailer.ts`). A successful test is the
only proof that a worker's key **and** sender domain actually work; queued
rows in `email_outbox` alone prove nothing.

**From the UI.** Sign in as `ob`, open `Admin → Email and audit`, and click
**Send test email**. It sends `NSDC email test` synchronously to the
signed-in admin's own address and reports one of:

| Result | Meaning |
| --- | --- |
| `Sent (id …)` | Delivered to Resend. The key is present and `MAIL_FROM` is an accepted sender. Check the inbox (and spam) for the id shown. |
| `Not configured — set RESEND_API_KEY` | The worker has no `RESEND_API_KEY`. Set the secret on **that** worker (`npx wrangler secret put RESEND_API_KEY -c wrangler.staging.jsonc`), then retry. The outbox keeps waiting meanwhile. |
| `Provider rejected the message (HTTP 4xx)` | The key reached Resend but the request was refused. Usually the sender domain in `MAIL_FROM` (default `noreply@mail.nsdcaseb.xyz`) is not verified in Resend, or the API key is wrong/revoked. Verify the domain in the Resend dashboard and redeploy. |
| `Could not reach the email provider` | Network/DNS failure from the worker; retry, then check worker logs. |

**From a shell.** Same contract, `ob` session required:

```bash
curl -X POST https://<host>/api/admin/email/test \
  -H 'content-type: application/json' \
  -b 'nsdc_session=<ob cookie>' \
  -d '{}'
# 200 {"ok":true,"delivered":true,"detail":"<resend-id>"}
# 200 {"ok":true,"delivered":false,"detail":"not-configured"}
# 400 {"error":"invalid_email"}    (only when an explicit `to` is malformed)
# 401 / 403 without an `ob` session
```

An optional `{"to":"someone@example.com"}` overrides the recipient; leave it
out to use the signed-in admin. Every attempt is written to
`admin_audit_log` as `email_test` with the recipient, boolean, and provider
detail. The endpoint intentionally returns 200 for a failed send so the UI
can explain it; it never echoes the key.

**Outbox path.** The test bypasses `email_outbox` on purpose: it isolates the
provider from queueing. Broadcasts still enqueue, and the scheduled sweep
(`processOutbox`, every 15 minutes) marks rows `sent` only when the same
Resend call reports delivered; unconfigured workers increment `attempts` and
leave rows `pending` until the 5th attempt flips them to `failed`.

## Event posters and image variants

Posters are resized **once in the admin's browser**, before upload: no
Supabase Image Transformations and no Cloudflare Images. Creating or replacing
a poster sends three files in the same multipart request.

| Object | Key | What it is |
| --- | --- | --- |
| Original | `events/{id}/poster.webp` | The admin's file, uploaded unchanged. |
| Thumb | `events/{id}/poster-thumb.webp` | WebP, 640w, quality 0.82, never upscaled. |
| Full | `events/{id}/poster-full.webp` | WebP, capped at 1600w, quality 0.82, never upscaled. |

If the browser cannot encode WebP, the admin console still uploads the
original and says so; the site then serves the original alone.

**No schema change.** `GET /api/events` and `GET /api/events/:id` expose
`poster_variants: { thumb, full } | null`, derived from `poster_key` having a
value. There is no "has variants" column. Posters uploaded before this pipeline
have no variant objects, so those URLs 404; the public pages keep the original
as `src` and drop `srcSet` on the image's error event, so old events degrade to
the full-size poster with no broken images.

**Backfill existing posters.** Dev-only, one-off, sequential:

```bash
# sharp is intentionally not a package.json dependency.
npm install --no-save sharp

SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
node scripts/backfill-image-variants.mjs --site https://preview.nsdcaseb.xyz
```

Useful flags: `--event <id>` for one event, `--dry-run` to resize and report
sizes without uploading, `--force` to overwrite variants that already exist.
The script reads the public event list (including archived events) and each
poster's public URL, then uploads the two variants. It needs the Supabase
service-role key because Storage writes are not public. Without that key, run
`--dry-run` only. Re-running is safe: keys are deterministic and uploads upsert.

## Gallery photos (Admin → Gallery)

The public archive carousel reads its slides from the media gallery. Add photos
from the admin console; the old "paste an image URL" flow is gone for new
items.

1. Sign in as `ob` and unlock `/admin` (AdminDoor). Open **Admin → Gallery**.
2. **Create album** first (title required; description, event id, cover and
   sort order are optional). Use the **Album** picker to choose where the photo
   goes.
3. In **Add item**, choose a photo with the **file picker**. Fill in an optional
   title, caption and sort order, then **Add item**. Repeat for each photo —
   the picker is intentionally single-select, so uploads happen one at a time.

**What happens to the file.** The browser inspects the photo and encodes two
WebP variants before sending the request. Photos up to **10 MB** upload with
their original bytes; larger photos are re-encoded in the browser (WebP,
stepping width and quality down) until they fit under the cap.

| Multipart field | Object | Purpose |
| --- | --- | --- |
| `photo` | original, or compressed WebP when over 10 MB | Fallback/full-size source; still required. |
| `photo_thumb` | 640w WebP | Small card/carousel image. |
| `photo_full` | capped 1600w WebP | Larger preview. |

`photo_thumb` and `photo_full` are optional so a browser that cannot encode
WebP can still upload the original. The response is
`{ id, url, variants }`; the public `GET /api/media` feed then lists the item
under its album, with the same URL the browser displays.

**Limits and errors.** Photos only — there is no video option in this form,
and the picker accepts one file at a time. The uploaded source must stay at or
under **10 MB**; the browser compression above exists to meet that cap, and a
photo that is still too large after every compression step is rejected before
upload. The API answers:

| Status | Body | Meaning |
| --- | --- | --- |
| `201` | `{ id, url, variants }` | Stored and listed. |
| `413` | `{ "error": "photo_too_large" }` | Source is over the 10 MB cap (e.g. a script upload; the UI compresses first). |
| `400` | `{ "error": "invalid_file_type" }` | Not an image (the worker checks the uploaded file's MIME type; the picker offers images only). |
| `503` | `{ "error": "storage_not_configured" }` | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing on that worker. Local dev and CI without club storage hit this; nothing is written. |

Uploads go to the same Supabase Storage bucket as event posters. If storage is
not configured locally, the UI reports the 503 instead of silently dropping the
photo; configure the two values in `.dev.vars` (local) or as worker secrets
(staging) to exercise the real upload path.

**Scripted upload.** With an `ob` session cookie:

```bash
curl -X POST https://<host>/api/media/items \
  -H 'Cookie: nsdc_session=<ob cookie>' \
  -F album_id=<album id> \
  -F type=image \
  -F title='Workshop photo' \
  -F caption='Optional caption' \
  -F photo=@photo.jpg
# 201 {"id":"…","url":"https://<project>.supabase.co/storage/v1/object/public/…","variants":{…}}
# 503 {"error":"storage_not_configured"} when storage is not configured
```

**Cleaning up test uploads.** `e2e/media-upload.spec.ts` creates a
`[E2E] Gallery …` album, uploads a 1×1 PNG, asserts it in `GET /api/media`,
then deletes the item and album **rows**. Its throwaway `ob` account is removed
from local D1 in a `finally` block. The current delete endpoints do not remove
Storage objects, so a successful upload leaves a tiny
`gallery/<item id>/photo.webp` (plus any variants) in the bucket; delete that
prefix when you need a spotless bucket. If a run is interrupted, open
**Admin → Gallery** and delete the leftover `[E2E] …` album (its rows go with
it), then remove the matching `gallery/<item id>/` prefix. Never run this spec
against production: it creates and deletes real admin data.

## Things with no admin UI (API-only, `ob` session required)

Sign in via the site first, then call from that browser session, or reuse the
session cookie with curl. Mutations are audit-logged.

- **Landing sections** (`about`, `origin` copy): no editor in the Content tab
  (intentionally removed). Update directly:
  `PUT /api/content/sections/about` (or `/origin`) with `{"title": "…", "body": "…"}`.
- **Projects**: `POST /api/projects` (title, summary, description, stack ≤12,
  url, cover_url, status `active|shipped|archived`, event_id, featured) and
  `PATCH /api/projects/:id` / `DELETE /api/projects/:id`.
- **Featured-project flag**: `PATCH /api/projects/:id` with `{"featured": true}`.
  The Projects page shows flagged items in the standout block; with no flags
  the first two by sort order stand in — flipping a flag swaps the block with
  no code change. Keep 1–3 featured at a time.
- **Testimonials**: `POST /api/testimonials` (`quote`, `name`, `role`) and
  `PATCH /api/testimonials/:id` (`quote|name|role|sort_order|active`) /
  `DELETE`. Only `active: 1` rows render, ordered by `sort_order`.
- **Announcement + recruitment**: `PUT /api/site` with any of
  `announcement_active`, `announcement_text` (≤160 chars), `announcement_href`
  (same-origin path only), `recruitment_open` (booleans).
- **Media gallery**: album CRUD is still available at
  `POST /api/media/albums`, `PATCH` / `DELETE /api/media/albums/:id`, and items
  at `/api/media/items/:id`. **Admin → Gallery** is the normal path for photos;
  use the API directly only for bulk/automation. New photos are multipart
  uploads (`album_id`, `type=image`, `photo`, optional `photo_thumb` /
  `photo_full`) — see the Gallery photos section above.

## Recruitment applications

Public form and status lookup live at `/recruit`; review happens in
`Admin → Recruitment`.

**Where they live.** Applications are D1 rows in `recruitment_applications`
(migration `0019_recruitment.sql`), not emails or files. Columns: `name`,
college `email` (normalized lowercase, unique), `reg_number`, `phone`, `year`
(`1|2|3`), `branch`, the two long answers (`why_join`, `contribute`),
`time_commitment`, optional `remarks`, `status` (`pending|selected|rejected`),
`created_at`, `decided_at`. The admin list shows all three statuses; the
filter chips only narrow what is on screen (their counts are global).

**Decide.** Open `Admin → Recruitment` (the tab needs an `ob` session and the
usual AdminDoor unlock), find the applicant, expand `Answers` for the full
submission, then `Select` or `Reject`. The browser asks for confirmation and
the decision is **final** — the worker only updates rows that are still
`pending` (a second attempt gets 409 `already_decided`). Each decision writes
`admin_audit_log` and queues the applicant email in `email_outbox`; actual
delivery still waits on the club mail setup, same as other email.

**Status lookup.** `/recruit` → "Check your application status", or
`GET /api/recruit/status?email=<college email>&reg_number=<register id>`.
Both fields must match; the response is
`{ application: { status, created_at, decided_at } }`. Pending renders as
"Under review", selected as "Selected", rejected as "Not selected". Bad or
non-matching pairs return 404 `not_found` (the endpoint never reveals which
field was wrong). Public lookup is rate-limited to 20 checks / 15 min per IP.

**CSV.** `Download CSV` exports the rows for the filter currently selected
(`/api/admin/recruitment.csv?status=...`, header row included, all answers and
timestamps in plain text). It is an `ob`-only endpoint; open it from a signed-in
admin session.

**Open / close recruitment.** The page reads the `recruitment_open` row in
`site_settings` (`'1'` = open). Flip it either from a signed-in `ob` session:

```bash
curl -X PUT https://<host>/api/site \
  -H 'content-type: application/json' \
  -b 'nsdc_session=<ob cookie>' \
  -d '{"recruitment_open": false}'
```

or directly in the database (local/staging D1):

```sql
UPDATE site_settings SET value = '0', updated_at = datetime('now')
WHERE key = 'recruitment_open';
```

While closed, `/recruit` hides the form and shows "Applications are closed.";
`POST /api/recruit` answers 403 `recruitment_closed`. The status lookup stays
available. Reopen with `'1'` / `true`.

**Rules in force.** College email (`@bl.students.amrita.edu` only), unique
application per email (duplicate → 409 `already_applied`), phone 10–15 digits,
register ID 3–40 characters, and both long answers at least 40 characters on
the public form (the API floor is 10). Public submissions are limited to
10 / 15 min per IP.

## When fallback content shows

- **Landing about/origin/bearers/achievements**: the page never renders empty —
  `site/src/lib/content.ts` `FALLBACK_CONTENT` (baked-in copy) shows on *any*
  fetch failure (API down, migration not applied, malformed rows). If you see
  stale-but-plausible copy instead of your edits, check `/api/content` first:
  a 404/500 means the worker/DB is the problem, not your edit.
- **Announcement/testimonials**: failures resolve to "no announcement" /
  empty rotation (the Testimonials block renders nothing — no placeholder).
  Missing testimonials on the page = fetch failed or zero `active` rows.
- **Events / media / projects**: these show an error line ("Could not load…"),
  never fallback copy. An error there means the API is unreachable.

## Deploy

**Order matters.** Back up first, then apply migrations, then deploy the worker
that reads them (notably `0020_email_kind.sql`, which adds
`email_outbox.kind`):

```bash
node scripts/backup-d1.mjs --env staging --label pre-deploy   # restore point
npm run migrate:staging                                       # DB first
npm run build:site && npx wrangler deploy -c wrangler.staging.jsonc
```

Production is a separate, human-run cutover (`docs/production-cutover.md`).
There is **no automatic production deploy**, and CI cannot deploy production.

### Deploy paths at a glance

| Path | Trigger | Gate |
| --- | --- | --- |
| CI staging deploy | Actions → `ci` → **Run workflow**, set `deploy_staging` and a `reason` | `quality` + `audit` + `e2e` green on the same commit |
| Manual staging deploy | a human at a shell | run the checklist below |
| Production cutover | human, planned | `docs/production-cutover.md` §2–§3 |

The CI deploy job only runs when the workflow is dispatched with
`deploy_staging: true`. A normal push or pull request never deploys. The job
uses the `staging` environment, so repository settings can add required
reviewers on top of this.

Required repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit and
D1:Edit for the deploy, migration and export; add KV edit only when bindings
change) and optionally `CLOUDFLARE_ACCOUNT_ID` for multi-account tokens. The CI
backup is D1-only; Supabase credentials are not required there.

### What the CI staging job does

1. **Preflight** — refuses to run without `CLOUDFLARE_API_TOKEN` (and uses
   `CLOUDFLARE_ACCOUNT_ID` when set). Secrets are never printed.
2. **Build** — `npm run build:site` (`dist-site/`).
3. **Backup first** — `node scripts/backup-d1.mjs --env staging` exports the
   staging D1 and (when the Supabase pair is in the environment) writes a
   Storage manifest. The dump is uploaded as
   `d1-backup-staging-<run_number>` and kept 14 days.
4. **Migrations** — prints `wrangler d1 migrations list`, then applies pending
   migrations (`npm run migrate:staging`).
5. **Deploy** — `npx wrangler deploy -c wrangler.staging.jsonc`.
6. **Smoke** — shell, security headers, routes (`/nope` + `/admin` must 404),
   data APIs, canonical origin, XML sitemap and the Supabase CSP origin.
7. **Summary** — commit, reason, artifact name and the manual ink-on-paper
   checks still due. On failure it prints the rollback commands.

The job never touches `nsdcaseb` (teaser) or `nsdcaseb-site` (production).

### Manual staging deploy

Use this when CI is unavailable. It is the same order as CI:

```bash
git status --porcelain          # must be empty
git rev-parse HEAD              # record the SHA in the deploy note
npm ci
npm run build:site

# 1. Restore point BEFORE any schema change. Keep the dump out of git.
node scripts/backup-d1.mjs --env staging --label pre-deploy

# 2. Confirm what will be applied, then apply.
npx wrangler d1 migrations list nsdc-auth --remote -c wrangler.staging.jsonc
npm run migrate:staging

# 3. Deploy the worker + dist-site assets.
npx wrangler deploy -c wrangler.staging.jsonc

# 4. Smoke it (see the checklist below), then check the ink-on-paper items.
```

If a migration is pending and the backup step cannot run (expired login,
missing token), **stop** — do not apply the migration without a restore point.

### Rollback

**Worker code (preferred, 10–30 s, keeps DNS, bindings, secrets, crons):**

```bash
npx wrangler versions list -c wrangler.staging.jsonc
npx wrangler rollback <version-id> -c wrangler.staging.jsonc \
  -m "rollback: <reason>" -y
```

`rollback` takes a **version ID**, not a deployment ID. A rollback does not
undo a bad secret/vars change; re-put the correct value instead.

**Data.** Migrations in `worker/db/migrations/` are additive — there are no
down scripts, and the worker must not be pointed at a database that has not
applied the newest migration. Recover data like this:

1. Download the pre-deploy artifact `d1-backup-staging-<run_number>` (or use a
   local dump).
2. Create a **new** D1 database and import into it:
   ```bash
   npx wrangler d1 create nsdc-staging-restore
   npx wrangler d1 execute nsdc-staging-restore --remote \
     -c wrangler.staging.jsonc --file=tmp-d1-backups/<dump>.sql
   ```
3. Verify row counts (`users`, `events`, `registrations`,
   `recruitment_applications`, `email_outbox`) and spot-check the admin console.
4. Only then point a config at the restored database (a code/config change,
   reviewed like any other) and redeploy.

Cloudflare D1 Time Travel keeps 30 days of bookmarks and can restore in place:
`npx wrangler d1 time-travel info nsdc-auth --remote -c wrangler.staging.jsonc`.
Prefer importing the export into a new database for anything beyond a
minutes-old mistake; Time Travel restore is a last resort and still needs a
fresh export first.

**Never during an incident:** drop tables, run destructive SQL, delete the
worker (keeping it deployed makes recovery a rollback, not a rebuild), or
deploy the teaser config over staging.

## Backups (D1 + Supabase Storage)

What lives where:

| Store | Contents | Backup |
| --- | --- | --- |
| D1 `nsdc-auth` (staging) / `nsdc-auth-prod` (production) | users, sessions, events, registrations, applications, outbox, audit log, content | `scripts/backup-d1.mjs` export (`.sql`) |
| Supabase Storage `event-posters` | event posters **and** gallery photos (`gallery/<item id>/…`) | Storage manifest + byte copy |
| Supabase Storage `email-assets` | broadcast images (`email/<uuid>.jpg` or `.png`) | Storage manifest + byte copy |

A D1 dump alone is not a complete restore: rows point at Storage objects. The
script writes a manifest so a restore can prove which objects are missing; take
a byte copy before cutover and before bulk media work.

### Routine

- **Before every staging deploy** (CI does this automatically).
- **Before any production write or cutover** — twice: once at T-1 day, once
  immediately before the flip.
- **Daily while recruitment or event registration is open.**
- **Monthly** — keep one snapshot off the workstation (encrypted drive or
  club-owned storage). Dumps contain real member data: never commit, never
  paste into chat, never attach to a public issue.

### Commands

```bash
# Staging (default): nsdc-auth, wrangler.staging.jsonc
node scripts/backup-d1.mjs --label daily

# Production: nsdc-auth-prod, wrangler.production.jsonc
node scripts/backup-d1.mjs --env production --label pre-cutover

# Local wrangler dev database (no credentials needed)
node scripts/backup-d1.mjs --local --label local

# Print the commands without writing anything
node scripts/backup-d1.mjs --env production --dry-run
```

Output defaults to `tmp-d1-backups/` (ignored by the `tmp-*` rule in
`.gitignore`). Each run prints the file, size and SHA-256, and keeps the newest
10 dumps (`--keep N`, `0` keeps all). The Supabase manifest is written
automatically when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set;
`--supabase` makes a missing pair an error and `--no-supabase` skips it. The
manifest lists bucket, object key, size and update time — it does **not**
download bytes.

Byte copy of the public buckets (no extra credentials; both buckets are public):

```bash
MANIFEST=tmp-d1-backups/<dump>.storage-manifest.json
DEST=tmp-d1-backups/storage
for bucket in event-posters email-assets; do
  jq -r --arg b "$bucket" '.buckets[$b].objects[]?.key' "$MANIFEST" |
  while IFS= read -r key; do
    mkdir -p "$DEST/$bucket/$(dirname "$key")"
    curl -fsS "$SUPABASE_URL/storage/v1/object/public/$bucket/$key" \
      -o "$DEST/$bucket/$key"
  done
done
```

For a private bucket or a resumable copy, use rclone against the Supabase S3
endpoint (`https://<project>.supabase.co/storage/v1/s3`) with S3 access keys
created in the Supabase dashboard (Storage → S3). The service-role key is not
an S3 credential.

### Restore drill (do this once per quarter)

1. Import the dump into a throwaway D1 (never staging/production directly).
2. Count rows in `users`, `events`, `registrations`, `recruitment_applications`.
3. Check the manifest's object count against the copied files; list a few
   poster URLs from `events` and confirm the bytes exist locally.
4. Delete the throwaway database. Record the date and result in the ops note.

## Post-deploy smoke checklist

CI runs the automated part; run the rest after every staging deploy and after
the production cutover. Use `-H 'cache-control: no-cache'` for the first
10 minutes.

### Automated (CI `Smoke test staging`)

- [ ] `/` 200; CSP, HSTS and `nosniff` present; CSP includes the Supabase
      origin (posters render).
- [ ] `/registrations`, `/recruit`, `/archive`, `/projects` 200; `/media` is a
      301 to `/archive` (the old route is intentionally retired).
- [ ] `/nope` and `/admin` 404 (teaser no longer serving; admin door hidden).
- [ ] `/api/events`, `/api/projects`, `/api/content`, `/api/media`, `/api/site`
      200.
- [ ] `/registrations` canonical is the preview origin (for example
      `https://preview.nsdcaseb.xyz/registrations`).
- [ ] `/sitemap.xml` is `application/xml` and advertises the preview origin.

### Manual — ink-on-paper

- [ ] Page ground is paper `#F2EEE3`, type is ink `#111110`; no dark-theme
      flash and no cream-on-cream text (check the landing, admin tables/forms,
      footer and announcement banner).
- [ ] Header/Footer render the kit chrome; seal is an accent only (≈10% of a
      viewport, never body copy).
- [ ] Landing StoryStages 01/02/03 render text-only with no globe/canvas;
      reduced motion leaves a readable static stack, and mobile uses the paper
      composition with no room line-art behind copy.
- [ ] No layout jump on `/recruit` desktop or `/registrations` mobile
      (CLS < 0.1); fonts are the local Bespoke Serif / Switzer / Geist Mono.
- [ ] Archive contact sheet and event posters still show real media (no kit
      placeholders), and gallery items match `Admin → Gallery`.

### Manual — product

- [ ] Register a college address → verification mail arrives; verify, log in,
      reload stays signed in, logout clears the session.
- [ ] Register for an open event → confirmed or waitlisted; cancel → seat
      frees and the oldest waiter is promoted.
- [ ] `/recruit` submits and the status lookup returns the same status;
      `Admin → Recruitment` can select/reject and download CSV.
- [ ] `/admin` while locked is a camouflage 404; unlock with
      `ADMIN_ENTRY_CODE`; a member session gets 403.
- [ ] `Admin → Email → Send test email` reports a Resend id (the only proof
      the key + sender domain work).
- [ ] After a cron cycle (≤15 min): `email_outbox` pending drops, or attempts
      increment if Resend is intentionally off:
      `npx wrangler d1 execute nsdc-auth --remote -c wrangler.staging.jsonc --command "SELECT status, COUNT(*) FROM email_outbox GROUP BY status;"`
- [ ] No `E2E_DISABLE_RATE_LIMIT` in vars or page source.

Record the commit SHA, backup artifact name and pass/fail in the deploy note.
If any item fails, roll back (above) rather than patching on staging.

## Monitoring and alerting

### What “healthy” means

| SLI | Definition | Target (SLO) |
| --- | --- | --- |
| Availability | Share of requests to `/` and `/api/*` that are **not 5xx** (4xx/429 are expected client/rate-limit outcomes) | **99.5% / 30 days** |
| Registration path | `POST /api/events/:id/register` returns 2xx/409/429, never 5xx | 99.5% / 30 days |
| Email sweep | Oldest `pending` outbox row is drained within 30 min of the cron tick | 99% of days |
| Deploy success | Manual staging deploy passes smoke on first try | track, no SLO |

99.5% monthly leaves an **error budget of ~3 h 36 min**. Budget policy:

- **>50% remaining:** ship normally.
- **<50% remaining:** no risky changes (migrations, auth, cron); fix
  reliability first.
- **Exhausted:** only fixes and rollbacks until a clean 7-day window; note it
  in the ops log and tell the club.

This is a club site, not a payment system: the SLO exists to make “is it bad
enough to act?” a decision, not to justify paging at 3 a.m.

### Cloudflare analytics and logs

- **Workers & Pages → `nsdcaseb-staging` (and `nsdcaseb-site`) → Metrics:**
  requests, 5xx count/rate, subrequests, CPU p50/p99. Filter by status and
  path; `/api/*` errors are the first place to look.
- **Observability / Workers Logs:** enable in the dashboard for both workers
  (the committed Wrangler configs deliberately do not pin an observability
  block). Logs are sampled and retained by Cloudflare; do not log secrets,
  passwords, session cookies or full request bodies.
- **Live tail during an incident:** `npx wrangler tail -c wrangler.staging.jsonc
  --format pretty` (authenticated; stop it afterwards — it streams real
  traffic).
- **D1 → `nsdc-auth` / `nsdc-auth-prod`:** queries, rows read/written, errors,
  storage; Time Travel bookmarks and the 30-day restore window.
- **Cron:** Worker → Triggers → Cron (expect exactly `*/15 * * * *`) and the
  outbox query above; `wrangler deployments status` does **not** show crons.
- **Zone analytics** (`nsdcaseb.xyz`): request volume, cache ratio, 5xx at the
  edge, certificate status.

### Uptime checks

Use an external monitor (Better Stack, UptimeRobot, or Cloudflare Health
Checks) so a Cloudflare-wide incident is still visible. Read-only endpoints
only:

| Check | URL | Expect | Interval |
| --- | --- | --- | --- |
| Site HTML | `https://preview.nsdcaseb.xyz/` (production: apex) | 200, body contains `NSDC` | 1 min |
| Data API | `/api/events` | 200, JSON | 5 min |
| Admin liveness | `/api/admin/_ping` | 403 unauthenticated (worker + D1 reachable; it is not a public `/health`) | 5 min |
| Sitemap | `/sitemap.xml` | 200, `application/xml` | 15 min |

Do not probe `POST` endpoints, registration, or auth from a monitor: they
write data and consume rate-limit budget. A `403` from `_ping` is a **pass**.

### Alerts

Route to the club ops address and a chat channel the exec team reads.

| Alert | Condition | First response |
| --- | --- | --- |
| 5xx spike | >1% of requests over 5 min, or >10 5xx/min | Check Worker logs + D1 errors; roll back if it started with a deploy |
| Worker exceptions | any uncaught exception in 5 min | Same; capture the request path (never the body) |
| Latency | p95 > 1.5 s for 10 min | Check D1 and Supabase reachability |
| Site down | 2 consecutive uptime failures | Check Cloudflare status; then worker/deploy |
| Email stalled | oldest `pending` outbox row > 30 min, or pending > 25 for 30 min | Check cron trigger, `RESEND_API_KEY`, Resend status |
| D1 errors | any query error rate above baseline | Check migration state and D1 status |
| Certificate | <14 days to expiry | Cloudflare usually auto-renews; check the zone |
| Deploy failure | CI `deploy-staging` fails | Use the run summary rollback block |

Review the error budget and alert noise on the first Monday of each month;
delete alerts nobody acts on and add the ones that were missed.

## Dependency audits

`package.json` splits runtime dependencies (shipped in the worker/site bundle)
from devDependencies (build, test and deploy tooling only). CI enforces that
split:

```bash
npm audit --omit=dev --audit-level=high   # gate: production deps must be clean
npm audit --audit-level=high              # informational: includes dev tooling
```

The `audit` job runs the first command as a gate and posts the second as a run
summary without blocking the deploy. As of **2026-10-31** production
dependencies are clean; the full audit reports dev-only advisories in `vite`
(launch-editor Windows handling, dev-server middleware) and its build-time
transitives `source-map-js` and `postcss-selector-parser`. None is in the
deployed worker or `dist-site` output: they run while building or testing.

**Triage dev-only findings**

1. Confirm it is dev-only: `npm explain <package>` and check it is not a
   dependency of `worker/` or `site/` runtime code. If it ships, treat it as a
   production gate failure.
2. Read the advisory (GHSA link) for the affected versions and the actual
   attack surface. A dev-server-only issue is not reachable from the deployed
   site.
3. Prefer a patch/minor upgrade in the lockfile; run `npm ci`, `npm run
   build`, `npm run build:site`, `npm test` and the e2e job. Do not use
   `npm audit fix --force` (it can jump majors) and do not upgrade tooling
   during a deploy freeze or the cutover window.
4. If no fix exists, record the advisory, why it is not reachable, and the
   review date in the ops note; re-check monthly.
5. `.npmrc` sets `legacy-peer-deps=true`, so peer conflicts are ignored during
   install. After a major upgrade, verify the build explicitly rather than
   trusting a clean `npm ci`.

Cadence: monthly, plus before the production cutover and after any Dependabot
security alert. Enabling Dependabot alerts/security updates in repository
settings is recommended; this repo does not commit a Dependabot config.
