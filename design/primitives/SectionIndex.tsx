/**
 * The outlined section numeral: the page's index drawn as a hairline hollow,
 * not a filled label. Decorative, so it is hidden from assistive technology;
 * the section's own heading carries the meaning.
 */
export function SectionIndex({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "pointer-events-none select-none font-mono leading-[0.72] tracking-[-0.06em]",
        className ?? "",
      ].join(" ")}
      style={{
        fontSize: "clamp(6rem, 10vw, 8.75rem)",
        WebkitTextStroke: "1px var(--color-faint)",
        color: "transparent",
      }}
    >
      {value}
    </span>
  );
}
