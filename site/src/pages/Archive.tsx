import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { SectionIndex } from '../../../design/primitives/SectionIndex';
import Reveal from '../components/Reveal';
import { useFocusTrap } from '../lib/focus-trap';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { ApiError, listMedia } from '../lib/media';
import type { MediaAlbum, MediaItem } from '../lib/media';
import { photoAlt } from '../components/LandingArchive';
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

const pad = (value: number) => String(value).padStart(2, '0');

/** Placeholder-looking DB titles ("Photo 1", "photo 02", "Photo 1 of 12") are not labels. */
const GENERIC_PHOTO_TITLE = /^photo[\s_-]*\d+(?:\s*(?:of|\/)\s*\d+)?$/i;

/** Trim a DB string and drop generic "Photo N" placeholders. */
function meaningfulText(value: string | undefined | null): string {
  const text = (value ?? '').trim();
  return text && !GENERIC_PHOTO_TITLE.test(text) ? text : '';
}

interface MediaLabel {
  text: string;
  /** True when this is the album/frame fallback, not a real caption. */
  fallback: boolean;
}

/**
 * Visible index title for a frame: caption, then title, then "Album / 03".
 * Generic "Photo 1" placeholders never render in the contact sheet.
 */
function mediaLabel(item: MediaItem, albumTitle?: string, frame?: number): MediaLabel {
  const title = meaningfulText(item.title);
  const caption = meaningfulText(item.caption);
  if (caption && caption !== title) return { text: caption, fallback: false };
  if (title) return { text: title, fallback: false };
  if (albumTitle) {
    return {
      text: typeof frame === 'number' ? `${albumTitle} / ${pad(frame)}` : albumTitle,
      fallback: true,
    };
  }
  return {
    text: typeof frame === 'number' ? `Frame ${pad(frame)}` : 'Unlabelled frame',
    fallback: true,
  };
}

function chipClass(on: boolean): string {
  return on
    ? 'min-h-11 shrink-0 whitespace-nowrap rounded-[2px] border border-seal px-3.5 py-2 mono text-seal md:min-h-0 md:py-1.5'
    : 'min-h-11 shrink-0 whitespace-nowrap rounded-[2px] border hairline px-3.5 py-2 mono text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink md:min-h-0 md:py-1.5';
}

// The archive is a contact sheet, not a uniform card grid. Phones get one
// full-width plate per row (so nothing is cropped into a sliver and captions
// stay readable), small tablets two, and desktop repeats spans of 7+5 / 4+8.
// `sizes` mirrors each breakpoint so srcset stays honest.
interface TileLayout {
  span: string;
  ratio: string;
  sizes: string;
}

const PHONE_SIZES = 'calc(100vw - 3rem)';

const TILE_LAYOUT: readonly TileLayout[] = [
  {
    span: 'md:col-span-7',
    ratio: 'aspect-[16/9]',
    sizes: `(max-width: 639px) ${PHONE_SIZES}, (max-width: 767px) 50vw, 58vw`,
  },
  {
    span: 'md:col-span-5',
    ratio: 'aspect-[16/9] sm:aspect-[4/3]',
    sizes: `(max-width: 639px) ${PHONE_SIZES}, (max-width: 767px) 50vw, 42vw`,
  },
  {
    span: 'md:col-span-4',
    ratio: 'aspect-[16/9] sm:aspect-square',
    sizes: `(max-width: 639px) ${PHONE_SIZES}, (max-width: 767px) 50vw, 33vw`,
  },
  {
    span: 'md:col-span-8',
    ratio: 'aspect-[16/9]',
    sizes: `(max-width: 639px) ${PHONE_SIZES}, (max-width: 767px) 50vw, 67vw`,
  },
];

function tileLayout(index: number): TileLayout {
  return TILE_LAYOUT[index % TILE_LAYOUT.length];
}

