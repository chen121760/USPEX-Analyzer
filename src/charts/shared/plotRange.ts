import { useCallback, useState } from 'react';
import type { PlotLayout } from './plotTypes';

type LayoutPatch = Record<string, unknown>;

const DEFAULT_CARTESIAN_AXES = ['xaxis', 'yaxis'] as const;

interface AxisRangeUpdate {
  layoutPatch: LayoutPatch;
  clearedAxes: string[];
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

export function usePlotViewport(axisNames: readonly string[] = DEFAULT_CARTESIAN_AXES) {
  const [viewportLayout, setViewportLayout] = useState<Partial<PlotLayout>>({});

  const handleRelayout = useCallback((event: object) => {
    const { layoutPatch, clearedAxes } = parseCartesianAxisRangeUpdate(event, axisNames);
    const hasLayoutPatch = Object.keys(layoutPatch).length > 0;
    const hasClearedAxes = clearedAxes.length > 0;

    if (!hasLayoutPatch && !hasClearedAxes) return false;

    setViewportLayout((current: Partial<PlotLayout>) => {
      const next: LayoutPatch = { ...current };

      for (const axisName of clearedAxes) {
        delete next[axisName];
      }

      return {
        ...next,
        ...layoutPatch,
      } as Partial<PlotLayout>;
    });

    return true;
  }, [axisNames]);

  const resetViewport = useCallback(() => {
    setViewportLayout({});
  }, []);

  return {
    viewportLayout,
    handleRelayout,
    resetViewport,
  };
}
