/// <reference types="@cloudflare/workers-types" />

import { handleApi, type Env } from './auth';
import { handleContentApi } from './content';
import { handleEventsApi } from './events';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return (
        (await handleContentApi(request, env)) ??
        (await handleEventsApi(request, env)) ??
        handleApi(request, env)
      );
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
