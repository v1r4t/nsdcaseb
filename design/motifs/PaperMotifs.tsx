/** Paper motifs: the form sheet and the application dossier. SVG children only. */

const INK = "#111110";
const SEAL = "#B33C1B";

export function FormSheet() {
  const sheetX = 860;
  const sheetY = 90;
  const sheetW = 440;
  const sheetH = 620;
  const backSheetX = sheetX + 14;
  const backSheetY = sheetY + 10;

  const labelW = 60;
  const rowStartX = sheetX + 70;
  const rowW = sheetW - 140;
  const rowH = 38;
  const rows = [
    { y: sheetY + 150, filled: "none" },
    { y: sheetY + 150 + rowH + 16, filled: "partial" },
    { y: sheetY + 150 + (rowH + 16) * 2, filled: "none" },
    { y: sheetY + 150 + (rowH + 16) * 3, filled: "partial" },
    { y: sheetY + 150 + (rowH + 16) * 4, filled: "complete" },
    { y: sheetY + 150 + (rowH + 16) * 5, filled: "none" },
  ];

  return (
    <g data-motif="form">
      {/* Back sheet peeking behind */}
      <rect
        x={backSheetX}
        y={backSheetY}
        width={sheetW - 8}
        height={sheetH - 10}
        rx={4}
        fill="none"
        stroke={INK}
        strokeOpacity={0.14}
        strokeWidth={1}
      />

      {/* Main sheet */}
      <rect
        x={sheetX}
        y={sheetY}
        width={sheetW}
        height={sheetH}
        rx={4}
        fill="none"
        stroke={INK}
        strokeOpacity={0.22}
        strokeWidth={1}
      />
      {/* Fold mark */}
      <line
        x1={sheetX + 36}
        y1={sheetY}
        x2={sheetX + 36}
        y2={sheetY + 24}
        stroke={INK}
        strokeOpacity={0.16}
        strokeWidth={1}
      />

      {/* Margin tick marks down the edge */}
      {Array.from({ length: 9 }).map((_, i) => (
        <line
          key={`tick-${i}`}
          x1={sheetX + 18}
          y1={sheetY + 90 + i * 52}
          x2={sheetX + 24}
          y2={sheetY + 90 + i * 52}
          stroke={INK}
          strokeOpacity={0.16}
          strokeWidth={1}
        />
      ))}

      {rows.map((row, i) => {
        const isCaretRow = i === 0;
        return (
          <g key={`row-${i}`}>
            {/* Label rule */}
            <line
              x1={rowStartX}
              y1={row.y}
              x2={rowStartX + labelW}
              y2={row.y}
              stroke={INK}
              strokeOpacity={0.16}
              strokeWidth={1}
            />
            {/* Field box */}
            <rect
              x={rowStartX}
              y={row.y + 8}
              width={rowW}
              height={rowH}
              rx={3}
              fill="none"
              stroke={INK}
              strokeOpacity={0.14}
              strokeWidth={1}
            />
            {row.filled === "partial" && (
              <line
                x1={rowStartX + 12}
                y1={row.y + 8 + rowH / 2}
                x2={rowStartX + rowW * 0.42}
                y2={row.y + 8 + rowH / 2}
                stroke={INK}
                strokeOpacity={0.16}
                strokeWidth={1}
              />
            )}
            {row.filled === "complete" && (
              <path
                d={`M ${rowStartX + 14} ${row.y + 8 + rowH / 2} L ${rowStartX + 20} ${
                  row.y + 8 + rowH / 2 + 6
                } L ${rowStartX + 32} ${row.y + 8 + rowH / 2 - 4}`}
                fill="none"
                stroke={INK}
                strokeOpacity={0.18}
                strokeWidth={1}
              />
            )}
            {isCaretRow && (
              <line
                x1={rowStartX + 6}
                y1={row.y + 8 + 6}
                x2={rowStartX + 6}
                y2={row.y + 8 + rowH - 6}
                stroke={SEAL}
                strokeOpacity={1}
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function Dossier() {
  const folderX = 780;
  const folderY = 110;
  const folderW = 520;
  const folderH = 560;

  const tabW = 160;
  const tabH = 28;

  const checkRows = [
    { y: folderY + 170, checked: true, sealed: false },
    { y: folderY + 170 + 56, checked: true, sealed: true },
    { y: folderY + 170 + 112, checked: false, sealed: false },
  ];

  return (
    <g data-motif="dossier">
      {/* Folder */}
      <path
        d={`M ${folderX} ${folderY + tabH} L ${folderX + tabW} ${folderY + tabH} L ${
          folderX + tabW + 14
        } ${folderY} L ${folderX + folderW} ${folderY} L ${folderX + folderW} ${
          folderY + folderH
        } L ${folderX} ${folderY + folderH} Z`}
        fill="none"
        stroke={INK}
        strokeOpacity={0.2}
        strokeWidth={1}
      />

      {/* Checklist rows */}
      {checkRows.map((row, i) => {
        const boxX = folderX + 70;
        const boxY = row.y;
        const boxSize = 16;
        return (
          <g key={`check-${i}`}>
            <rect
              x={boxX}
              y={boxY}
              width={boxSize}
              height={boxSize}
              fill="none"
              stroke={INK}
              strokeOpacity={0.18}
              strokeWidth={1}
            />
            {row.checked && (
              <path
                d={`M ${boxX + 4} ${boxY + boxSize / 2} L ${boxX + 7} ${
                  boxY + boxSize / 2 + 4
                } L ${boxX + 13} ${boxY + boxSize / 2 - 3}`}
                fill="none"
                stroke={row.sealed ? SEAL : INK}
                strokeOpacity={row.sealed ? 1 : 0.2}
                strokeWidth={1}
              />
            )}
            <line
              x1={boxX + 26}
              y1={boxY + boxSize / 2}
              x2={boxX + 320}
              y2={boxY + boxSize / 2}
              stroke={INK}
              strokeOpacity={0.16}
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* Stamp ring in lower right */}
      <g>
        <circle
          cx={folderX + folderW - 110}
          cy={folderY + folderH - 110}
          r={38}
          fill="none"
          stroke={INK}
          strokeOpacity={0.14}
          strokeWidth={1}
        />
        <circle
          cx={folderX + folderW - 110}
          cy={folderY + folderH - 110}
          r={28}
          fill="none"
          stroke={INK}
          strokeOpacity={0.14}
          strokeWidth={1}
        />
        <line
          x1={folderX + folderW - 148}
          y1={folderY + folderH - 110}
          x2={folderX + folderW - 72}
          y2={folderY + folderH - 110}
          stroke={INK}
          strokeOpacity={0.14}
          strokeWidth={1}
        />
      </g>

      {/* Hairline running off right edge */}
      <line
        x1={folderX + folderW - 60}
        y1={folderY + 230}
        x2={1440}
        y2={folderY + 230}
        stroke={INK}
        strokeOpacity={0.12}
        strokeWidth={1}
      />
    </g>
  );
}
