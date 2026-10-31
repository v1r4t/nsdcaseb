/// <reference types="@cloudflare/workers-types" />

// Per-event and per-project social metadata injection, structured data,
// sitemap building, and the known-route list for the staging worker.
// Route list mirrors site/src/App.tsx (read-only).

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
  '/archive',
  '/projects',
];

/** Routes listed in /sitemap.xml. Auth pages are excluded deliberately. */
export const SITEMAP_STATIC_ROUTES: readonly string[] = ['/', '/registrations', '/recruit', '/archive', '/projects'];

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EVENT_ROUTE_RE = /^\/registrations\/([^/]+)\/?$/;
const PROJECT_ROUTE_RE = /^\/projects\/([^/]+)\/?$/;

export const DEFAULT_SITE_NAME = 'NSDC — National Student Data Corps';
export const DEFAULT_DESCRIPTION =
  'What happens when students stop waiting for the future and start building it? NSDC at Amrita Bengaluru — events, projects and research in the open.';

/** Shell assets that must resolve against the request origin. */
const DEFAULT_OG_IMAGE_PATH = '/og-default.png';
const DEFAULT_OG_IMAGE_WIDTH = 1200;
const DEFAULT_OG_IMAGE_HEIGHT = 630;
const DEFAULT_OG_IMAGE_ALT = 'NSDC — National Student Data Corps, Amrita Bengaluru';
const DEFAULT_LOGO_PATH = '/nsdc_logo.png';

const ORGANIZATION_NAME = 'National Student Data Corps';
const ORGANIZATION_DESCRIPTION =
  'A student technology community at Amrita Vishwa Vidyapeetham, Bengaluru.';
const ORGANIZATION_EMAIL = 'nsdcaseb@gmail.com';
const ORGANIZATION_FOUNDING_DATE = '2024-08-01';
const ORGANIZATION_SAME_AS = [
  'https://www.instagram.com/nsdc_avvb/',
  'https://www.linkedin.com/company/nsdc-avv-b',
];

const CAMPUS_NAME = 'Amrita Vishwa Vidyapeetham, Bengaluru';
const CAMPUS_LOCALITY = 'Bengaluru';
const CAMPUS_REGION = 'Karnataka';
const CAMPUS_COUNTRY = 'IN';

const DEFAULT_PROJECT_DESCRIPTION =
  'A student-built project from the NSDC community at Amrita Bengaluru.';

interface RouteCopy {
  title: string;
  description: string;
  label: string;
  /** Emit a CollectionPage node for list routes that expose a detail URL. */
  collection?: boolean;
}

/**
 * Server-rendered copy for the public, indexable routes. Mirrors the client's
 * `useDocumentMeta` strings so the first HTML a crawler sees matches what the
 * SPA renders after hydration. Auth and 404 routes keep the shell defaults.
 */
const ROUTE_COPY: Record<string, RouteCopy> = {
  '/registrations': {
    title: 'Events — NSDC',
    description:
      'Talks, workshops and competitions from NSDC at Amrita Bengaluru. See what is upcoming, register, or check your registration status.',
    label: 'Events',
    collection: true,
  },
  '/projects': {
    title: 'Projects — NSDC',
    description:
      'Student-built projects from the NSDC community at Amrita Bengaluru — active builds and shipped work across data, AI and emerging technology.',
    label: 'Projects',
    collection: true,
  },
  '/archive': {
    title: 'Archive — NSDC',
    description:
      'The NSDC photo archive — every event, kept on the record and browsable by album.',
    label: 'Archive',
    collection: true,
  },
  '/recruit': {
    title: 'Join the corps — NSDC Recruitment',
    description:
      'Apply to join the National Student Data Corps at Amrita Vishwa Vidyapeetham, Bengaluru. Open to 1st, 2nd and 3rd-year students of all branches. Check your application status here.',
    label: 'Recruit',
  },
};

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

/** Raw (still-encoded) project id when pathname is /projects/:id, else null. */
export function matchProjectRoute(pathname: string): string | null {
  const m = PROJECT_ROUTE_RE.exec(pathname);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Data lookups
// ---------------------------------------------------------------------------

export interface EventMeta {
  id: string;
  title: string;
  description: string;
  posterUrl: string | null;
  startsAt: string;
  endsAt: string;
  /** Optional physical venue; null/absent means "not published". */
  venue?: string | null;
}

interface EventMetaRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  poster_key: string | null;
  venue?: string | null;
}

