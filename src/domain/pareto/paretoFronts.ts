type Point2D = { id: number; x: number; y: number };

function normalize(points: Point2D[], xMinimize: boolean, yMinimize: boolean): Point2D[] {
  return points.map((p) => ({
    id: p.id,
    x: xMinimize ? p.x : -p.x,
    y: yMinimize ? p.y : -p.y,
  }));
}

function getNonDominated(points: Point2D[]): Point2D[] {
  return points.filter(
    (p) =>
      !points.some(
        (q) => q.id !== p.id && q.x <= p.x && q.y <= p.y && (q.x < p.x || q.y < p.y),
      ),
  );
}

/** Layer Classification (non-dominated sorting). Returns map: id -> front number (1-based). */
export function layerClassification(
  points: Point2D[],
  xMinimize: boolean,
  yMinimize: boolean,
): Map<number, number> {
  const result = new Map<number, number>();
  let remaining = normalize(points, xMinimize, yMinimize);
  let front = 1;
  while (remaining.length > 0) {
    const nonDom = getNonDominated(remaining);
    for (const p of nonDom) result.set(p.id, front);
    const nonDomIds = new Set(nonDom.map((p) => p.id));
    remaining = remaining.filter((p) => !nonDomIds.has(p.id));
    front++;
  }
  return result;
}

/** 2D hypervolume indicator (staircase area). Handles min/max via normalization. */
export function computeHypervolume2D(
  points: { x: number; y: number }[],
  refX: number,
  refY: number,
  xMinimize: boolean,
  yMinimize: boolean,
): number {
  const rx = xMinimize ? refX : -refX;
  const ry = yMinimize ? refY : -refY;

  const norm = points
    .map((p, i) => ({
      id: i,
      x: xMinimize ? p.x : -p.x,
      y: yMinimize ? p.y : -p.y,
    }))
    .filter((p) => p.x < rx && p.y < ry);

  if (norm.length === 0) return 0;

  const front = getNonDominated(norm).sort((a, b) => a.x - b.x);

  let hv = 0;
  for (let i = 0; i < front.length; i++) {
    const xNext = i + 1 < front.length ? front[i + 1].x : rx;
    hv += (xNext - front[i].x) * (ry - front[i].y);
  }
  return hv;
}

/** Compute a stable reference point from the full dataset (nadir + 10% range). */
export function autoReferencePoint(
  allPoints: { x: number; y: number }[],
  xMinimize: boolean,
  yMinimize: boolean,
): { refX: number; refY: number } {
  if (allPoints.length === 0) return { refX: 1, refY: 1 };

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xRange = Math.abs(Math.max(...xs) - Math.min(...xs)) || 1;
  const yRange = Math.abs(Math.max(...ys) - Math.min(...ys)) || 1;

  const refX = xMinimize
    ? Math.max(...xs) + 0.1 * xRange
    : Math.min(...xs) - 0.1 * xRange;

  const refY = yMinimize
    ? Math.max(...ys) + 0.1 * yRange
    : Math.min(...ys) - 0.1 * yRange;

  return { refX, refY };
}
