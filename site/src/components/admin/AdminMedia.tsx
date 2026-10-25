import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createAlbum,
  createItem,
  deleteAlbum,
  deleteItem,
  listMedia,
  updateAlbum,
  updateItem,
} from '../../lib/media';
import type { MediaAlbum, MediaItem, MediaType } from '../../lib/media';
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

// Same allow-list as worker/media.ts; videos render in an iframe publicly.
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'youtube-nocookie.com']);

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
  type: MediaType;
  url: string;
  title: string;
  caption: string;
  sort_order: string;
}

function emptyItemForm(albumId: string): ItemFormState {
  return {
    album_id: albumId,
    type: 'image',
    url: '',
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

interface ItemPayload {
  album_id: string;
  type: MediaType;
  url: string;
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

/** https only; videos are additionally restricted to the YouTube hosts. */
function validateUrl(raw: string, type: MediaType): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'URL is required.' };
  if (trimmed.length > MAX_URL) return { ok: false, error: `URL must be ${MAX_URL} characters or fewer.` };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'URL must be an absolute https URL.' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'URL must be an absolute https URL.' };
  if (type === 'video' && !VIDEO_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { ok: false, error: 'Video URLs must be on youtube.com, youtu.be or youtube-nocookie.com.' };
  }
  return { ok: true, value: trimmed };
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
  }

  function startItemEdit(item: MediaItem): void {
    setEditingItemId(item.id);
    setItemForm({
      album_id: currentAlbum?.id ?? '',
      type: item.type,
      url: item.url,
      title: item.title,
      caption: item.caption,
      sort_order: String(item.sort_order),
    });
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

  function buildItemPayload(): ItemPayload | null {
    const albumForItem = itemForm.album_id || currentAlbum?.id || '';
    if (!albums?.some((a) => a.id === albumForItem)) {
      setError('Choose an album for this item.');
      return null;
    }
    const url = validateUrl(itemForm.url, itemForm.type);
    if (!url.ok) {
      setError(url.error);
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
      type: itemForm.type,
      url: url.value,
      title: itemForm.title,
      caption: itemForm.caption,
      sort_order: sort.value,
    };
  }

  async function submitItem(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const payload = buildItemPayload();
    if (!payload) return;
    if (editingItemId) {
      // album_id is part of the patch, so changing it moves the item.
      const saved = await run(() => updateItem(editingItemId, payload), 'Saved item.');
      if (saved) resetItemForm(payload.album_id);
    } else {
      const created = await run(() => createItem(payload), `Added ${payload.type} item.`);
      if (created) resetItemForm(payload.album_id);
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
          Albums and gallery items for the public gallery. Everything is URL-based — paste an
          https link; there is no upload flow here.
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
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="label">Album</span>
                        <select
                          aria-label="Item album"
                          value={itemForm.album_id || currentAlbum?.id || ''}
                          onChange={(e) => setItemForm({ ...itemForm, album_id: e.target.value })}
                          className="field"
                        >
                          {albums.map((album) => (
                            <option key={album.id} value={album.id}>
                              {album.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="label">Type</span>
                        <select
                          aria-label="Item type"
                          value={itemForm.type}
                          onChange={(e) => setItemForm({ ...itemForm, type: e.target.value as MediaType })}
                          className="field"
                        >
                          <option value="image">image</option>
                          <option value="video">video</option>
                        </select>
                      </label>
                    </div>
                    <p className="hint">
                      Changing the album and saving moves this item (PATCH album_id).
                    </p>
                    <div>
                      <input
                        aria-label="Item URL"
                        value={itemForm.url}
                        onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
                        placeholder={itemForm.type === 'video' ? 'https://www.youtube.com/watch?v=…' : 'https://… image URL'}
                        inputMode="url"
                        className="field"
                        required
                      />
                      <p className="hint mt-1">
                        {itemForm.type === 'video'
                          ? 'https and a YouTube host: youtube.com, youtu.be or youtube-nocookie.com.'
                          : 'Any absolute https image URL.'}
                      </p>
                    </div>
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
