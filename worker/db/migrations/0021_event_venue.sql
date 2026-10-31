-- Optional physical location for an event (room, hall, building, or address).
-- NULL means "no venue published", so existing rows stay unchanged and the
-- public pages keep rendering without a venue line. Additive only.

ALTER TABLE events ADD COLUMN venue TEXT;
