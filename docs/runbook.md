# Content runbook

How to update what visitors see, what to do when fallback copy shows, and how
to ship. Baseline numbers live in `docs/baseline.md`.

## Admin console (`/admin`, sign in as `ob`)

Unlock via the AdminDoor, then use the tabs. Every tab needs an `ob` session;
members get 403.

| Tab | Path in UI | What it does |
| --- | --- | --- |
| Overview | Admin → Overview | Read-only stats (members, events, registrations, email queue). |
| Events | Admin → Events | Create / edit events: title, description, schedule, registration window, capacity (blank = unlimited), force-closed flag, poster upload, up to 20 registration questions. "Show archived" reveals soft-archived events; Archive/Unarchive toggles them. Registration Open/Close flips `force_closed`. |
| Registrations | Admin → Roster | Pick an event → roster table (search by email/name, status filter), "Download CSV (server)" for the full export. |
| Recruitment | Admin → Recruitment | Review applications (newest first), filter by status, expand "Answers", Select/Reject with a final-decision confirm, Download CSV. |
| Email | Admin → Email and audit | **Send test email** (one click, proves delivery), broadcast to all or one event (subject + body), outbox queue with pending/sent/failed filter, retry failed, audit-log table. |
| Content | Admin → Content | Office bearers (name, role, links as `Label https://…` one per line) and Achievements (title, description) — add / edit inline / delete with confirm. |
| Accounts | Admin → Accounts and roles | Search users, change role (member/executive/ob), toggle email-verified, resend verification. |

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
- **Media gallery**: `POST /api/media/albums|/items`, `PATCH` / `DELETE`
  `/api/media/albums/:id`, `/api/media/items/:id`. Images need https URLs;
  videos must be YouTube links. No admin UI — this is the one area where an
  admin tab is still missing.

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

```bash
npm run migrate:staging   # apply worker/db/migrations to the staging D1
npm run deploy:staging    # build dist-site/ + deploy nsdcaseb-staging (preview.nsdcaseb.xyz)
```

Production apex (`nsdcaseb.xyz`) serves the coming-soon teaser from
`wrangler.jsonc` (`npm run build && npx wrangler deploy`) and is **not**
affected by site work. Never point site builds at production.
