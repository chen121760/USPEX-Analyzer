/**
 * Constants for the application.
 */

/** Element colors (Jmol scheme) — subset for common elements */
export const ELEMENT_COLORS: Record<string, string> = {
  H: '#ffffff',
  He: '#d9ffff',
  Li: '#cc80ff',
  Be: '#c2ff00',
  B: '#ffb5b5',
  C: '#909090',
  N: '#3050f8',
  O: '#ff0d0d',
  F: '#90e050',
  Na: '#ab5cf2',
  Mg: '#8aff00',
  Al: '#bfa6a6',
  Si: '#f0c8a0',
  P: '#ff8000',
  S: '#ffff30',
  Cl: '#1ff01f',
  K: '#8f40d4',
  Ca: '#3dff00',
  Ti: '#bfc2c7',
  V: '#a6a6ab',
  Cr: '#8a99c7',
  Mn: '#9c7ac7',
  Fe: '#e06633',
  Co: '#f090a0',
  Ni: '#50d050',
  Cu: '#c88033',
  Zn: '#7d80b0',
  Ga: '#c28f8f',
  Ge: '#668f8f',
  Sr: '#00ff00',
  Y: '#94ffff',
  Zr: '#94e0e0',
  Nb: '#73c2c9',
  Mo: '#54b5b5',
  Pd: '#006985',
  Ag: '#c0c0c0',
  Sn: '#668080',
  Ba: '#00c900',
  La: '#70d4ff',
  Pt: '#d0d0e0',
  Au: '#ffd123',
  Pb: '#575961',
};

/** Origin method → color mapping */
export const ORIGIN_COLORS: Record<string, string> = {
  Seeds: '#6366f1',
  Random: '#6b7280',
  Heredity: '#ec4899',
  LatMutate: '#f97316',
  softmutate: '#14b8a6',
  Permutate: '#8b5cf6',
  Transmutate: '#06b6d4',
  spinMutate: '#a855f7',
  UserAdded: '#eab308',
  Unknown: '#9ca3af',
};

/** Shared Plotly font — Times New Roman for Latin/numbers, fallback for CJK */
export const PLOTLY_FONT = {
  family: "'Times New Roman', Times, serif",
  size: 13,
};

/**
 * 根据当前主题（'light' 或 'dark'）返回一套完整的 Plotly 颜色配置。
 *
 * 为什么要集中管理？
 *   每个图表组件都需要背景色、网格线色、文字色等配置。
 *   如果每个文件各自硬编码，暗色模式就会出现白色图表框、
 *   看不见的文字、消失的网格线等问题。
 *   统一在这里定义，所有图表只需传入 theme 字符串即可。
 */
export function getPlotlyTheme(theme: 'light' | 'dark') {
  const isDark = theme === 'dark';

  return {
    // 图表区域背景色（散点/折线所在的白色/深色矩形区域）
    plotBg: isDark ? '#1e293b' : '#ffffff',

    // 整张图的纸张背景色（图例、标题所在的外层区域）
    paperBg: isDark ? '#1e293b' : '#ffffff',

    // 主标题文字颜色
    titleColor: isDark ? '#f1f5f9' : '#0f172a',

    // 坐标轴标题文字颜色
    axisTitleColor: isDark ? '#94a3b8' : '#334155',

    // 坐标轴刻度数字颜色
    tickColor: isDark ? '#64748b' : '#64748b',

    // 网格线颜色（暗色模式用更深的线，避免太刺眼）
    gridColor: isDark ? '#334155' : '#e2e8f0',

    // 零刻度线颜色
    zerolineColor: isDark ? '#475569' : '#cbd5e1',

    // 坐标轴边框线颜色
    lineColor: isDark ? '#475569' : '#94a3b8',

    // 图例文字颜色
    legendColor: isDark ? '#94a3b8' : '#334155',

    // 注释文字颜色（三元图的顶点标签等）
    annotationColor: isDark ? '#cbd5e1' : '#334155',

    // 结构线颜色（凸包轮廓线、三角形边框等）
    // 亮色模式用深色线，暗色模式用浅色线，保证在各自背景上都清晰可见
    structureLineColor: isDark ? '#94a3b8' : '#1e293b',
  };
}

/** Colorscale options for charts */
export const COLORSCALES = [
  'Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis',
  'Blues', 'Reds', 'YlOrRd', 'RdYlGn', 'Spectral',
];