/** Null when the id is malformed or no event exists (caller serves defaults). */
export async function fetchEventMeta(env: Env, eventId: string): Promise<EventMeta | null> {
  if (!ID_RE.test(eventId)) return null;
  const select = 'SELECT id, title, description, starts_at, ends_at, poster_key';
  let row: EventMetaRow | null;
  try {
    row = await env.AUTH_DB
      .prepare(`${select}, venue FROM events WHERE id = ?`)
      .bind(eventId)
      .first<EventMetaRow>();
  } catch {
    // A DB without migration 0021 still serves the original meta fields.
    row = await env.AUTH_DB
      .prepare(`${select} FROM events WHERE id = ?`)
      .bind(eventId)
      .first<EventMetaRow>();
  }
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    posterUrl: posterUrl(env, row.poster_key),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: row.venue ?? null,
  };
}

export interface ProjectMeta {
  id: string;
  title: string;
  summary: string;
  description: string;
  stack: string[];
  url: string | null;
  coverUrl: string | null;
  status: string;
  eventId: string | null;
  author: string;
}

interface ProjectMetaRow {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  stack: string | null;
  url: string | null;
  cover_url: string | null;
  status: string;
  event_id: string | null;
  author: string | null;
}

/** Stored `stack` is a JSON string; malformed values degrade to an empty list. */
function parseStack(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

/** Null when the id is malformed or no project exists. */
export async function fetchProjectMeta(env: Env, projectId: string): Promise<ProjectMeta | null> {
  if (!ID_RE.test(projectId)) return null;
  const row = await env.AUTH_DB
    .prepare(
      `SELECT id, title, summary, description, stack, url, cover_url, status, event_id, author
       FROM projects WHERE id = ?`,
    )
    .bind(projectId)
    .first<ProjectMetaRow>();
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? '',
    description: row.description ?? '',
    stack: parseStack(row.stack),
    url: row.url,
    coverUrl: row.cover_url,
    status: row.status,
    eventId: row.event_id,
    author: row.author ?? '',
  };
}

/**
 * Project ids for `/sitemap.xml`. Returns an empty list on a DB error so the
 * static and event entries still ship; the caller decides whether to log.
 */
