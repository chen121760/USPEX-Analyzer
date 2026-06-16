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

declare module 'react-plotly.js/factory' {
  import type Plot from 'react-plotly.js';
  import type * as Plotly from 'plotly.js-dist-min';

  export default function createPlotlyComponent(plotly: typeof Plotly): typeof Plot;
}

declare module 'plotly.js-dist-min' {
  import type * as Plotly from 'plotly.js';

  const PlotlyModule: typeof Plotly;
  export default PlotlyModule;
  export * from 'plotly.js';
}
