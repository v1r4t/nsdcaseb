import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { SectionIndex } from '../../../design/primitives/SectionIndex';
import Reveal from '../components/Reveal';
import { useFocusTrap } from '../lib/focus-trap';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { ApiError, listMedia } from '../lib/media';
import type { MediaAlbum, MediaItem } from '../lib/media';
import { galleryFullSources, galleryTileSources } from '../lib/image-variants';
import { listEvents } from '../lib/events';
import type { EventSummary } from '../lib/events';

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

function photoAlt(item: MediaItem): string {
  return item.title
    ? item.caption && item.caption !== item.title
      ? `${item.title} — ${item.caption}`
      : item.title
    : item.caption || 'Event photo';
}

const pad = (value: number) => String(value).padStart(2, '0');

function chipClass(on: boolean): string {
  return on
    ? 'rounded-[2px] border border-seal px-3.5 py-1.5 mono text-seal'
    : 'rounded-[2px] border hairline px-3.5 py-1.5 mono text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink';
}

// The archive is a contact sheet, not a uniform card grid: four repeating
// spans lay two tiles per desktop row (7+5, 4+8) and alternate full- and
// half-width plates on phones. `sizes` mirrors each span so srcset stays honest.
interface TileLayout {
  span: string;
  ratio: string;
  sizes: string;
}

const TILE_LAYOUT: readonly TileLayout[] = [
  {
    span: 'col-span-2 md:col-span-7',
    ratio: 'aspect-[16/9]',
    sizes: '(max-width: 768px) 100vw, 58vw',
  },
  {
    span: 'col-span-1 md:col-span-5',
    ratio: 'aspect-[4/3]',
    sizes: '(max-width: 768px) 50vw, 42vw',
  },
  {
    span: 'col-span-1 md:col-span-4',
    ratio: 'aspect-square',
    sizes: '(max-width: 768px) 50vw, 33vw',
  },
  {
    span: 'col-span-2 md:col-span-8',
    ratio: 'aspect-[16/9]',
    sizes: '(max-width: 768px) 100vw, 67vw',
  },
];

function tileLayout(index: number): TileLayout {
  return TILE_LAYOUT[index % TILE_LAYOUT.length];
}

