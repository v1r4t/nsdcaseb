import { useEffect, useRef, useState } from "react";
import { registerGsap, ScrollTrigger } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import { cn } from "../lib/cn";

const GLYPHS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#%&·—–.,:;!?");
const REVEAL_MS = 450;

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "";
}

function scrambled(source: string): string {
  return Array.from(source)
    .map((char) => (char.trim() === "" ? char : randomGlyph()))
    .join("");
}

/**
 * A label that resolves from noise once, when it first enters the viewport.
 *
 * The final `text` lives in the DOM at rest and the wrapper always carries it
 * as an `aria-label`; the animated string is hidden from assistive tech, so a
 * screen reader hears the real label even mid-scramble.
 */
export function Scramble({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    setDisplay(text);

    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    let frame = 0;
    let kick = 0;
    let started = false;
    let cancelled = false;
    let trigger: ScrollTrigger | null = null;

    const run = () => {
      if (cancelled) return;
      const source = Array.from(text);
      const startedAt = window.performance.now();

      const write = (value: string) => {
        if (!cancelled) setDisplay(value);
      };

      write(scrambled(text));

      const tick = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startedAt) / REVEAL_MS);
        const revealed = Math.floor(progress * (source.length + 1));

        let next = "";
        source.forEach((char, index) => {
          if (index < revealed || char.trim() === "") next += char;
          else next += randomGlyph();
        });
        write(next);

        if (progress < 1) {
          frame = window.requestAnimationFrame(tick);
        } else {
          write(text);
        }
      };

      frame = window.requestAnimationFrame(tick);
    };

    const schedule = () => {
      if (started || cancelled) return;
      started = true;
      // Deferring one frame keeps server/prerendered text intact until the
      // animation actually has a frame to run on.
      kick = window.requestAnimationFrame(run);
    };

    try {
      registerGsap();
      trigger = ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: schedule,
      });
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) schedule();
    } catch {
      // ScrollTrigger is an enhancement; the label still scrambles on load.
      schedule();
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(kick);
      trigger?.kill();
    };
  }, [text]);

  return (
    <span ref={ref} className={cn(className)} data-scramble aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
