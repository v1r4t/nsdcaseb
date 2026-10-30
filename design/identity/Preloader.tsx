import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { arc, line, morph, sampleSegments, toPath, type Poly } from "./morph";
import { MARK_PATH } from "./markPath";

/**
 * The acronym forms first, then becomes the mark.
 *
 * You read NSDC. Then the four letters leave the word and travel into the four
 * strokes the emblem is built from - a needle, two orbits and a ring. As they
 * arrive, the club's own artwork resolves underneath them, so the last frame is
 * the real emblem, not a drawing of it. It appears once.
 *
 * The interpolation is real: both ends are sampled to the same number of points
 * and moved pairwise. A filled outline cannot be interpolated, which is why the
 * letters land on centre lines and the artwork then fills in around them.
 *
 * All geometry is in the artwork's own units (450 x 483) and mapped to the view
 * once, so the numbers in MARK are the numbers measured from the .ai.
 */

const POINTS = 128;

/** Artwork units -> view units. */
const K = 620 / 483;
const TX = 310 - 225 * K;
const TY = 310 - 241.5 * K;

/** The word, mapped from its own drawing space into artwork units. */
const WORD_SCALE = 450 / 620;
const WORD: (poly: Poly) => Poly = (poly) =>
  poly.map(([x, y]) => [x * WORD_SCALE, 241.5 + (y - 75) * WORD_SCALE] as [number, number]);

/** Where the letters land, measured from brand-source/NSDC_emblem_white.ai. */
const MARK = {
  ring: arc(225, 241.5, 216, 216, 0, 0, 360, POINTS),
  orbitA: arc(179, 241, 150, 110, 34, 0, 360, POINTS),
  orbitB: arc(271, 242, 150, 110, 34, 0, 360, POINTS),
  needle: line([91, 3], [359, 480], POINTS),
} satisfies Record<string, Poly>;

/** The letterforms, sampled from the same paths the static wordmark uses. */
const LETTER = {
  N: WORD(
    sampleSegments(
      [40, 128],
      [
        { type: "L", to: [40, 22] },
        { type: "L", to: [150, 128] },
        { type: "L", to: [150, 22] },
      ],
      POINTS,
    ),
  ),
  S: WORD(
    sampleSegments(
      [284, 28],
      [
        { type: "Q", control: [280, 22], to: [262, 22] },
        { type: "L", to: [224, 22] },
        { type: "Q", control: [204, 22], to: [204, 42] },
        { type: "Q", control: [204, 62], to: [224, 74] },
        { type: "L", to: [264, 76] },
        { type: "Q", control: [284, 78], to: [284, 98] },
        { type: "Q", control: [284, 126], to: [258, 126] },
        { type: "L", to: [226, 126] },
        { type: "Q", control: [206, 126], to: [202, 118] },
      ],
      POINTS,
    ),
  ),
  D: WORD(
    sampleSegments(
      [350, 22],
      [
        { type: "L", to: [350, 128] },
        { type: "L", to: [384, 128] },
        { type: "Q", control: [446, 128], to: [446, 75] },
        { type: "Q", control: [446, 22], to: [384, 22] },
        { type: "L", to: [350, 22] },
      ],
      POINTS,
    ),
  ),
  C: WORD(
    sampleSegments(
      [592, 42],
      [
        { type: "Q", control: [580, 22], to: [548, 22] },
        { type: "Q", control: [504, 22], to: [504, 75] },
        { type: "Q", control: [504, 128], to: [548, 128] },
        { type: "Q", control: [580, 128], to: [592, 108] },
      ],
      POINTS,
    ),
  ),
} satisfies Record<string, Poly>;

/**
 * Which letter becomes which stroke, by shape: the straight N is the only one
 * that can become the needle, a flat orbit takes the S, the other orbit closes
 * into the D, and the ring takes the C. Widths are the artwork's.
 */
const PAIRS: Array<{
  letter: keyof typeof LETTER;
  mark: keyof typeof MARK;
  width: number;
}> = [
  { letter: "N", mark: "needle", width: 28 },
  { letter: "S", mark: "orbitA", width: 18 },
  { letter: "D", mark: "orbitB", width: 18 },
  { letter: "C", mark: "ring", width: 17 },
];

/** The word's own weight, in artwork units. */
const WORD_WIDTH = 5.1;

const DRAW_MS = 800;
const DRAW_STAGGER = 120;
/** The last letter lands at 1160; nothing moves before the word is whole. */
const MORPH_AT = 1500;
const MORPH_MS = 900;
const MORPH_STAGGER = 110;
/**
 * The strokes dissolve as the artwork arrives, in one cross-fade of the same
 * ink - so the mark appears once, and never on top of a tangle.
 */
