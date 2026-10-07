-- Corrections and additions from the club's public posts.
--
-- 1. NextMind Meet 2.0: the club's own announcement gives the event date as
--    17th October 2025 (the 18th was when the recap post went out).
-- 2. "How to Evolve in the Agentic Era" added to the archive at the club's
--    request. Date follows the club's own event listing (30 Sep); confirm and
--    the description can be replaced from the admin panel.

UPDATE events
SET starts_at = '2025-10-17T09:00:00Z',
    ends_at = '2025-10-17T17:00:00Z'
WHERE id = 'evt-nextmind-2';

INSERT INTO events (id, title, description, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, force_closed, questions) VALUES
  ('evt-agentic-era',
   'How to Evolve in the Agentic Era',
   'A workshop on the shift from AI that answers to AI that acts — what agentic systems change, and what students should learn and build to work with them.',
   '2026-09-30T09:00:00Z', '2026-09-30T17:00:00Z',
   '2026-09-01T00:00:00Z', '2026-09-29T00:00:00Z', NULL, 1, '[]')
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  force_closed = excluded.force_closed;
