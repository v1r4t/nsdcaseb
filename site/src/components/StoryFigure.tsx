import { useEffect, useState } from 'react';

/**
 * StoryFigure — the bearer at the centre of the story.
 *
 * A sculpted figure supplied as `scripts/assets/human_figure.glb` and rendered
 * offline into 36 halftone WebP frames (`scripts/render-turntable.mjs`), so the
 * landing gets real form and lighting without shipping `three` or a canvas.
 *
 * On desktop with motion allowed the frames are preloaded and scrubbed by
 * scroll; phones and reduced motion keep the first frame. Decorative — the
 * stage copy carries the meaning — so it is hidden from assistive technology.
 */

export const STORY_FRAME_COUNT = 36;

export function storyFrameSrc(index: number): string {
  return `/story/turntable/frame-${String(index).padStart(2, '0')}.webp`;
}

interface StoryFigureProps {
  className?: string;
  /** Frame to show when scrubbing. Ignored until every frame is preloaded. */
  frame?: number;
  /** Desktop motion path: preload the turntable and follow the scroll. */
  scrub?: boolean;
}

export default function StoryFigure({ className, frame = 0, scrub = false }: StoryFigureProps) {
  const [ready, setReady] = useState(!scrub);

  useEffect(() => {
    if (!scrub) return;
    let cancelled = false;

    const preload = Array.from({ length: STORY_FRAME_COUNT }, (_, index) => {
      return new Promise<void>((done) => {
        const image = new Image();
        image.onload = () => done();
        image.onerror = () => done();
        image.src = storyFrameSrc(index);
      });
    });

    void Promise.all(preload).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [scrub]);

  const index = scrub && ready ? frame % STORY_FRAME_COUNT : 0;

  return (
    <img
      src={storyFrameSrc(index)}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-story-figure=""
      data-frame={index}
      className={className}
    />
  );
}
