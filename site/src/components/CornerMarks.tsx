/**
 * CornerMarks — print-style registration marks at a section's corners.
 * Four small L-shaped ticks drawn with the kit hairline, so they read as
 * "this was composed on a page", not as a border. Purely decorative.
 */

/** Shared tick: a 12px square whose two joined sides use the hairline token. */
const MARK = 'absolute h-3 w-3 border-[color:var(--hairline)]';

export default function CornerMarks() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      <span className={`${MARK} left-0 top-0 border-l border-t`} />
      <span className={`${MARK} right-0 top-0 border-r border-t`} />
      <span className={`${MARK} bottom-0 left-0 border-b border-l`} />
      <span className={`${MARK} bottom-0 right-0 border-b border-r`} />
    </span>
  );
}
