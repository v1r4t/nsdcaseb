// @vitest-environment node
/**
 * Security tests for admin-composed broadcast HTML. These are the boundary
 * between the composer and the outbox: anything that survives here will be
 * rendered in a member's mail client.
 */
import { describe, expect, it } from 'vitest';
import {
  broadcastText,
  isEmailAssetUrl,
  plainTextToHtml,
  renderBroadcastHtml,
  sanitizeBroadcastHtml,
} from './email-content';

const SUPABASE = 'https://project-ref.supabase.co';
const IMAGE = `${SUPABASE}/storage/v1/object/public/email-assets/email/abc.jpg`;

describe('sanitizeBroadcastHtml', () => {
  it('removes scripts, including their body', () => {
    const out = sanitizeBroadcastHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(out).toBe('<p>Hello</p>');
    expect(out).not.toContain('alert');
  });

  it('removes inline event handlers', () => {
    const out = sanitizeBroadcastHtml('<p onclick="alert(1)" onmouseover="steal()">Hi</p>');
    expect(out).toBe('<p>Hi</p>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
  });

  it('drops javascript: links but keeps the link text', () => {
    const out = sanitizeBroadcastHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).toContain('click');
    expect(out).not.toContain('href');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('drops javascript: hrefs hidden behind entities or mixed case', () => {
    const out = sanitizeBroadcastHtml(
      '<a href="java&#x73;cript:alert(1)">a</a><a href="JaVaScRiPt:alert(2)">b</a>',
    );
    expect(out.toLowerCase()).not.toContain('javascript');
    expect(out).not.toContain('href');
  });

  it('drops relative and protocol-relative links', () => {
    const out = sanitizeBroadcastHtml('<a href="/account">a</a><a href="//evil.test/x">b</a>');
    expect(out).not.toContain('href');
  });

  it('removes style attributes, classes and style blocks', () => {
    const out = sanitizeBroadcastHtml(
      '<style>body{display:none}</style><p style="color:red" class="x">Hi</p>',
    );
    expect(out).toBe('<p>Hi</p>');
    expect(out).not.toContain('display:none');
    expect(out).not.toContain('style=');
    expect(out).not.toContain('class=');
  });

  it('removes iframes, objects, embeds and images', () => {
    const out = sanitizeBroadcastHtml(
      '<iframe src="https://evil.test"></iframe>' +
        '<object data="x"></object>' +
        '<embed src="y">' +
        '<img src="https://evil.test/pixel.png" onerror="alert(1)">' +
        '<p>ok</p>',
    );
    expect(out).toBe('<p>ok</p>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('img');
    expect(out).not.toContain('evil.test');
  });

  it('removes unknown tags but keeps readable text', () => {
    const out = sanitizeBroadcastHtml('<div><span>kept</span></div><form><input value="x"></form>');
    expect(out).toBe('kept');
    expect(out).not.toContain('<div');
    expect(out).not.toContain('<form');
  });

  it('keeps the allow-listed formatting', () => {
    const out = sanitizeBroadcastHtml(
      '<h2>Title</h2><p><strong>bold</strong> <b>b</b> <em>em</em> <i>i</i></p>' +
        '<ul><li>one</li></ul><ol><li>two</li></ol>' +
        '<blockquote>quote</blockquote><hr>' +
        '<p><a href="https://example.test/page" title="Example">link</a></p>',
    );
    for (const fragment of [
      '<h2>Title</h2>',
      '<strong>bold</strong>',
      '<b>b</b>',
      '<em>em</em>',
      '<i>i</i>',
      '<ul><li>one</li></ul>',
      '<ol><li>two</li></ol>',
      '<blockquote>quote</blockquote>',
      '<hr>',
      'href="https://example.test/page"',
      'title="Example"',
    ]) {
      expect(out).toContain(fragment);
    }
  });

  it('allows mailto links', () => {
    const out = sanitizeBroadcastHtml('<a href="mailto:club@example.test">Mail us</a>');
    expect(out).toContain('href="mailto:club@example.test"');
  });

  it('keeps ampersands singly encoded and is idempotent', () => {
    // TipTap emits `&amp;` inside href attribute values.
    const input = '<p><a href="https://forms.example.com/x?a=1&amp;b=2">form</a></p>';
    const once = sanitizeBroadcastHtml(input);
    expect(once).toContain('href="https://forms.example.com/x?a=1&amp;b=2"');
    expect(once).not.toContain('amp;amp;');
    expect(sanitizeBroadcastHtml(once)).toBe(once);
  });

  it('does not double-encode an ampersand through sanitize + render', () => {
    const input = '<p><a href="https://forms.example.com/x?a=1&amp;b=2">form</a></p>';
    const html = renderBroadcastHtml({ bodyHtml: input });
    expect(html).toContain('href="https://forms.example.com/x?a=1&amp;b=2"');
    expect(html).not.toContain('amp;amp;');
    // renderBroadcastHtml sanitises again; pre-sanitised input is unchanged.
    const presanitised = renderBroadcastHtml({ bodyHtml: sanitizeBroadcastHtml(input) });
    expect(presanitised).toContain('href="https://forms.example.com/x?a=1&amp;b=2"');
    expect(presanitised).not.toContain('amp;amp;');
  });
});

describe('renderBroadcastHtml', () => {
  it('wraps the body in the fixed dark 560px shell', () => {
    const html = renderBroadcastHtml({ bodyHtml: '<p>Hello</p>' });
    expect(html).toContain('max-width:560px');
    expect(html).toContain('background:#0b0b0c');
    expect(html).toContain('<p>Hello</p>');
    expect(html).not.toContain('<img');
  });

  it('adds the image at the top with the required inline style', () => {
    const html = renderBroadcastHtml({
      bodyHtml: '<p>Hello</p>',
      imageUrl: IMAGE,
      imageAlt: 'A poster',
    });
    expect(html).toContain(
      `<img src="${IMAGE}" alt="A poster" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;margin:0 0 20px" />`,
    );
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<p>Hello</p>'));
  });

  it('escapes a hostile image alt instead of injecting attributes', () => {
    const html = renderBroadcastHtml({
      bodyHtml: '<p>Hello</p>',
      imageUrl: IMAGE,
      imageAlt: '" onerror="alert(1)',
    });
    expect(html).toContain('alt="&quot; onerror=&quot;alert(1)"');
    expect(html).not.toContain('alt="" onerror="alert(1)"');
    expect(html).not.toContain('<script');
  });

  it('escapes hostile body titles instead of breaking out of the attribute', () => {
    const html = renderBroadcastHtml({
      bodyHtml: '<a href="https://example.test" title=\'"><script>alert(1)</script>\'>x</a><script>alert(2)</script>',
    });
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('title=""><script');
  });

  it('escapes a quote in the image URL', () => {
    const html = renderBroadcastHtml({
      bodyHtml: '<p>Hi</p>',
      imageUrl: `${IMAGE}" onerror="alert(1)`,
    });
    expect(html).toContain('&quot;');
    expect(html).not.toContain('" onerror="alert(1)"');
  });
});

describe('isEmailAssetUrl', () => {
  it('accepts the public email-assets bucket prefix', () => {
    expect(isEmailAssetUrl(IMAGE, SUPABASE)).toBe(true);
    expect(
      isEmailAssetUrl(`${SUPABASE}/storage/v1/object/public/email-assets/email/nested/a.png`, SUPABASE),
    ).toBe(true);
  });

  it('accepts percent-encoded object paths', () => {
    expect(
      isEmailAssetUrl(`${SUPABASE}/storage/v1/object/public/email-assets/email/a%20b.jpg`, SUPABASE),
    ).toBe(true);
  });

  it('rejects another host, even with the same path', () => {
    expect(isEmailAssetUrl('https://evil.test/storage/v1/object/public/email-assets/email/a.jpg', SUPABASE)).toBe(
      false,
    );
  });

  it('rejects another bucket on our own host', () => {
    expect(isEmailAssetUrl(`${SUPABASE}/storage/v1/object/public/event-posters/events/a.webp`, SUPABASE)).toBe(
      false,
    );
    expect(isEmailAssetUrl(`${SUPABASE}/storage/v1/object/public/email-assets-other/a.jpg`, SUPABASE)).toBe(false);
  });

  it('rejects traversal, queries, fragments and junk', () => {
    expect(
      isEmailAssetUrl(`${SUPABASE}/storage/v1/object/public/email-assets/../event-posters/x`, SUPABASE),
    ).toBe(false);
    expect(
      isEmailAssetUrl(`${SUPABASE}/storage/v1/object/public/email-assets/%2e%2e/event-posters/x`, SUPABASE),
    ).toBe(false);
    expect(isEmailAssetUrl(`${IMAGE}?download=1`, SUPABASE)).toBe(false);
    expect(isEmailAssetUrl(`${IMAGE}#frag`, SUPABASE)).toBe(false);
    expect(isEmailAssetUrl('', SUPABASE)).toBe(false);
    expect(isEmailAssetUrl(IMAGE, '')).toBe(false);
    expect(isEmailAssetUrl('not a url', SUPABASE)).toBe(false);
    expect(isEmailAssetUrl('javascript:alert(1)', SUPABASE)).toBe(false);
  });

  it('rejects a different scheme on the same host', () => {
    expect(isEmailAssetUrl(IMAGE.replace('https:', 'http:'), SUPABASE)).toBe(false);
  });
});

describe('broadcastText', () => {
  it('trims the body when there is no image', () => {
    expect(broadcastText('  hello  ')).toBe('hello');
  });

  it('appends the image announcement and URL', () => {
    expect(broadcastText('hello', IMAGE, 'A poster')).toBe(
      `hello\n\n[Image: A poster]\n${IMAGE}`,
    );
  });

  it('falls back to the URL when the alt is empty', () => {
    expect(broadcastText('hello', IMAGE, '   ')).toBe(`hello\n\n[Image: ${IMAGE}]\n${IMAGE}`);
  });

  it('returns only the image block for an empty body', () => {
    expect(broadcastText('   ', IMAGE, 'A poster')).toBe(`[Image: A poster]\n${IMAGE}`);
  });
});

describe('plainTextToHtml', () => {
  it('escapes markup and turns blank lines into paragraphs', () => {
    const html = plainTextToHtml('Hello <script>alert(1)</script>\n\nSecond\nline');
    expect(html).toBe('<p>Hello &lt;script&gt;alert(1)&lt;/script&gt;</p><p>Second<br>line</p>');
    expect(sanitizeBroadcastHtml(html)).not.toContain('<script>');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(plainTextToHtml('  \n\n ')).toBe('');
  });
});
