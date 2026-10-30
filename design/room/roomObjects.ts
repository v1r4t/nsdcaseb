import { box, place, type RoomObject, type Segment } from "./room";

/**
 * What stands in the corridor.
 *
 * Every object is line geometry on purpose: it has to read as drafted on paper,
 * not rendered. Each chapter gets one, spaced so only one is ever close, and
 * exactly one of them is drawn in seal.
 */

// Rails need the same vertical structure as rungs did; keeping small helpers
// local avoids leaking geometry assumptions.
function rungs(count: number, width: number, y: number, z: number): Segment[] {
  const segments: Segment[] = [];
  const step = (y * 2) / (count + 1);
  for (let i = 1; i <= count; i += 1) {
    const at = -y + step * i;
    segments.push([-width, at, z, width, at, z]);
  }
  return segments;
}

/** A server rack: a tall box with 7 shelf lines and two side rails, plus a small base plinth. */
function rack(): Segment[] {
  const body = box(0.86, 1.7, 0.55);
  const segments: Segment[] = [...body];
  // Shelf lines across the front face read as technical drawing.
  segments.push(...rungs(7, 0.36, 0.7, 0.29));
  // Two side rails run the full height to read as a frame rather than a slab.
  const railX = 0.38;
  segments.push([-railX, -0.85, 0.28, -railX, 0.85, 0.28]);
  segments.push([railX, -0.85, 0.28, railX, 0.85, 0.28]);
  // Small base plinth grounds it without bloating width.
  const plinth = box(0.94, 0.08, 0.62);
  for (const segment of plinth) {
    segments.push([segment[0], segment[1] + 0.89, segment[2], segment[3], segment[4] + 0.89, segment[5]]);
  }
  return segments;
}

/** An 8-node cube with edges, plus 6 short stubs radiating outward from the corner nodes. */
function lattice(): Segment[] {
  const nodes: Array<[number, number, number]> = [];
  for (const x of [-0.42, 0.42]) {
    for (const y of [-0.42, 0.42]) {
      for (const z of [-0.42, 0.42]) nodes.push([x, y, z]);
    }
  }
  const segments: Segment[] = [];
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const from = nodes[a];
      const to = nodes[b];
      if (!from || !to) continue;
      // Connect only neighbours: one axis apart (Manhattan distance 0.84).
      const distance =
        Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) + Math.abs(from[2] - to[2]);
      if (distance > 0.85) continue;
      segments.push([from[0], from[1], from[2], to[0], to[1], to[2]]);
    }
  }
  // Six short stubs radiating outward from corner nodes read as a neural net.
  // Use all 8 corners but give each axis a stub pointing away from cube center.
  const stub = 0.22;
  for (const node of nodes) {
    // Radiate along axes that go outside the cube's face relative to origin.
    if (node[0] < 0) segments.push([node[0], node[1], node[2], node[0] - stub, node[1], node[2]]);
    if (node[0] > 0) segments.push([node[0], node[1], node[2], node[0] + stub, node[1], node[2]]);
    if (node[1] < 0) segments.push([node[0], node[1], node[2], node[0], node[1] - stub, node[2]]);
    if (node[1] > 0) segments.push([node[0], node[1], node[2], node[0], node[1] + stub, node[2]]);
    if (node[2] < 0) segments.push([node[0], node[1], node[2], node[0], node[1], node[2] - stub]);
    if (node[2] > 0) segments.push([node[0], node[1], node[2], node[0], node[1], node[2] + stub]);
  }
  return segments;
}

/** A terminal: a plinth, an angled screen box, and a plotted trace across the screen face. */
function terminal(): Segment[] {
  const segments: Segment[] = [];
  // Plinth grounds the unit.
  const plinth = box(1.0, 0.12, 0.46);
  for (const segment of plinth) {
    segments.push([segment[0], segment[1] + 0.42, segment[2], segment[3], segment[4] + 0.42, segment[5]]);
  }
  // Angled screen box sits on top of plinth, tilted back.
  // Tilt: push top back in z, tilt around x axis implicitly by placing segments.
  // Keep within bounds by constructing explicitly.
  const sw = 0.44, sh = 0.29, sd = 0.04;
  const sy = -0.02, sz = 0.16;
  // Angled panel - simpler approach: draw box and offset top vertices back.
  const screenCorners: Array<[number, number, number]> = [
    [-sw, sy - sh, sz - sd],
    [sw, sy - sh, sz - sd],
    [sw, sy + sh, sz - sd + 0.08], // top edge angled back
    [-sw, sy + sh, sz - sd + 0.08],
    [-sw, sy - sh, sz + sd],
    [sw, sy - sh, sz + sd],
    [sw, sy + sh, sz + sd + 0.08],
    [-sw, sy + sh, sz + sd + 0.08],
  ];
  const screenEdges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (const [a, b] of screenEdges) {
    const from = screenCorners[a];
    const to = screenCorners[b];
    if (!from || !to) continue;
    segments.push([from[0], from[1], from[2], to[0], to[1], to[2]]);
  }
  // Plotted trace across the screen face (front face of angled screen).
  const trace: Segment[] = [];
  const points = [0.12, -0.14, 0.08, -0.06, 0.16, -0.12, 0.04, 0.14];
  const span = 0.72;
  points.forEach((y, index) => {
    const x = -span / 2 + (span / (points.length - 1)) * index;
    if (index === 0) return;
    const previous = points[index - 1] ?? 0;
    const prevX = -span / 2 + (span / (points.length - 1)) * (index - 1);
    // Trace on the front face; angle it slightly.
    trace.push([prevX, sy + previous * 0.5, sz + sd + 0.001, x, sy + y * 0.5, sz + sd + 0.001]);
  });
  segments.push(...trace);
  return segments;
}

/** A stack of archive plates seen edge-on. */
function plates(): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < 7; i += 1) {
    const offset = -0.055 * i; // slight offset
    const slab = box(1.0, 0.028, 0.68);
    for (const segment of slab) {
      segments.push([
        segment[0],
        segment[1] + offset,
        segment[2],
        segment[3],
        segment[4] + offset,
        segment[5],
      ]);
    }
  }
  // Vertical spine line through their left edges.
  segments.push([-0.5, 0.165, 0, -0.5, -0.165, 0]);
  return segments;
}

/** Object-space definitions, before placement. */
export const OBJECT_SOURCES = {
  rack,
  lattice,
  terminal,
  plates,
} as const;

export const ROOM_OBJECTS: RoomObject[] = [
  {
    id: "rack",
    at: 9,
    x: -1.3,
    scale: 1,
    segments: rack().map((segment) => place(segment, 0, 0.15, 0)),
  },
  {
    id: "lattice",
    at: 19,
    x: 1.35,
    scale: 1,
    segments: lattice().map((segment) => place(segment, 0, -0.15, 0)),
    seal: true,
  },
  {
    id: "terminal",
    at: 29,
    x: -1.25,
    scale: 1,
    segments: terminal().map((segment) => place(segment, 0, 0.2, 0)),
  },
  {
    id: "plates",
    at: 39,
    x: 1.3,
    scale: 1,
    segments: plates().map((segment) => place(segment, 0, 0.45, 0)),
  },
];
