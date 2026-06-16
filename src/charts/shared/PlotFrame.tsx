import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import * as createPlotlyComponentModule from 'react-plotly.js/factory';
import * as PlotlyModule from 'plotly.js-dist-min';
import { PlotlyInteractionBoundary } from './PlotlyInteractionBoundary';
import { mergePlotlyConfig, mergePlotlyLayout } from './plotTheme';
import type { PlotFrameBoundaryHandlers, PlotProps } from './plotTypes';

type PlotInitializedHandler = NonNullable<PlotProps['onInitialized']>;
type PlotUpdateHandler = NonNullable<PlotProps['onUpdate']>;
type PlotFigure = Parameters<PlotInitializedHandler>[0];
type PlotGraphDiv = Parameters<PlotInitializedHandler>[1];

type PlotFactory = (plotly: PlotlyResizeRuntime) => typeof import('react-plotly.js').default;

interface PlotlyResizeRuntime {
  Plots?: {
    resize?: (graphDiv: HTMLElement) => void | Promise<unknown>;
  };
}

interface PlotlyResizeRuntimeModule extends PlotlyResizeRuntime {
  default?: PlotlyResizeRuntime;
}

const createPlotlyComponent = unwrapDefault(createPlotlyComponentModule) as PlotFactory;
const Plotly = unwrapDefault(PlotlyModule) as PlotlyResizeRuntime;
const Plot = createPlotlyComponent(Plotly);

let plotlyResizeRuntimePromise: Promise<PlotlyResizeRuntimeModule> | null = null;

interface PlotFrameProps extends PlotProps {
  boundaryClassName?: string;
  boundaryHandlers?: PlotFrameBoundaryHandlers;
  boundaryStyle?: CSSProperties;
  hoverTooltip?: ReactNode;
}

const DEFAULT_PLOT_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
};

export function PlotFrame({
  boundaryClassName,
  boundaryHandlers,
  boundaryStyle,
  className,
  config,
  hoverTooltip,
  layout,
  onInitialized,
  onUpdate,
  style,
  ...plotProps
}: PlotFrameProps) {
  const [graphDiv, setGraphDiv] = useState<HTMLElement | null>(null);
  const mergedConfig = useMemo(() => mergePlotlyConfig(config), [config]);
  const mergedLayout = useMemo(() => mergePlotlyLayout(layout), [layout]);
  const plotStyle = useMemo(() => ({ ...DEFAULT_PLOT_STYLE, ...style }), [style]);

  const handleInitialized: PlotInitializedHandler = useCallback((figure: PlotFigure, nextGraphDiv: PlotGraphDiv) => {
    setGraphDiv(nextGraphDiv);
    onInitialized?.(figure, nextGraphDiv);
  }, [onInitialized]);

  const handleUpdate: PlotUpdateHandler = useCallback((figure: PlotFigure, nextGraphDiv: PlotGraphDiv) => {
    setGraphDiv(nextGraphDiv);
    onUpdate?.(figure, nextGraphDiv);
  }, [onUpdate]);

  useEffect(() => {
    if (!graphDiv || typeof ResizeObserver === 'undefined') return;

    let frameId: number | null = null;
    const scheduleResize = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        resizePlot(graphDiv);
      });
    };

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(graphDiv);
    if (graphDiv.parentElement) resizeObserver.observe(graphDiv.parentElement);

    scheduleResize();

    return () => {
      resizeObserver.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [graphDiv]);

  return (
    <PlotlyInteractionBoundary
      className={boundaryClassName}
      style={boundaryStyle}
      {...boundaryHandlers}
    >
      <Plot
        {...plotProps}
        className={className}
        config={mergedConfig}
        layout={mergedLayout}
        onInitialized={handleInitialized}
        onUpdate={handleUpdate}
        style={plotStyle}
      />
      {hoverTooltip}
    </PlotlyInteractionBoundary>
  );
}

function resizePlot(graphDiv: HTMLElement) {
  plotlyResizeRuntimePromise ??= import('plotly.js-dist-min') as Promise<PlotlyResizeRuntimeModule>;
  void plotlyResizeRuntimePromise.then((runtimeModule) => {
    if (!document.body.contains(graphDiv)) return;
    const runtime = runtimeModule.default ?? runtimeModule;
    const resize = runtime.Plots?.resize;
    if (resize) void resize(graphDiv);
  });
}

function unwrapDefault<T>(module: T | { default?: T }): T {
  let current = module as T | { default?: T };
  while (
    current &&
    typeof current === 'object' &&
    'default' in current &&
    current.default
  ) {
    current = current.default;
  }
  return current as T;
}
