import { useId } from "react";
import { cn } from "../lib/cn";

/** The plate is a fixed ink-on-paper object, so it reads the same in every theme. */
// Use palette tones; derive ink components via color-mix against ink to stay in palette.
const INK = "17, 17, 16";
// Tint of paper for the plate ground to stay within the three-tone palette.
const GROUND = "color-mix(in srgb, var(--color-paper) 80%, var(--color-ink))";
const STRIP = "var(--color-paper)";
const SEAL = "var(--color-seal)";

/**
 * Stands in for photography until the club's Supabase library is wired up.
 * It is drawn, not empty: two woven hatches, an oversized frame number, an
 * inner rule and a mono caption on a paper strip. Emptiness, made deliberate.
 */
export function DrawnPlaceholder({
  caption,
  alt,
  className,
  ratio = "aspect-[4/3]",
  anchor = "01",
}: {
  caption: string;
  alt: string;
  className?: string;
  ratio?: string;
  anchor?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const hatchId = `hatch-${uid}`;
  const weaveId = `weave-${uid}`;

  return (
    <div
      role="img"
      aria-label={alt}
      className={cn("relative w-full overflow-hidden border", ratio, className)}
      style={{
        backgroundColor: GROUND,
        borderColor: "color-mix(in srgb, var(--color-ink) 35%, transparent)",
        containerType: "size",
      }}
    >
      {/* Two sets of ink lines at 5px pitch: a fine diagonal and a softer
          perpendicular weave. The whole layer lifts a little on button hover. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.88] transition-opacity duration-300 ease-out group-hover:opacity-100"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(38)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke="var(--color-ink)"
              strokeWidth="0.55"
              opacity="0.26"
            />
          </pattern>
          <pattern
            id={weaveId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-52)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke="var(--color-ink)"
              strokeWidth="0.5"
              opacity="0.1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${hatchId})`} />
        <rect width="100%" height="100%" fill={`url(#${weaveId})`} />
      </svg>

      {/* The frame number carries the composition: ~22% of the plate height,
          ink at 0.14, optically centred slightly high. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span
          className="font-serif leading-none tracking-[-0.03em]"
          style={{
            fontSize: "22cqh",
            color: "color-mix(in srgb, var(--color-ink) 14%, transparent)",
            transform: "translateY(-6%)",
            whiteSpace: "nowrap",
          }}
        >
          {anchor}
        </span>
      </span>

      {/* Inner rule insets the image area; the seal square sits in its corner. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[10px] border"
        style={{ borderColor: "color-mix(in srgb, var(--color-ink) 42%, transparent)" }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[16px] top-[16px] h-2 w-2"
        style={{ backgroundColor: SEAL }}
      />

      {/* Caption lives on a strip of paper so it survives the hatch. */}
      <span
        aria-hidden="true"
        className="absolute bottom-[14px] left-[14px] max-w-[calc(100%-28px)] truncate px-2 py-[3px]"
        style={{
          backgroundColor: STRIP,
          color: "color-mix(in srgb, var(--color-ink) 75%, transparent)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          lineHeight: 1.45,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {caption}
      </span>
    </div>
  );
}
