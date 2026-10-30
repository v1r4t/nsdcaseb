export type Point = { x: number; y: number };

/** Small deterministic PRNG so a drawing looks hand-made but never changes. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function plotPoints(count: number, width: number, height: number, seed = 7): Point[] {
  const random = mulberry32(seed);
  const top = height * 0.15;
  const band = height * 0.7;
  return Array.from({ length: count }, (_, i) => ({
    x: count === 1 ? width / 2 : (i / (count - 1)) * width,
    y: top + random() * band,
  }));
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildPlotPath(points: Point[], seed = 7): string {
  if (points.length === 0) return "";
  const random = mulberry32(seed + 101);
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const gap = b.x - a.x;
    const wobble = () => (random() - 0.5) * Math.min(28, gap * 0.12);
    const c1x = a.x + gap * 0.4;
    const c1y = a.y + wobble();
    const c2x = a.x + gap * 0.6;
    const c2y = b.y + wobble();
    d += ` C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}
