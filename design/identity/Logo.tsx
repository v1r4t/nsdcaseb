/**
 * The club's actual mark, derived from the supplied artwork.
 *
 * The source file is a blue logo on transparency, so its alpha channel is the
 * drawing. It ships as a white-on-transparent mask and is painted here with
 * `currentColor`, which means the mark can be ink on paper, paper on the ink
 * footer, or seal when it needs to be the loudest thing on screen — one asset,
 * three tones, no recoloured copies to keep in sync.
 */
const SOURCES = {
  symbol: { url: "/brand/nsdc-symbol.png", ratio: "601 / 643" },
  lockup: { url: "/brand/nsdc-lockup.png", ratio: "891 / 934" },
} as const;

export function Logo({
  variant = "symbol",
  className,
  label = "NSDC",
}: {
  variant?: keyof typeof SOURCES;
  className?: string;
  label?: string;
}) {
  const source = SOURCES[variant];

  return (
    <span
      role="img"
      aria-label={label}
      data-testid="logo"
      data-variant={variant}
      className={["inline-block shrink-0 bg-current align-middle", className ?? ""].join(" ")}
      style={{
        aspectRatio: source.ratio,
        WebkitMaskImage: `url(${source.url})`,
        maskImage: `url(${source.url})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
