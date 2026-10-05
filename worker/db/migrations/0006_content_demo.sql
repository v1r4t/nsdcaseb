-- DEMO seed data for the club to replace via the admin content editor.
--
-- This migration swaps the 0002 placeholder copy for realistic demo content so
-- the landing page looks alive on first paint. The club should overwrite every
-- row below with its own real copy through the admin content editor.
--
-- UPDATE/INSERT only: no DROP, no DELETE. Safe to apply on top of 0002.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0006_content_demo.sql

-- About --------------------------------------------------------------------
UPDATE content_sections SET
  title = 'About the club',
  body = 'NSDC is Amrita''s student-run data club — short for the National Student Data Corps chapter on our campus. We meet every week for hands-on sessions on Python, machine learning, and data visualisation, plus monthly project nights where small teams ship something real.

No experience needed and all branches are welcome. Most members joined knowing only a little Python; the sessions, peer mentors, and project nights do the rest.'
WHERE key = 'about';

-- Origin -------------------------------------------------------------------
UPDATE content_sections SET
  title = 'How we started',
  body = 'NSDC started in early 2024, when a handful of juniors realised their data science courses were all theory and no datasets. They booked the hostel common room, put up a handwritten poster, and nine people showed up for the first meetup — a messy, wonderful evening of installing pandas together.

Word spread. The common-room meetups became weekly workshops, the workshops gained project nights, and by the end of the year the club was running events for hundreds of students across branches.'
WHERE key = 'origin';

-- Office bearers: give the three seeded rows real demo identities --------------
UPDATE office_bearers SET
  id = 'bearer-ananya-sharma',
  name = 'Ananya Sharma',
  role = 'President',
  cohort = '2026',
  photo_url = NULL,
  sort_order = 10
WHERE id = 'placeholder-president';

UPDATE office_bearers SET
  id = 'bearer-rohan-iyer',
  name = 'Rohan Iyer',
  role = 'Vice President',
  cohort = '2026',
  photo_url = NULL,
  sort_order = 20
WHERE id = 'placeholder-secretary';

UPDATE office_bearers SET
  id = 'bearer-sneha-nair',
  name = 'Sneha Nair',
  role = 'Tech Lead',
  cohort = '2027',
  photo_url = NULL,
  sort_order = 30
WHERE id = 'placeholder-coordinator';

INSERT INTO office_bearers (id, name, role, cohort, photo_url, sort_order) VALUES
  ('bearer-arjun-menon', 'Arjun Menon', 'Events Head', '2027', NULL, 40),
  ('bearer-diya-patel',  'Diya Patel',   'Design Lead', '2027', NULL, 50);

-- Achievements: replace the two seeded rows, then add three more -------------
UPDATE achievements SET
  id = 'achievement-sih-finalists',
  title = 'Smart India Hackathon finalists',
  description = 'Our six-member team reached the SIH grand finale with a crop-price forecasting tool for small farmers, built across three all-night project sessions.',
  date = '2024-12-18',
  sort_order = 10
WHERE id = 'placeholder-achievement-1';

UPDATE achievements SET
  id = 'achievement-ml-workshop',
  title = 'Intro-to-ML workshop draws 200+ students',
  description = 'A beginner-friendly Saturday workshop on scikit-learn filled the seminar hall, with peer mentors helping every attendee train their first classifier.',
  date = '2025-03-09',
  sort_order = 20
WHERE id = 'placeholder-achievement-2';

INSERT INTO achievements (id, title, description, date, sort_order) VALUES
  (
    'achievement-datathon-win',
    'Inter-college datathon winners',
    'Team NSDC took first place at the state inter-college datathon, predicting hostel energy use from two years of meter data.',
    '2025-10-12',
    30
  ),
  (
    'achievement-open-source',
    '20+ open-source contributions shipped',
    'Members landed more than twenty merged pull requests across pandas-adjacent libraries and data-for-good projects during the winter contribution drive.',
    '2026-01-25',
    40
  ),
  (
    'achievement-fest-analytics',
    'Analytics desk for the campus tech fest',
    'The club ran a live footfall-and-feedback dashboard for the annual tech fest, used by organisers to schedule events across three days.',
    '2026-03-02',
    50
  );
