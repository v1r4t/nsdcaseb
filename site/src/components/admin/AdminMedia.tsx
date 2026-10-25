import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createAlbum,
  createItemPhoto,
  deleteAlbum,
  deleteItem,
  listMedia,
  updateAlbum,
  updateItem,
  updateItemPhoto,
} from '../../lib/media';
import type { MediaAlbum, MediaItem } from '../../lib/media';
import { GalleryPhotoError, prepareGalleryPhoto } from '../../lib/image-variants';
import type { GalleryPhotoUpload } from '../../lib/image-variants';
import { errText } from './AdminOverview';
import type { PanelProps } from './AdminOverview';

// Field limits mirror worker/media.ts. Client-side checks are only a fast
// path — the worker stays the authority and its `{ error }` code is shown
// inline (via errText) when a request still fails.
const MAX_TITLE = 160;
const MAX_TEXT = 2000;
const MAX_URL = 2048;
const MAX_ID_REF = 64;
const MAX_SORT = 1_000_000;

/** Human-readable size for the selected/compressed photo notices. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface AlbumFormState {
  title: string;
  description: string;
  cover_url: string;
  event_id: string;
  sort_order: string;
}

const EMPTY_ALBUM_FORM: AlbumFormState = {
  title: '',
  description: '',
  cover_url: '',
  event_id: '',
  sort_order: '',
};

interface ItemFormState {
  album_id: string;
  title: string;
  caption: string;
  sort_order: string;
}

function emptyItemForm(albumId: string): ItemFormState {
  return {
    album_id: albumId,
    title: '',
    caption: '',
    sort_order: '',
  };
}

interface AlbumPayload {
  title: string;
  description: string;
  cover_url: string | null;
  event_id: string | null;
  sort_order: number | undefined;
}

/** Item metadata shared by JSON patches and multipart photo uploads. */
interface ItemFields {
  album_id: string;
  title: string;
  caption: string;
  sort_order: number | undefined;
}

/** Blank means "leave it out" (server default on create, unchanged on patch). */
function parseSortOrder(raw: string): { ok: true; value: number | undefined } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, error: 'Sort order must be a whole number.' };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SORT) {
    return { ok: false, error: 'Sort order must be between -1,000,000 and 1,000,000.' };
  }
  return { ok: true, value };
}

/** Albums store a cover URL; blank clears it. Same https rule the UI promises. */
function validateCover(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > MAX_URL) return { ok: false, error: `Cover URL must be ${MAX_URL} characters or fewer.` };
  try {
    if (new URL(trimmed).protocol !== 'https:') throw new Error('not https');
  } catch {
    return { ok: false, error: 'Cover URL must be an absolute https URL.' };
  }
  return { ok: true, value: trimmed };
}

