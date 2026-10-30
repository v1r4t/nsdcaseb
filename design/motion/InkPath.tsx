import type { CSSProperties } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface InkPathProps {
  d: string;
  /** 0..1 how much of the stroke is drawn. Ignored under reduced motion. */
  progress?: number;
  className?: string;
  strokeWidth?: number;
  stroke?: string;
  fill?: string;
  style?: CSSProperties;
  testId?: string;
}

/**
 * A drawing that is written rather than faded.
 * `pathLength={1}` means the dash maths never reads layout — this is why the
 * whole site stays smooth without an animation library.
 */
export function InkPath({
  d,
  progress = 1,
  className,
  strokeWidth = 1,
  stroke = "currentColor",
  fill = "none",
  style,
  testId = "ink-path",
}: InkPathProps) {
  const reduced = useReducedMotion();
  const clamped = reduced ? 1 : Math.max(0, Math.min(1, progress));

  return (
    <path
      data-testid={testId}
      d={d}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - clamped}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill={fill}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      className={className}
      style={style}
    />
  );
}
