-- Phase 3: soft event archive for the admin console.
-- Archived events stay in the DB (rosters + audit intact) but are hidden
-- from the public list. Additive only.

ALTER TABLE events ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_events_archived
  ON events(archived_at);
