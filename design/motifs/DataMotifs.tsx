/**
 * Data-fed motifs: drawn from real records rather than invented shapes.
 * Returns SVG children only — PageScene owns the <svg> frame.
 *
 * Nothing here reads a data module: pass the two numbers you have and the
 * drawing follows them. Defaults are chosen so the motif still composes when
 * the host app has no data to give it yet.
 */

const INK = "#111110";
const SEAL = "#B33C1B";

export function SeatChart({
  capacity = 960,
  registered = 0,
  className,
}: {
  capacity?: number;
  registered?: number;
  className?: string;
}) {
  const totalCapacity = Math.max(1, capacity);
  const totalRegistered = Math.max(0, registered);
  const ratio = Math.min(1, totalRegistered / totalCapacity);

  const rows = 8;
  const cols = 14;
  const cellW = 22;
  const cellH = 16;
  const gap = 8;
  const totalCells = rows * cols;
  const filledCount = Math.max(
    0,
    Math.min(totalCells, Math.round(ratio * totalCells)),
  );
  const yourSeatIndex = filledCount > 0 ? filledCount - 1 : 0;

  const blockX = 920;
  const blockY = 500;
  const totalW = cols * cellW + (cols - 1) * gap;
  const totalH = rows * cellH + (rows - 1) * gap;

  const waitlistY = blockY + totalH + 14;
  const tickCount = 28;
  const ruleY = waitlistY + 24;

  return (
    <g data-motif="seats" className={className}>
      {Array.from({ length: totalCells }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = blockX + c * (cellW + gap);
        const y = blockY + r * (cellH + gap);
        const isYour = i === yourSeatIndex;
        const isFilled = i < filledCount;
        return (
          <g key={`seat-${i}`}>
            <rect
              x={x}
              y={y}
              width={cellW}
              height={cellH}
              rx={3}
              fill={isYour ? SEAL : isFilled ? INK : "none"}
              fillOpacity={isYour ? 1 : isFilled ? 0.18 : undefined}
              stroke={INK}
              strokeOpacity={0.14}
              strokeWidth={1}
            />
            {isYour && (
              <rect
                x={x - 2}
                y={y - 2}
                width={cellW + 4}
                height={cellH + 4}
                rx={4}
                fill="none"
                stroke={SEAL}
                strokeOpacity={1}
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}

      {Array.from({ length: tickCount }).map((_, i) => {
        const x = blockX + (i * totalW) / (tickCount - 1);
        const tall = (i + 1) % 5 === 0;
        const h = tall ? 12 : 6;
        return (
          <line
            key={`wait-${i}`}
            x1={x}
            y1={waitlistY}
            x2={x}
            y2={waitlistY + h}
            stroke={INK}
            strokeOpacity={0.16}
            strokeWidth={1}
          />
        );
      })}

      <line
        x1={blockX}
        y1={ruleY}
        x2={blockX + totalW}
        y2={ruleY}
        stroke={INK}
        strokeOpacity={0.14}
        strokeWidth={1}
      />
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line
          key={`rule-tick-${i}`}
          x1={blockX + totalW * t}
          y1={ruleY - 4}
          x2={blockX + totalW * t}
          y2={ruleY + 4}
          stroke={INK}
          strokeOpacity={0.16}
          strokeWidth={1}
        />
      ))}

      <path
        d={`M ${blockX} ${ruleY + 10} L ${blockX + 6} ${ruleY + 10} L ${blockX + 6} ${ruleY + 16}`}
        fill="none"
        stroke={INK}
        strokeOpacity={0.12}
        strokeWidth={1}
      />
    </g>
  );
}

export function ContactSheet({ frames = 15, className }: { frames?: number; className?: string }) {
  const count = Math.max(1, frames);
  const cols = 5;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = 88;
  const cellH = 66;
  const gapX = 12;
  const gapY = 12;
  const blockX = 880;
  const blockY = 280;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const totalH = rows * cellH + (rows - 1) * gapY;

  const sealIndex = Math.floor(count / 2);

  const cells = Array.from({ length: count });

  return (
    <g data-motif="contact-sheet" className={className}>
      <rect
        x={blockX - 24}
        y={blockY - 24}
        width={totalW + 48}
        height={totalH + 48}
        rx={4}
        fill="none"
        stroke={INK}
        strokeOpacity={0.16}
        strokeWidth={1}
      />

      {Array.from({ length: Math.max(3, rows * 2 + 1) }).map((_, i) => {
        const y = blockY - 12 + i * 18;
        return (
          <circle
            key={`perf-${i}`}
            cx={blockX - 16}
            cy={y}
            r={3}
            fill="none"
            stroke={INK}
            strokeOpacity={0.16}
            strokeWidth={1}
          />
        );
      })}

      {cells.map((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = blockX + col * (cellW + gapX);
        const y = blockY + row * (cellH + gapY);
        const isSeal = i === sealIndex;
        const isHatch = (i + 1) % 3 === 0;
        return (
          <g key={`frame-${i}`}>
            <rect
              x={x}
              y={y}
              width={cellW}
              height={cellH}
              rx={2}
              fill="none"
              stroke={isSeal ? SEAL : INK}
              strokeOpacity={isSeal ? 1 : 0.18}
              strokeWidth={1}
            />
            <rect
              x={x + cellW / 2 - 3}
              y={y - 3}
              width={6}
              height={4}
              rx={1}
              fill={INK}
              fillOpacity={0.16}
              stroke="none"
            />
            <rect
              x={x + cellW / 2 - 3}
              y={y + cellH - 1}
              width={6}
              height={4}
              rx={1}
              fill={INK}
              fillOpacity={0.16}
              stroke="none"
            />
            {isHatch &&
              Array.from({ length: 6 }).map((_, k) => {
                const offset = k * 12;
                return (
                  <line
                    key={`hatch-${i}-${k}`}
                    x1={x + offset}
                    y1={y}
                    x2={x + offset - cellH}
                    y2={y + cellH}
                    stroke={INK}
                    strokeOpacity={0.12}
                    strokeWidth={1}
                  />
                );
              })}
          </g>
        );
      })}

      <path
        d={`M ${blockX} ${blockY + totalH + 16} L ${blockX + totalW} ${blockY + totalH + 16}`}
        fill="none"
        stroke={INK}
        strokeOpacity={0.12}
        strokeWidth={1}
      />
    </g>
  );
}
