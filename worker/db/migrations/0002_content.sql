-- Phase 2 landing content for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0002_content.sql
--
-- Every seeded value is placeholder copy. Text fields are prefixed with
-- "[TODO" and section bodies open with `<!-- TODO(club): replace -->` so the
-- club can find them with one grep. Additive only: no drops, no rewrites.

CREATE TABLE content_sections (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE office_bearers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  cohort TEXT,
  photo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Landing copy -------------------------------------------------------------

-- Body copy uses real multi-line string literals (SQLite does not expand
-- backslash escapes); blank line between paragraphs.

INSERT INTO content_sections (key, title, body, sort_order) VALUES
  (
    'about',
    '[TODO: replace] About the club',
    '<!-- TODO(club): replace -->

[TODO: replace] Write two or three sentences about what NSDC is, who it is for, and what a typical week looks like. Keep it plain.',
    10
  ),
  (
    'origin',
    '[TODO: replace] How we started',
    '<!-- TODO(club): replace -->

[TODO: replace] Write the short version of the origin story: who founded the club, when, and what problem it set out to solve.',
    20
  );

-- Office bearers -----------------------------------------------------------

-- Note: SQLite string literals do NOT process backslash escapes, so the
-- cohort en dashes below are literal UTF-8 characters.

INSERT INTO office_bearers (id, name, role, cohort, photo_url, sort_order) VALUES
  ('placeholder-president',   '[TODO: replace] President (placeholder)',  '[TODO: replace] President',   '2025–26', NULL, 10),
  ('placeholder-secretary',   '[TODO: replace] Secretary (placeholder)',  '[TODO: replace] Secretary',   '2025–26', NULL, 20),
  ('placeholder-coordinator', '[TODO: replace] Data Lead (placeholder)',  '[TODO: replace] Coordinator', '2025–26', NULL, 30);

-- Achievements -------------------------------------------------------------

INSERT INTO achievements (id, title, description, date, sort_order) VALUES
  (
    'placeholder-achievement-1',
    '[TODO: replace] First achievement',
    '[TODO: replace] One line on what was done and who it was for.',
    NULL,
    10
  ),
  (
    'placeholder-achievement-2',
    '[TODO: replace] Second achievement',
    '[TODO: replace] One line on what was done and who it was for.',
    NULL,
    20
  );