-- Deterministic e2e seed for the LOCAL D1 database only.
-- Never apply to staging/production (it would inject fake events).
--
--   npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc
--
-- Registration windows are wide open (2020 -> 2035) so the events are always
-- joinable; dates far in the future keep them in "Upcoming". Re-running is
-- safe: rows are deleted first, including registrations that reference them.
-- Specs still skip gracefully when no seeded event matches (empty DB), so
-- this file is an accelerator, not a requirement.

DELETE FROM registrations WHERE event_id IN ('e2e-open-plain', 'e2e-open-questions', 'e2e-tiny-cap1');
DELETE FROM events WHERE id IN ('e2e-open-plain', 'e2e-open-questions', 'e2e-tiny-cap1');

INSERT INTO events
  (id, title, description, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, force_closed, questions)
VALUES
  ('e2e-open-plain', '[E2E] Open Workshop (no questions)', 'Seeded e2e event with no questions; safe for guest registration.',
    '2030-06-01T10:00:00Z', '2030-06-01T12:00:00Z',
    '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
    50, 0, '[]'),
  ('e2e-open-questions', '[E2E] Open Workshop (required question)', 'Seeded e2e event with one required question for the stepped member flow.',
    '2030-06-02T10:00:00Z', '2030-06-02T12:00:00Z',
    '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
    50, 0, '[{"id":"why","label":"Why do you want to join?","required":true,"maxLength":500}]'),
  ('e2e-tiny-cap1', '[E2E] Tiny Event (capacity 1)', 'Seeded e2e event with capacity 1 for the waitlist/promote flow.',
    '2030-06-03T10:00:00Z', '2030-06-03T12:00:00Z',
    '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
    1, 0, '[]');
