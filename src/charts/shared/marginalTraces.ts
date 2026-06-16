import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import type { ThemeName } from '@/theme/themeTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;

function silvermanBandwidth(values: number[], minBandwidth = 0): number {
  const n = values.length;
  if (n < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return Math.max(0.9 * std * Math.pow(n, -0.2), minBandwidth);
}

function evalKDE(values: number[], bw: number, pts: number[]): number[] {
  const inv = 1 / (values.length * bw * Math.sqrt(2 * Math.PI));
  return pts.map((x) =>
    inv * values.reduce((acc, v) => acc + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0),
  );
}

function linspace(lo: number, hi: number, n: number): number[] {
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + i * step);
}

/** Build X-marginal traces (histogram + KDE) for subplot xaxis2/yaxis2. */
export function buildXMarginalTraces(
  xVals: number[],
  bins: number,
  label: string,
  minBandwidth = 0,
  theme: ThemeName = 'light',
): PlotlyData[] {
  if (xVals.length < 2) return [];
  const plotTheme = getPlotlyTheme(theme);
  const bw = silvermanBandwidth(xVals, minBandwidth);
  const lo = Math.min(...xVals);
  const hi = Math.max(...xVals);
  const pts = linspace(lo, hi, 200);
  const density = evalKDE(xVals, bw, pts);

  return [
    {
      x: xVals,
      type: 'histogram',
      nbinsx: bins,
      histnorm: 'probability density',
      marker: { color: plotTheme.marginalXFill, line: { color: plotTheme.marginalXLine, width: 1 } },
      name: `${label} dist`,
      showlegend: false,
      xaxis: 'x',
      yaxis: 'y2',
      hoverinfo: 'skip',
    },
    {
      x: pts,
      y: density,
      type: 'scatter',
      mode: 'lines',
      line: { color: plotTheme.marginalXLine, width: 2 },
      name: `${label} KDE`,
      showlegend: false,
      xaxis: 'x',
      yaxis: 'y2',
      hoverinfo: 'skip',
    },
  ];
}

/** Build Y-marginal traces (horizontal histogram + KDE) for subplot xaxis3/yaxis3. */
export function buildYMarginalTraces(
  yVals: number[],
  bins: number,
  label: string,
  minBandwidth = 0,
  theme: ThemeName = 'light',
): PlotlyData[] {
  if (yVals.length < 2) return [];
  const plotTheme = getPlotlyTheme(theme);
  const bw = silvermanBandwidth(yVals, minBandwidth);
  const lo = Math.min(...yVals);
  const hi = Math.max(...yVals);
  const pts = linspace(lo, hi, 200);
  const density = evalKDE(yVals, bw, pts);

  return [
    {
      y: yVals,
      type: 'histogram',
      nbinsy: bins,
      histnorm: 'probability density',
      orientation: 'h',
      marker: { color: plotTheme.marginalYFill, line: { color: plotTheme.marginalYLine, width: 1 } },
      name: `${label} dist`,
      showlegend: false,
      xaxis: 'x3',
      yaxis: 'y',
      hoverinfo: 'skip',
    },
    {
      x: density,
      y: pts,
      type: 'scatter',
      mode: 'lines',
      line: { color: plotTheme.marginalYLine, width: 2 },
      name: `${label} KDE`,
      showlegend: false,
      xaxis: 'x3',
      yaxis: 'y',
      hoverinfo: 'skip',
    },
  ];
}
