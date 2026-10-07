-- Projects + testimonials + site settings for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0008_projects_site.sql
--
-- Additive only. `projects.stack` stores a JSON array of strings.
-- `projects.event_id` is a loose cross-link to events(id): no FK on purpose,
-- so events can be removed without breaking the projects list. An empty
-- projects / testimonials table is the honest initial state — the club
-- supplies real rows via the admin API, so this migration seeds no fakes.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '[]',
  url TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  event_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE testimonials (
  id TEXT PRIMARY KEY,
  quote TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_sort_order
  ON projects(sort_order);

CREATE INDEX idx_testimonials_sort_order
  ON testimonials(sort_order);

INSERT INTO site_settings (key, value) VALUES ('announcement_active', '0');
INSERT INTO site_settings (key, value) VALUES ('announcement_text', '');
INSERT INTO site_settings (key, value) VALUES ('announcement_href', '');
INSERT INTO site_settings (key, value) VALUES ('recruitment_open', '1');
