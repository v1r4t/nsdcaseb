/// <reference types="@cloudflare/workers-types" />

interface Env {
  NOTIFY_KV: KVNamespace;
  ASSETS: Fetcher;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 2048;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function handleNotify(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', allow: 'POST', 'cache-control': 'no-store' },
    });
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);

  let payload: { email?: unknown; company?: unknown } | null = null;
  try {
    payload = (await request.json()) as { email?: unknown; company?: unknown };
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  // Honeypot: bots fill it, humans never see it. Pretend success.
  if (typeof payload?.company === 'string' && payload.company.trim() !== '') {
    return json({ ok: true });
  }

  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  const key = `sub:${email}`;
  const existing = await env.NOTIFY_KV.get(key);
  if (existing) return json({ ok: true, already: true });

  await env.NOTIFY_KV.put(
    key,
    JSON.stringify({
      email,
      ts: Date.now(),
      ua: (request.headers.get('user-agent') ?? '').slice(0, 180),
    }),
  );

  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/notify') return handleNotify(request, env);
      return json({ ok: false, error: 'not_found' }, 404);
    }

    // Defensive: if a non-API request ever reaches the Worker, serve assets.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
