/**
 * StoryFigure — the bearer at the centre of the story.
 *
 * The supplied halftone figure, traced to vector and loaded as an external SVG
 * so the stipple stays crisp at every size and the very large path stays out of
 * the JS bundle. Decorative: the stage copy carries the meaning, so it is hidden
 * from assistive technology.
 *
 * The rotation is owned by StoryStages: it turns one full clockwise revolution
 * on its vertical axis across chapters 01–03 and leaves as About arrives.
 */
export default function StoryFigure({ className }: { className?: string }) {
  return (
    <img
      src="/story/figure.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      data-story-figure=""
      className={className}
    />
  );
}
