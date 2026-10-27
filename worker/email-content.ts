/// <reference types="@cloudflare/workers-types" />

// Phase 6: rich broadcast content.
//
// Admin-composed mail is the only HTML that does not come from a template in
// `email.ts`, so it goes through a strict allow-list before it is stored in the
// outbox. The same module owns the fixed mail shell and the plain-text mirror,
// keeping the sanitizer and the renderer impossible to use apart.

import xss from 'xss';

/** Tags the composer is allowed to produce. Everything else is dropped. */
const ALLOWED_TAGS: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  h1: [],
  h2: [],
  h3: [],
  ul: [],
  ol: [],
  li: [],
  a: ['href', 'title'],
  blockquote: [],
  hr: [],
};

/** Tags whose whole body is discarded (not merely unwrapped). */
const DROP_BODY_TAGS = ['script', 'style', 'iframe'];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

/**
 * Links may only point at the web or an inbox. Relative URLs are rejected too:
 * a mail has no useful base, and `//host` would silently become https.
 */
function isSafeLinkHref(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
}

/**
 * Strict allow-list for admin-composed broadcast HTML.
 *
 * Removes scripts (and their bodies), styles, iframes, media embeds, event
 * handlers, `style`/`class` attributes, images and any tag outside
 * `ALLOWED_TAGS`. Links keep only `href`/`title`, and `href` must be http,
 * https or mailto.
 */
export function sanitizeBroadcastHtml(html: string): string {
  return xss(html, {
    whiteList: ALLOWED_TAGS,
    stripIgnoreTag: true,
    stripIgnoreTagBody: DROP_BODY_TAGS,
    allowCommentTag: false,
    css: false,
    onTagAttr(tag, name, value, isWhiteAttr) {
      if (tag === 'a' && name === 'href') {
        // Safe URLs fall through to xss's own attribute encoder, which
        // decodes entities before re-encoding — that keeps the output
        // idempotent (an `&amp;` in a query string stays `&amp;`). Returning
        // a manually escaped value here would encode the ampersand twice.
        return isSafeLinkHref(value) ? undefined : '';
      }
      // Non-allow-listed attributes (style, class, on*) are dropped.
      return isWhiteAttr ? undefined : '';
    },
  });
}

/** Escape plain text and turn blank-line paragraphs / single newlines into HTML. */
export function plainTextToHtml(text: string): string {
  const trimmed = text.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Best-effort plain-text mirror of sanitized broadcast HTML. */
export function htmlToText(html: string): string {
  return decodeEntities(
    sanitizeBroadcastHtml(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h1|h2|h3|li|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface BroadcastRenderInput {
  bodyHtml: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}

/**
 * Fixed dark shell for broadcasts: 560px single column card, same palette as
 * `mailShell` in `email.ts`. The optional image sits above the body.
 */
export function renderBroadcastHtml(input: BroadcastRenderInput): string {
  const body = sanitizeBroadcastHtml(input.bodyHtml ?? '');
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  const imageAlt = typeof input.imageAlt === 'string' ? input.imageAlt.trim() : '';
  const image = imageUrl
    ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(imageAlt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;margin:0 0 20px" />`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0b0b0c;font-family:system-ui,sans-serif;color:#f2f2f0"><div style="max-width:560px;margin:0 auto;background:#151517;border:1px solid #2a2a2e;border-radius:12px;padding:32px">${image}<div style="font-size:14px;line-height:1.6;color:#c9c9c6">${body}</div><p style="margin:24px 0 0;font-size:12px;color:#888">— NSDC</p></div></body></html>`;
}

/**
 * Plain-text mirror. The image is announced in words so a text-only client
 * still knows it is there (and where it lives).
 */
export function broadcastText(
  bodyText: string,
  imageUrl?: string | null,
  imageAlt?: string | null,
): string {
  const text = (bodyText ?? '').trim();
  const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!url) return text;
  const label = (imageAlt ?? '').trim() || url;
  const imageBlock = `[Image: ${label}]\n${url}`;
  return text ? `${text}\n\n${imageBlock}` : imageBlock;
}

/**
 * The only image host a broadcast may reference: the public `email-assets`
 * bucket of the configured Supabase project. Encoded paths are resolved before
 * the prefix check, and `..` traversal is refused.
 */
export function isEmailAssetUrl(url: string, supabaseUrl: string): boolean {
  if (typeof url !== 'string' || typeof supabaseUrl !== 'string') return false;
  const candidate = url.trim();
  if (!candidate || !supabaseUrl.trim()) return false;
  let base: URL;
  let parsed: URL;
  try {
    base = new URL(supabaseUrl.trim());
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.origin !== base.origin) return false;
  if (parsed.search || parsed.hash) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    return false;
  }
  const prefix = '/storage/v1/object/public/email-assets/';
  if (!decoded.startsWith(prefix)) return false;
  const rest = decoded.slice(prefix.length);
  if (!rest || rest.includes('..')) return false;
  return true;
}
