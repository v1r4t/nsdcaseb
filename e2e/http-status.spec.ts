import { test, expect } from './fixtures';

// HTTP status contract of the staging worker (worker/meta.ts isKnownRoute):
// unknown routes and the camouflaged /admin answer 404 with the SPA shell,
// while real SPA routes answer 200. Requires the wrangler worker — the Vite
// dev server answers 200 for everything.

test('HTTP status: /nope and /admin are 404, / and /archive are 200', async ({
  request,
}) => {
  const cases: Array<[string, number]> = [
    ['/nope-this-route-does-not-exist-e2e', 404],
    ['/admin', 404],
    ['/', 200],
    ['/archive', 200],
  ];
  for (const [path, status] of cases) {
    const res = await request.get(path);
    expect(res.status(), `GET ${path}`).toBe(status);
    expect(res.headers()['content-type'] ?? '', `content-type ${path}`).toContain('text/html');
  }

  // Media merged into the archive: permanent redirect, no duplicate page.
  const media = await request.get('/media', { maxRedirects: 0 });
  expect(media.status(), 'GET /media').toBe(301);
  expect(media.headers()['location'] ?? '').toContain('/archive');
});
