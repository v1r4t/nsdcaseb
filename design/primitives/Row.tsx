import type { ElementType, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface RowProps {
  index?: string;
  title: string;
  meta?: ReactNode;
  href?: string;
  /** Any component that accepts `href`, `className` and `children`. Defaults to `<a>`. */
  linkComponent?: ElementType;
  onClick?: () => void;
  className?: string;
  testId?: string;
  children?: ReactNode;
}

/**
 * A hairline row. Not a card: the hover state draws a box around the row
 * instead of lifting it, so nothing moves and nothing casts a shadow.
 */
export function Row({
  index,
  title,
  meta,
  href,
  linkComponent: LinkComponent = "a",
  onClick,
  className,
  testId,
  children,
}: RowProps) {
  const inner = (
    <>
      <span className="pointer-events-none absolute inset-y-0 -inset-x-1 border border-transparent transition-colors duration-200 group-hover:border-ink/35 group-focus-visible:border-ink/35" />
      {index ? <span className="mono relative text-faint">{index}</span> : null}
      <span className="relative min-w-0 font-serif text-[clamp(1.15rem,2vw,1.6rem)] leading-tight">
        {title}
      </span>
      {meta ? <span className="mono relative text-right text-faint">{meta}</span> : null}
      <span aria-hidden="true" className="mono relative text-faint transition-transform duration-200 group-hover:translate-x-1">
        →
      </span>
    </>
  );

  const shell = cn(
    "group relative grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-4 border-b py-5 hairline md:gap-6",
    className,
  );

  if (href) {
    return (
      <LinkComponent href={href} className={shell} data-testid={testId}>
        {inner}
        {children}
      </LinkComponent>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shell, "w-full text-left")} data-testid={testId}>
        {inner}
        {children}
      </button>
    );
  }
  return (
    <div className={shell} data-testid={testId}>
      {inner}
      {children}
    </div>
  );
}
