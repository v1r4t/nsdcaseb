import { createElement, useEffect, useRef } from "react";
import { gsap, registerGsap } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";

export interface RisingWord {
  text: string;
  className?: string;
}

/**
 * One word = one overflow-hidden mask. Masking per word (never per character)
 * keeps words unbreakable mid-word and lets the whitespace between masks
 * collapse to a single ordinary space.
 *
 * The mask's bottom padding reserves a descender strip ("y" in drawn, the tail
 * of hand.) inside the clip box. Each glyph carries its own padding so its box
 * is taller than the mask's clip region — at the yPercent: 110 start the glyph
 * is therefore fully below the clip edge, not peeking through the descender
 * strip.
 *
 * The entrance is a mount animation, not a scroll animation: this belongs above
 * the fold. Under reduced motion nothing is scheduled and the text renders at
 * rest.
 */
export function RisingText({
  lines,
  as = "h1",
  className,
}: {
  lines: RisingWord[][];
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const label = lines.map((line) => line.map((word) => word.text).join(" ")).join(" ");

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const node = ref.current;
    const glyphs = node
      ? Array.from(node.querySelectorAll<HTMLElement>("[data-glyph]"))
      : [];

    let rise: gsap.core.Tween | null = null;
    try {
      registerGsap();
      if (glyphs.length > 0) {
        rise = gsap.fromTo(
          glyphs,
          { yPercent: 110 },
          // 0.48s + 16 gaps × 26ms ≈ 896ms — the whole headline lands under 900ms.
          { yPercent: 0, duration: 0.48, ease: "ink", stagger: 0.026 },
        );
      }
    } catch {
      // A failed entrance must leave the headline readable.
      try {
        rise?.kill();
      } catch {
        // Cleanup must never throw.
      }
      if (glyphs.length > 0) gsap.set(glyphs, { yPercent: 0 });
    }

    return () => {
      try {
        rise?.kill();
      } catch {
        // Cleanup must never throw during unmount.
      }
    };
  }, []);

  const children = lines.map((line, lineIndex) => (
    <span key={lineIndex} className="block">
      {line.map((word, wordIndex) => (
        <span key={`${word.text}-${wordIndex}`}>
          {wordIndex > 0 ? " " : null}
          <span
            data-word-mask=""
            className={[
              "-mb-[0.16em] inline-block overflow-hidden pb-[0.16em] align-bottom",
              word.className ?? "",
            ].join(" ")}
          >
            {Array.from(word.text).map((char, charIndex) => (
              <span
                key={`${char}-${charIndex}`}
                data-glyph=""
                aria-hidden="true"
                className="-mb-[0.22em] inline-block pb-[0.22em]"
              >
                {char}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  ));

  return createElement(
    as,
    {
      ref,
      "aria-label": label,
      className,
    },
    children,
  );
}
