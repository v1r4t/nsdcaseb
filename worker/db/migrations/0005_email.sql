-- Phase 5 email outbox + admin audit log for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0005_email.sql
--
-- Delivery activates later (mailer seam logs until M365 credentials land);
-- this migration only builds the queue machinery. Additive only.

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  html TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX idx_email_outbox_status_created
  ON email_outbox(status, created_at);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_admin_audit_log_created
  ON admin_audit_log(created_at);
