-- Phase 3 events + registrations schema for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0003_events.sql

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reg_opens_at TEXT NOT NULL,
  reg_closes_at TEXT NOT NULL,
  capacity INTEGER,
  force_closed INTEGER NOT NULL DEFAULT 0,
  questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered',
  answers TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_registrations_event_status_created
  ON registrations(event_id, status, created_at);

-- Cancelled rows are kept for audit; only one live row per (event, user).
CREATE UNIQUE INDEX idx_registrations_active_unique
  ON registrations(event_id, user_id)
  WHERE status != 'cancelled';

-- Clearly-labeled sample so the archive renders; window is in the past and
-- force-closed so nothing is ever joinable.
INSERT INTO events
  (id, title, description, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, force_closed, questions)
VALUES
  ('sample-past-event', '[SAMPLE] Past Data-Science Meetup', 'Sample archived event used to render the registrations archive. Registration is closed.',
   '2020-03-01T10:00:00Z', '2020-03-01T12:00:00Z',
   '2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z',
   50, 1, '[]');
