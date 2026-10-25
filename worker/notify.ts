/// <reference types="@cloudflare/workers-types" />

// Launch-list signup endpoint (`POST /api/notify`). Extracted verbatim from
// worker/index.ts (teaser) so the full-site worker can serve the identical
// contract after cutover: same validation, honeypot, `sub:<email>` KV key
// format, dedupe response, and JSON envelopes.
//
// KV is typed optional so both worker Env shapes satisfy NotifyEnv without
// forcing every caller to declare the binding. A worker that mounts this
// handler without the binding answers 503 instead of throwing.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 2048;

export interface NotifyEnv {
  NOTIFY_KV?: KVNamespace;
}

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function handleNotify(request: Request, env: NotifyEnv): Promise<Response> {
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

  const kv = env.NOTIFY_KV;
  if (!kv) return json({ ok: false, error: 'notify_unavailable' }, 503);

  const key = `sub:${email}`;
  const existing = await kv.get(key);
  if (existing) return json({ ok: true, already: true });

  await kv.put(
    key,
    JSON.stringify({
      email,
      ts: Date.now(),
      ua: (request.headers.get('user-agent') ?? '').slice(0, 180),
    }),
  );

  return json({ ok: true });
}
