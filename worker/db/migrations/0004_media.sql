-- Phase 4 media gallery schema for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0004_media.sql
--
-- URL-based media only: no object storage binding yet, every item points at an
-- external https URL. Additive only: no drops, no rewrites.

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  event_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_albums_sort_order
  ON albums(sort_order);

CREATE TABLE media_items (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'image',
  source TEXT NOT NULL DEFAULT 'url',
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_media_items_album_sort
  ON media_items(album_id, sort_order);

-- Note on `source`: 'url' means the item renders from an external https URL.
-- 'r2' is reserved for a later phase so R2 uploads can land without a schema
-- change. The API rejects anything but 'url' today.

-- Note on `event_id`: a loose label reference for now. There is deliberately no
-- foreign key to events(id) — event ids are server-generated UUIDs and an
-- album should survive its event being deleted.

-- Seed -----------------------------------------------------------------------
-- One clearly-labeled sample album with three placeholder photos so the gallery
-- renders before the club uploads anything. picsum.photos serves stable seeded
-- placeholder images. No sample video: an album with a fake video would embed
-- somebody else's content.

INSERT INTO albums (id, title, description, cover_url, sort_order) VALUES (
  'sample-media-album',
  '[SAMPLE] Intro to ML Workshop',
  'Sample album seeded with placeholder photos. Delete this album from the admin dashboard once real event photos are uploaded.',
  'https://picsum.photos/seed/nsdc1/1200/800',
  10
);

INSERT INTO media_items (id, album_id, type, source, url, title, caption, sort_order) VALUES
  ('sample-media-item-1', 'sample-media-album', 'image', 'url',
   'https://picsum.photos/seed/nsdc1/1200/800',
   '[SAMPLE] Photo 1', 'Placeholder image — replace with a real event photo.', 10),
  ('sample-media-item-2', 'sample-media-album', 'image', 'url',
   'https://picsum.photos/seed/nsdc2/1200/800',
   '[SAMPLE] Photo 2', 'Placeholder image — replace with a real event photo.', 20),
  ('sample-media-item-3', 'sample-media-album', 'image', 'url',
   'https://picsum.photos/seed/nsdc3/1200/800',
   '[SAMPLE] Photo 3', 'Placeholder image — replace with a real event photo.', 30);
