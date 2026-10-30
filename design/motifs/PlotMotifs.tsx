/** Plot motifs: the project index and the single project sheet. SVG children only. */

import { plotPoints, buildPlotPath, type Point } from "./plot";

const INK = "#111110";
const SEAL = "#B33C1B";

export function PlotField({ count = 9, className }: { count?: number; className?: string } = {}) {
  const fieldLeft = 560;
  const fieldTop = 120;
  const fieldW = 800;
  const fieldH = 640;
  const fieldRight = fieldLeft + fieldW;
  const fieldBottom = fieldTop + fieldH;
  const tick = 80;

  const raw = plotPoints(count, fieldW, fieldH, 7);
  const points: Point[] = raw.map((p) => ({
    x: fieldLeft + p.x,
    y: fieldTop + p.y,
  }));
  const pathD = buildPlotPath(points, 7);

  const sealIndex = count > 1 ? 1 : 0;
  const sealPoint = points.length > 0 ? points[Math.min(sealIndex, points.length - 1)] : null;

  const xTicks = Math.floor(fieldW / tick);
  const yTicks = Math.floor(fieldH / tick);

  return (
    <g data-motif="plot-field" className={className}>
      {/* Faint gridlines */}
      {Array.from({ length: xTicks + 1 }).map((_, i) => (
        <line
          key={`gv-${i}`}
          x1={fieldLeft + i * tick}
          y1={fieldTop}
          x2={fieldLeft + i * tick}
          y2={fieldBottom}
          stroke={INK}
          strokeOpacity={0.07}
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: yTicks + 1 }).map((_, i) => (
        <line
          key={`gh-${i}`}
          x1={fieldLeft}
          y1={fieldBottom - i * tick}
          x2={fieldRight}
          y2={fieldBottom - i * tick}
          stroke={INK}
          strokeOpacity={0.07}
          strokeWidth={1}
        />
      ))}

      {/* Axis rules meeting at the corner */}
      <line
        x1={fieldLeft}
        y1={fieldBottom}
        x2={fieldRight}
        y2={fieldBottom}
        stroke={INK}
        strokeOpacity={0.22}
        strokeWidth={1}
      />
      <line
        x1={fieldLeft}
        y1={fieldTop}
        x2={fieldLeft}
        y2={fieldBottom}
        stroke={INK}
        strokeOpacity={0.22}
        strokeWidth={1}
      />

      {/* Tick marks every 80 units */}
      {Array.from({ length: xTicks + 1 }).map((_, i) => (
        <line
          key={`tx-${i}`}
          x1={fieldLeft + i * tick}
          y1={fieldBottom}
          x2={fieldLeft + i * tick}
          y2={fieldBottom + 6}
          stroke={INK}
          strokeOpacity={0.18}
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: yTicks + 1 }).map((_, i) => (
        <line
          key={`ty-${i}`}
          x1={fieldLeft - 6}
          y1={fieldBottom - i * tick}
          x2={fieldLeft}
          y2={fieldBottom - i * tick}
          stroke={INK}
          strokeOpacity={0.18}
          strokeWidth={1}
        />
      ))}

      {/* Hand-wobbled plotted path */}
      <path
        d={pathD}
        fill="none"
        stroke={INK}
        strokeOpacity={0.18}
        strokeWidth={1}
      />

      {/* Plotted points */}
      {points.map((p, i) => (
        <circle
          key={`pt-${i}`}
          cx={p.x}
          cy={p.y}
          r={4}
          fill={INK}
          fillOpacity={0.18}
        />
      ))}

      {/* Seal point: ring + hairline to axis */}
      {sealPoint ? (
        <>
          <circle
            cx={sealPoint.x}
            cy={sealPoint.y}
            r={10}
            fill="none"
            stroke={SEAL}
            strokeOpacity={0.9}
            strokeWidth={1}
          />
          <line
            x1={sealPoint.x}
            y1={sealPoint.y}
            x2={sealPoint.x}
            y2={fieldBottom}
            stroke={INK}
            strokeOpacity={0.18}
            strokeWidth={1}
          />
        </>
      ) : null}
    </g>
  );
}

export function CaseSheet() {
  const curvePoints: Point[] = [
    { x: 520, y: 640 },
    { x: 1320, y: 220 },
  ];
  const curvePath = buildPlotPath(curvePoints, 13);

  const leaders = [
    { x: 700, labelY: 700, labelLen: 90 },
    { x: 960, labelY: 750, labelLen: 140 },
    { x: 1220, labelY: 800, labelLen: 70 },
  ];

  // Approximate curve y at each leader x (linear rise).
  const yAt = (x: number) => {
    const t = (x - 520) / (1320 - 520);
    return 640 + (220 - 640) * t;
  };

  return (
    <g data-motif="case-sheet">
      {/* Large hand-wobbled curve */}
      <path
        d={curvePath}
        fill="none"
        stroke={INK}
        strokeOpacity={0.2}
        strokeWidth={1}
      />

      {/* Annotation leaders */}
      {leaders.map((l, i) => {
        const isSeal = i === 1;
        const color = isSeal ? SEAL : INK;
        const opacity = isSeal ? 0.9 : 0.18;
        const topY = yAt(l.x);
        return (
          <g key={`leader-${i}`}>
            <line
              x1={l.x}
              y1={topY}
              x2={l.x}
              y2={l.labelY}
              stroke={color}
              strokeOpacity={opacity}
              strokeWidth={1}
            />
            <line
              x1={l.x}
              y1={l.labelY}
              x2={l.x + l.labelLen}
              y2={l.labelY}
              stroke={color}
              strokeOpacity={opacity}
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* A small node on the curve */}
      <circle
        cx={960}
        cy={yAt(960)}
        r={4}
        fill={INK}
        fillOpacity={0.18}
      />

      {/* Vertical rule down the left margin with three tick marks */}
      <line
        x1={470}
        y1={260}
        x2={470}
        y2={760}
        stroke={INK}
        strokeOpacity={0.18}
        strokeWidth={1}
      />
      {[340, 500, 660].map((y) => (
        <line
          key={`mt-${y}`}
          x1={470}
          y1={y}
          x2={478}
          y2={y}
          stroke={INK}
          strokeOpacity={0.18}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}
