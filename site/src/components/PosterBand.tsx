/**
 * PosterBand — the page's one large typographic moment.
 *
 * With no club photography yet, the band is pure type at poster scale rather
 * than a stock photo or a placeholder box. It carries an optional `imageUrl`
 * slot: pass one and the band becomes a full-bleed photograph with the same
 * type overlaid, washed back to paper so the ink stays legible. Real photos
 * upgrade this without a rebuild.
 */

import type { ReactNode } from 'react';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';

const MARQUEE_ITEMS = [
  'BUILD',
  'LEARN',
  'SHIP',
  '12.894702° N, 77.675574° E',
  'BENGALURU',
  'NATIONAL STUDENT DATA CORPS',
  '26—27',
];

/**
 * Copies of the strip inside the marquee track. The animation slides exactly
 * ONE copy width per cycle (see `nsdc-marquee`), so at least two copies must
 * remain visible at the widest supported viewport or the loop shows a gap
 * before it restarts. One copy measures ~1111px; six leaves ~5.5k of tail,
 * covering 4K/5K displays. If the copy content grows/shrinks significantly,
 * re-check this number (and keep it in sync with the CSS keyframe).
 */
const MARQUEE_COPIES = 6;

interface PosterBandProps {
  /** Optional photograph. Absent → pure typographic band. */
  imageUrl?: string;
  /** Accessible description when an image is supplied. */
  imageAlt?: string;
  children: ReactNode;
}

export default function PosterBand({ imageUrl, imageAlt, children }: PosterBandProps) {
  return (
    <section aria-label="Statement" className="rule relative overflow-hidden">
      <CornerMarks />
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={imageAlt ?? ''}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Paper wash so poster type stays legible over any photograph. */}
          <div aria-hidden="true" className="absolute inset-0 bg-paper/80" />
        </>
      ) : null}

      <div className="relative">
        <div className="wrap py-24 sm:py-36">{children}</div>

        {/* Marquee — a slow strip of real club metadata. Pauses on hover and
            stops entirely under prefers-reduced-motion. */}
        <div className="marquee rule overflow-hidden py-4">
          <div className="marquee-track flex w-max items-center">
            {Array.from({ length: MARQUEE_COPIES }, (_, copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy > 0}>
                {MARQUEE_ITEMS.map((item) => (
                  <span
                    key={`${copy}-${item}`}
                    className="mono flex items-center whitespace-nowrap text-quiet"
                  >
                    <span className="px-6">{item}</span>
                    <span aria-hidden="true" className="text-seal">
                      ·
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Poster-scale statement lines. Left-aligned, deliberately broken. */
export function PosterLines({ lines }: { lines: string[] }) {
  return (
    <Reveal>
      <p className="mono text-quiet">Statement</p>
      <p className="mt-8 font-display text-[clamp(3rem,11vw,9rem)] leading-[0.88] tracking-tight text-ink">
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </Reveal>
  );
}
