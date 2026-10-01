/**
 * Triangle-shaped zoom windows for the ternary phase diagram.
 *
 * A rectangle brush cannot be drawn on a triangle without either cutting the
 * triangle off or stretching it.  Instead the zoom target is always an upright
 * equilateral sub-triangle of the diagram, so the frame that comes out of a
 * zoom looks exactly like the initial one: same margins, same equilateral
 * shape, just magnified.
 *
 * The gesture is a magnifier: press where the new view should be centred, drag
 * outwards until the triangle covers the region to keep, release.  The pressed
 * point becomes the centroid of the window.
 */

export type Point2D = readonly [number, number];

/** Vertices of the unit ternary triangle in plot coordinates. */
export const TERNARY_VERTICES: readonly Point2D[] = [
  [0, 0],
  [0.5, Math.sqrt(3) / 2],
  [1, 0],
];

/** Centroid of the unit triangle. */
export const TERNARY_CENTROID: Point2D = [0.5, Math.sqrt(3) / 6];

/**
 * Margin the ternary layouts keep around the triangle: `xaxis.range` is
 * `[-0.12, 1.12]` and `yaxis.range` is `[-0.12, sqrt(3)/2 + 0.12]`.
 */
export const TERNARY_PADDING = 0.12;

/** Deepest zoom: the window covers 5% of the diagram. */
export const MIN_TERNARY_SCALE = 0.05;

/** Inradius of the unit triangle: dragging this far from the anchor fills it. */
const UNIT_INRADIUS = Math.sqrt(3) / 6;

export interface TernaryZoomWindow {
  /** Data-space vertices of the zoom triangle (upright, same orientation). */
  vertices: [Point2D, Point2D, Point2D];
  /** Axis ranges that draw that triangle in the same frame as the full one. */
  ranges: { x: [number, number]; y: [number, number] };
  /** 1 = whole diagram, smaller = deeper zoom. */
  scale: number;
}

/**
 * Upright equilateral sub-triangle centred on `anchor`, `scale` times the size
 * of the diagram, together with the axis ranges that render it.
 */
export function ternaryZoomWindow(anchor: Point2D, scale: number): TernaryZoomWindow {
  const clampedScale = clamp(scale, MIN_TERNARY_SCALE, 1);
  const centre = clampToTriangle(anchor, innerTriangle(clampedScale));
  const place = (vertex: Point2D): Point2D => [
    centre[0] + clampedScale * (vertex[0] - TERNARY_CENTROID[0]),
    centre[1] + clampedScale * (vertex[1] - TERNARY_CENTROID[1]),
  ];
  const vertices: [Point2D, Point2D, Point2D] = [
    place(TERNARY_VERTICES[0]),
    place(TERNARY_VERTICES[1]),
    place(TERNARY_VERTICES[2]),
  ];

  const xs = vertices.map((vertex) => vertex[0]);
  const ys = vertices.map((vertex) => vertex[1]);
  // Scale the margin with the window so a zoom keeps the initial framing.
  const padding = TERNARY_PADDING * clampedScale;

  return {
    vertices,
    scale: clampedScale,
    ranges: {
      x: [Math.min(...xs) - padding, Math.max(...xs) + padding],
      y: [Math.min(...ys) - padding, Math.max(...ys) + padding],
    },
  };
}

/**
 * Window size implied by dragging `distance` data units away from the anchor.
 * Moving by the triangle's inradius opens the window to the whole diagram.
 */
export function ternaryZoomScale(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return MIN_TERNARY_SCALE;
  return clamp(distance / UNIT_INRADIUS, MIN_TERNARY_SCALE, 1);
}

/** True when the point lies inside the diagram itself (not in its margin). */
export function isInsideTernary(point: Point2D, padding = 0): boolean {
  return isInsideTriangle(point, TERNARY_VERTICES, padding);
}

/** Clamp a point into a triangle, keeping points that are already inside. */
export function clampToTriangle(point: Point2D, triangle: readonly Point2D[]): Point2D {
  if (isInsideTriangle(point, triangle)) return [point[0], point[1]];

  const [a, b, c] = triangle as [Point2D, Point2D, Point2D];
  const v0: Point2D = [b[0] - a[0], b[1] - a[1]];
  const v1: Point2D = [c[0] - a[0], c[1] - a[1]];
  const v2: Point2D = [point[0] - a[0], point[1] - a[1]];
  const d00 = dot(v0, v0);
  const d01 = dot(v0, v1);
  const d11 = dot(v1, v1);
  const d20 = dot(v2, v0);
  const d21 = dot(v2, v1);
  const denominator = d00 * d11 - d01 * d01;

  if (!Number.isFinite(denominator) || Math.abs(denominator) < Number.EPSILON) {
    return [a[0], a[1]];
  }

  const v = clamp((d11 * d20 - d01 * d21) / denominator, 0, 1);
  const w = clamp((d00 * d21 - d01 * d20) / denominator, 0, 1);
  const u = clamp(1 - v - w, 0, 1);
  const total = u + v + w || 1;

  return [
    (u * a[0] + v * b[0] + w * c[0]) / total,
    (u * a[1] + v * b[1] + w * c[1]) / total,
  ];
}

/** Triangle a window of the given scale may be centred in, without leaving the diagram. */
function innerTriangle(scale: number): [Point2D, Point2D, Point2D] {
  const shrink = 1 - clamp(scale, 0, 1);
  const place = (vertex: Point2D): Point2D => [
    TERNARY_CENTROID[0] + shrink * (vertex[0] - TERNARY_CENTROID[0]),
    TERNARY_CENTROID[1] + shrink * (vertex[1] - TERNARY_CENTROID[1]),
  ];
  return [place(TERNARY_VERTICES[0]), place(TERNARY_VERTICES[1]), place(TERNARY_VERTICES[2])];
}

function isInsideTriangle(point: Point2D, triangle: readonly Point2D[], padding = 0): boolean {
  const [a, b, c] = triangle as [Point2D, Point2D, Point2D];
  const area = cross(a, b, c);

  if (Math.abs(area) < Number.EPSILON) return false;

  const sign = area > 0 ? 1 : -1;
  const edge = (from: Point2D, to: Point2D): number => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    return sign * cross(from, to, point) / length;
  };

  return edge(a, b) >= -padding && edge(b, c) >= -padding && edge(c, a) >= -padding;
}

function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function dot(a: Point2D, b: Point2D): number {
  return a[0] * b[0] + a[1] * b[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
