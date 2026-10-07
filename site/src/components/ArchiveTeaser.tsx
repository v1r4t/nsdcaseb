import { Link } from 'react-router-dom';
import Reveal from './Reveal';

export interface ArchivePhoto {
  url: string;
  title: string;
}

/**
 * ARCHIVE teaser — the first 3 images from GET /api/media in an asymmetric
 * 3-up row (tall / short / tall, middle frame pushed down). Links to /media.
 * Renders an honest line when the gallery is empty or unreachable.
 */
export default function ArchiveTeaser({ photos }: { photos: ArchivePhoto[] }) {
  return (
    <div>
      {photos.length === 0 ? (
        <p className="text-sm text-muted">The archive is empty for now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
          {photos.slice(0, 3).map((photo, i) => (
            <Reveal
              key={photo.url}
              delay={i * 80}
              className={i === 1 ? 'col-span-2 md:col-span-1 md:mt-16' : undefined}
            >
              <figure className="overflow-hidden" data-cursor="OPEN ARCHIVE →">
                <img
                  src={photo.url}
                  alt={photo.title || 'NSDC archive photo'}
                  loading="lazy"
                  className={i === 1 ? 'aspect-[4/3] w-full object-cover' : 'aspect-[3/4] w-full object-cover'}
                />
                {photo.title ? (
                  <figcaption className="mt-2 font-mono text-xs text-muted">{photo.title}</figcaption>
                ) : null}
              </figure>
            </Reveal>
          ))}
        </div>
      )}
      <p className="mt-8">
        <Link to="/media" className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-signal">
          Open the archive →
        </Link>
      </p>
    </div>
  );
}
