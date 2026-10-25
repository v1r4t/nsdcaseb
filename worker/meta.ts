/// <reference types="@cloudflare/workers-types" />

// Per-event social metadata injection, sitemap building, and the known-route
// list for the staging worker. Route list mirrors site/src/App.tsx (read-only).

import type { Env } from './auth-helpers';
import { posterUrl } from './supabase-storage';

/** SPA routes (site/src/App.tsx) that must answer HTTP 200. */
export const KNOWN_STATIC_ROUTES: readonly string[] = [
  '/',
  '/login',
  '/register',
  '/verify-pending',
  '/verify-email',
  '/reset-password',
  '/registrations',
  '/recruit',
  '/media',
  '/archive',
  '/projects',
];

/** Routes listed in /sitemap.xml. Auth pages are excluded deliberately. */
export const SITEMAP_STATIC_ROUTES: readonly string[] = ['/', '/registrations', '/recruit', '/media', '/archive', '/projects'];

const EVENT_ROUTE_RE = /^\/registrations\/([^/]+)\/?$/;
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PROJECT_ROUTE_RE = /^\/projects\/([^/]+)\/?$/;

export const DEFAULT_SITE_NAME = 'NSDC — National Student Data Corps';
export const DEFAULT_DESCRIPTION =
  'NSDC — National Student Data Corps. A student technology community at Amrita Vishwa Vidyapeetham, Bengaluru. We bring students together to learn, build, experiment and compete across data, AI and emerging technology.';

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * True for SPA routes that must answer 200. `/admin` renders AdminDoor in the
 * client but must answer 404 (admin disguise preserved).
 */
export function isKnownRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path === '/admin') return false;
  if ((KNOWN_STATIC_ROUTES as readonly string[]).includes(path)) return true;
  if (PROJECT_ROUTE_RE.test(path)) return true;
  return EVENT_ROUTE_RE.test(path);
}

/** Raw (still-encoded) event id when pathname is /registrations/:id, else null. */
export function matchEventRoute(pathname: string): string | null {
  const m = EVENT_ROUTE_RE.exec(pathname);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Event metadata
// ---------------------------------------------------------------------------

export interface EventMeta {
  id: string;
  title: string;
  description: string;
  posterUrl: string | null;
  startsAt: string;
  endsAt: string;
}

interface EventMetaRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  poster_key: string | null;
}

/** Null when the id is malformed or no event exists (caller serves defaults). */
export async function fetchEventMeta(env: Env, eventId: string): Promise<EventMeta | null> {
  if (!EVENT_ID_RE.test(eventId)) return null;
  const row = await env.AUTH_DB
    .prepare('SELECT id, title, description, starts_at, ends_at, poster_key FROM events WHERE id = ?')
    .bind(eventId)
    .first<EventMetaRow>();
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    posterUrl: posterUrl(env, row.poster_key),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

// ---------------------------------------------------------------------------
// HTML injection
// ---------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export interface InjectInput {
  origin: string;
  eventId: string;
  meta: EventMeta | null;
}

/**
 * Rewrite the SPA shell with per-event title/description/canonical/OG/Twitter
 * tags plus Event JSON-LD. All dynamic values are escaped; JSON-LD is emitted
 * with `<` unicode-escaped so a hostile title cannot break out of the script
 * block. Missing events get default metadata (caller keeps HTTP 200 so the
 * client can render its own 404 page).
 */
export function injectEventMeta(shell: Response, input: InjectInput): Response {
  const { origin, eventId, meta } = input;
  const title = meta ? `${meta.title} | NSDC` : DEFAULT_SITE_NAME;
  const description = meta && meta.description ? truncate(meta.description, 300) : DEFAULT_DESCRIPTION;
  const canonical = `${origin}/registrations/${encodeURIComponent(eventId)}`;
  const image = meta?.posterUrl ?? `${origin}/nsdc_logo.png`;

  const tags = [
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeAttr(DEFAULT_SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
  ].join('\n');

  let jsonLd = '';
  if (meta) {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: meta.title,
      description,
      url: canonical,
      startDate: meta.startsAt,
      endDate: meta.endsAt,
      image: [image],
      organizer: { '@type': 'Organization', name: DEFAULT_SITE_NAME },
      eventStatus: 'https://schema.org/EventScheduled',
    };
    jsonLd = `\n<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  }

  const rewriter = new HTMLRewriter()
    .on('title', {
      // setInnerContent defaults to text mode (auto-escaped): pass raw title.
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', description);
      },
    })
    // Strip the shell's default tags first so event pages never ship
    // duplicates (which fail Lighthouse's canonical audit).
    .on('link[rel="canonical"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[property^="og:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name^="twitter:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('head', {
      element(el) {
        el.append(tags + jsonLd, { html: true });
      },
    });
  return rewriter.transform(shell);
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemap(origin: string, eventIds: string[]): string {
  const seen = new Set<string>();
  const entries: Array<{ loc: string; priority: string }> = [];
  for (const route of SITEMAP_STATIC_ROUTES) {
    entries.push({ loc: `${origin}${route}`, priority: route === '/' ? '1.0' : '0.7' });
  }
  for (const id of eventIds) {
    if (!EVENT_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    entries.push({ loc: `${origin}/registrations/${id}`, priority: '0.6' });
  }
  const body = entries
    .map((e) => `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <priority>${e.priority}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}
