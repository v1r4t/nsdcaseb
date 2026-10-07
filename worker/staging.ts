/// <reference types="@cloudflare/workers-types" />

import { handleApi, type Env } from './auth';
import { handleContentApi } from './content';
import { handleEventsApi } from './events';
import { handleAdminApi } from './admin';
import { handleMediaApi } from './media';
import { handleProjectsApi } from './projects';
import { handleScheduled } from './email';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return (
        (await handleContentApi(request, env)) ??
        (await handleEventsApi(request, env)) ??
        (await handleMediaApi(request, env)) ??
        (await handleProjectsApi(request, env)) ??
        (await handleAdminApi(request, env)) ??
        handleApi(request, env)
      );
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  },
} satisfies ExportedHandler<Env>;
