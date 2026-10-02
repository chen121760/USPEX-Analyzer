/** Equilateral sub-triangles in the original composition coordinate system. */
export type Point2D = readonly [number, number];
export interface TernaryRanges { x: [number, number]; y: [number, number] }
export const TERNARY_VERTICES: readonly Point2D[] = [[0, 0], [0.5, Math.sqrt(3) / 2], [1, 0]];
export const BASE_TERNARY_RANGES: TernaryRanges = { x: [-0.12, 1.12], y: [-0.12, Math.sqrt(3) / 2 + 0.12] };
export const MIN_TERNARY_SCALE = 0.05;
const PADDING = 0.12;
const HEIGHT = Math.sqrt(3) / 2;
const CENTRE: Point2D = [0.5, HEIGHT / 3];

export function compositionAtTernaryPoint(point: Point2D): [number, number, number] {
  const b = point[1] / HEIGHT;
  return [1 - point[0] - b / 2, b, point[0] - b / 2];
}

function constrainCentre(point: Point2D, scale: number): Point2D {
  if (scale >= 1) return CENTRE;
  const safe: Point2D = point.every(Number.isFinite) ? point : CENTRE;
  const minimum = scale / 3;
  if (compositionAtTernaryPoint(safe).every((n) => n >= minimum - 1e-12)) return safe;
  const inner = TERNARY_VERTICES.map((v) => [CENTRE[0] + (1 - scale) * (v[0] - CENTRE[0]), CENTRE[1] + (1 - scale) * (v[1] - CENTRE[1])] as Point2D);
  let closest: Point2D = CENTRE;
  let distance = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = inner[i], b = inner[(i + 1) % 3];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const fraction = Math.max(0, Math.min(1, ((safe[0] - a[0]) * dx + (safe[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    const candidate: Point2D = [a[0] + fraction * dx, a[1] + fraction * dy];
    const nextDistance = Math.hypot(safe[0] - candidate[0], safe[1] - candidate[1]);
    if (nextDistance < distance) { closest = candidate; distance = nextDistance; }
  }
  return closest;
}

export function ternaryViewport(centre: Point2D, scale: number): TernaryRanges {
  const size = Number.isFinite(scale) ? Math.min(1, Math.max(MIN_TERNARY_SCALE, scale)) : 1;
  const middle = constrainCentre(centre, size);
  return {
    x: [middle[0] - size * (0.5 + PADDING), middle[0] + size * (0.5 + PADDING)],
    y: [middle[1] - size * (HEIGHT / 3 + PADDING), middle[1] + size * (2 * HEIGHT / 3 + PADDING)],
  };
}
export function ternaryViewportScale(ranges: TernaryRanges): number { return (ranges.x[1] - ranges.x[0]) / (1 + 2 * PADDING); }
export function ternaryViewportCentre(ranges: TernaryRanges): [number, number] {
  return [(ranges.x[0] + ranges.x[1]) / 2, ranges.y[0] + ternaryViewportScale(ranges) * (HEIGHT / 3 + PADDING)];
}
export function ternaryViewportVertices(ranges: TernaryRanges): Point2D[] {
  const centre = ternaryViewportCentre(ranges), scale = ternaryViewportScale(ranges);
  return TERNARY_VERTICES.map((v) => [centre[0] + scale * (v[0] - CENTRE[0]), centre[1] + scale * (v[1] - CENTRE[1])]);
}
export function zoomTernaryViewport(ranges: TernaryRanges, factor: number): TernaryRanges {
  return ternaryViewport(ternaryViewportCentre(ranges), ternaryViewportScale(ranges) * factor);
}
export function panTernaryViewport(ranges: TernaryRanges, delta: Point2D): TernaryRanges {
  const centre = ternaryViewportCentre(ranges);
  return ternaryViewport([centre[0] + delta[0], centre[1] + delta[1]], ternaryViewportScale(ranges));
}
/** Opposite corners of the dragged bounding box define an upright equilateral selection. */
export function selectTernaryViewport(start: Point2D, end: Point2D): TernaryRanges {
  const scale = Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]) / HEIGHT);
  return ternaryViewport([(start[0] + end[0]) / 2, Math.min(start[1], end[1]) + HEIGHT * scale / 3], scale);
}
export function isInTernaryViewport(point: Point2D, ranges: TernaryRanges): boolean {
  const centre = compositionAtTernaryPoint(ternaryViewportCentre(ranges));
  const scale = ternaryViewportScale(ranges);
  return compositionAtTernaryPoint(point).every((value, i) => value >= centre[i] - scale / 3 - 1e-10);
}
export function ternaryRangePatch(ranges: TernaryRanges): Record<string, unknown> { return { 'xaxis.range': ranges.x, 'yaxis.range': ranges.y }; }

/** Clip actual tie-line segments against the composition half-planes; no painted mask is needed. */
export function clipTernaryEdges(edges: { p1: [number, number]; p2: [number, number] }[], ranges: TernaryRanges) {
  const centre = compositionAtTernaryPoint(ternaryViewportCentre(ranges));
  const scale = ternaryViewportScale(ranges);
  const clipped: { p1: [number, number]; p2: [number, number] }[] = [];
  for (const edge of edges) {
    const start = compositionAtTernaryPoint(edge.p1), end = compositionAtTernaryPoint(edge.p2);
    let lower = 0, upper = 1;
    for (let i = 0; i < 3; i++) {
      const value = start[i] - (centre[i] - scale / 3), delta = end[i] - start[i];
      if (Math.abs(delta) < 1e-12) { if (value < -1e-10) { lower = 1; upper = 0; break; } }
      else if (delta > 0) lower = Math.max(lower, -value / delta);
      else upper = Math.min(upper, -value / delta);
    }
    if (lower > upper + 1e-10) continue;
    const at = (t: number): [number, number] => [edge.p1[0] + t * (edge.p2[0] - edge.p1[0]), edge.p1[1] + t * (edge.p2[1] - edge.p1[1])];
    clipped.push({ p1: at(lower), p2: at(upper) });
  }
  return clipped;
}
