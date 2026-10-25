/// <reference types="@cloudflare/workers-types" />

import { handleApi, type Env } from './auth';
import { handleContentApi } from './content';
import { handleEventsApi } from './events';
import { handleAdminApi } from './admin';
import { handleMediaApi } from './media';
import { handleProjectsApi } from './projects';
import { handleRecruitmentApi } from './recruitment';
import { handleScheduled } from './email';
import { applySecurityHeaders } from './security-headers';
import { buildSitemap, fetchEventMeta, injectDefaultMeta, injectEventMeta, isKnownRoute, matchEventRoute } from './meta';
import { handleNotify } from './notify';

const ASSET_DIR_RE = /^\/(assets|static|images|fonts)\//;
const FILE_LIKE_RE = /\/[^/]+\.[A-Za-z0-9]{1,8}$/;

/**
 * Site worker env: the shared auth Env plus the launch-list binding declared in
 * wrangler.staging.jsonc. Typed here (rather than in auth-helpers) so the
 * shared Env stays untouched; the binding is optional only so a local dev run
 * without KV degrades to `notify_unavailable` instead of crashing.
 */
type SiteEnv = Env & { NOTIFY_KV?: KVNamespace };

function isAssetPath(pathname: string): boolean {
  return ASSET_DIR_RE.test(pathname) || FILE_LIKE_RE.test(pathname);
}

async function fetchShell(request: Request, env: Env): Promise<Response | null> {
  try {
    return await env.ASSETS.fetch(request);
  } catch (err) {
    console.error('[staging] ASSETS.fetch failed', err);
    return null;
  }
}

function serviceUnavailable(): Response {
  return new Response('Service unavailable', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** SPA shell with an HTTP 404 status (visual page unchanged). */
function toNotFound(shell: Response): Response {
  const headers = new Headers(shell.headers);
  headers.set('cache-control', 'no-store');
  headers.delete('etag');
  return new Response(shell.body, { status: 404, statusText: 'Not Found', headers });
}

async function serveSitemap(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  let ids: string[] = [];
  try {
    const rows = await env.AUTH_DB.prepare('SELECT id FROM events ORDER BY starts_at ASC').all<{ id: string }>();
    ids = (rows.results ?? []).map((r) => r.id);
  } catch (err) {
    // Degrade to a static-only sitemap rather than failing the request.
    console.error('[staging] sitemap D1 query failed, serving static-only sitemap', err);
  }
  return new Response(buildSitemap(origin, ids), {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

async function serveEventPage(request: Request, env: Env, rawId: string): Promise<Response> {
  const origin = new URL(request.url).origin;
  let eventId = rawId;
  try {
    eventId = decodeURIComponent(rawId).slice(0, 128);
  } catch {
    // Keep the raw segment; fetchEventMeta rejects malformed ids safely.
  }

  const shell = await fetchShell(request, env);
  if (!shell) return serviceUnavailable();

  const headers = new Headers(shell.headers);
  headers.set('cache-control', 'no-store');
  // Body is rewritten below, so the shell's validators no longer apply.
  headers.delete('etag');
  headers.delete('content-length');
  const base = new Response(shell.body, { status: 200, headers });

  if (request.method === 'HEAD') return applySecurityHeaders(base, env);

  let meta = null;
  try {
    meta = await fetchEventMeta(env, eventId);
  } catch (err) {
    console.error('[staging] event meta lookup failed, serving default metadata', err);
  }
  // Missing event -> default metadata, still 200 (client renders its 404 page).
  try {
    return applySecurityHeaders(injectEventMeta(base, { origin, eventId, meta }), env);
  } catch (err) {
    console.error('[staging] meta injection failed, serving unmodified shell', err);
    return applySecurityHeaders(base, env);
  }
}

/**
 * Rewrite the shell's origin-dependent tags for HTML navigation responses.
 * HEAD carries no body (leave it untouched, like the event branch) and
 * non-HTML responses are returned as-is so asset streaming is untouched.
 */
function withDefaultMeta(request: Request, shell: Response): Response {
  if (request.method === 'HEAD') return shell;
  if (!(shell.headers.get('content-type') ?? '').includes('text/html')) return shell;
  try {
    const url = new URL(request.url);
    return injectDefaultMeta(shell, { origin: url.origin, pathname: url.pathname });
  } catch (err) {
    console.error('[staging] default meta injection failed, serving unmodified shell', err);
    return shell;
  }
}

async function serveAppRoute(request: Request, env: Env, pathname: string): Promise<Response> {
  const shell = await fetchShell(request, env);
  if (!shell) return serviceUnavailable();
  const base = isKnownRoute(pathname) ? shell : toNotFound(shell);
  return applySecurityHeaders(withDefaultMeta(request, base), env);
}

export default {
  async fetch(request: Request, env: SiteEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/notify') return handleNotify(request, env);
      return (
        (await handleContentApi(request, env)) ??
        (await handleEventsApi(request, env)) ??
        (await handleMediaApi(request, env)) ??
        (await handleProjectsApi(request, env)) ??
        (await handleRecruitmentApi(request, env)) ??
        (await handleAdminApi(request, env)) ??
        handleApi(request, env)
      );
    }

    if (pathname === '/robots.txt') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD', 'cache-control': 'no-store' },
        });
      }
      // Origin-aware: staging advertises staging, production advertises apex.
      const origin = new URL(request.url).origin;
      const body =
        `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`;
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    if (pathname === '/sitemap.xml') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD', 'cache-control': 'no-store' },
        });
      }
      return serveSitemap(request, env);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Non-reads of pages/assets: pass through to static handling untouched.
      const shell = await fetchShell(request, env);
      return shell ?? serviceUnavailable();
    }

    if (isAssetPath(pathname)) {
      const res = await fetchShell(request, env);
      if (!res) return serviceUnavailable();
      // A real file keeps its exact status/headers (streaming intact). An
      // HTML content-type here means the SPA fallback shell answered for a
      // missing file -> surface a real 404 instead of a disguised 200.
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/html') && !isKnownRoute(pathname)) {
        return applySecurityHeaders(withDefaultMeta(request, toNotFound(res)), env);
      }
      return res;
    }

    const eventId = matchEventRoute(pathname);
    if (eventId !== null) return serveEventPage(request, env, eventId);

    return serveAppRoute(request, env, pathname);
  },

  async scheduled(_controller: ScheduledController, env: SiteEnv): Promise<void> {
    await handleScheduled(env);
  },
} satisfies ExportedHandler<SiteEnv>;
