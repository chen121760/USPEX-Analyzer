import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import type { ThemeName } from '@/theme/themeTypes';
import type { PlotConfig, PlotLayout } from './plotTypes';

export type PlotThemeName = ThemeName;

export const DEFAULT_PLOTLY_CONFIG: PlotConfig = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  scrollZoom: false,
  doubleClick: 'reset',
};

export const DEFAULT_PLOTLY_LAYOUT: Partial<PlotLayout> = {
  dragmode: 'zoom',
};

export function mergePlotlyConfig(config?: PlotConfig): PlotConfig {
  return {
    ...DEFAULT_PLOTLY_CONFIG,
    ...config,
  };
}

export function mergePlotlyLayout(layout?: PlotLayout): PlotLayout {
  return {
    ...DEFAULT_PLOTLY_LAYOUT,
    ...layout,
  } as PlotLayout;
}

export function getPlotAxisStyle(theme: PlotThemeName) {
  const plotTheme = getPlotlyTheme(theme);

  return {
    tickfont: { size: 11, color: plotTheme.tickColor },
    gridcolor: plotTheme.gridColor,
    zerolinecolor: plotTheme.zerolineColor,
    linecolor: plotTheme.lineColor,
  };
}

export function getPlotAxisTitleFont(theme: PlotThemeName, size = 13) {
  return {
    size,
    color: getPlotlyTheme(theme).axisTitleColor,
  };
}

export function getPlotLegend(theme: PlotThemeName, overrides: Record<string, unknown> = {}) {
  const isDark = theme === 'dark';

  return {
    bgcolor: isDark ? 'rgba(24, 24, 37, 0.86)' : 'rgba(255, 255, 255, 0.78)',
    bordercolor: isDark ? '#313244' : '#dce0e8',
    font: { size: 11, color: getPlotlyTheme(theme).legendColor },
    ...overrides,
  };
}
