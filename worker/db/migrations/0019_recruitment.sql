-- Recruitment applications for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0019_recruitment.sql
--
-- Additive only. Email is stored normalized (trimmed + lowercase) so the
-- unique index is case-insensitive without a functional index, and the
-- public status lookup can match on it directly.
--
-- status: 'pending' -> 'selected' | 'rejected' (one-way; decided_at is set
-- by the worker at decision time).

CREATE TABLE recruitment_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  reg_number TEXT NOT NULL,
  phone TEXT NOT NULL,
  year TEXT NOT NULL,
  branch TEXT NOT NULL,
  why_join TEXT NOT NULL,
  contribute TEXT NOT NULL,
  time_commitment TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE UNIQUE INDEX idx_recruitment_applications_email
  ON recruitment_applications(email);

CREATE INDEX idx_recruitment_applications_status_created
  ON recruitment_applications(status, created_at);
