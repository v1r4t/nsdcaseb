import {
  test,
  expect,
  createTestAlbum,
  deleteTestAlbum,
  deleteUserByEmail,
  galleryTestPng,
  registerObViaApi,
  uniqueEmail,
  uploadGalleryPhoto,
} from './fixtures';

// Gallery photo uploads, against the real product paths:
//   ob account via API (register -> local-D1 verify/promote -> login)
//   -> create album via API
//   -> POST multipart /api/media/items (album_id, type=image, photo)
//   -> GET /api/media shows the item -> delete item and album.
//
// Storage is optional by contract: local dev and CI without Supabase secrets
// answer 503 `storage_not_configured`. That path is asserted here and the
// upload success test is skipped with an explicit reason, so the suite stays
// green without club storage credentials. Never point these tests at staging
// or production: the suite writes and deletes real admin rows.

const PASSWORD = 'E2eTest123456';

interface MediaListBody {
  albums: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      type: string;
      url: string;
      title: string;
      caption: string;
    }>;
  }>;
}

function albumName(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `[E2E] ${prefix} ${stamp}`;
}

function obAccount(email: string) {
  return {
    name: 'E2E Gallery Admin',
    email,
    mobile: '+911234567894',
    password: PASSWORD,
  };
}

test('gallery photo upload: ob multipart -> 201 -> GET /api/media -> delete', async ({
  request,
}) => {
  const adminEmail = uniqueEmail('gallery-ob');
  const title = albumName('Gallery upload');
  let album: { id: string; title: string } | null = null;
  let itemId: string | null = null;

  try {
    await registerObViaApi(request, obAccount(adminEmail));
    album = await createTestAlbum(request, title);

    const upload = await uploadGalleryPhoto(request, {
      albumId: album.id,
      title: 'E2E photo',
      caption: 'Uploaded by e2e/media-upload.spec.ts; deleted at the end of the run.',
      fileName: 'e2e-gallery.png',
      // A real 1x1 PNG, not random bytes: the request mirrors a browser pick.
      bytes: galleryTestPng(),
    });
    const uploadText = await upload.text();

    // Storage is not configured in local/CI runs without Supabase secrets.
    // Verify the documented 503 envelope, then skip instead of failing.
    if (upload.status() === 503) {
      const body = JSON.parse(uploadText) as { error?: string };
      expect(
        body.error,
        `503 from /api/media/items must be the documented storage_not_configured envelope: ${uploadText}`,
      ).toBe('storage_not_configured');
      test.skip(
        true,
        'Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing); ' +
          'verified the 503 storage_not_configured path instead.',
      );
    }

    expect(
      upload.status(),
      `POST /api/media/items should create the photo: ${uploadText}`,
    ).toBe(201);
    const created = JSON.parse(uploadText) as { id: string; url: string; variants?: unknown };
    expect(created.id, 'created item must have an id').toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(created.url, 'upload must return a public photo URL').toMatch(/^https?:\/\//);
    itemId = created.id;

    // The read endpoint is the public gallery contract: the item must be
    // attached to the album with the same URL the upload returned.
    const listRes = await request.get('/api/media');
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as MediaListBody;
    const listedAlbum = list.albums.find((a) => a.id === album?.id);
    expect(listedAlbum, 'created album must appear in GET /api/media').toBeTruthy();
    const listedItem = listedAlbum?.items.find((i) => i.id === created.id);
    expect(listedItem, 'uploaded photo must appear under its album in GET /api/media').toBeTruthy();
    expect(listedItem).toMatchObject({
      type: 'image',
      url: created.url,
      title: 'E2E photo',
    });

    const deleteItem = await request.delete(`/api/media/items/${encodeURIComponent(created.id)}`);
    expect(deleteItem.status(), await deleteItem.text()).toBe(200);
    itemId = null;

    const deleteAlbum = await request.delete(`/api/media/albums/${encodeURIComponent(album.id)}`);
    expect(deleteAlbum.status(), await deleteAlbum.text()).toBe(200);
    album = null;
  } finally {
    // Interrupted runs must not leave gallery rows or a throwaway admin behind.
    if (itemId) {
      await request.delete(`/api/media/items/${encodeURIComponent(itemId)}`).catch(() => null);
    }
    if (album) await deleteTestAlbum(request, album.id).catch(() => null);
    await deleteUserByEmail(adminEmail);
  }
});

test.describe('admin gallery at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('photo picker replaces the URL field and there is no video option', async ({ page }) => {
    const adminEmail = uniqueEmail('gallery-ui-ob');
    const title = albumName('Gallery UI');
    let album: { id: string; title: string } | null = null;

    try {
      // page.request shares the browser context's cookie jar, so the UI below
      // uses the same live ob session as these API calls.
      await registerObViaApi(page.request, obAccount(adminEmail));
      album = await createTestAlbum(page.request, title);

      await page.goto('/admin');
      await page.getByRole('button', { name: 'Open admin console' }).click();
      await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
      await page.getByRole('tab', { name: 'Gallery' }).click();

      const gallery = page.getByRole('region', { name: 'Gallery' });
      await expect(gallery).toBeVisible();
      // Wait for the media fetch: the fake album proves the item form is for a
      // real, selectable album rather than the empty state.
      await expect(gallery.getByText(title, { exact: false }).first()).toBeVisible();

      // The item form must offer a file picker, one photo at a time, photos only.
      const fileInputs = gallery.locator('input[type="file"]');
      expect(await fileInputs.count(), 'gallery item form must have a photo file input').toBeGreaterThan(0);
      const photoInput = fileInputs.first();
      await expect(photoInput).toBeVisible();
      expect((await photoInput.getAttribute('accept')) ?? '').toContain('image');
      expect(
        await photoInput.getAttribute('multiple'),
        'photos upload one at a time; the picker must not be multi-select',
      ).toBeNull();

      // Photos only: no video type selector and no leftover URL text field for
      // creating an item (editing an existing URL item is out of scope here).
      await expect(gallery.getByRole('option', { name: /video/i })).toHaveCount(0);
      await expect(gallery.getByLabel('Item URL', { exact: true })).toHaveCount(0);
    } finally {
      if (album) await deleteTestAlbum(page.request, album.id).catch(() => null);
      await deleteUserByEmail(adminEmail);
    }
  });
});
