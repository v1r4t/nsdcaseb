import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import IndexStage from './IndexStage';
import type { IndexStageItem } from './IndexStage';
import { ApiError, listMedia } from '../lib/media';
import type { MediaAlbum, MediaItem } from '../lib/media';
import { galleryFullSources } from '../lib/image-variants';

const pad = (value: number): string => String(value).padStart(2, '0');

/** A landing frame is intentionally short: a contact sheet, not the archive. */
const FRAME_LIMIT = 6;
const PER_ALBUM = 2;

const SIZES = '(max-width: 768px) 100vw, 60vw';

interface Frame {
  album: MediaAlbum;
  item: MediaItem;
  /** 1-based position inside the album, for the honest frame label. */
  frame: number;
}

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
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  } catch {
    return null;
  }
}

/** Fill the landing contact sheet from real album items: two per album
 *  first (so a multi-album landing still samples across albums), then top up
 *  from any remaining items until six frames — so a single five-item album
 *  shows five frames instead of stopping at two. */
function pickFrames(albums: MediaAlbum[]): Frame[] {
  const frames: Frame[] = [];
  const picked = new Set<string>();
  const key = (album: MediaAlbum, item: MediaItem): string => `${album.id}:${item.id}`;

  const add = (album: MediaAlbum, item: MediaItem, index: number): void => {
    if (frames.length >= FRAME_LIMIT) return;
    const id = key(album, item);
    if (picked.has(id)) return;
    picked.add(id);
    frames.push({ album, item, frame: index + 1 });
  };

  for (const album of albums) {
    let taken = 0;
    for (let i = 0; i < album.items.length && taken < PER_ALBUM; i += 1) {
      const item = album.items[i];
      if (!item.url) continue;
      add(album, item, i);
      taken += 1;
      if (frames.length >= FRAME_LIMIT) return frames;
    }
  }

  for (const album of albums) {
    for (let i = 0; i < album.items.length; i += 1) {
      const item = album.items[i];
      if (!item.url) continue;
      add(album, item, i);
      if (frames.length >= FRAME_LIMIT) return frames;
    }
  }

  return frames;
}

/** Placeholder-looking DB titles ("Photo 1", "photo 02") are not descriptions. */
const GENERIC_PHOTO_TITLE = /^photo\s*\d+$/i;

/** Descriptive alt text, shared with the full archive page. */
export function photoAlt(item: MediaItem, albumTitle?: string, frame?: number): string {
  const title = (item.title ?? '').trim();
  const rawCaption = (item.caption ?? '').trim();
  const caption = rawCaption && !GENERIC_PHOTO_TITLE.test(rawCaption) ? rawCaption : '';
  if (title && !GENERIC_PHOTO_TITLE.test(title)) {
    return caption && caption !== title ? `${title} — ${caption}` : title;
  }
  if (caption) return caption;
  if (albumTitle) {
    return typeof frame === 'number' ? `${albumTitle} — frame ${pad(frame)}` : albumTitle;
  }
  return 'Archive photo';
}

/** Useful index label: caption, then album + frame, never "Photo 1". */
function frameTitle(frame: Frame): string {
  const { album, item } = frame;
  const title = (item.title ?? '').trim();
  const rawCaption = (item.caption ?? '').trim();
  const caption = rawCaption && !GENERIC_PHOTO_TITLE.test(rawCaption) ? rawCaption : '';
  if (title && !GENERIC_PHOTO_TITLE.test(title)) return title;
  if (caption) return caption;
  return `${album.title} — frame ${pad(frame.frame)}`;
}

/**
 * ARCHIVE — landing index + stage.
 *
 * Index: frame title, album, and frame number. Stage: the real image (through
 * its stored 640w / 1600w WebP variants) or the real video embed, the caption
 * under a hairline, and the link into the full archive. Nothing is invented:
 * no poster for a video that has none, no derivative URLs that would 404.
 */
export default function LandingArchive() {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMedia()
      .then((res) => {
        if (alive) setFrames(pickFrames(res.albums));
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

  if (error) {
    return (
      <div>
        <p role="alert" aria-live="assertive" className="text-sm text-seal">
          {error}
        </p>
        <p className="mt-8 border-t hairline pt-4">
          <Link
            to="/archive"
            className="mono text-ink transition-colors duration-200 hover:text-seal"
          >
            Open the archive →
          </Link>
        </p>
      </div>
    );
  }

  if (frames === null) return null;

  if (frames.length === 0) {
    return (
      <div className="border-t hairline pt-6">
        <p className="max-w-md text-[15px] leading-[1.7] text-quiet">The archive is empty for now.</p>
        <p className="mt-6">
          <Link to="/archive" className="mono text-ink transition-colors duration-200 hover:text-seal">
            Open the archive →
          </Link>
        </p>
      </div>
    );
  }

  const items: IndexStageItem[] = frames.map((frame, ordinal) => ({
    id: `${frame.album.id}:${frame.item.id}`,
    index: pad(ordinal + 1),
    title: frameTitle(frame),
    meta: `${frame.album.title} / ${frame.item.type === 'video' ? 'Film' : 'Frame'} ${pad(frame.frame)}`,
    href: '/archive',
  }));

  const framesById = new Map(
    items.map((item, ordinal) => [item.id, frames[ordinal]]),
  );

  const stage = (item: IndexStageItem): ReactNode => {
    const frame = framesById.get(item.id);
    if (!frame) return null;
    const { album, item: media } = frame;
    const label = `${album.title} / ${media.type === 'video' ? 'Film' : 'Frame'} ${pad(frame.frame)}`;
    const caption = media.caption || media.title;
    const videoSrc = media.type === 'video' ? embedUrl(media.url) : null;
    const imageSources =
      media.type === 'video' ? null : galleryFullSources(media.url, media.variants);

    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-3">
          <span className="mono min-w-0 truncate text-quiet">{label}</span>
          <span aria-hidden="true" className="mono shrink-0 text-faint">
            {media.type === 'video' ? 'Motion' : 'Still'}
          </span>
        </div>

        <div className="mt-4 border hairline">
          {media.type === 'video' ? (
            videoSrc ? (
              <iframe
                src={videoSrc}
                title={media.title || `${album.title} film`}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="aspect-video w-full"
              />
            ) : (
              <p className="mono flex aspect-video items-center justify-center p-3 text-center text-quiet">
                Video unavailable
              </p>
            )
          ) : (
            <img
              src={imageSources?.src ?? media.url}
              srcSet={imageSources?.srcSet}
              sizes={SIZES}
              alt={photoAlt(media, album.title, frame.frame)}
              loading="lazy"
              decoding="async"
              width={800}
              height={500}
              className="aspect-[16/10] w-full object-cover"
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-3">
          <p className="mono-sm line-clamp-2 max-w-2xl text-pretty text-quiet">
            {caption || album.title}
          </p>
          <span aria-hidden="true" className="mono shrink-0 text-faint">
            Plate {pad(frame.frame)}
          </span>
        </div>

        <p className="mono mt-4">
          <Link
            to="/archive"
            aria-label={`Open the archive — ${frameTitle(frame)}`}
            className="text-ink transition-colors duration-200 hover:text-seal"
          >
            Open the archive →
          </Link>
        </p>
      </div>
    );
  };

  return <IndexStage items={items} renderStage={stage} label="Archive" />;
}
