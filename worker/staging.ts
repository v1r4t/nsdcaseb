/// <reference types="@cloudflare/workers-types" />

import { handleApi, type Env } from './auth';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
