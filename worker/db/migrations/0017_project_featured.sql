-- Featured projects flag for the Projects depth plan.
-- Additive only. `projects.featured` is 0/1; existing rows default to 0
-- (not featured) so no backfill is needed. The owner picks standouts by
-- flipping the flag via PATCH /api/projects/:id — no code change required.

ALTER TABLE projects ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
