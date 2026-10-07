-- Member projects, sourced from the club's public GitHub profiles.
-- Descriptions are the repositories' own words. Authors are credited in a
-- quiet line under each project (the `author` column added below).

ALTER TABLE projects ADD COLUMN author TEXT NOT NULL DEFAULT '';

INSERT INTO projects (id, title, summary, description, stack, url, cover_url, status, event_id, author, sort_order) VALUES
  ('proj-jadal',
   'Jadal',
   'Agentic, physics-based canal water allocation for warabandi-style irrigation. Third place, IEEE-CIS Hackathon.',
   'Agentic, physics-based canal water allocation for warabandi-style irrigation. Agents reason over canal physics and water demand to propose fair, workable allocations across a shared irrigation network. Built by NSDC members during the IEEE-CIS Hackathon, where it placed third.',
   '["TypeScript", "Agentic AI", "Simulation"]',
   'https://github.com/Parswanadh/jadal', NULL, 'shipped', NULL, 'NSDC members', 10),

  ('proj-voyaq',
   'VOYAQ',
   'Group travel planning that settles the arguments before the trip starts.',
   'A squad-based travel planner: create or join a squad with an invite code, vote on destinations until a majority locks one in, align budgets anonymously by median, and coordinate dates by consensus. Includes a packing list, budget calculator with estimated-vs-actual tracking, live currency conversion, and a destination hub with weather, food, places, events, safety, transport and AI tips across 26 Indian states. Ships as an installable PWA with offline fallback.',
   '["Next.js", "TypeScript", "Supabase", "PWA"]',
   'https://voyaq.vercel.app/', NULL, 'active', NULL, 'Dhruva Vura', 20),

  ('proj-laya',
   'Laya',
   'Non-autoregressive decision engine — typed decisions over text in a single forward pass.',
   'A non-autoregressive System 1 decision engine: typed choice, score and yes/no decisions over any text in a single forward pass, across 100+ languages, with a router that picks the right checkpoint per request. NSDC members contribute to this open-source project.',
   '["LLM", "Open Source", "Multilingual"]',
   'https://huggingface.co/convaiinnovations/laya', NULL, 'active', NULL, 'Balcha Venkata Parswanadh — open-source contributor', 30),

  ('proj-custom-gpu',
   'Custom GPU for LLM Inference',
   'A GPU built for transformer inference, in Verilog.',
   'A custom GPU for LLM inference with zero-skip sparsity and Q8.8 fixed-point arithmetic, demonstrated end to end running OPT-125M. Explores how much inference throughput a purpose-built datapath can win over general hardware.',
   '["Verilog", "Hardware", "LLM Inference"]',
   'https://github.com/Parswanadh/custom_gpu_project', NULL, 'shipped', NULL, 'Balcha Venkata Parswanadh', 40),

  ('proj-event-scan',
   'Event Scan',
   'Mobile barcode attendance scanner — Cloudflare Worker + D1.',
   'A mobile barcode attendance scanner that reads an ID-card barcode, records periods P1–P8 as hours, and exports to Excel. Runs on the same Cloudflare Worker + D1 stack as this site, and is built for the way attendance is actually taken on campus.',
   '["Cloudflare Workers", "D1", "JavaScript"]',
   'https://github.com/Parswanadh/event-scan', NULL, 'active', NULL, 'Balcha Venkata Parswanadh', 50),

  ('proj-jarvis',
   'JARVIS',
   'An AI-assisted recruitment platform for screening and reviewing candidates.',
   'A full-stack recruitment platform that helps teams screen, review and manage candidates faster with AI-assisted workflows: resume upload with AI summarisation, browser-based interview recording with private artifact storage, LLM-based interview scoring with retry handling, role routing, and admin search, filtering, stage updates and bulk operations.',
   '["React", "FastAPI", "Supabase", "LLM"]',
   'https://github.com/v1r4t/JARVIS', NULL, 'active', NULL, 'Dhruva Vura', 60)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  summary = excluded.summary,
  description = excluded.description,
  stack = excluded.stack,
  url = excluded.url,
  status = excluded.status,
  author = excluded.author,
  sort_order = excluded.sort_order;

-- Retire anything this selection replaced.
DELETE FROM projects WHERE id IN ('proj-cyclosac', 'proj-world-sim');
