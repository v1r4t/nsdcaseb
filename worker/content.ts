/// <reference types="@cloudflare/workers-types" />

// Phase 2 public content API: landing copy, office bearers, achievements.
//
// Read-only on purpose. Admin editing is Phase 5 -- a `PUT /api/content`
// handler guarded by `requireRole(env, user, 'admin')` will live here then,
// reusing the row types below. Until then this module only ever SELECTs.
//
// Returns `null` when the request path is not ours so the orchestrator can
// chain it ahead of the auth router in the staging dispatcher.

import { json, type Env } from './auth-helpers';

const CONTENT_PATH = '/api/content';

export interface SectionRow {
  key: string;
  title: string;
  body: string;
  sort_order: number;
}

export interface BearerRow {
  id: string;
  name: string;
  role: string;
  cohort: string | null;
  photo_url: string | null;
  sort_order: number;
}

export interface AchievementRow {
  id: string;
  title: string;
  description: string;
  date: string | null;
  sort_order: number;
}

const SECTIONS_SQL =
  'SELECT key, title, body, sort_order FROM content_sections ORDER BY sort_order ASC, key ASC';
const BEARERS_SQL =
  'SELECT id, name, role, cohort, photo_url, sort_order FROM office_bearers ORDER BY sort_order ASC, name ASC';
const ACHIEVEMENTS_SQL =
  'SELECT id, title, description, date, sort_order FROM achievements ORDER BY sort_order ASC, title ASC';

/**
 * Public (no auth) read-only content endpoint.
 *
 * - `GET /api/content` -> `{ sections, bearers, achievements }`, each ordered.
 * - Any other method on that path -> 405 with an `Allow: GET` header.
 * - Any other path -> `null`, so the caller falls through to its next handler.
 *
 * D1 errors are deliberately not swallowed: a missing migration should be loud,
 * and the site ships a baked-in fallback so the page still renders.
 */
export async function handleContentApi(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname !== CONTENT_PATH) return null;

  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }

  const [sections, bearers, achievements] = await Promise.all([
    env.AUTH_DB.prepare(SECTIONS_SQL).all<SectionRow>(),
    env.AUTH_DB.prepare(BEARERS_SQL).all<BearerRow>(),
    env.AUTH_DB.prepare(ACHIEVEMENTS_SQL).all<AchievementRow>(),
  ]);

  return json({
    sections: sections.results,
    bearers: bearers.results,
    achievements: achievements.results,
  });
}