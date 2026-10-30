import { InkPath } from "./InkPath";
import { cn } from "../lib/cn";

/** A mark drawn beneath a word. The "hand" of the site, in one component. */
export function InkUnderline({
  progress = 1,
  className,
  stroke = "currentColor",
}: {
  progress?: number;
  className?: string;
  stroke?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 3"
      preserveAspectRatio="none"
      className={cn("block h-[6px] w-full overflow-visible", className)}
    >
      <InkPath
        d="M0 2.1 C 16 1.2 30 2.4 47 1.8 C 64 1.1 82 2.3 100 1.4"
        progress={progress}
        strokeWidth={1.4}
        stroke={stroke}
        testId="ink-underline"
      />
    </svg>
  );
}
