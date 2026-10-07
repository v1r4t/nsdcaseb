-- Real NSDC office bearers, replacing the 2026-10 demo seed rows.
-- Supplied by the club. Roles/cohorts are verbatim; ordering is club order.

DELETE FROM office_bearers WHERE id LIKE 'bearer-%';

INSERT INTO office_bearers (id, name, role, cohort, photo_url, sort_order) VALUES
  ('bearer-b-parswanadh',      'B Parswanadh',      'President',           '2024', NULL, 10),
  ('bearer-aluvala-sai-vinya', 'Aluvala Sai Vinya', 'Vice President',      '2024', NULL, 20),
  ('bearer-dhruva-vura',       'Dhruva Vura',       'Vice President',      '2025', NULL, 30),
  ('bearer-k-shanmuga-priya',  'K Shanmuga Priya',  'Treasurer',           '2025', NULL, 40),
  ('bearer-babbitha-b',        'Babitha B',         'Head of Executives',  '2025', NULL, 50);
