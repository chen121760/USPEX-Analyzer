import { useCallback, useRef, useState } from 'react';
import type { PlotLayout } from './plotTypes';

type LayoutPatch = Record<string, unknown>;

const DEFAULT_CARTESIAN_AXES = ['xaxis', 'yaxis'] as const;

interface AxisRangeUpdate {
  layoutPatch: LayoutPatch;
  clearedAxes: string[];
}

/**
 * Apply viewport-only axis ranges without replacing the axis declarations.
 *
 * A shallow `{ ...layout, ...viewportLayout }` drops everything else on the
 * affected axes.  That is especially visible on ternary charts: the first
 * zoom used to remove `scaleanchor`, grid visibility and tick visibility, so
 * the triangle stretched into the full rectangular canvas.
 */
export function mergePlotViewport(
  layout: PlotLayout,
  viewportLayout: Partial<PlotLayout>,
): PlotLayout {
  const merged: PlotLayout = { ...layout, ...viewportLayout };

  for (const [key, value] of Object.entries(viewportLayout)) {
    if (!/^[xyz]axis\d*$/.test(key) || !isObject(value)) continue;
    const baseValue = layout[key];
    merged[key] = {
      ...(isObject(baseValue) ? baseValue : {}),
      ...value,
    };
  }

  return merged;
}

export function parseCartesianAxisRangeUpdate(
  event: object,
  axisNames: readonly string[] = DEFAULT_CARTESIAN_AXES,
): AxisRangeUpdate {
  const relayout = event as Record<string, unknown>;
  const layoutPatch: LayoutPatch = {};
  const clearedAxes: string[] = [];

  for (const axisName of axisNames) {
    const range = relayout[`${axisName}.range`];
    const start = relayout[`${axisName}.range[0]`];
    const end = relayout[`${axisName}.range[1]`];
    const autorange = relayout[`${axisName}.autorange`];

    if (autorange === true) {
      clearedAxes.push(axisName);
      continue;
    }

    if (Array.isArray(range) && range.length >= 2) {
      layoutPatch[axisName] = { range: [range[0], range[1]] };
      continue;
    }

    if (start !== undefined && end !== undefined) {
      layoutPatch[axisName] = { range: [start, end] };
    }
  }

  return { layoutPatch, clearedAxes };
}

/** How many zoom steps the toolbox "back" icon can walk back through. */
const VIEWPORT_HISTORY_LIMIT = 20;

export function usePlotViewport(axisNames: readonly string[] = DEFAULT_CARTESIAN_AXES) {
  const [viewportLayout, setViewportLayout] = useState<Partial<PlotLayout>>({});
  // ECharts' own toolbox history is inert here: the window it replays is
  // resolved against axis extents that this app rewrites on every zoom, so the
  // app keeps the stack itself and the "back" icon drives `undoViewport`.
  const pastRef = useRef<Array<Partial<PlotLayout>>>([]);
  const currentRef = useRef<Partial<PlotLayout>>(viewportLayout);
  currentRef.current = viewportLayout;

  const applyViewport = useCallback((next: Partial<PlotLayout>) => {
    currentRef.current = next;
    setViewportLayout(next);
  }, []);

  const handleRelayout = useCallback((event: object) => {
    const { layoutPatch, clearedAxes } = parseCartesianAxisRangeUpdate(event, axisNames);
    const hasLayoutPatch = Object.keys(layoutPatch).length > 0;
    const hasClearedAxes = clearedAxes.length > 0;

    if (!hasLayoutPatch && !hasClearedAxes) return false;

    const current = currentRef.current;

    if (hasClearedAxes) {
      // "Back to the initial view" (toolbox restore, blank double-click) drops
      // the history instead of becoming a step in it.
      pastRef.current = [];
      const next: LayoutPatch = { ...current, ...layoutPatch };

      for (const axisName of clearedAxes) {
        delete next[axisName];
      }

      if (hasSameRanges(current, next)) return false;
      applyViewport(next as Partial<PlotLayout>);
      return true;
    }

    const next = { ...current, ...layoutPatch } as Partial<PlotLayout>;
    // A patch that resolves to the ranges already on screen (the toolbox "back"
    // icon replays the current window that way) must not add a history step.
    if (hasSameRanges(current, next)) return false;

    pastRef.current = [...pastRef.current, current].slice(-VIEWPORT_HISTORY_LIMIT);
    applyViewport(next);
    return true;
  }, [applyViewport, axisNames]);

  const undoViewport = useCallback(() => {
    const past = pastRef.current;

    if (!past.length) return false;

    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    applyViewport(previous);
    return true;
  }, [applyViewport]);

  const resetViewport = useCallback(() => {
    pastRef.current = [];
    applyViewport({});
  }, [applyViewport]);

  return {
    viewportLayout,
    handleRelayout,
    undoViewport,
    resetViewport,
  };
}

/** Compare two viewport patches by the axis ranges they carry. */
function hasSameRanges(a: Partial<PlotLayout>, b: Partial<PlotLayout>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    const left = rangeOf(a[key]);
    const right = rangeOf(b[key]);
    if (!left && !right) continue;
    if (!left || !right) return false;
    if (left[0] !== right[0] || left[1] !== right[1]) return false;
  }

  return true;
}

function rangeOf(value: unknown): [number, number] | null {
  const range = isObject(value) ? value.range : null;
  return Array.isArray(range) && range.length >= 2 && typeof range[0] === 'number' && typeof range[1] === 'number'
    ? [range[0], range[1]]
    : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
