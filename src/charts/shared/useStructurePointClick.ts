/** Native ECharts bridge from a clicked chart point to the structure viewer. */
interface TraceLike {
  customdata?: unknown;
  [key: string]: unknown;
}

interface Options {
  traces: TraceLike[];
  onStructureClick: (structureId: number) => void;
  hoverDistancePx?: number;
  maxDistancePx?: number;
}

export function useStructurePointClick({ traces, onStructureClick }: Options) {
  return {
    boundaryHandlers: {},
    hoverTooltip: null,
    plotHandlers: { onStructureClick },
    plotTraces: traces,
  };
}
