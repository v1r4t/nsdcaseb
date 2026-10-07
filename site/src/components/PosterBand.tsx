/**
 * PosterBand — the page's one large typographic moment.
 *
 * With no club photography yet, the band is pure type at poster scale rather
 * than a stock photo or a placeholder box. It carries an optional `imageUrl`
 * slot: pass one and the band becomes a full-bleed photograph with the same
 * type overlaid (plus a scrim for legibility), so real photos upgrade this
 * without a rebuild.
 */

import type { ReactNode } from 'react';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';

const MARQUEE_ITEMS = [
  'BUILD',
  'LEARN',
  'SHIP',
  '12.9716° N, 77.5946° E',
  'BENGALURU',
  'NATIONAL STUDENT DATA CORPS',
  '26—27',
];

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
          {/* Scrim so poster type stays legible over any photograph. */}
          <div aria-hidden="true" className="absolute inset-0 bg-ink/70" />
        </>
      ) : null}

      <div className="relative">
        <div className="shell py-24 sm:py-36">{children}</div>

        {/* Marquee — a slow strip of real club metadata. Pauses on hover and
            stops entirely under prefers-reduced-motion. */}
        <div className="marquee rule overflow-hidden py-4">
          <div className="marquee-track flex w-max items-center">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {MARQUEE_ITEMS.map((item) => (
                  <span
                    key={`${copy}-${item}`}
                    className="flex items-center whitespace-nowrap font-mono text-[11px] uppercase tracking-wide text-muted"
                  >
                    <span className="px-6">{item}</span>
                    <span aria-hidden="true" className="text-signal">
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
      <p className="label">Statement</p>
      <p className="mt-8 font-display text-[clamp(3rem,11vw,9rem)] font-bold uppercase leading-[0.88] tracking-tight text-paper">
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </Reveal>
  );
}