export async function fetchSitemapProjectIds(env: Env): Promise<string[]> {
  try {
    const rows = await env.AUTH_DB
      .prepare('SELECT id FROM projects ORDER BY sort_order ASC, created_at ASC')
      .all<{ id: string }>();
    return (rows.results ?? []).map((row) => row.id);
  } catch (err) {
    console.error('[meta] sitemap project query failed, omitting project URLs', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// HTML injection helpers
// ---------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Absolute base without a trailing slash, so `${base}${path}` is predictable. */
function contentBase(origin: string): string {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Absolute URL on the request origin. Keeps the path/search of the incoming
 * value (so the shell's `og-default.png` survives) and rewrites any baked-in
 * host such as the staging preview domain.
 */
function localAssetUrl(value: string | null, origin: string, fallbackPath: string): string {
  if (!value) return `${origin}${fallbackPath}`;
  try {
    const url = new URL(value, `${origin}/`);
    return `${origin}${url.pathname}${url.search}`;
  } catch {
    return `${origin}${fallbackPath}`;
  }
}

/** Absolute URL that preserves a foreign host (posters live on Supabase). */
function absoluteAsset(value: string | null, origin: string, fallbackPath: string): string {
  if (!value) return `${origin}${fallbackPath}`;
  try {
    return new URL(value, `${origin}/`).toString();
  } catch {
    return `${origin}${fallbackPath}`;
  }
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

type JsonLdNode = Record<string, unknown>;

/**
 * Serialize JSON-LD for an inline script. JSON.stringify already escapes
 * quotes and controls; `<`, `>`, `&`, U+2028 and U+2029 are escaped as well so
 * a hostile title can never close the script block or break HTML parsing.
 */
function jsonText(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function scriptJson(data: unknown): string {
  return `<script type="application/ld+json">${jsonText(data)}</script>`;
}

function organizationNode(base: string): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: ORGANIZATION_NAME,
    alternateName: 'NSDC',
    url: `${base}/`,
    logo: {
      '@type': 'ImageObject',
      '@id': `${base}/#logo`,
      url: `${base}${DEFAULT_LOGO_PATH}`,
    },
    description: ORGANIZATION_DESCRIPTION,
    email: ORGANIZATION_EMAIL,
    foundingDate: ORGANIZATION_FOUNDING_DATE,
    address: {
      '@type': 'PostalAddress',
      addressLocality: CAMPUS_LOCALITY,
      addressRegion: CAMPUS_REGION,
      addressCountry: CAMPUS_COUNTRY,
    },
    sameAs: ORGANIZATION_SAME_AS,
  };
}

function websiteNode(base: string): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: `${base}/`,
    name: DEFAULT_SITE_NAME,
    alternateName: 'NSDC',
    description: DEFAULT_DESCRIPTION,
    inLanguage: 'en-IN',
    publisher: { '@id': `${base}/#organization` },
  };
}

/** Organization + WebSite; this is the single graph baked into the shell. */
function siteGraphText(base: string): string {
  return jsonText({
    '@context': 'https://schema.org',
    '@graph': [organizationNode(base), websiteNode(base)],
  });
}

function collectionNode(
  base: string,
  path: string,
  name: string,
  description: string,
): JsonLdNode {
  return {
    '@type': 'CollectionPage',
    '@id': `${base}${path}#collection`,
    url: `${base}${path}`,
    name,
    description,
    inLanguage: 'en-IN',
    isPartOf: { '@id': `${base}/#website` },
    publisher: { '@id': `${base}/#organization` },
  };
}

interface Crumb {
  name: string;
  path: string;
}

function breadcrumbNode(base: string, canonical: string, trail: Crumb[]): JsonLdNode {
  const crumbs: Crumb[] = [{ name: 'Home', path: '/' }, ...trail];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${base}${crumb.path}`,
    })),
  };
}

function eventNode(
  base: string,
  canonical: string,
  meta: EventMeta,
  description: string,
  image: string,
): JsonLdNode {
  const venue = meta.venue?.trim();
  const address: JsonLdNode = {
    '@type': 'PostalAddress',
    addressLocality: CAMPUS_LOCALITY,
    addressRegion: CAMPUS_REGION,
    addressCountry: CAMPUS_COUNTRY,
  };
  if (venue) address.streetAddress = venue;

  return {
    '@type': 'Event',
    '@id': `${canonical}#event`,
    name: meta.title,
    description,
    url: canonical,
    startDate: meta.startsAt,
    endDate: meta.endsAt,
    image: [image],
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'en-IN',
    location: {
      '@type': 'Place',
      name: venue ?? CAMPUS_NAME,
      address,
    },
    organizer: {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: ORGANIZATION_NAME,
      url: `${base}/`,
    },
    isPartOf: { '@id': `${base}/#website` },
  };
}

function projectNode(
  base: string,
  canonical: string,
  projectId: string,
  meta: ProjectMeta | null,
  description: string,
  coverUrl: string | null,
): JsonLdNode {
  const node: JsonLdNode = {
    '@type': 'SoftwareSourceCode',
    '@id': `${canonical}#project`,
    name: meta?.title ?? 'Project — NSDC',
    description,
    url: canonical,
    identifier: safeDecode(projectId),
    inLanguage: 'en-IN',
    isPartOf: {
      '@type': 'CollectionPage',
      '@id': `${base}/projects#collection`,
      url: `${base}/projects`,
      name: 'Projects',
    },
    publisher: { '@id': `${base}/#organization` },
  };
  if (meta?.author) node.author = { '@type': 'Person', name: meta.author };
  if (meta?.stack.length) node.keywords = meta.stack.join(', ');
  if (coverUrl) node.image = coverUrl;
  if (meta?.url) node.sameAs = meta.url;
  return node;
}

// ---------------------------------------------------------------------------
// HTML injection
// ---------------------------------------------------------------------------

export interface InjectInput {
  origin: string;
  eventId: string;
  meta: EventMeta | null;
}

interface DetailMeta {
  base: string;
  canonical: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  /** True only when the 1200 × 630 fallback card is used. */
  defaultImage: boolean;
  jsonLd: JsonLdNode[];
}

/**
 * Shared detail-page rewriter: per-page title/description/canonical/OG/Twitter
 * plus Event/Project + BreadcrumbList JSON-LD. The shell's tags are removed
 * before the new ones are appended, so a page never ships duplicates (which
 * fail Lighthouse's canonical audit).
 */
function injectDetailMeta(shell: Response, meta: DetailMeta): Response {
  const { base, canonical, title, description, image, imageAlt, defaultImage } = meta;

  const tags = [
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="en_IN" />',
    `<meta property="og:site_name" content="${escapeAttr(DEFAULT_SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    ...(defaultImage
      ? [
          `<meta property="og:image:width" content="${DEFAULT_OG_IMAGE_WIDTH}" />`,
          `<meta property="og:image:height" content="${DEFAULT_OG_IMAGE_HEIGHT}" />`,
        ]
      : []),
    `<meta property="og:image:alt" content="${escapeAttr(imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
  ].join('\n');

  const jsonLd = meta.jsonLd.map(scriptJson).join('\n');
  const graph = siteGraphText(base);

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
    // Strip the shell's default tags first so detail pages never ship
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
    // The shell's Organization + WebSite block is not an og/twitter tag, so
    // localize it here too; otherwise detail pages keep the baked-in origin.
    .on('script[type="application/ld+json"]', {
      element(el) {
        el.setInnerContent(graph, { html: true });
      },
    })
    .on('head', {
      element(el) {
        el.append(tags + (jsonLd ? `\n${jsonLd}` : ''), { html: true });
      },
    });
  return rewriter.transform(shell);
}

/**
 * Rewrite the SPA shell with per-event title/description/canonical/OG/Twitter
 * tags plus Event + BreadcrumbList JSON-LD. Missing events get default
 * metadata (caller keeps HTTP 200 so the client can render its own 404 page).
 */
export function injectEventMeta(shell: Response, input: InjectInput): Response {
  const { origin, eventId, meta } = input;
  const base = contentBase(origin);
  const path = `/registrations/${encodeURIComponent(eventId)}`;
  const canonical = `${base}${path}`;
  const title = meta ? `${meta.title} | NSDC` : DEFAULT_SITE_NAME;
  const description = meta && meta.description ? truncate(meta.description, 300) : DEFAULT_DESCRIPTION;
  const defaultImage = !meta?.posterUrl;
  const image = meta?.posterUrl ?? `${base}${DEFAULT_OG_IMAGE_PATH}`;

  const jsonLd: JsonLdNode[] = [];
  if (meta) {
    jsonLd.push(eventNode(base, canonical, meta, description, image));
    jsonLd.push(
      breadcrumbNode(base, canonical, [
        { name: 'Events', path: '/registrations' },
        { name: meta.title, path },
      ]),
    );
  }

  return injectDetailMeta(shell, {
    base,
    canonical,
    title,
    description,
    image,
    imageAlt: meta?.posterUrl ? `${meta.title} poster` : DEFAULT_OG_IMAGE_ALT,
    defaultImage,
    jsonLd,
  });
}

export interface InjectProjectInput {
  origin: string;
  projectId: string;
  meta: ProjectMeta | null;
}

/**
 * Project-detail counterpart to `injectEventMeta`. Kept as its own export so a
 * dispatcher can route `/projects/:id` here; when no row exists the caller can
 * still pass `meta: null` for default copy (HTTP 200, client renders its 404).
 */
export function injectProjectMeta(shell: Response, input: InjectProjectInput): Response {
  const { origin, projectId, meta } = input;
  const base = contentBase(origin);
  const path = `/projects/${encodeURIComponent(projectId)}`;
  const canonical = `${base}${path}`;
  const title = meta ? `${meta.title} — NSDC Projects` : 'Project — NSDC';
  const description = meta
    ? truncate(meta.summary || meta.description || DEFAULT_PROJECT_DESCRIPTION, 300)
    : DEFAULT_PROJECT_DESCRIPTION;
  const cover = meta?.coverUrl ? absoluteAsset(meta.coverUrl, base, DEFAULT_OG_IMAGE_PATH) : null;
  const defaultImage = !cover;
  const image = cover ?? `${base}${DEFAULT_OG_IMAGE_PATH}`;

  return injectDetailMeta(shell, {
    base,
    canonical,
    title,
    description,
    image,
    imageAlt: meta?.title ? `${meta.title} project cover` : DEFAULT_OG_IMAGE_ALT,
    defaultImage,
    jsonLd: [
      projectNode(base, canonical, projectId, meta, description, cover),
      breadcrumbNode(base, canonical, [
        { name: 'Projects', path: '/projects' },
        { name: meta?.title ?? 'Project', path },
      ]),
    ],
  });
}

// ---------------------------------------------------------------------------
// Default (non-detail) metadata
// ---------------------------------------------------------------------------

export interface DefaultMetaInput {
  origin: string;
  /** Request pathname, already normalized by the caller if desired. */
  pathname: string;
  /** Optional hydrated project row for `/projects/:id` (dispatcher-provided). */
  project?: ProjectMeta | null;
}

/**
 * Origin-aware defaults for the SPA shell: canonical, title/description,
 * og:url, og:image, twitter:image and the Organization + WebSite JSON-LD all
 * follow the request origin and path. This is what keeps non-event routes from
 * canonicalising to the staging homepage after a production cutover.
 *
 * Static public routes also get their server-rendered title/description and a
 * BreadcrumbList; project detail routes get a CreativeWork/SoftwareSourceCode
 * node plus a breadcrumb (the row is used when the dispatcher passes it).
 * Event routes use `injectEventMeta` instead, so the two never both append.
 */
export function injectDefaultMeta(shell: Response, input: DefaultMetaInput): Response {
  const { origin } = input;
  const base = contentBase(origin);
  const path = normalizePath(input.pathname);
  const canonical = `${base}${path}`;
  const graph = siteGraphText(base);

  const projectId = matchProjectRoute(path);
  const route = ROUTE_COPY[path];
  let title = DEFAULT_SITE_NAME;
  let description = DEFAULT_DESCRIPTION;
  const extraJsonLd: JsonLdNode[] = [];

  if (projectId !== null) {
    const project = input.project ?? null;
    title = project ? `${project.title} — NSDC Projects` : 'Project — NSDC';
    description = project
      ? truncate(project.summary || project.description || DEFAULT_PROJECT_DESCRIPTION, 300)
      : DEFAULT_PROJECT_DESCRIPTION;
    const cover = project?.coverUrl
      ? absoluteAsset(project.coverUrl, base, DEFAULT_OG_IMAGE_PATH)
      : null;
    extraJsonLd.push(
      projectNode(base, canonical, projectId, project, description, cover),
      breadcrumbNode(base, canonical, [
        { name: 'Projects', path: '/projects' },
        { name: project?.title ?? 'Project', path },
      ]),
    );
  } else if (route) {
    title = route.title;
    description = route.description;
    if (route.collection) {
      extraJsonLd.push(collectionNode(base, path, route.label, route.description));
    }
    extraJsonLd.push(breadcrumbNode(base, canonical, [{ name: route.label, path }]));
  }

  const headers = new Headers(shell.headers);
  // The body is rewritten: stale validators/lengths would be wrong.
  headers.delete('etag');
  headers.delete('content-length');

  const extra = extraJsonLd.map(scriptJson).join('\n');

  const rewriter = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', description);
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute('href', canonical);
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute('content', canonical);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', title);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', description);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute('content', title);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute('content', description);
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute(
          'content',
          localAssetUrl(el.getAttribute('content'), base, DEFAULT_OG_IMAGE_PATH),
        );
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute(
          'content',
          localAssetUrl(el.getAttribute('content'), base, DEFAULT_OG_IMAGE_PATH),
        );
      },
    })
    // The shell carries exactly one JSON-LD graph (Organization + WebSite).
    // It is rebuilt from constants so its url/logo follow the request origin.
    .on('script[type="application/ld+json"]', {
      element(el) {
        el.setInnerContent(graph, { html: true });
      },
    })
    .on('head', {
      element(el) {
        if (extra) el.append(extra, { html: true });
      },
    });

  return rewriter.transform(
    new Response(shell.body, { status: shell.status, statusText: shell.statusText, headers }),
  );
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

/**
 * Static routes + every public event and project detail URL. Project ids are
 * optional so callers on an older dispatcher still get a valid static/event
 * sitemap; pass `fetchSitemapProjectIds(env)` to include projects.
 */
export function buildSitemap(
  origin: string,
  eventIds: readonly string[],
  projectIds: readonly string[] = [],
): string {
  const base = contentBase(origin);
  const seen = new Set<string>();
  const entries: Array<{ loc: string; priority: string }> = [];
  for (const route of SITEMAP_STATIC_ROUTES) {
    entries.push({ loc: `${base}${route}`, priority: route === '/' ? '1.0' : '0.7' });
  }
  for (const id of eventIds) {
    if (!ID_RE.test(id)) continue;
    const key = `event:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ loc: `${base}/registrations/${id}`, priority: '0.6' });
  }
  for (const id of projectIds) {
    if (!ID_RE.test(id)) continue;
    const key = `project:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ loc: `${base}/projects/${id}`, priority: '0.6' });
  }
  const body = entries
    .map((e) => `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <priority>${e.priority}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}
