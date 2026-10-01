type Dict = Record<string, unknown>;

type AxisName = 'x' | 'y';

export interface AxisRanges {
  x: [number, number] | null;
  y: [number, number] | null;
}

/**
 * ECharts' toolbox rectangle zoom writes through internal dataZoom components
 * whose ids look like `\0_ec_\0toolbox-dataZoom_xAxis0`.
 */
const TOOLBOX_DATA_ZOOM_ID = /toolbox-dataZoom_(x|y)Axis\d+/;

/**
 * Convert an ECharts dataZoom event into the Plotly-compatible relayout patch
 * consumed by the existing chart viewport store.
 *
 * Two payload shapes reach this function:
 *
 * - The app's own `inside` dataZooms (`zoom-x` / `zoom-y`) report percentages.
 * - The toolbox rectangle zoom reports `startValue` / `endValue` in axis data
 *   units and names its axes through the internal
 *   `toolbox-dataZoom_xAxis0` / `..._yAxis0` ids.
 *
 * The second shape used to be read as percentages with an unknown axis, which
 * produced a full-extent range on both axes: the chart snapped straight back
 * and the rectangle zoom looked like it did nothing at all.
 */
export function dataZoomRelayoutPatch(event: unknown, ranges: AxisRanges): Dict {
  const patch: Dict = {};
  const entries = zoomEventEntries(event);
  const batched = entries.length > 1 || (isRecord(event) && Array.isArray(event.batch));

  for (const source of entries) {
    const axis = zoomAxis(source);
    // A batch always names its axes, so an unlabelled entry there has to be
    // ignored rather than applied to both; only a plain `dataZoom` action
    // addresses every axis, which is also what ECharts itself does.
    const targets: AxisName[] = axis ? [axis] : batched ? [] : ['x', 'y'];

    for (const target of targets) {
      const range = axisRange(source, target === 'x' ? ranges.x : ranges.y);
      if (!range) continue;
      patch[`${target}axis.range[0]`] = range[0];
      patch[`${target}axis.range[1]`] = range[1];
    }
  }

  return patch;
}

export const CARTESIAN_AUTORANGE_PATCH: Readonly<Dict> = Object.freeze({
  'xaxis.autorange': true,
  'yaxis.autorange': true,
});

function zoomEventEntries(event: unknown): Dict[] {
  if (!isRecord(event)) return [];
  const batch = Array.isArray(event.batch) ? event.batch.filter(isRecord) : [];
  return batch.length ? batch : [event];
}

function zoomAxis(source: Dict): AxisName | null {
  const id = typeof source.dataZoomId === 'string' ? source.dataZoomId : '';
  const index = typeof source.dataZoomIndex === 'number' ? source.dataZoomIndex : null;
  if (id === 'zoom-x' || index === 0) return 'x';
  if (id === 'zoom-y' || index === 1) return 'y';
  const toolboxAxis = TOOLBOX_DATA_ZOOM_ID.exec(id);
  return toolboxAxis ? (toolboxAxis[1] as AxisName) : null;
}

/**
 * Range reported by one dataZoom entry: data-space values when the event
 * carries them, otherwise percentages resolved against the current extent.
 */
function axisRange(source: Dict, extent: [number, number] | null): [number, number] | null {
  const startValue = optionalNumber(source.startValue);
  const endValue = optionalNumber(source.endValue);
  if (startValue !== undefined && endValue !== undefined) {
    return startValue <= endValue ? [startValue, endValue] : [endValue, startValue];
  }
  if (!extent) return null;
  const start = interpolate(extent[0], extent[1], finite(source.start, 0));
  const end = interpolate(extent[0], extent[1], finite(source.end, 100));
  return start <= end ? [start, end] : [end, start];
}

function interpolate(min: number, max: number, percent: number): number {
  return min + (max - min) * Math.min(100, Math.max(0, percent)) / 100;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null;
}
