/// <reference types="@cloudflare/workers-types" />

import { handleNotify, json } from './notify';

interface Env {
  NOTIFY_KV: KVNamespace;
  ASSETS: Fetcher;
}

// Minimal static security headers for teaser HTML responses. Kept inline so
// the notify API path (shared via ./notify) stays byte-for-byte identical.
function withSecurityHeaders(res: Response): Response {
  try {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return res;
    const headers = new Headers(res.headers);
    headers.set(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com",
    );
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/notify') return handleNotify(request, env);
      return json({ ok: false, error: 'not_found' }, 404);
    }

    // Defensive: if a non-API request ever reaches the Worker, serve assets.
    if (env.ASSETS) return withSecurityHeaders(await env.ASSETS.fetch(request));
    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
