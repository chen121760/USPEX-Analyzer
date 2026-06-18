/**
 * Shared Plotly click helpers for resolving structure IDs from chart events.
 *
 * Plotly can expose `customdata` directly on a clicked point or only on the
 * source trace with a point index. Keeping this logic here prevents each chart
 * page from making slightly different assumptions about the event shape.
 */

interface PlotClickPoint {
  customdata?: unknown;
  curveNumber?: number;
  pointIndex?: number;
  pointNumber?: number;
  data?: {
    customdata?: unknown;
  };
}

export interface PlotClickEvent {
  points?: PlotClickPoint[];
}

export interface PlotTraceLike {
  customdata?: unknown;
}

export function getStructureIdFromTracePoint(trace: PlotTraceLike, pointIndex: number): number | null {
  return coerceStructureId(resolveIndexedCustomData(trace.customdata, pointIndex));
}

export function getStructureIdFromPlotClick(
  event: PlotClickEvent,
  traces: PlotTraceLike[] = [],
): number | null {
  for (const point of event.points ?? []) {
    const id = coerceStructureId(getPointCustomData(point, traces));
    if (id !== null) return id;
  }

  return null;
}

function getPointCustomData(point: PlotClickPoint, traces: PlotTraceLike[]): unknown {
  const index = point.pointIndex ?? point.pointNumber;
  const directCustomData = resolveIndexedCustomData(point.customdata, index);

  if (directCustomData !== undefined && directCustomData !== null) {
    return directCustomData;
  }

  const eventTraceCustomData = resolveIndexedCustomData(point.data?.customdata, index);

  if (eventTraceCustomData !== undefined && eventTraceCustomData !== null) {
    return eventTraceCustomData;
  }

  if (typeof point.curveNumber === 'number') {
    return resolveIndexedCustomData(traces[point.curveNumber]?.customdata, index);
  }

  return undefined;
}

function resolveIndexedCustomData(customData: unknown, index?: number): unknown {
  if (typeof index === 'number' && Array.isArray(customData) && index in customData) {
    return customData[index];
  }

  return customData;
}

function coerceStructureId(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = coerceStructureId(entry);
      if (id !== null) return id;
    }

    return null;
  }

  const candidate = value;

  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === 'object' && candidate !== null) {
    const record = candidate as Record<string, unknown>;
    return coerceStructureId(record.structureId ?? record.structureID ?? record.id ?? record.eaId);
  }

  if (typeof candidate === 'string' && candidate.trim() !== '') {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
