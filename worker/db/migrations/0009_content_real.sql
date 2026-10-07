-- Real NSDC content sourced from the club's public LinkedIn posts, the
-- NEBDHub chapter page, and member GitHub profiles. Replaces the invented
-- demo copy from 0002/0006. Everything here is stated in those sources.

-- ---------------------------------------------------------------- Bearers
-- Full names per the club's own office-bearer announcement.
UPDATE office_bearers SET name = 'Balcha Venkata Parswanadh' WHERE id = 'bearer-b-parswanadh';
UPDATE office_bearers SET name = 'Konduru Shanmuga Priya'   WHERE id = 'bearer-k-shanmuga-priya';
UPDATE office_bearers SET name = 'Bovilla Babitha'          WHERE id = 'bearer-babbitha-b';

-- Dr. Manju Venugopalan was seeded earlier; the club's current mentor is
-- Dr. Peeta Basa Pati alone.
DELETE FROM office_bearers WHERE id = 'bearer-mentor-manju';

-- ---------------------------------------------------------------- About
UPDATE content_sections
SET title = 'About the club',
    body = 'The National Student Data Corps (NSDC) at Amrita School of Engineering, Bengaluru is a student chapter of the NEBDHub''s NSDC initiative — a community-developed programme that gives students resources and opportunities to learn data science in a community of support.

Our mission is to foster innovation, collaboration and professional growth while addressing real-world challenges. Through workshops, hackathons and networking events we build technical skills and connect students with industry experts, aiming to create an ecosystem that prepares members for careers in data science.'
WHERE key = 'about';

-- ---------------------------------------------------------------- Origin
UPDATE content_sections
SET title = 'How we started',
    body = 'The chapter was founded in August 2024 as an institutional chapter of the National Student Data Corps — part of the Northeast Big Data Innovation Hub at Columbia University.

It began with four students — Manaswini Poluri, Anirudh S, Sajjad Shaik and Spoorthi M — who wanted a place on campus to actually work with data rather than only study it. From there it grew into a chapter running industry talks, cybersecurity sessions, a multi-module data science bootcamp and competitive hackathon teams.

The chapter is mentored by Dr. Peeta Basa Pati.'
WHERE key = 'origin';

-- ---------------------------------------------------------------- Achievements
DELETE FROM achievements;

INSERT INTO achievements (id, title, description, date, sort_order) VALUES
  ('ach-hackathon-3rd',
   'Third place at the IEEE-CIS Hackathon',
   'Team NSDC placed third with Jadal — an agentic, physics-based system for canal water allocation in warabandi-style irrigation, built during the hackathon.',
   NULL, 10),
  ('ach-bug-to-breach',
   'BUG TO BREACH drew 190 students',
   'A cybersecurity tech-talk event run with NEURON at the Bengaluru campus on 26 March 2026. Two sessions: "Hunting Fileless Malware with Memory Forensics" and "Behind the Firewall: The Hidden Attack" on SSRF, including a live HackTheBox forensics demo. Free to attend.',
   '2026-03-26', 20),
  ('ach-nextmind-2',
   'NextMind Meet 2.0 — industry talks and panel',
   'The second edition of NextMind Meet brought Mr. Prashant Sharma (Senior Staff Engineer, Hinge Health) and Mr. Pradeek J (CTO, HappyFox) to campus for talks on AI in production and customer-service AI, followed by a panel discussion on bridging campus and industry.',
   '2025-10-18', 30),
  ('ach-ai-house',
   'Invited into the AI House Bangalore ecosystem',
   'The team attended the launch of AI House Bangalore by HiDevs on 21 December 2025 — an initiative offering student communities event space, mentorship, industry connections and venture access — opening the door to future collaborations.',
   '2025-12-21', 40),
  ('ach-bootcamp',
   'Multi-module Data Science Bootcamp',
   'A structured bootcamp run for members, delivered in modules and completed by participants through mid-2026.',
   '2026-07-01', 50),
  ('ach-founded',
   'Chapter founded at Amrita Bengaluru',
   'NSDC Amrita Vishwa Vidyapeetham, Bengaluru was established in August 2024 as an institutional chapter of the National Student Data Corps.',
   '2024-08-01', 60);

-- ---------------------------------------------------------------- Mentor
INSERT INTO office_bearers (id, name, role, cohort, photo_url, sort_order) VALUES
  ('bearer-mentor-peeta', 'Dr. Peeta Basa Pati', 'Mentor', NULL, NULL, 60)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- Events (archive)
INSERT INTO events (id, title, description, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, force_closed, questions) VALUES
  ('evt-bug-to-breach',
   'BUG TO BREACH — Cybersecurity Tech Talks',
   'Run with NEURON at Amrita Vishwa Vidyapeetham, Bengaluru. Two deep-dive sessions: "Hunting Fileless Malware with Memory Forensics" (R Venkata Skanda Vyvaswath) covering in-memory attacks and Volatility, with a live HackTheBox forensics demo; and "Behind the Firewall: The Hidden Attack" (Rochit Madamanchi) on Server-Side Request Forgery. 190 students attended. Free to attend.',
   '2026-03-26T09:00:00Z', '2026-03-26T16:00:00Z',
   '2026-03-01T00:00:00Z', '2026-03-25T00:00:00Z', 190, 1, '[]'),
  ('evt-nextmind-2',
   'NextMind Meet 2.0',
   'Industry talks and a panel discussion. Mr. Prashant Sharma (Senior Staff Engineer, Hinge Health) and Mr. Pradeek J (CTO, HappyFox) spoke on AI in real-world customer support and lessons from building customer-service AI at scale, followed by a panel on bridging campus and industry.',
   '2025-10-18T09:00:00Z', '2025-10-18T17:00:00Z',
   '2025-10-01T00:00:00Z', '2025-10-17T00:00:00Z', NULL, 1, '[]'),
  ('evt-ai-house',
   'AI House Bangalore — launch',
   'The NSDC team attended the inauguration and launch of AI House Bangalore by HiDevs on 21 December 2025. AI House supports student communities with event space, mentorship, industry connections and access to venture funding; the launch brought together student leaders from universities across the city.',
   '2025-12-21T10:00:00Z', '2025-12-21T17:00:00Z',
   '2025-12-01T00:00:00Z', '2025-12-20T00:00:00Z', NULL, 1, '[]')
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  force_closed = excluded.force_closed;
