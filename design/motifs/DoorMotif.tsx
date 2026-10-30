/** The door. One drawing for every auth route, ajar for 404. SVG children only. */

export function Door({ open = false }: { open?: boolean }) {
  const ink = "#111110";
  const seal = "#B33C1B";
  const wallX1 = 820;
  const wallX2 = 840;
  const frameLeft = 880;
  const frameRight = 980;
  const frameTop = 520;
  const frameBottom = 760;
  const inset = 40;
  const innerLeft = frameLeft + inset;
  const innerRight = frameRight - inset;
  const innerTop = frameTop + inset;
  const innerBottom = frameBottom - inset;

  if (open) {
    return (
      <g data-motif="door-ajar">
        <line x1={wallX1} y1={frameTop - 40} x2={wallX1} y2={frameBottom + 10} stroke={ink} strokeOpacity={0.16} strokeWidth={1} />
        <line x1={wallX2} y1={frameTop - 40} x2={wallX2} y2={frameBottom + 10} stroke={ink} strokeOpacity={0.16} strokeWidth={1} />
        <rect x={frameLeft} y={frameTop} width={frameRight - frameLeft} height={frameBottom - frameTop} fill="none" stroke={ink} strokeOpacity={0.18} strokeWidth={1} />
        <line x1={frameLeft + 10} y1={frameTop + 15} x2={frameLeft + 10} y2={frameTop + 35} stroke={ink} strokeOpacity={0.22} strokeWidth={1} />
        <line x1={frameLeft + 18} y1={frameTop + 15} x2={frameLeft + 18} y2={frameTop + 35} stroke={ink} strokeOpacity={0.22} strokeWidth={1} />
        <line x1={frameLeft} y1={frameBottom} x2={frameRight} y2={frameBottom} stroke={ink} strokeOpacity={0.16} strokeWidth={1} />
        <line x1={frameLeft} y1={frameTop} x2={frameLeft + 60} y2={frameTop} stroke={ink} strokeOpacity={0.18} strokeWidth={1} />
        <line x1={frameLeft + 100} y1={frameTop} x2={frameRight} y2={frameTop} stroke={ink} strokeOpacity={0.18} strokeWidth={1} strokeDasharray="6 40" />
        <polygon points={`${frameLeft},${innerTop} ${frameLeft + 70},${innerTop - 25} ${frameLeft + 70},${innerBottom - 25} ${frameLeft},${innerBottom}`} fill="none" stroke={ink} strokeOpacity={0.2} strokeWidth={1} />
        <circle cx={frameLeft + 12} cy={innerTop + 60} r={4} fill="none" stroke={seal} strokeOpacity={0.9} strokeWidth={1} />
        <path d={`M ${frameLeft + 12} ${innerTop + 64} L ${frameLeft + 16} ${innerTop + 78} L ${frameLeft + 8} ${innerTop + 78} Z`} fill="none" stroke={seal} strokeOpacity={0.9} strokeWidth={1} />
      </g>
    );
  }

  return (
    <g data-motif="door">
      <line x1={wallX1} y1={frameTop - 40} x2={wallX1} y2={frameBottom + 10} stroke={ink} strokeOpacity={0.16} strokeWidth={1} />
      <line x1={wallX2} y1={frameTop - 40} x2={wallX2} y2={frameBottom + 10} stroke={ink} strokeOpacity={0.16} strokeWidth={1} />
      <rect x={frameLeft} y={frameTop} width={frameRight - frameLeft} height={frameBottom - frameTop} fill="none" stroke={ink} strokeOpacity={0.18} strokeWidth={1} />
      <line x1={frameLeft + 10} y1={frameTop + 15} x2={frameLeft + 10} y2={frameTop + 35} stroke={ink} strokeOpacity={0.22} strokeWidth={1} />
      <line x1={frameLeft + 18} y1={frameTop + 15} x2={frameLeft + 18} y2={frameTop + 35} stroke={ink} strokeOpacity={0.22} strokeWidth={1} />
      <line x1={frameLeft} y1={frameBottom} x2={frameRight} y2={frameBottom} stroke={ink} strokeOpacity={0.16} strokeWidth={1} />
      <rect x={innerLeft} y={innerTop} width={innerRight - innerLeft} height={innerBottom - innerTop} fill="none" stroke={ink} strokeOpacity={0.2} strokeWidth={1} />
      <line x1={innerRight - 12} y1={innerTop + 70} x2={innerRight - 12} y2={innerTop + 90} stroke={ink} strokeOpacity={0.22} strokeWidth={1} />
      <circle cx={innerLeft + 16} cy={innerTop + 60} r={4} fill="none" stroke={seal} strokeOpacity={0.9} strokeWidth={1} />
      <path d={`M ${innerLeft + 16} ${innerTop + 64} L ${innerLeft + 20} ${innerTop + 78} L ${innerLeft + 12} ${innerTop + 78} Z`} fill="none" stroke={seal} strokeOpacity={0.9} strokeWidth={1} />
    </g>
  );
}
