/**
 * The room, in metres.
 *
 * Eye at the origin looking down +z. x is right, y is down (so the floor is a
 * positive y and the ceiling negative), z is depth ahead of the camera. One
 * point perspective with the horizon fixed at 44% of the viewport height, which
 * is where the corridor converges.
 *
 * Everything here is pure and testable; nothing touches the DOM.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/** A line segment between two world points. */
export type Segment = readonly [number, number, number, number, number, number];

export interface RoomObject {
  id: string;
  /** World z of the object's centre, in metres ahead of z=0. */
  at: number;
  /** World x of the object's centre. */
  x: number;
  /** Uniform scale. 1 is life size. */
  scale: number;
  /** Segments in the object's own space, centred on the origin. */
  segments: readonly Segment[];
  /** Drawn in seal rather than ink. One object per chapter earns this. */
  seal?: boolean;
}

export const ROOM = {
  halfWidth: 2.4,
  floor: 0.92,
  ceiling: -1.15,
  spacing: 2.4,
  horizon: 0.44,
  /** Vanishing point across the viewport. Off-centre on purpose: a corridor
   *  opening to the right of the headline reads composed; dead centre reads
   *  like a backdrop behind a title. */
  centreX: 0.64,
  /** Very close: the floor has to start below the fold, or the lower half of
   *  every screen is empty paper and the room reads as a band, not a space. */
  near: 0.32,
  far: 26,
  focal: 0.9,
} as const;

export function horizonAt(height: number): number {
  return height * ROOM.horizon;
}

/** Screen position of a world point. Null when it is behind the camera. */
export function project(
  point: WorldPoint,
  width: number,
  height: number,
  cameraZ = 0,
): Vec2 | null {
  const depth = point.z - cameraZ;
  if (depth <= ROOM.near) return null;

  const scale = (height * ROOM.focal) / depth;
  return {
    x: width * ROOM.centreX + point.x * scale,
    y: horizonAt(height) + point.y * scale,
  };
}

/** Depth fade: things dissolve into the horizon rather than ending abruptly. */
export function fadeAt(depth: number): number {
  if (depth < ROOM.near || depth >= ROOM.far) return 0;
  const t = 1 - (depth - ROOM.near) / (ROOM.far - ROOM.near);
  return Math.max(0, Math.min(1, t)) ** 1.4;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * The corridor itself: long rails running to the vanishing point, plus a cross
 * rib every ROOM.spacing metres. Ribs are the thing the eye reads as travel, so
 * they are generated from the camera position rather than stored.
 */
export function corridorSegments(cameraZ: number): { rails: Segment[]; ribs: Segment[] } {
  const rails: Segment[] = [];
  const ribs: Segment[] = [];
  // Nudge past the near plane: project() rejects anything at or inside it, and
  // a rail whose start is exactly `near` is dropped whole, which leaves the
  // corridor as a stack of disconnected frames.
  const zStart = cameraZ + ROOM.near + 0.02;
  const zEnd = cameraZ + ROOM.far;

  // Long lines: floor and ceiling bays, and the wall/floor junctions. These are
  // structural, so they keep a steady weight instead of fading by midpoint.
  const bays = [-ROOM.halfWidth, -ROOM.halfWidth / 2, 0, ROOM.halfWidth / 2, ROOM.halfWidth];
  for (const x of bays) {
    rails.push([x, ROOM.floor, zStart, x, ROOM.floor, zEnd]);
    rails.push([x, ROOM.ceiling, zStart, x, ROOM.ceiling, zEnd]);
  }
  for (const x of [-ROOM.halfWidth, ROOM.halfWidth]) {
    rails.push([x, ROOM.floor, zStart, x, ROOM.floor, zEnd]);
    rails.push([x, ROOM.ceiling, zStart, x, ROOM.ceiling, zEnd]);
  }

  // Ribs: each sits at one depth, so each fades on its own.
  const first = Math.floor(zStart / ROOM.spacing) * ROOM.spacing;
  for (let z = first; z <= zEnd; z += ROOM.spacing) {
    if (z <= zStart) continue;
    ribs.push([-ROOM.halfWidth, ROOM.floor, z, ROOM.halfWidth, ROOM.floor, z]);
    ribs.push([-ROOM.halfWidth, ROOM.ceiling, z, ROOM.halfWidth, ROOM.ceiling, z]);
    ribs.push([-ROOM.halfWidth, ROOM.ceiling, z, -ROOM.halfWidth, ROOM.floor, z]);
    ribs.push([ROOM.halfWidth, ROOM.ceiling, z, ROOM.halfWidth, ROOM.floor, z]);
  }

  return { rails, ribs };
}

/** Convenience for object authors: a wireframe box centred on the origin. */
export function box(w: number, h: number, d: number): Segment[] {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const corners: Array<[number, number, number]> = [
    [-x, -y, -z],
    [x, -y, -z],
    [x, y, -z],
    [-x, y, -z],
    [-x, -y, z],
    [x, -y, z],
    [x, y, z],
    [-x, y, z],
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return edges.map(([a, b]) => {
    const from = corners[a];
    const to = corners[b];
    if (!from || !to) return [0, 0, 0, 0, 0, 0] as const;
    return [from[0], from[1], from[2], to[0], to[1], to[2]] as const;
  });
}

/** Move a segment from object space into world space. */
export function place(
  segment: Segment,
  x: number,
  y: number,
  z: number,
  scale = 1,
): Segment {
  return [
    x + segment[0] * scale,
    y + segment[1] * scale,
    z + segment[2] * scale,
    x + segment[3] * scale,
    y + segment[4] * scale,
    z + segment[5] * scale,
  ];
}

/** Camera depth in metres for a scroll position. One viewport ≈ 2.6 m. */
export function cameraAt(scrollY: number, viewportHeight: number): number {
  const height = Math.max(1, viewportHeight);
  return (scrollY / height) * 2.6;
}

/**
 * The corridor's full length in metres. Objects sit at fixed depths, so the
 * whole document has to map onto this length rather than onto viewports —
 * otherwise the four chapter objects drift out of step with the chapters.
 */
export const ROOM_LENGTH = 44;

export function cameraAtProgress(progress: number): number {
  return Math.max(0, Math.min(1, progress)) * ROOM_LENGTH;
}

/** Linear blend used by the depth ramp and by object entrance. */
export function mix(from: number, to: number, t: number): number {
  return lerp(from, to, Math.max(0, Math.min(1, t)));
}
