declare module 'react-plotly.js' {
  import * as Plotly from 'plotly.js-dist-min';
  import * as React from 'react';

  export interface PlotPoint {
    customdata?: unknown;
  }

  export interface PlotMouseEvent {
    points?: PlotPoint[];
  }

  interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    frames?: Plotly.Frame[];
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: Plotly.Figure, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: Plotly.Figure, graphDiv: HTMLElement) => void;
    onPurge?: (figure: Plotly.Figure, graphDiv: HTMLElement) => void;
    onClick?: (event: PlotMouseEvent) => void;
    onSelected?: (event: Plotly.PlotSelectionEvent) => void;
    onClick?: (event: Plotly.PlotMouseEvent) => void;
    onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
    revision?: number;
    useResizeHandler?: boolean;
  }

  const Plot: React.FC<PlotParams>;
  export default Plot;
}

declare module 'plotly.js-dist-min' {
  export * from 'plotly.js';
}
