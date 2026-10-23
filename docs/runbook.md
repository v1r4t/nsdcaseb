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
| Email | Admin → Email and audit | Broadcast to all or one event (subject + body), outbox queue with pending/sent/failed filter, retry failed, audit-log table. Note: queueing works; actual delivery starts once club email is connected ("Delivery: not configured" banner). |
| Content | Admin → Content | Office bearers (name, role, links as `Label https://…` one per line) and Achievements (title, description) — add / edit inline / delete with confirm. |
| Accounts | Admin → Accounts and roles | Search users, change role (member/executive/ob), toggle email-verified, resend verification. |

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
