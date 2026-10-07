/**
 * Backdrop — the page's texture layer: film grain over a 12-column
 * blueprint grid. Both are fixed, pointer-transparent and aria-hidden,
 * so they never intercept input or reach assistive tech.
 *
 * The grid is deliberately faint (~5%): it should read as the structure the
 * layout was composed on, not as decoration.
 */
export default function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      {/* 12-column blueprint grid */}
      <div className="nsdc-grid absolute inset-0" />
      {/* Film grain on top of the grid so both share one surface */}
      <div className="nsdc-grain absolute inset-0" />
    </div>
  );
}