/** Videos are not embedded here — just label the host so owners know what they pasted. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase() || 'video';
  } catch {
    return 'video';
  }
}

function itemLabel(item: MediaItem): string {
  return item.title || item.caption || `${item.type} item`;
}

export default function AdminMedia({ busy, setBusy, notify }: PanelProps) {
  const [albums, setAlbums] = useState<MediaAlbum[] | null>(null);
  const [albumId, setAlbumId] = useState('');
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [albumForm, setAlbumForm] = useState<AlbumFormState>(EMPTY_ALBUM_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(() => emptyItemForm(''));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  // Bumping this remounts the file input so a finished upload starts blank.
  const [photoInputNonce, setPhotoInputNonce] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    listMedia()
      .then((res) => {
        if (!alive) return;
        setAlbums(res.albums);
        setAlbumId((prev) => prev || res.albums[0]?.id || '');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setAlbums([]);
        setError(errText(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  const currentAlbum = albums === null ? null : albums.find((a) => a.id === albumId) ?? albums[0] ?? null;
  // Legacy video rows still render in the list but the form only edits their
  // metadata — videos can no longer be created or have their URL changed.
  const editingItem = editingItemId && albums
    ? albums.flatMap((a) => a.items).find((item) => item.id === editingItemId) ?? null
    : null;
  const isLegacyVideo = editingItem?.type === 'video';

  // Keep the picker pointed at a real album after a delete or the first create.
  useEffect(() => {
    if (!albums || albums.length === 0) return;
    if (!albums.some((a) => a.id === albumId)) setAlbumId(albums[0].id);
  }, [albums, albumId]);

  // New-item form follows the chosen album unless the owner already picked one
  // in the form (or is editing an item that lives elsewhere).
  useEffect(() => {
    if (!albums || !currentAlbum) return;
    if (albums.some((a) => a.id === itemForm.album_id)) return;
    setItemForm((prev) => ({ ...prev, album_id: currentAlbum.id }));
  }, [albums, currentAlbum, itemForm.album_id]);

  async function refresh(): Promise<void> {
    const res = await listMedia();
    setAlbums(res.albums);
  }

  async function run(fn: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
      notify(message);
      return true;
    } catch (err) {
      setError(errText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function resetAlbumForm(): void {
    setEditingAlbumId(null);
    setAlbumForm(EMPTY_ALBUM_FORM);
  }

  function startAlbumEdit(album: MediaAlbum): void {
    setEditingAlbumId(album.id);
    setAlbumForm({
      title: album.title,
      description: album.description,
      cover_url: album.cover_url ?? '',
      event_id: album.event_id ?? '',
      sort_order: String(album.sort_order),
    });
    setError('');
  }

  function resetItemForm(forAlbum = currentAlbum?.id ?? ''): void {
    setEditingItemId(null);
    setItemForm(emptyItemForm(forAlbum));
    setPhoto(null);
    setPhotoNotice(null);
    setPhotoInputNonce((n) => n + 1);
  }

  function startItemEdit(item: MediaItem): void {
    const owner = albums?.find((album) => album.items.some((it) => it.id === item.id));
    setEditingItemId(item.id);
    setItemForm({
      album_id: owner?.id ?? currentAlbum?.id ?? '',
      title: item.title,
      caption: item.caption,
      sort_order: String(item.sort_order),
    });
    setPhoto(null);
    setPhotoNotice(null);
    setPhotoInputNonce((n) => n + 1);
    setError('');
  }

  function chooseAlbum(id: string): void {
    setAlbumId(id);
    setError('');
    if (!editingItemId) setItemForm((prev) => ({ ...prev, album_id: id }));
  }

  function buildAlbumPayload(): AlbumPayload | null {
    const title = albumForm.title.trim();
    if (!title) {
      setError('Album title is required.');
      return null;
    }
    if (title.length > MAX_TITLE) {
      setError(`Album title must be ${MAX_TITLE} characters or fewer.`);
      return null;
    }
    if (albumForm.description.length > MAX_TEXT) {
      setError(`Description must be ${MAX_TEXT} characters or fewer.`);
      return null;
    }
    const cover = validateCover(albumForm.cover_url);
    if (!cover.ok) {
      setError(cover.error);
      return null;
    }
    const eventId = albumForm.event_id.trim();
    if (eventId.length > MAX_ID_REF) {
      setError(`Event id must be ${MAX_ID_REF} characters or fewer.`);
      return null;
    }
    const sort = parseSortOrder(albumForm.sort_order);
    if (!sort.ok) {
      setError(sort.error);
      return null;
    }
    return {
      title,
      description: albumForm.description,
      cover_url: cover.value,
      event_id: eventId === '' ? null : eventId,
      sort_order: sort.value,
    };
  }

  async function submitAlbum(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const payload = buildAlbumPayload();
    if (!payload) return;
    if (editingAlbumId) {
      const saved = await run(() => updateAlbum(editingAlbumId, payload), `Saved album “${payload.title}”.`);
      if (saved) resetAlbumForm();
    } else {
      const created = await run(() => createAlbum(payload), `Created album “${payload.title}”.`);
      if (created) resetAlbumForm();
    }
  }

  function removeAlbum(album: MediaAlbum): void {
    const itemCount = album.items.length;
    const suffix = itemCount > 0 ? ` and its ${itemCount} item${itemCount === 1 ? '' : 's'}` : '';
    if (!window.confirm(`Delete “${album.title}”${suffix}?`)) return;
    const itemIds = new Set(album.items.map((item) => item.id));
    void run(async () => {
      await deleteAlbum(album.id);
      if (editingAlbumId === album.id) resetAlbumForm();
      if (editingItemId && itemIds.has(editingItemId)) resetItemForm('');
      if (albumId === album.id) setAlbumId('');
    }, `Deleted album “${album.title}”.`);
  }

  function buildItemFields(): ItemFields | null {
    const albumForItem = itemForm.album_id || currentAlbum?.id || '';
    if (!albumForItem || !albums?.some((a) => a.id === albumForItem)) {
      setError('Choose an album for this item.');
      return null;
    }
    if (itemForm.title.length > MAX_TITLE) {
      setError(`Item title must be ${MAX_TITLE} characters or fewer.`);
      return null;
    }
    if (itemForm.caption.length > MAX_TEXT) {
      setError(`Caption must be ${MAX_TEXT} characters or fewer.`);
      return null;
    }
    const sort = parseSortOrder(itemForm.sort_order);
    if (!sort.ok) {
      setError(sort.error);
      return null;
    }
    return {
      album_id: albumForItem,
      title: itemForm.title,
      caption: itemForm.caption,
      sort_order: sort.value,
    };
  }

  async function submitItem(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    const fields = buildItemFields();
    if (!fields) return;

    // Legacy videos: metadata only. No type/url in the patch, so the row stays
    // a video and its URL cannot be edited through this form.
    if (isLegacyVideo) {
      if (!editingItemId) {
        setError('Videos can no longer be added. Choose a photo instead.');
        return;
      }
      const saved = await run(() => updateItem(editingItemId, fields), 'Saved item.');
      if (saved) resetItemForm(fields.album_id);
      return;
    }

    const source = photo;
    if (!editingItemId && !source) {
      setError('Choose a photo to upload.');
      return;
    }

    setBusy(true);
    setError('');
    let prepared: GalleryPhotoUpload | null = null;
    if (source) {
      setPhotoNotice('Preparing photo…');
      try {
        prepared = await prepareGalleryPhoto(source, setPhotoNotice);
        const summary = prepared.compressed
          ? `Compressed to ${formatBytes(prepared.photo.size)} (from ${formatBytes(source.size)})`
          : `Photo ready (${formatBytes(source.size)})`;
        setPhotoNotice(
          prepared.variantError
            ? `${summary} · uploading the original only — ${prepared.variantError}`
            : `${summary} · 640w and 1600w WebP variants generated.`,
        );
      } catch (err) {
        setPhotoNotice(null);
        setError(
          err instanceof GalleryPhotoError
            ? err.message
            : 'Could not prepare that photo. Try a different image.',
        );
        setBusy(false);
        return;
      }
    }

    try {
      if (editingItemId) {
        // No new file: metadata-only JSON patch keeps the existing photo.
        if (prepared) {
          await updateItemPhoto(editingItemId, fields, {
            photo: prepared.photo,
            thumb: prepared.thumb,
            full: prepared.full,
          });
        } else {
          await updateItem(editingItemId, fields);
        }
      } else if (prepared) {
        await createItemPhoto(fields, {
          photo: prepared.photo,
          thumb: prepared.thumb,
          full: prepared.full,
        });
      }
      await refresh();
      notify(editingItemId ? 'Saved item.' : 'Added photo.');
      resetItemForm(fields.album_id);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  function removeItem(item: MediaItem): void {
    if (!window.confirm(`Delete “${itemLabel(item)}”?`)) return;
    void run(async () => {
      await deleteItem(item.id);
      if (editingItemId === item.id) resetItemForm();
    }, `Deleted ${item.type} item.`);
  }

  return (
    <section aria-label="Gallery" className="space-y-8">
      <div>
        <h2 className="label">Gallery</h2>
        <p className="mt-2 text-sm text-muted">
          Albums and gallery items for the public gallery. Album covers stay URL-based; gallery
          photos are uploaded from this browser as WebP variants, with sources over 10 MB
          compressed automatically before upload.
        </p>
        {error && (
          <p role="alert" aria-live="assertive" className="error-text mt-3">
            {error}
          </p>
        )}
        {albums === null && (
          <p aria-live="polite" className="mt-6 font-mono text-[11px] uppercase tracking-wide text-muted">
            Loading media…
          </p>
        )}
      </div>

      {albums !== null && (
        <>
          <div>
            <h3 className="label">Albums</h3>
            <ul className="mt-4">
              {albums.map((album) => (
                <li key={album.id} className="border-t border-line py-4 last:border-b">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      {album.cover_url && (
                        <img
                          src={album.cover_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={96}
                          height={54}
                          className="h-14 w-24 shrink-0 border border-line object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-paper/80">
                          {album.title}
                          <span className="ml-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                            sort {album.sort_order}
                          </span>
                        </p>
                        {album.description && <p className="mt-1 text-xs text-muted">{album.description}</p>}
                        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">
                          {album.items.length} item{album.items.length === 1 ? '' : 's'} ·{' '}
                          {album.event_id ? `event ${album.event_id}` : 'no event'}
                        </p>
                        {album.cover_url && (
                          <p className="mt-1 truncate font-mono text-[11px] text-muted" title={album.cover_url}>
                            {album.cover_url}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" className="btn-ghost" disabled={busy} onClick={() => startAlbumEdit(album)}>
                        Edit
                      </button>
                      <button type="button" className="btn-ghost" disabled={busy} onClick={() => removeAlbum(album)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {albums.length === 0 && <p className="mt-4 text-sm text-muted">No albums yet. Create one below.</p>}
          </div>

          <div className="border-t border-line pt-6">
            <h3 className="label">{editingAlbumId ? 'Edit album' : 'Create album'}</h3>
            <form className="mt-4 space-y-3" onSubmit={submitAlbum}>
              <input
                aria-label="Album title"
                value={albumForm.title}
                onChange={(e) => setAlbumForm({ ...albumForm, title: e.target.value })}
                placeholder="Album title"
                maxLength={MAX_TITLE}
                className="field"
                required
              />
              <textarea
                aria-label="Album description"
                value={albumForm.description}
                onChange={(e) => setAlbumForm({ ...albumForm, description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
                className="field resize-y"
              />
              <div>
                <input
                  aria-label="Cover image URL"
                  value={albumForm.cover_url}
                  onChange={(e) => setAlbumForm({ ...albumForm, cover_url: e.target.value })}
                  placeholder="Cover image URL (https, optional)"
                  inputMode="url"
                  className="field"
                />
                <p className="hint mt-1">https URL only. Leave blank to clear the cover.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  aria-label="Event id"
                  value={albumForm.event_id}
                  onChange={(e) => setAlbumForm({ ...albumForm, event_id: e.target.value })}
                  placeholder="Event id (optional)"
                  maxLength={MAX_ID_REF}
                  className="field"
                />
                <input
                  aria-label="Album sort order"
                  value={albumForm.sort_order}
                  onChange={(e) => setAlbumForm({ ...albumForm, sort_order: e.target.value })}
                  placeholder="Sort order (blank = 0)"
                  inputMode="numeric"
                  className="field"
                />
              </div>
              <p className="hint">
                Event id is a loose label reference — it links an album to an event without a strict
                foreign key. Sort order is a whole number.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={busy}>
                  {editingAlbumId ? 'Save album' : 'Create album'}
                </button>
                {editingAlbumId && (
                  <button type="button" className="btn-ghost" disabled={busy} onClick={resetAlbumForm}>
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="border-t border-line pt-6">
            <h3 className="label">Gallery items</h3>
            {albums.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Create an album before adding gallery items.</p>
            ) : (
              <>
                <label className="mt-4 block max-w-sm">
                  <span className="label">Album</span>
                  <select
                    aria-label="Album to manage"
                    value={currentAlbum?.id ?? ''}
                    onChange={(e) => chooseAlbum(e.target.value)}
                    className="field mt-1"
                  >
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.title} ({album.items.length})
                      </option>
                    ))}
                  </select>
                </label>

                <ul className="mt-4">
                  {(currentAlbum?.items ?? []).map((item) => (
                    <li key={item.id} className="border-t border-line py-4 last:border-b">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          {item.type === 'image' ? (
                            <img
                              src={item.url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              width={96}
                              height={54}
                              className="h-14 w-24 shrink-0 border border-line object-cover"
                            />
                          ) : (
                            <span className="flex h-14 w-24 shrink-0 items-center justify-center border border-line px-2 text-center font-mono text-[10px] uppercase tracking-wide text-muted">
                              {hostLabel(item.url)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-paper/80">
                              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
                                {item.type}
                              </span>
                              {item.title && <span> · {item.title}</span>}
                              <span className="ml-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                                sort {item.sort_order}
                              </span>
                            </p>
                            {item.caption && <p className="mt-1 text-xs text-muted">{item.caption}</p>}
                            <p className="mt-1 truncate font-mono text-[11px] text-muted" title={item.url}>
                              {item.url}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" className="btn-ghost" disabled={busy} onClick={() => startItemEdit(item)}>
                            Edit
                          </button>
                          <button type="button" className="btn-ghost" disabled={busy} onClick={() => removeItem(item)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {(currentAlbum?.items.length ?? 0) === 0 && (
                  <p className="mt-4 text-sm text-muted">No items in this album yet. Add one below.</p>
                )}

                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="label">{editingItemId ? 'Edit item' : 'Add item'}</h3>
                  <form className="mt-4 space-y-3" onSubmit={submitItem}>
                    <label className="block max-w-sm space-y-1">
                      <span className="label">Album</span>
                      <select
                        aria-label="Item album"
                        value={itemForm.album_id || currentAlbum?.id || ''}
                        onChange={(e) => setItemForm({ ...itemForm, album_id: e.target.value })}
                        className="field"
                        required
                      >
                        {albums.map((album) => (
                          <option key={album.id} value={album.id}>
                            {album.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="hint">
                      Changing the album and saving moves this item (PATCH album_id).
                    </p>
                    {isLegacyVideo ? (
                      <div>
                        <p className="hint">
                          Legacy video item — only its album, title, caption and sort order can be
                          edited. Videos can no longer be added or re-pointed.
                        </p>
                        {editingItem && (
                          <p className="mt-1 truncate font-mono text-[11px] text-muted" title={editingItem.url}>
                            {editingItem.url}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <input
                          aria-label={editingItemId ? 'Replacement photo' : 'Photo'}
                          key={`${editingItemId ?? 'new'}-${photoInputNonce}`}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            setPhoto(e.target.files?.[0] ?? null);
                            setPhotoNotice(null);
                            setError('');
                          }}
                          className="field"
                          required={!editingItemId}
                        />
                        <p className="hint mt-1">
                          {editingItemId
                            ? 'Leave empty to keep the current photo.'
                            : 'One photo at a time. Photos over 10 MB are compressed in your browser.'}
                        </p>
                        {photo && (
                          <p className="mt-1 font-mono text-[11px] text-muted">
                            {photo.name} · {formatBytes(photo.size)}
                          </p>
                        )}
                        {photoNotice && (
                          <p role="status" aria-live="polite" className="hint mt-1">
                            {photoNotice}
                          </p>
                        )}
                      </div>
                    )}
                    <input
                      aria-label="Item title"
                      value={itemForm.title}
                      onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                      placeholder="Title (optional)"
                      maxLength={MAX_TITLE}
                      className="field"
                    />
                    <textarea
                      aria-label="Item caption"
                      value={itemForm.caption}
                      onChange={(e) => setItemForm({ ...itemForm, caption: e.target.value })}
                      placeholder="Caption (optional)"
                      rows={2}
                      className="field resize-y"
                    />
                    <input
                      aria-label="Item sort order"
                      value={itemForm.sort_order}
                      onChange={(e) => setItemForm({ ...itemForm, sort_order: e.target.value })}
                      placeholder="Sort order (blank = 0)"
                      inputMode="numeric"
                      className="field"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className="btn-primary" disabled={busy}>
                        {editingItemId ? 'Save item' : 'Add item'}
                      </button>
                      {editingItemId && (
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => resetItemForm()}>
                          Cancel edit
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
