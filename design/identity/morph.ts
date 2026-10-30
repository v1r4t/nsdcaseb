/**
 * Stroke morphing without a library.
 *
 * Both ends of the animation are reduced to the same number of points, and the
 * points are interpolated pairwise. That is a true morph — the ink travels —
 * rather than a cross-fade between two drawings.
 *
 * Pure maths: no DOM, no SVG APIs, so it can be tested anywhere.
 */

export type Point = [number, number];
export type Poly = Point[];

export type PathSegment =
  | { type: "L"; to: Point }
  | { type: "Q"; control: Point; to: Point };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sample a straight run. */
export function line(from: Point, to: Point, count: number): Poly {
  const points: Poly = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    points.push([lerp(from[0], to[0], t), lerp(from[1], to[1], t)]);
  }
  return points;
}

/** Sample a quadratic bezier. */
export function quad(from: Point, control: Point, to: Point, count: number): Poly {
  const points: Poly = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const u = 1 - t;
    points.push([
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ]);
  }
  return points;
}

/** Sample an ellipse arc. Angles in degrees, clockwise from +x. */
export function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  start: number,
  end: number,
  count: number,
): Poly {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const points: Poly = [];

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const angle = ((start + (end - start) * t) * Math.PI) / 180;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    points.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
  }
  return points;
}

/** Sample a path made of line and quadratic segments, evenly by segment. */
export function sampleSegments(
  start: Point,
  segments: PathSegment[],
  count: number,
): Poly {
  const per = Math.max(2, Math.ceil(count / Math.max(1, segments.length)));
  const points: Poly = [];
  let cursor = start;

  for (const segment of segments) {
    const run =
      segment.type === "L"
        ? line(cursor, segment.to, per)
        : quad(cursor, segment.control, segment.to, per);
    // Drop the first point of every run but the first: it duplicates the join.
    points.push(...(points.length === 0 ? run : run.slice(1)));
    cursor = segment.to;
  }

  return resample(points, count);
}

/** Resample a polyline to an exact point count, evenly by arc length. */
export function resample(points: Poly, count: number): Poly {
  if (points.length === 0) return [];
  if (points.length === 1) return new Array(count).fill(points[0]);

  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    total += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    lengths.push(total);
  }
  if (total === 0) return new Array(count).fill(points[0]);

  const result: Poly = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i / (count - 1)) * total;
    while (cursor < lengths.length - 2 && (lengths[cursor + 1] ?? 0) < target) cursor += 1;
    const from = points[cursor]!;
    const to = points[cursor + 1] ?? from;
    const span = (lengths[cursor + 1] ?? 0) - (lengths[cursor] ?? 0);
    const t = span === 0 ? 0 : (target - (lengths[cursor] ?? 0)) / span;
    result.push([lerp(from[0], to[0], t), lerp(from[1], to[1], t)]);
  }
  return result;
}

/** Pairwise interpolation. Both sides must be the same length. */
export function morph(from: Poly, to: Poly, t: number): Poly {
  const clamped = Math.max(0, Math.min(1, t));
  return from.map((point, index) => {
    const target = to[index] ?? point;
    return [lerp(point[0], target[0], clamped), lerp(point[1], target[1], clamped)] as Point;
  });
}

/** Serialise a polyline as an SVG path. */
export function toPath(points: Poly): string {
  if (points.length === 0) return "";
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
}

/** Concatenate two polylines, dropping the duplicated join point. */
export function concat(a: Poly, b: Poly): Poly {
  return [...a, ...b.slice(1)];
}
