import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/** Renderer-neutral trace vocabulary consumed by the ECharts adapter. */
export type PlotTrace = Record<string, unknown>;
export type PlotData = PlotTrace[];
export type PlotLayout = Record<string, unknown>;
export type PlotConfig = Record<string, unknown>;

export interface PlotClickEventLike {
  points?: Array<{
    customdata?: unknown;
    curveNumber?: number;
    pointIndex?: number;
    pointNumber?: number;
    data?: { customdata?: unknown };
  }>;
}

export interface PlotFrameProps {
  data: PlotData;
  layout?: PlotLayout;
  config?: PlotConfig;
  revision?: number;
  style?: CSSProperties;
  className?: string;
  boundaryClassName?: string;
  boundaryStyle?: CSSProperties;
  boundaryHandlers?: PlotFrameBoundaryHandlers;
  hoverTooltip?: ReactNode;
  /** Absolutely positioned layer drawn over the chart (zoom preview, chips…). */
  overlay?: ReactNode;
  useResizeHandler?: boolean;
  onInitialized?: (figure: unknown, chart: unknown) => void;
  onUpdate?: (figure: unknown, chart: unknown) => void;
  onClick?: (event: PlotClickEventLike) => void;
  onRelayout?: (event: Record<string, unknown>) => void;
  /** Toolbox "back" button — step the chart's own viewport history backwards. */
  onUndo?: () => void;
  onStructureClick?: (structureId: number) => void;
  editableAxisTitles?: { x: string; y: string; z?: string };
  axisTitleEditHint?: string;
  onAxisTitleDoubleClick?: (axis: 'x' | 'y' | 'z') => void;
}

export type PlotFrameBoundaryHandlers = Pick<
  HTMLAttributes<HTMLDivElement>,
  'onClickCapture' | 'onPointerDownCapture' | 'onPointerLeave' | 'onPointerMoveCapture'
>;
