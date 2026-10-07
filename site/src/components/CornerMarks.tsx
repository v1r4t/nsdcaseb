/**
 * CornerMarks — print-style registration marks at a section's corners.
 * Four small L-shaped ticks that read as "this was composed on a page",
 * not as a border. Purely decorative.
 */
export default function CornerMarks() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      <span className="reg-mark left-0 top-0 border-l border-t" />
      <span className="reg-mark right-0 top-0 border-r border-t" />
      <span className="reg-mark bottom-0 left-0 border-b border-l" />
      <span className="reg-mark bottom-0 right-0 border-b border-r" />
    </span>
  );
}
