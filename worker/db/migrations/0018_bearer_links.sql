-- Optional professional links per office bearer, stored as a JSON array of
-- { "label": string, "url": string }. Additive only: existing rows default
-- to an empty list. Apply with the standard migration flow.
ALTER TABLE office_bearers ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
