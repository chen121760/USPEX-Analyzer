import type { ComponentProps, HTMLAttributes } from 'react';
import type Plot from 'react-plotly.js';

export type PlotProps = ComponentProps<typeof Plot>;
export type PlotConfig = NonNullable<PlotProps['config']>;
export type PlotData = PlotProps['data'];
export type PlotLayout = NonNullable<PlotProps['layout']>;

export type PlotFrameBoundaryHandlers = Pick<
  HTMLAttributes<HTMLDivElement>,
  'onClickCapture' | 'onPointerDownCapture' | 'onPointerLeave' | 'onPointerMoveCapture'
>;
