import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Reveal from '../components/Reveal';
import { ApiError, listMedia } from '../lib/media';
import type { MediaAlbum, MediaItem } from '../lib/media';

const ALL = 'all';

/** Turn any YouTube share/watch URL into a privacy-friendly embed URL. */
function embedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = parsed.pathname.slice(1);
    else if (parsed.pathname.startsWith('/embed/')) id = parsed.pathname.slice(7);
    else if (parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.slice(8);
    else id = parsed.searchParams.get('v');
    // Only the id is carried over, so a share link's query/fragment is dropped.
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  } catch {
    return null;
  }
}

function chipClass(on: boolean): string {
  return on
    ? 'rounded-full border border-neon bg-neon/15 px-4 py-1.5 text-sm text-neon'
    : 'rounded-full border border-white/10 px-4 py-1.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white';
}

function Tile({ item, onOpen }: { item: MediaItem; onOpen: (item: MediaItem) => void }) {
  if (item.type === 'video') {
    const src = embedUrl(item.url);
    return (
      <figure className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
        {src ? (
          <iframe
            src={src}
            title={item.title || 'Event video'}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center p-3 text-center text-xs text-white/50">
            Video unavailable
          </div>
        )}
        {(item.title || item.caption) && (
          <figcaption className="px-3 py-2 text-xs text-white/60">{item.title || item.caption}</figcaption>
        )}
      </figure>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open photo: ${item.title || item.caption || 'untitled'}`}
      className="group block w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] text-left transition hover:border-neon/50"
    >
      <img
        src={item.url}
        alt={item.title || item.caption || 'Event photo'}
        loading="lazy"
        decoding="async"
        className="aspect-video w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      />
      {item.caption && <span className="block px-3 py-2 text-xs text-white/60">{item.caption}</span>}
    </button>
  );
}

export default function Media() {
  const [albums, setAlbums] = useState<MediaAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>(ALL);
  const [lightbox, setLightbox] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    listMedia()
      .then((res) => {
        if (alive) setAlbums(res.albums);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(
          err instanceof ApiError && err.error === 'network_error'
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Could not load the gallery. Please try again.',
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  // Videos play inline, so only images go in the viewer.
  const photos = useMemo(() => {
    if (!albums) return [];
    const scoped = active === ALL ? albums : albums.filter((a) => a.id === active);
    return scoped.flatMap((a) => a.items).filter((item) => item.type !== 'video');
  }, [albums, active]);

  const sections = useMemo(() => {
    if (!albums) return [];
    const scoped = active === ALL ? albums : albums.filter((a) => a.id === active);
    return scoped.filter((album) => album.items.length > 0);
  }, [albums, active]);

  const step = useCallback(
    (delta: number) =>
      setLightbox((prev) => {
        if (!prev || prev.items.length === 0) return prev;
        return { ...prev, index: (prev.index + delta + prev.items.length) % prev.items.length };
      }),
    [],
  );

  const close = useCallback(() => {
    setLightbox(null);
    triggerRef.current?.focus(); // hand focus back to the thumbnail
  }, []);

  const open = useCallback(
    (item: MediaItem) => {
      const index = photos.indexOf(item);
      if (index === -1) return;
      const active = document.activeElement;
      triggerRef.current = active instanceof HTMLButtonElement ? active : null;
      setLightbox({ items: photos, index });
    },
    [photos],
  );

  // Move focus into the dialog and hold the page still behind it. Re-runs per
  // navigation so focus stays on the dialog, not the arrow button just pressed.
  useEffect(() => {
    if (!lightbox) return;
    dialogRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [lightbox]);

  const current = lightbox ? lightbox.items[lightbox.index] : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-white">Media</h1>
      <p className="mt-1 text-sm text-white/60">
        Photos and recordings from our workshops, meetups and hack nights.
      </p>

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-4">
          {error}
        </p>
      )}
      {!error && albums === null && (
        <p aria-live="polite" className="mt-6 text-sm text-white/60">
          Loading gallery…
        </p>
      )}
      {albums !== null && albums.length === 0 && (
        <div className="card mt-8 text-center">
          <p className="text-sm text-white/60">Photos from our events will land here soon.</p>
        </div>
      )}

      {albums !== null && albums.length > 0 && (
        <>
          <Reveal>
            <div role="group" aria-label="Filter by album" className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => setActive(ALL)} aria-pressed={active === ALL} className={chipClass(active === ALL)}>
                All
              </button>
              {albums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => setActive(album.id)}
                  aria-pressed={active === album.id}
                  className={chipClass(active === album.id)}
                >
                  {album.title}
                </button>
              ))}
            </div>
          </Reveal>

          {sections.length === 0 && <p className="mt-8 text-sm text-white/50">This album has no photos yet.</p>}
          {sections.map((album, index) => (
            <Reveal key={album.id} delay={index * 60}>
              <section aria-label={album.title} className="mt-8">
                <h2 className="font-display text-lg font-semibold text-white">{album.title}</h2>
                {album.description && <p className="mt-1 max-w-2xl text-sm text-white/50">{album.description}</p>}
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {album.items.map((item) => (
                    <Tile key={item.id} item={item} onOpen={open} />
                  ))}
                </div>
              </section>
            </Reveal>
          ))}
        </>
      )}

      {lightbox && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${lightbox.index + 1} of ${lightbox.items.length}`}
          tabIndex={-1}
          ref={dialogRef}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 p-4 sm:p-8"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close photo viewer"
            className="absolute right-4 top-4 rounded-full border border-white/15 p-2 text-white/80 transition hover:border-white/40 hover:text-white"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 p-3 text-white/80 transition hover:border-white/40 hover:text-white sm:left-6"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 p-3 text-white/80 transition hover:border-white/40 hover:text-white sm:right-6"
          >
            ›
          </button>

          <img
            key={current.id}
            src={current.url}
            alt={current.title || current.caption || 'Event photo'}
            className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
          />

          <div className="max-w-2xl text-center">
            {current.title && <p className="text-sm font-medium text-white">{current.title}</p>}
            {current.caption && <p className="mt-1 text-sm text-white/60">{current.caption}</p>}
            <p aria-live="polite" className="mt-2 text-xs text-white/40">
              {lightbox.index + 1} / {lightbox.items.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