function Tile({
  item,
  layout,
  priority = false,
  onOpen,
}: {
  item: MediaItem;
  layout: TileLayout;
  /** True only for the lead plate — the page's LCP element. */
  priority?: boolean;
  onOpen: (item: MediaItem) => void;
}) {
  if (item.type === 'video') {
    const src = embedUrl(item.url);
    return (
      <figure className={`${layout.span} self-start overflow-hidden border hairline`}>
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
          <div className="mono flex aspect-video items-center justify-center p-3 text-center text-quiet">
            Video unavailable
          </div>
        )}
        {(item.title || item.caption) && (
          <figcaption className="mono-sm border-t hairline px-3 py-2 text-quiet">
            {item.title || item.caption}
          </figcaption>
        )}
      </figure>
    );
  }
  // The ratio class reserves the plate before the image arrives (CLS); the
  // intrinsic width/height mirror the common 16:9 tile. object-cover crops
  // off-ratio originals into the contact-sheet plate.
  const sources = galleryTileSources(item.url, item.variants);
  // The lead plate is the LCP element, so it loads eagerly and at high
  // priority. Keep the full responsive srcset: `sizes` already selects the
  // thumb for small columns, while retina displays can still pick a larger
  // candidate instead of being capped at 640w.
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open photo: ${item.caption || item.title || 'untitled'}`}
      data-cursor="EXPAND →"
      className={`group block w-full self-start overflow-hidden border hairline text-left transition-colors duration-200 hover:border-ink/40 focus-visible:border-ink/40 ${layout.span}`}
    >
      <img
        src={sources.src}
        srcSet={sources.srcSet}
        sizes={layout.sizes}
        alt={photoAlt(item)}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        width={640}
        height={360}
        className={`w-full object-cover transition-transform duration-700 ease-ink group-hover:scale-[1.03] motion-reduce:transform-none ${layout.ratio}`}
      />
      {item.caption && (
        <span className="mono-sm block border-t hairline px-3 py-2 text-quiet transition-colors duration-200 group-hover:text-ink">
          {item.caption}
        </span>
      )}
    </button>
  );
}

export default function Archive() {
  const [albums, setAlbums] = useState<MediaAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>(ALL);
  const [eventsById, setEventsById] = useState<Map<string, EventSummary> | null>(null);
  const [lightbox, setLightbox] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDocumentMeta({
    title: 'Archive — NSDC',
    description:
      'The NSDC photo archive — every event, kept on the record and browsable by album.',
  });

  // Tab wraps inside the lightbox (shared hook); Escape/Arrows stay below.
  useFocusTrap(dialogRef, !!lightbox);

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

  // Single events fetch for the FROM: cross-links; unresolvable ids render nothing.
  useEffect(() => {
    let alive = true;
    listEvents()
      .then((res) => {
        if (alive) setEventsById(new Map(res.events.map((e) => [e.id, e])));
      })
      .catch(() => {
        if (alive) setEventsById(new Map());
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

  const frameTotal = albums
    ? albums.reduce((total, album) => total + album.items.filter((item) => item.type === 'image').length, 0)
    : 0;

  // The first photo of the first rendered album sits right below the header
  // and is the LCP element on the unfiltered archive; it alone loads eagerly.
  const leadImageId = useMemo(() => {
    const lead = sections[0]?.items.find((item) => item.type !== 'video');
    return lead?.id ?? null;
  }, [sections]);

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

  // Escape closes, arrows step; Tab-wrap comes from the shared useFocusTrap
  // hook above (document-level listener, active only while the lightbox is open).
  const handleDialogKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return; }
    },
    [close, step],
  );

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
  // The full variant (capped 1600w) stands in for the original in the viewer;
  // URL-based items without variants keep their original URL.
  const currentSources = current ? galleryFullSources(current.url, current.variants) : null;

  return (
    <div className="wrap py-12 md:py-16">
      <header className="grid gap-8 border-b hairline pb-8 md:grid-cols-12 md:items-end md:gap-6 md:pb-10">
        <div className="md:col-span-7">
          <p className="mono text-quiet">The record · contact sheet</p>
          <h1 className="mt-4 font-display text-[clamp(3.25rem,9vw,7rem)] leading-[0.9] tracking-tight text-ink">
            Archive
          </h1>
          <p className="mt-5 max-w-md text-pretty text-[17px] leading-[1.7] text-quiet">
            Every frame kept on the record — browse the archive by album and event.
          </p>
        </div>
        <div className="md:col-span-4 md:col-start-9 md:justify-self-end">
          <div className="mb-5 hidden justify-end md:flex">
            <SectionIndex value="05" />
          </div>
          {albums !== null && albums.length > 0 && (
            <dl className="grid grid-cols-2 gap-6 border-t hairline pt-4">
              <div>
                <dt className="mono text-faint">Albums</dt>
                <dd className="mt-2 font-mono text-2xl leading-none text-ink">{pad(albums.length)}</dd>
              </div>
              <div>
                <dt className="mono text-faint">Frames</dt>
                <dd className="mt-2 font-mono text-2xl leading-none text-ink">{pad(frameTotal)}</dd>
              </div>
            </dl>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" aria-live="assertive" className="error-text mt-6">
          {error}
        </p>
      )}
      {!error && albums === null && (
        <p aria-live="polite" className="mono mt-10 text-quiet">
          Loading gallery…
        </p>
      )}
      {!error && albums !== null && albums.length === 0 && (
        <p className="mt-10 border-t hairline py-8 text-[15px] text-quiet">
          Photos from our events will land here soon.
        </p>
      )}

      {albums !== null && albums.length > 0 && (
        <>
          <Reveal>
            <div className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-3 md:mt-10">
              <span aria-hidden="true" className="mono mr-2 text-faint">Filter</span>
              <div role="group" aria-label="Filter by album" className="flex flex-wrap gap-2">
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
            </div>
          </Reveal>

          {sections.length === 0 && (
            <p className="mt-10 border-t hairline py-8 text-[15px] text-quiet">This album has no photos yet.</p>
          )}
          {sections.map((album, index) => {
            const event = album.event_id ? eventsById?.get(album.event_id) : undefined;
            return (
              <Reveal key={album.id} delay={index * 60}>
                <section aria-label={album.title} className="mt-16 border-t hairline pt-6 md:mt-20 md:pt-8">
                  <div className="grid gap-x-6 gap-y-3 md:grid-cols-12 md:items-baseline">
                    <span aria-hidden="true" className="mono text-faint md:col-span-1">
                      {pad(index + 1)}
                    </span>
                    <div className="md:col-span-7">
                      <h2 className="statement-sm text-ink">{album.title}</h2>
                      {album.description && (
                        <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-[1.7] text-quiet">
                          {album.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 md:col-span-4 md:justify-end">
                      <span className="mono text-faint">{pad(album.items.length)} items</span>
                      {event && (
                        <Link
                          to={`/registrations/${encodeURIComponent(album.event_id ?? '')}`}
                          aria-label={`From event: ${event.title}`}
                          className="mono text-quiet transition-colors duration-200 hover:text-seal"
                        >
                          From: {event.title} →
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-4 md:mt-8 md:grid-cols-12 md:gap-x-6 md:gap-y-8">
                    {album.items.map((item, i) => (
                      <Tile
                        key={item.id}
                        item={item}
                        layout={tileLayout(i)}
                        priority={index === 0 && item.id === leadImageId}
                        onOpen={open}
                      />
                    ))}
                  </div>
                </section>
              </Reveal>
            );
          })}
        </>
      )}

      {lightbox && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${lightbox.index + 1} of ${lightbox.items.length}`}
          tabIndex={-1}
          ref={dialogRef}
          onKeyDown={handleDialogKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-paper text-ink"
        >
          <div className="wrap flex items-center justify-between gap-4 border-b hairline py-3">
            <p className="mono text-quiet">Archive · photo viewer</p>
            <button
              type="button"
              onClick={close}
              aria-label="Close photo viewer"
              className="flex h-11 w-11 items-center justify-center rounded-[2px] border hairline font-mono text-lg text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-20">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-[2px] border hairline bg-paper/90 font-mono text-xl text-ink transition-colors duration-200 hover:bg-ink hover:text-paper sm:left-6"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-[2px] border hairline bg-paper/90 font-mono text-xl text-ink transition-colors duration-200 hover:bg-ink hover:text-paper sm:right-6"
            >
              ›
            </button>

            <img
              key={current.id}
              src={currentSources?.src ?? current.url}
              srcSet={currentSources?.srcSet}
              sizes="100vw"
              alt={photoAlt(current)}
              decoding="async"
              className="max-h-full max-w-full object-contain"
            />
          </div>

          <div className="wrap flex flex-wrap items-baseline justify-between gap-4 border-t hairline py-5">
            <div className="min-w-0 max-w-2xl">
              {current.title && (
                <p className="font-display text-xl leading-tight tracking-tight text-ink">
                  {current.title}
                </p>
              )}
              {current.caption && (
                <p className="mt-1 text-[15px] leading-[1.6] text-quiet">{current.caption}</p>
              )}
            </div>
            <p aria-live="polite" className="mono shrink-0 text-quiet">
              {lightbox.index + 1} / {lightbox.items.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