function Tile({
  item,
  layout,
  priority = false,
  label,
  alt,
  albumTitle,
  onOpen,
}: {
  item: MediaItem;
  layout: TileLayout;
  /** True only for the lead plate — the page's LCP element. */
  priority?: boolean;
  /** Visible index title (caption, title, or album/frame). */
  label: MediaLabel;
  /** Descriptive alt text, shared with the lightbox. */
  alt: string;
  albumTitle: string;
  onOpen: (item: MediaItem) => void;
}) {
  if (item.type === 'video') {
    const src = embedUrl(item.url);
    const videoLabel = meaningfulText(item.title) || meaningfulText(item.caption);
    return (
      <figure className={`${layout.span} self-start overflow-hidden border hairline`}>
        {src ? (
          <iframe
            src={src}
            title={videoLabel || item.title || 'Event video'}
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
        {videoLabel && (
          <figcaption className="mono-sm break-words border-t hairline px-3 py-2.5 text-quiet md:py-2">
            {videoLabel}
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
  const captionTone = label.fallback ? 'text-faint' : 'text-quiet';
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={
        label.fallback
          ? `Open photo: ${label.text}`
          : `Open photo from ${albumTitle}: ${label.text}`
      }
      data-cursor="EXPAND →"
      className={`group block w-full self-start overflow-hidden border hairline text-left transition-colors duration-200 hover:border-ink/40 focus-visible:border-ink/40 ${layout.span}`}
    >
      <img
        src={sources.src}
        srcSet={sources.srcSet}
        sizes={layout.sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        width={640}
        height={360}
        className={`w-full object-cover transition-transform duration-700 ease-ink group-hover:scale-[1.03] motion-reduce:transform-none ${layout.ratio}`}
      />
      <span
        className={`mono-sm block break-words border-t hairline px-3 py-2.5 transition-colors duration-200 group-hover:text-ink md:py-2 ${captionTone}`}
      >
        {label.text}
      </span>
    </button>
  );
}

interface Photo {
  item: MediaItem;
  label: MediaLabel;
  alt: string;
}

export default function Archive() {
  const [albums, setAlbums] = useState<MediaAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>(ALL);
  const [eventsById, setEventsById] = useState<Map<string, EventSummary> | null>(null);
  const [lightbox, setLightbox] = useState<{ items: Photo[]; index: number } | null>(null);
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

  // Videos play inline, so only images go in the viewer. Each entry carries the
  // label and alt text its album gave it, so the lightbox never falls back to a
  // generic "Photo N".
  const photos = useMemo<Photo[]>(() => {
    if (!albums) return [];
    const scoped = active === ALL ? albums : albums.filter((a) => a.id === active);
    const list: Photo[] = [];
    for (const album of scoped) {
      album.items.forEach((item, i) => {
        if (item.type === 'video') return;
        list.push({
          item,
          label: mediaLabel(item, album.title, i + 1),
          alt: photoAlt(item, album.title, i + 1),
        });
      });
    }
    return list;
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
      const index = photos.findIndex((photo) => photo.item.id === item.id);
      if (index === -1) return;
      const trigger = document.activeElement;
      triggerRef.current = trigger instanceof HTMLButtonElement ? trigger : null;
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
  const currentSources = current
    ? galleryFullSources(current.item.url, current.item.variants)
    : null;
  const currentTitle = current ? meaningfulText(current.item.title) : '';
  const currentCaption = current ? meaningfulText(current.item.caption) : '';

  return (
    <div className="wrap py-8 md:py-16">
      <header className="grid gap-6 border-b hairline pb-6 md:grid-cols-12 md:items-end md:gap-6 md:pb-10">
        <div className="md:col-span-7">
          <p className="mono text-quiet">The record · contact sheet</p>
          <h1 className="mt-3 font-display text-[clamp(3.25rem,9vw,7rem)] leading-[0.9] tracking-tight text-ink md:mt-4">
            Archive
          </h1>
          <p className="mt-4 max-w-md text-pretty text-[17px] leading-[1.7] text-quiet md:mt-5">
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
            <div className="mt-6 flex items-center gap-3 md:mt-10 md:flex-wrap md:items-baseline md:gap-x-2 md:gap-y-3">
              <span aria-hidden="true" className="mono shrink-0 text-faint md:mr-2">Filter</span>
              <div
                role="group"
                aria-label="Filter by album"
                className="-my-2 flex min-w-0 flex-1 gap-2 overflow-x-auto py-2 [scrollbar-width:none] md:my-0 md:flex-none md:flex-wrap md:overflow-visible md:py-0 [&::-webkit-scrollbar]:hidden"
              >
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
                <section aria-label={album.title} className="mt-10 border-t hairline pt-6 md:mt-20 md:pt-8">
                  <div className="grid gap-x-6 gap-y-3 md:grid-cols-12 md:items-baseline">
                    <span aria-hidden="true" className="mono text-faint md:col-span-1">
                      {pad(index + 1)}
                    </span>
                    <div className="md:col-span-7">
                      <h2 className="break-words statement-sm text-ink">{album.title}</h2>
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
                          className="mono min-w-0 break-words text-quiet transition-colors duration-200 hover:text-seal"
                        >
                          From: {event.title} →
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4 md:mt-8 md:grid-cols-12 md:gap-x-6 md:gap-y-8">
                    {album.items.map((item, i) => {
                      const label = mediaLabel(item, album.title, i + 1);
                      return (
                        <Tile
                          key={item.id}
                          item={item}
                          layout={tileLayout(i)}
                          priority={index === 0 && item.id === leadImageId}
                          label={label}
                          alt={photoAlt(item, album.title, i + 1)}
                          albumTitle={album.title}
                          onOpen={open}
                        />
                      );
                    })}
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
          aria-label={`Photo viewer: ${current.label.text} (${lightbox.index + 1} of ${lightbox.items.length})`}
          tabIndex={-1}
          ref={dialogRef}
          onKeyDown={handleDialogKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-paper text-ink"
        >
          <div className="wrap flex items-center justify-between gap-4 border-b hairline py-3">
            <p className="mono min-w-0 text-quiet">Archive · photo viewer</p>
            <button
              type="button"
              onClick={close}
              aria-label="Close photo viewer"
              className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-[2px] border hairline font-mono text-lg text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-20">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 touch-manipulation items-center justify-center rounded-[2px] border hairline bg-paper/90 font-mono text-xl text-ink transition-colors duration-200 hover:bg-ink hover:text-paper sm:left-6"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 touch-manipulation items-center justify-center rounded-[2px] border hairline bg-paper/90 font-mono text-xl text-ink transition-colors duration-200 hover:bg-ink hover:text-paper sm:right-6"
            >
              ›
            </button>

            <img
              key={current.item.id}
              src={currentSources?.src ?? current.item.url}
              srcSet={currentSources?.srcSet}
              sizes="100vw"
              alt={current.alt}
              decoding="async"
              className="max-h-full max-w-full object-contain"
            />
          </div>

          <div className="wrap flex flex-wrap items-baseline justify-between gap-4 border-t hairline py-5">
            <div className="min-w-0 max-w-2xl">
              {current.label.fallback ? (
                <p className="mono break-words text-quiet">{current.label.text}</p>
              ) : (
                <p className="break-words font-display text-xl leading-tight tracking-tight text-ink">
                  {currentTitle || current.label.text}
                </p>
              )}
              {currentCaption && currentCaption !== currentTitle && (
                <p className="mt-1 break-words text-[15px] leading-[1.6] text-quiet">
                  {currentCaption}
                </p>
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
