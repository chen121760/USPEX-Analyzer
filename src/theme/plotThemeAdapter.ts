import type { ThemeName } from './themeTypes';

export interface PlotThemeTokens {
  plotBg: string;
  paperBg: string;
  titleColor: string;
  axisTitleColor: string;
  tickColor: string;
  gridColor: string;
  zerolineColor: string;
  lineColor: string;
  legendColor: string;
  annotationColor: string;
  structureLineColor: string;
  categoricalColors: string[];
  frontColors: string[];
  defaultMarkerColor: string;
  referenceLineColor: string;
  selectedMarkerFill: string;
  selectedMarkerLine: string;
  marginalXFill: string;
  marginalXLine: string;
  marginalYFill: string;
  marginalYLine: string;
}

export function getPlotlyTheme(theme: ThemeName): PlotThemeTokens {
  const isDark = theme === 'dark';

  return {
    plotBg: isDark ? '#181825' : '#ffffff',
    paperBg: isDark ? '#181825' : '#ffffff',
    titleColor: isDark ? '#f5e0dc' : '#0f172a',
    axisTitleColor: isDark ? '#bac2de' : '#334155',
    tickColor: isDark ? '#a6adc8' : '#64748b',
    gridColor: isDark ? '#313244' : '#e2e8f0',
    zerolineColor: isDark ? '#45475a' : '#cbd5e1',
    lineColor: isDark ? '#585b70' : '#94a3b8',
    legendColor: isDark ? '#cdd6f4' : '#334155',
    annotationColor: isDark ? '#cdd6f4' : '#334155',
    structureLineColor: isDark ? '#cdd6f4' : '#1e293b',
    categoricalColors: isDark
      ? ['#89b4fa', '#f5c2e7', '#fab387', '#94e2d5', '#cba6f7', '#f9e2af', '#89dceb', '#bac2de', '#f38ba8', '#a6e3a1']
      : ['#6366f1', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6', '#eab308', '#06b6d4', '#6b7280', '#dc2626', '#16a34a'],
    frontColors: isDark
      ? ['#f38ba8', '#f9e2af', '#a6e3a1', '#89b4fa', '#cba6f7', '#f5c2e7', '#89dceb', '#bac2de']
      : ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280'],
    defaultMarkerColor: isDark ? '#89b4fa' : '#6366f1',
    referenceLineColor: isDark ? '#bac2de' : '#374151',
    selectedMarkerFill: isDark ? '#1e1e2e' : '#ffffff',
    selectedMarkerLine: isDark ? '#cdd6f4' : '#1e293b',
    marginalXFill: isDark ? 'rgba(137,180,250,0.36)' : 'rgba(99,102,241,0.45)',
    marginalXLine: isDark ? '#89b4fa' : '#6366f1',
    marginalYFill: isDark ? 'rgba(245,194,231,0.34)' : 'rgba(236,72,153,0.45)',
    marginalYLine: isDark ? '#f5c2e7' : '#ec4899',
  };
}
