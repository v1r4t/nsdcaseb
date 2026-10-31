/**
 * StoryFigure — the bearer at the centre of the story.
 *
 * A Vitruvian ink silhouette: arms out, feet planted, head level. Authored as
 * one inline SVG so it stays crisp at every size, needs no extra request, and
 * carries no background plate. Purely decorative — the stage copy carries the
 * meaning — so it is hidden from assistive technology.
 *
 * The rotation is owned by StoryStages: it turns one full clockwise
 * revolution on its vertical axis across chapters 01–03 and leaves as About
 * arrives.
 */
export default function StoryFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 440"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-story-figure=""
    >
      {/*
        A paper halo, dilated from the silhouette's own alpha, keeps the figure
        reading as a cut-out pinned to the page instead of a body inside the
        room's line-art. Drawn with a filter so overlapping limbs never show a
        paper seam at the joints.
      */}
      <defs>
        <filter id="story-figure-halo" x="-12%" y="-12%" width="124%" height="124%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="dilated" />
          <feFlood style={{ floodColor: 'var(--color-paper)' }} result="paper" />
          <feComposite in="paper" in2="dilated" operator="in" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#story-figure-halo)" fill="var(--color-ink)">
        {/* Head and neck */}
        <ellipse cx="200" cy="44" rx="22" ry="27" />
        <path d="M190 62 L210 62 L214 98 L186 98 Z" />

        {/*
          Torso, hips and legs as one continuous outline, so the body never
          shows a seam at the waist or crotch. Inner edges leave a narrow slit
          between the legs; feet turn slightly outward.
        */}
        <path
          d="M155 108
             C160 96 183 92 200 92
             C217 92 240 96 245 108
             C248 124 243 156 236 180
             C243 196 241 214 240 228
             C238 258 232 290 226 318
             C222 338 220 356 220 372
             C220 386 221 396 222 404
             L224 414
             C230 417 238 419 246 419
             L250 425
             L209 425
             C207 414 207 402 208 390
             C210 360 208 320 205 292
             C203 270 202 252 201 246
             C200 240 200 236 200 232
             C200 236 200 240 199 246
             C198 252 197 270 195 292
             C192 320 190 360 192 390
             C193 402 193 414 191 425
             L150 425
             L150 419
             C160 419 170 417 176 414
             L178 404
             C179 396 180 386 180 372
             C180 356 178 338 174 318
             C168 290 162 258 160 228
             C159 214 157 196 164 180
             C157 156 152 124 155 108 Z"
        />

        {/* Right arm, outstretched; the underside tucks inside the torso. */}
        <path
          d="M243 104
             C275 106 315 116 350 126
             C368 131 382 134 391 136
             C397 137 399 141 397 145
             C395 149 390 150 384 148
             C366 143 340 138 314 134
             C288 130 258 132 232 140 Z"
        />

        {/* Left arm, mirrored. */}
        <path
          d="M157 104
             C125 106 85 116 50 126
             C32 131 18 134 9 136
             C3 137 1 141 3 145
             C5 149 10 150 16 148
             C34 143 60 138 86 134
             C112 130 142 132 168 140 Z"
        />
      </g>
    </svg>
  );
}
