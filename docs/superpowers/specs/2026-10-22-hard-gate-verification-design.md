# Hard-Gate Email Verification — Design

Date: 2026-10-22 | Approach: 1 (full hard gate, approved section by section in chat)

## Problem

Registration auto-signs users in (`handleRegister` creates a session immediately) and
nothing checks `email_verified` — not login, not `ProtectedRoute`, not event
registration. The verify/reset mails link to `/verify-email` and `/reset-password`,
but neither route exists in `site/src/App.tsx`, so verification cannot complete
from the inbox. Mails are text-only.

## Goal

Unverified users cannot use the site. Register → check-inbox screen, no session.
Login for unverified accounts → `403 email_unverified`. All auth mails get
HTML+text templates sent via the Resend seam (`worker/mailer.ts`).

## Section 1 — Worker API (`worker/auth.ts`, `worker/auth-helpers.ts`)

- `handleRegister`: create user + token + send verify mail (HTML+text), but do NOT
  create a session. Return `201 { user, verify_pending: true }` with no cookie.
- `handleLogin`: after password verification, if `!email_verified` return
  `403 { error: 'email_unverified' }` with no session. Verified flow unchanged.
- New `POST /api/auth/resend-verification` (`{email}` → always `202`, never reveals
  account existence, IP rate-limited 5/hr via a new `RATE_LIMITS` bucket): if the
  account exists and is unverified, mint a fresh token and re-send the verify mail.
- `handleVerifyEmail`: unchanged (`{ok:true}`); client routes to login after.
- `getSessionUser`: return `null` (and delete the session) for unverified users, so
  sessions minted before this deploys stop working. Event registration requires a
  session, so it is automatically gated — no changes in `events.ts`.

## Section 2 — Site pages + routing (`site/src`)

- New `/verify-pending`: check-inbox screen + resend form (email → resend endpoint).
  Register navigates here after `201`; login redirects here on `email_unverified`
  with the email prefilled.
- New `/verify-email`: reads `?token=`, calls verify endpoint; success → login link,
  invalid/expired → resend link.
- New `/forgot-password` + `/reset-password`: both missing today; forgot sends the
  mail, reset consumes `?token=` with new/confirm fields.
- `Login.tsx`: map `email_unverified` → redirect to `/verify-pending`.
- `Register.tsx` + `lib/auth.tsx`: `register()` no longer sets a session user (no
  cookie exists now); it surfaces the pending state and navigates away.
- `ProtectedRoute`: unchanged — no pre-verification sessions exist to gate.

## Section 3 — Email templates (HTML+text via Resend)

- Builders next to the existing text ones in `worker/email.ts` (new
  `worker/email-templates.ts` if length warrants): verify (CTA link + fallback URL),
  password-reset (same shape, expiry note), verified-welcome (login link, no token).
- Single-column inline-CSS dark card matching site aesthetic; text mirror always
  sent. Token links keep today's shape.
- Out of scope: event registration/reminder mails stay text-only (`enqueueEmail`
  does not persist `html`; templating those is a separate pass).

## Section 4 — Error handling & edge cases

- Token TTL 1h unchanged; used/invalid/expired → `400 invalid_token` → pages show
  the resend path.
- Resend outages stay best-effort (`trySendEmail`); API responses never depend on
  delivery; outbox retries via cron.
- One-time D1 cleanup at deploy: delete sessions for still-unverified users.
- Admin override stays: Accounts can manually mark verified (spam-folder escape).

## Section 5 — Verification

- `npm test` (42 site tests) + `tsc -p worker/tsconfig.json` green.
- Staging pass on `preview.nsdcaseb.xyz`: register → `201` no cookie → verify-pending;
  login pre-verify → `403`; resend → verify link → success → login `200` → event
  registration works; forgot/reset works; old unverified sessions dead.
- Confirm HTML+text delivery in Resend Logs + `email_outbox`.

## Non-goals

- Event/reminder mail templating. Token TTL changes. 2FA. Changing Resend
  sender/domain (`mail.nsdcaseb.xyz`, `MAIL_FROM` var already set).