const RESOLVE_AT = 2560;
const RESOLVE_MS = 420;
const LIFT_AT = 3400;
const LIFT_MS = 700;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function Preloader() {
  const [gone, setGone] = useState(() => prefersReducedMotion());
  const [status, setStatus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const emblem = useRef<SVGPathElement>(null);
  const strokeGroup = useRef<SVGGElement>(null);
  const strokes = useRef<Array<SVGPathElement | null>>([]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setGone(true);
      return;
    }

    let raf = 0;
    let start = 0;
    let lifted = false;

    const step = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;

      // 1. The word inks itself on, one letter at a time.
      strokes.current.forEach((path, index) => {
        if (!path) return;
        const began = index * DRAW_STAGGER;
        path.style.strokeDashoffset = String(1 - clamp01((elapsed - began) / DRAW_MS));
      });

      // 2. Once the word is whole, each letter travels into its stroke.
      if (elapsed >= MORPH_AT) {
        PAIRS.forEach((pair, index) => {
          const path = strokes.current[index];
          if (!path) return;
          const t = clamp01((elapsed - MORPH_AT - index * MORPH_STAGGER) / MORPH_MS);
          path.setAttribute("d", toPath(morph(LETTER[pair.letter], MARK[pair.mark], t)));
          // The ink thickens from letter weight to the mark's weight.
          path.setAttribute(
            "stroke-width",
            String(WORD_WIDTH + (pair.width - WORD_WIDTH) * t),
          );
          // Crossing strokes thin as they pass: ink lifting, not a tangle.
          path.style.opacity = String(1 - 0.7 * Math.sin(Math.PI * t));
        });
      }

      // 3. The artwork arrives as the strokes land, and they dissolve into it.
      const resolve = clamp01((elapsed - RESOLVE_AT) / RESOLVE_MS);
      if (resolve > 0) {
        if (emblem.current) emblem.current.style.opacity = String(resolve);
        if (strokeGroup.current) strokeGroup.current.style.opacity = String(1 - resolve);
      }

      const percent = Math.round(clamp01(elapsed / LIFT_AT) * 100);
      if (percent % 10 === 0) setStatus(percent);

      if (!lifted && elapsed >= LIFT_AT && root.current) {
        lifted = true;
        root.current.style.transition = `transform ${LIFT_MS}ms var(--ease-ink)`;
        root.current.style.transform = "translateY(-100%)";
      }

      if (elapsed >= LIFT_AT + LIFT_MS) {
        setGone(true);
        return;
      }
      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame(step);

    // A stalled frame must never trap the page behind paper.
    const safety = window.setTimeout(() => setGone(true), LIFT_AT + LIFT_MS + 1600);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(safety);
    };
  }, []);

  if (gone) return null;

  return (
    <>
      <div
        ref={root}
        aria-hidden="true"
        data-testid="preloader"
        className="pointer-events-none fixed inset-0 z-[70] flex flex-col justify-between bg-paper/95 px-[var(--gutter)] py-8"
      >
        <div className="mono flex items-baseline justify-between text-faint">
          <span>NSDC Amrita Bengaluru</span>
          <span>
            Loading the register <span className="text-ink">{String(status).padStart(3, "0")}</span>
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <svg
            viewBox="0 0 620 620"
            className="h-auto max-h-[64vh] w-[min(86vw,440px)] text-ink"
            fill="none"
            data-testid="preloader-mark"
          >
            <g transform={`translate(${TX.toFixed(2)} ${TY.toFixed(2)}) scale(${K.toFixed(4)})`}>
              <path
                ref={emblem}
                d={MARK_PATH}
                fill="currentColor"
                fillRule="evenodd"
                style={{ opacity: 0 }}
                data-testid="preloader-emblem"
              />

              <g ref={strokeGroup}>
                {PAIRS.map((pair, index) => (
                  <path
                    key={pair.letter}
                    ref={(node) => {
                      strokes.current[index] = node;
                    }}
                    data-testid="preloader-stroke"
                    data-letter={pair.letter}
                    d={toPath(LETTER[pair.letter])}
                    pathLength={1}
                    stroke="currentColor"
                    strokeWidth={WORD_WIDTH}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={1}
                    strokeDashoffset={1}
                  />
                ))}
              </g>
            </g>
          </svg>
        </div>

        <div className="mono flex items-baseline justify-between text-faint">
          <span>12.894702° N · 77.675574° E</span>
          <span>EST. AUG 2024</span>
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        Loading {status}%
      </span>
    </>
  );
}
