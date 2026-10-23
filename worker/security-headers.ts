/// <reference types="@cloudflare/workers-types" />

// Central security-header policy for HTML responses served by worker/staging.ts.
// Only depends on the Env *type* so it adds no runtime weight.

import type { Env } from './auth-helpers';

function supabaseOrigin(env: Env): string | null {
  try {
    const raw = env.SUPABASE_URL;
    if (!raw) return null;
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(env: Env): string {
  const img = ["'self'", 'data:', 'blob:'];
  const sb = supabaseOrigin(env);
  if (sb) img.push(sb);
  return [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    // NOTE: assumes self-hosted fonts (no Google Fonts in the shell).
    // If Google Fonts are (re)introduced, use this style/font pair instead:
    // "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(' ')}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'frame-src https://www.youtube-nocookie.com',
  ].join('; ');
}

/**
 * Attach the security-header set to HTML responses. Non-HTML responses
 * (assets, JSON, XML) are returned untouched so caching/streaming behaviour
 * is preserved. Never throws — on any internal error the original response
 * is returned as-is.
 */
export function applySecurityHeaders(res: Response, env: Env): Response {
  try {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return res;
    const headers = new Headers(res.headers);
    headers.set('content-security-policy', contentSecurityPolicy(env));
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err) {
    console.error('[staging] applySecurityHeaders failed, serving unmodified response', err);
    return res;
  }
}
