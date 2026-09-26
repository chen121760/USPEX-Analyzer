/**
 * Painted-output invariants.
 *
 * Renders charts through ECharts' SVG SSR mode (no DOM needed) and asserts that
 * elements which take their colour from the palette are actually painted.
 *
 * This guards the "chart is invisible" class of bug: an explicit
 * `color: undefined` key in the ECharts option wiped the palette, so every pie
 * slice was emitted as `fill="none"` — invisible on the light card and only a
 * faint outline on the dark one.
 */

import * as echarts from 'echarts';
import { adaptToECharts } from '@/charts/shared/echartsAdapter';
import type { PlotLayout, PlotTrace } from '@/charts/shared/plotTypes';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { CHART_FONT } from '@/lib/constants';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}`);
  }
}

/** Mirrors the Dashboard "Space Group Distribution" pie. */
const SG_LABELS = ['SG 225', 'SG 8', 'SG 1', 'SG 2', 'Others'];
const SG_VALUES = [4000, 900, 700, 600, 500];

function pieTrace(): PlotTrace {
  return {
    type: 'pie',
    labels: SG_LABELS,
    values: SG_VALUES,
    hole: 0.35,
    sort: false,
    textinfo: 'percent',
    textposition: 'inside',
    marker: { line: { color: '#fff', width: 1.5 } },
  };
}

function pieLayout(theme: 'light' | 'dark'): PlotLayout {
  const plotTheme = getPlotlyTheme(theme);
  return {
    showlegend: true,
    colorway: plotTheme.categoricalColors,
    legend: {
      bgcolor: theme === 'dark' ? 'rgba(24, 24, 37, 0.86)' : 'rgba(255,255,255,0.4)',
      bordercolor: theme === 'dark' ? '#313244' : '#e2e8f0',
      font: { size: 11, color: plotTheme.legendColor },
      orientation: 'v',
      x: 1,
      y: 0.5,
    },
    margin: { t: 4, b: 4, l: 4, r: 80 },
    paper_bgcolor: 'transparent',
    font: { ...CHART_FONT, color: plotTheme.titleColor },
  };
}

const PIE_WIDTH = 420;
const PIE_HEIGHT = 260;

function pieOption(theme: 'light' | 'dark') {
  return adaptToECharts([pieTrace()], pieLayout(theme), { displayModeBar: false }).option;
}

function renderSvg(option: unknown): string {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: PIE_WIDTH, height: PIE_HEIGHT });
  chart.setOption(option as never);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

function fillOf(pathTag: string): string {
  return /fill="([^"]*)"/.exec(pathTag)?.[1] ?? '';
}

/** Percentage strings like "42%" → 0.42. */
function percent(value: unknown): number {
  return parseFloat(String(value)) / 100;
}

/** Left edge of the drawn legend entries, in pixels. */
function legendLeftPx(svg: string): number {
  const xs = [...svg.matchAll(/<path\b[^>]*ecmeta_ssr_type="legend"[^>]*transform="translate\(([-\d.]+)[ ,]/g)]
    .map((match) => Number(match[1]));
  return xs.length ? Math.min(...xs) : Number.POSITIVE_INFINITY;
}

/** Right edge of the pie, derived from the option the adapter produced. */
function pieRightPx(option: Record<string, unknown>): number {
  const pie = records(option.series)[0];
  const [centerX] = (pie.center as unknown[]).map(percent);
  const radius = (pie.radius as unknown[]).map(percent);
  const outer = radius[radius.length - 1];
  return centerX * PIE_WIDTH + outer * Math.min(PIE_WIDTH, PIE_HEIGHT) / 2;
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((entry) => (
    typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
  )) : [];
}

console.log('\nPainted chart output');

for (const theme of ['light', 'dark'] as const) {
  const plotTheme = getPlotlyTheme(theme);
  const option = pieOption(theme) as Record<string, unknown>;
  const svg = renderSvg(option);
  // `ecmeta_ssr_type="chart"` marks drawn series elements; legend swatches and
  // axis primitives carry other markers, so filter on the tag itself rather
  // than on attribute order.
  const slicePaths = [...svg.matchAll(/<path\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes('ecmeta_ssr_type="chart"'));
  const sliceFills = slicePaths.map(fillOf);
  const legendBox = records(option.legend)[0] ?? {};

  check(`${theme}: every pie slice is drawn`, slicePaths.length === SG_LABELS.length);
  check(`${theme}: no pie slice has fill="none"`, sliceFills.every((fill) => fill !== '' && fill !== 'none'));
  check(`${theme}: slices use the theme palette`, sliceFills.every((fill) => plotTheme.categoricalColors.includes(fill)));
  check(`${theme}: slices are visually distinct`, new Set(sliceFills).size === sliceFills.length);
  check(`${theme}: slice labels are present`, SG_LABELS.every((label) => svg.includes(`>${label}</text>`)));
  check(`${theme}: legend swatches are painted`, plotTheme.categoricalColors.slice(0, SG_LABELS.length)
    .every((color) => (svg.match(new RegExp(`fill="${color}"`, 'g')) ?? []).length >= 2));
  check(`${theme}: no stray cartesian axis is drawn behind the pie`, !svg.includes('stroke="#94a3b8"'));

  // A legend anchored to both edges is stretched across the plot and its
  // entries then land on top of the pie.
  check(`${theme}: legend is anchored to exactly one edge`,
    !('left' in legendBox && 'right' in legendBox));
  check(`${theme}: legend entries sit clear of the pie`,
    legendLeftPx(svg) > pieRightPx(option));
}

console.log(`\n${passed} painted-output checks passed.`);
if (failures.length > 0) throw new Error(`Painted output checks failed: ${failures.join(', ')}`);
