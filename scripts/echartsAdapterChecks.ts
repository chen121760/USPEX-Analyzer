import { adaptToECharts, layoutNeedsEqualScale } from '@/charts/shared/echartsAdapter';
import { CARTESIAN_AUTORANGE_PATCH, dataZoomRelayoutPatch, shouldUseDirtyRect, toolboxIconName } from '@/charts/shared/echartsInteraction';
import { mergePlotViewport } from '@/charts/shared/plotRange';
import { CHART_FONT } from '@/lib/constants';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : [];
}

console.log('\nECharts adapter invariants');

const twoDimensional = adaptToECharts([
  { type: 'scatter', mode: 'lines', x: [0, 1], y: [0, 1], name: 'guide', showlegend: false },
  {
    type: 'scatter',
    mode: 'markers',
    x: [0, 1],
    y: [1, 0],
    name: 'structures',
    customdata: [101, 102],
    marker: { color: [0.125, 0.875], cmin: 0, cmax: 1 },
  },
  {
    type: 'histogram',
    orientation: 'h',
    y: [1, 1, 2, 3],
    name: 'distribution',
    showlegend: false,
    xaxis: 'x2',
    yaxis: 'y',
  },
], {
  xaxis: {},
  yaxis: {},
  xaxis2: { domain: [0.8, 1] },
  showlegend: true,
});

const option2D = record(twoDimensional.option);
const series2D = records(option2D.series);
const visualMap2D = records(option2D.visualMap)[0];
check('uses the ECharts 2D coordinate system', twoDimensional.is3D === false);
check('keeps structure ids in native ECharts data items', records(series2D[1].data)[0].customdata === 101);
check('targets visualMap at the converted series index', visualMap2D.seriesIndex === 1);
// A colour bar is a legend, not a control.  ECharts' continuous visualMap is
// draggable by default and dragging an end handle narrows the selected range,
// which leaves part of the bar unpainted — it reads as a half-loaded image.
check('colour bar drops ECharts drag handles', visualMap2D.calculable === false);
check('colour bar keeps its native hover value indicator', visualMap2D.hoverLink !== false);
check('colour bar pins its range to the full extent',
  Array.isArray(visualMap2D.range) && visualMap2D.range[0] === 0 && visualMap2D.range[1] === 1);
check('colour bar leaves ECharts no text slots to centre on the colours',
  visualMap2D.text === undefined && visualMap2D.padding === 0);

// The bar is bare, so its title and end values are `graphic` elements placed
// from the measured frame.
const titledBar = adaptToECharts([{
  type: 'scatter',
  mode: 'markers',
  x: [0.25, 0.75],
  y: [0.5, 0.5],
  name: 'structures',
  marker: { color: [0.25, 0.75], cmin: 0, cmax: 0.5, colorbar: { title: 'Fitness\n(eV/block)' } },
}], { xaxis: {}, yaxis: {} }, {}, { width: 900, height: 640 });
const titledVisualMap = records(record(titledBar.option).visualMap)[0];
const barGraphics = records(record(titledBar.option).graphic);
const barTexts = barGraphics.map((entry) => record(entry.style).text);
const barLeft = 900 - Number(titledVisualMap.right) - 12;
check('colour bar keeps its title, drawn above the bar',
  barTexts.includes('Fitness\n(eV/block)')
  && Number(record(barGraphics[0]).x) === barLeft + 6
  && Number(record(barGraphics[0]).y) < Number(titledVisualMap.top ?? 0) + 12);
check('colour bar labels both ends of the bar with the data range',
  barTexts.includes('0.5') && barTexts.includes('0'));
check('colour bar end values sit clear of the colours',
  barGraphics
    .filter((entry) => record(entry.style).align === 'right')
    .every((entry) => Number(entry.x) === barLeft - 8));
check('colour bar end values are one bar-height apart',
  Math.abs(Number(barGraphics[1].y) - Number(barGraphics[2].y)) === 120);
check('renders horizontal histograms as custom rectangles', series2D[2].type === 'custom');
check('honours showlegend=false', series2D[2].name === '');

// Interaction: clicking a structure point must not be swallowed by panning,
// the wheel must stay with the page, and the cursor must advertise which
// elements are clickable.
const dataZooms = records(option2D.dataZoom);
check('the wheel is not captured inside the plot',
  dataZooms.length === 2 && dataZooms.every((entry) => entry.type === 'inside' && entry.zoomOnMouseWheel === false));
check('the wheel does not pan either',
  dataZooms.every((entry) => entry.moveOnMouseWheel !== true));
check('left-drag panning is moved off the plain drag',
  dataZooms.every((entry) => entry.moveOnMouseMove === 'shift'));
check('plot area no longer shows the grab cursor',
  dataZooms.every((entry) => entry.cursorGrab === 'default' && entry.cursorGrabbing === 'default'));
check('clickable structure points show a pointer cursor', series2D[1].cursor === 'pointer');
check('non-clickable guides keep the default cursor', series2D[0].cursor === undefined);
check('hover emphasis keeps the rest of a scientific figure visible',
  record(series2D[1].emphasis).focus === 'none' && record(series2D[1].emphasis).scale === true);
check('dynamic visual maps use full canvas repaints during hover',
  shouldUseDirtyRect(false, true) === false);
check('ordinary 2D charts keep the dirty-rectangle optimisation',
  shouldUseDirtyRect(false, false) === true);
check('3D charts never use the 2D dirty-rectangle painter',
  shouldUseDirtyRect(true, false) === false);

const zoomPatch = dataZoomRelayoutPatch({
  batch: [
    { dataZoomId: 'zoom-x', start: 20, end: 70 },
    { dataZoomId: 'zoom-y', start: 10, end: 60 },
  ],
}, { x: [0, 10], y: [-2, 2] });
check('toolbox rectangle zoom keeps both axes from the ECharts batch',
  zoomPatch['xaxis.range[0]'] === 2
  && zoomPatch['xaxis.range[1]'] === 7
  && zoomPatch['yaxis.range[0]'] === -1.6
  && Math.abs(Number(zoomPatch['yaxis.range[1]']) - 0.4) < 1e-12);
check('blank-double-click reset patch restores both cartesian axes',
  CARTESIAN_AUTORANGE_PATCH['xaxis.autorange'] === true && CARTESIAN_AUTORANGE_PATCH['yaxis.autorange'] === true);

// The toolbox rectangle zoom is what the toolbar icon runs, and it is the only
// zoom gesture the convex-hull page offers.  ECharts reports it through its
// internal `toolbox-dataZoom_*` components with axis data values instead of
// percentages; reading those as percentages reset the view to the full extent.
const toolboxZoomPatch = dataZoomRelayoutPatch({
  batch: [
    { dataZoomId: '\u0000_ec_\u0000toolbox-dataZoom_xAxis0', startValue: 0.404, endValue: 0.806 },
    { dataZoomId: '\u0000_ec_\u0000toolbox-dataZoom_yAxis0', startValue: 0.509, endValue: 0.125 },
  ],
}, { x: [-0.12, 1.12], y: [-0.12, Math.sqrt(3) / 2 + 0.12] });
check('toolbox rectangle zoom keeps the brushed data range on both axes',
  toolboxZoomPatch['xaxis.range[0]'] === 0.404
  && toolboxZoomPatch['xaxis.range[1]'] === 0.806
  && toolboxZoomPatch['yaxis.range[0]'] === 0.125
  && toolboxZoomPatch['yaxis.range[1]'] === 0.509);
check('toolbox rectangle zoom does not fall back to the full extent',
  toolboxZoomPatch['xaxis.range[0]'] !== -0.12 && toolboxZoomPatch['yaxis.range[1]'] !== Math.sqrt(3) / 2 + 0.12);
check('an unnamed entry inside a batch never overwrites both axes',
  Object.keys(dataZoomRelayoutPatch({
    batch: [{ dataZoomId: 'something-else', start: 0, end: 100 }],
  }, { x: [0, 10], y: [0, 10] })).length === 0);

const zoomedTernaryLayout = mergePlotViewport({
  xaxis: { range: [-0.12, 1.12], showgrid: false, showticklabels: false },
  yaxis: {
    range: [-0.12, 0.986],
    showgrid: false,
    showticklabels: false,
    scaleanchor: 'x',
    scaleratio: 1,
  },
}, {
  xaxis: { range: [0.1, 0.9] },
  yaxis: { range: [0.05, 0.75] },
});
const zoomedTernaryX = record(zoomedTernaryLayout.xaxis);
const zoomedTernaryY = record(zoomedTernaryLayout.yaxis);
check('viewport ranges preserve the ternary equal-scale constraint',
  zoomedTernaryY.scaleanchor === 'x' && zoomedTernaryY.scaleratio === 1);
check('viewport ranges preserve hidden ternary axes and grid lines',
  zoomedTernaryX.showgrid === false
  && zoomedTernaryY.showgrid === false
  && zoomedTernaryX.showticklabels === false
  && zoomedTernaryY.showticklabels === false);
check('viewport ranges replace only the displayed ranges',
  records([zoomedTernaryX.range, zoomedTernaryY.range]).length === 2
  && Array.isArray(zoomedTernaryX.range)
  && zoomedTernaryX.range[0] === 0.1
  && Array.isArray(zoomedTernaryY.range)
  && zoomedTernaryY.range[1] === 0.75);

const labelled = adaptToECharts([{
  type: 'scatter',
  mode: 'markers+text',
  x: [0.5],
  y: [0.25],
  text: ['AB<sub>2</sub>'],
  hovertext: ['EA42: AB<sub>2</sub><br>E_form: -0.5'],
  textposition: 'top center',
  marker: { symbol: 'circle-open', color: '#ef4444', line: { width: 2 } },
}], {}, { displayModeBar: false });
const labelledSeries = records(record(labelled.option).series)[0];
const labelledPoint = records(labelledSeries.data)[0];
check('markers+text keeps the visible point label', labelledPoint.__label === 'AB<sub>2</sub>' && record(labelledSeries.label).show === true);
const labelFormatter = record(labelledSeries.label).formatter;
check('chemical-formula labels render stoichiometric numbers as subscripts',
  typeof labelFormatter === 'function'
  && labelFormatter({ data: labelledPoint }) === 'AB₂');
check('hovertext wins over the short visible label in the tooltip payload',
  labelledPoint.__text === 'EA42: AB<sub>2</sub><br>E_form: -0.5');
check('open Plotly markers remain hollow after conversion',
  record(labelledSeries.itemStyle).color === 'rgba(0,0,0,0)'
  && record(labelledSeries.itemStyle).borderColor === '#ef4444');

const noHover = records(record(adaptToECharts([{
  type: 'scatter', mode: 'markers', x: [0], y: [0], hoverinfo: 'none',
}], {}, { displayModeBar: false }).option).series)[0];
check('hoverinfo none disables the ECharts tooltip for that series', record(noHover.tooltip).show === false);

// Palette plumbing: `layout.colorway` becomes the ECharts palette, and when no
// palette is supplied the key must be absent entirely.  An explicit
// `color: undefined` wipes the palette and leaves pie slices with fill="none"
// (the Dashboard space-group pie was invisible in the light theme because of it).
const withPalette = record(adaptToECharts(
  [{ type: 'pie', labels: ['A', 'B'], values: [5, 3] }],
  { colorway: ['#6366f1', '#ec4899'] },
  { displayModeBar: false },
).option);
check('layout.colorway becomes the ECharts palette',
  Array.isArray(withPalette.color) && (withPalette.color as unknown[]).join(',') === '#6366f1,#ec4899');

const withoutPalette = record(adaptToECharts(
  [{ type: 'pie', labels: ['A'], values: [1] }],
  {},
  { displayModeBar: false },
).option);
check('omits the color key when no palette is given instead of setting undefined',
  !('color' in withoutPalette));
check('pie-only charts emit no cartesian axes',
  records(withoutPalette.xAxis).length === 0 && records(withoutPalette.yAxis).length === 0);
check('sets with a cartesian trace keep their axes',
  records(record(adaptToECharts([{ type: 'scatter', x: [0, 1], y: [0, 1] }], {}, {}).option).xAxis).length === 1);

// Legend anchoring: one edge only, so the box cannot stretch across the plot.
function legendOf(layout: Record<string, unknown>): Record<string, unknown> {
  return record(record(adaptToECharts(
    [{ type: 'scatter', mode: 'markers', x: [0, 1], y: [0, 1], name: 'structures' }],
    layout as never,
    { displayModeBar: false },
  ).option).legend);
}

const bottomLeftLegend = legendOf({ legend: { x: 0.02, y: 0.02, xanchor: 'left', yanchor: 'bottom' } });
check('bottom-left legends keep their corner',
  bottomLeftLegend.left === 12 && bottomLeftLegend.bottom === 8 && !('right' in bottomLeftLegend));

const rightLegend = legendOf({ legend: { x: 1, y: 0.5, orientation: 'v' } });
check('right-edge legends anchor to the right only',
  rightLegend.right === 8 && !('left' in rightLegend));
check('right-edge legends do not also reserve top plot space',
  rightLegend.top === 8);

const freeLegend = legendOf({ legend: {} });
check('legends without an anchor stay centred', freeLegend.left === 'center');

const threeDimensional = adaptToECharts([
  {
    type: 'mesh3d',
    name: 'hull',
    x: [0, 1, 0],
    y: [0, 0, 1],
    z: [0, 0, -1],
    i: [0],
    j: [1],
    k: [2],
  },
  {
    type: 'scatter3d',
    mode: 'lines',
    x: [0, 1, null, 1, 0],
    y: [0, 0, null, 0, 1],
    z: [0, 0, null, 0, -1],
    showlegend: false,
  },
  {
    type: 'scatter3d',
    mode: 'markers',
    x: [0.2],
    y: [0.3],
    z: [-0.1],
    customdata: [501],
    marker: { color: [-0.1], cmin: -1, cmax: 0 },
  },
], { scene: {} });

const option3D = record(threeDimensional.option);
const series3D = records(option3D.series);
const visualMap3D = records(option3D.visualMap)[0];
check('uses ECharts GL for 3D charts', threeDimensional.is3D === true);
check('converts each indexed hull face into a surface', series3D[0].type === 'surface');
check('splits disconnected 3D paths into line3D series', series3D.filter((item) => item.type === 'line3D').length === 2);
check('targets 3D visualMap after generated surface and line series', visualMap3D.seriesIndex === 3);
check('keeps 3D structure ids clickable', records(series3D[3].data)[0].customdata === 501);

// ── Fixed-aspect 2D charts (ternary phase diagram) ────────────────────────
const ternaryVertices: Array<[number, number]> = [
  [0, 0],
  [0.5, Math.sqrt(3) / 2],
  [1, 0],
];
const ternaryData = [{
  type: 'scatter',
  mode: 'markers',
  x: ternaryVertices.map((vertex) => vertex[0]),
  y: ternaryVertices.map((vertex) => vertex[1]),
  name: 'structures',
}];
const ternaryLayout = {
  xaxis: { range: [-0.12, 1.12], showticklabels: false, showgrid: false, zeroline: false },
  yaxis: { range: [-0.12, Math.sqrt(3) / 2 + 0.12], showticklabels: false, showgrid: false, zeroline: false, scaleanchor: 'x', scaleratio: 1 },
  showlegend: false,
};

check('detects charts that pin their axis scale', layoutNeedsEqualScale(ternaryLayout));
check('leaves ordinary charts unconstrained', !layoutNeedsEqualScale({ xaxis: {}, yaxis: {} }));

// A wide, short container is exactly the case that used to stretch the triangle.
const wideFrame = { width: 1400, height: 620 };
const constrained = adaptToECharts(ternaryData, ternaryLayout, {}, wideFrame);
const constrainedGrid = records(record(constrained.option).grid)[0];
const gridLeft = Number(constrainedGrid.left);
const gridTop = Number(constrainedGrid.top);
const boxWidth = wideFrame.width - gridLeft - Number(constrainedGrid.right);
const boxHeight = wideFrame.height - gridTop - Number(constrainedGrid.bottom);
const [xMin, xMax] = ternaryLayout.xaxis.range;
const [yMin, yMax] = ternaryLayout.yaxis.range;

check('fixed-aspect grid keeps equal units per pixel 2D',
  Math.abs(boxWidth / (xMax - xMin) - boxHeight / (yMax - yMin)) < 0.01);
check('fixed-aspect grid disables label-driven padding', constrainedGrid.containLabel === false);
check('fixed-aspect grid stays inside the frame',
  gridLeft >= 0 && Number(constrainedGrid.right) >= 0 && boxWidth > 0 && boxHeight > 0);

// Map the triangle corners through the same box the adapter produced and
// measure the drawn edges: an equilateral triangle has three equal sides.
const toPixels = ([x, y]: [number, number]): [number, number] => [
  gridLeft + (x - xMin) / (xMax - xMin) * boxWidth,
  gridTop + (yMax - y) / (yMax - yMin) * boxHeight,
];
const pixelCorners = ternaryVertices.map(toPixels);
const sideLengths = [
  Math.hypot(pixelCorners[0][0] - pixelCorners[1][0], pixelCorners[0][1] - pixelCorners[1][1]),
  Math.hypot(pixelCorners[1][0] - pixelCorners[2][0], pixelCorners[1][1] - pixelCorners[2][1]),
  Math.hypot(pixelCorners[2][0] - pixelCorners[0][0], pixelCorners[2][1] - pixelCorners[0][1]),
];
const sideSpread = Math.max(...sideLengths) - Math.min(...sideLengths);
check('ternary triangle renders equilateral', sideSpread < 0.5, `sides ${sideLengths.map((side) => side.toFixed(1)).join('/')}`);
check('ternary triangle is not flattened by the wide frame', sideLengths[0] > 200);
const constrainedXAxes = records(record(constrained.option).xAxis);
const constrainedYAxes = records(record(constrained.option).yAxis);
check('ternary plot hides the cartesian grid requested by showgrid=false',
  record(constrainedXAxes[0].splitLine).show === false && record(constrainedYAxes[0].splitLine).show === false);
check('ternary plot hides the zero axes requested by zeroline=false',
  record(constrainedXAxes[0].axisLine).show === false && record(constrainedYAxes[0].axisLine).show === false);

// Without a measured frame the adapter must fall back to the full plot area.
const unmeasured = adaptToECharts(ternaryData, ternaryLayout, {});
const unmeasuredGrid = records(record(unmeasured.option).grid)[0];
const unmeasuredWidth = 1400 - Number(unmeasuredGrid.left) - Number(unmeasuredGrid.right);
check('without a frame size the grid keeps the full width', unmeasuredWidth > boxWidth * 1.5);

// ── Marginal panel layout (Explorer / Beta Explorer) ──────────────────────
// The layout declares Plotly subplot domains: the scatter keeps [0, 0.8] and the
// two marginal panels live in [0.83, 1] of the freed band.  Those fractions must
// be resolved against the measured container, otherwise the panels land in the
// middle of the scatter (overlapping it) and the top band collapses to nothing.
const marginalData = [
  { type: 'scatter', mode: 'markers', x: [0, 1], y: [0, 1], name: 'structures' },
  { type: 'histogram', x: [0, 1, 1, 2], name: 'x dist', showlegend: false, xaxis: 'x', yaxis: 'y2' },
  { type: 'scatter', mode: 'lines', x: [0, 1], y: [0, 1], name: 'x kde', showlegend: false, xaxis: 'x', yaxis: 'y2' },
  { type: 'histogram', orientation: 'h', y: [0, 1, 1, 2], name: 'y dist', showlegend: false, xaxis: 'x3', yaxis: 'y' },
  { type: 'scatter', mode: 'lines', x: [0, 1], y: [0, 1], name: 'y kde', showlegend: false, xaxis: 'x3', yaxis: 'y' },
];
const marginalAxisStyle = { tickfont: { size: 11, color: '#64748b' }, gridcolor: '#e2e8f0', linecolor: '#94a3b8' };
const marginalLayout = {
  xaxis: { title: { text: 'Fitness (eV/block)' }, domain: [0, 0.8], ...marginalAxisStyle },
  yaxis: { title: { text: 'Enthalpy (eV)' }, domain: [0, 0.8], ...marginalAxisStyle },
  xaxis2: { domain: [0, 0.8], matches: 'x', showticklabels: false, ...marginalAxisStyle },
  yaxis2: { domain: [0.83, 1], title: { text: 'density', font: { size: 10, color: '#64748b' } }, ...marginalAxisStyle },
  xaxis3: { domain: [0.83, 1], title: { text: 'density', font: { size: 10, color: '#64748b' } }, ...marginalAxisStyle },
  yaxis3: { domain: [0, 0.8], matches: 'y', showticklabels: false, ...marginalAxisStyle },
  showlegend: true,
  margin: { t: 10, r: 10, l: 60, b: 60 },
};
const marginalFrame = { width: 1600, height: 620 };
const marginalOption = record(adaptToECharts(marginalData, marginalLayout, {}, marginalFrame).option);
const marginalGrids = records(marginalOption.grid);
const gridBox = (grid: Record<string, unknown>): { x0: number; x1: number; y0: number; y1: number } => ({
  x0: Number(grid.left),
  x1: marginalFrame.width - Number(grid.right),
  y0: Number(grid.top),
  y1: marginalFrame.height - Number(grid.bottom),
});
const [scatterBox, xMarginalBox, yMarginalBox] = marginalGrids.map(gridBox);

check('a marginal chart emits one grid per subplot', marginalGrids.length === 3, `got ${marginalGrids.length}`);
check('the scatter keeps the left 80% of the plot area',
  Math.abs(scatterBox.x0 - 60) < 1 && Math.abs(scatterBox.x1 - (60 + 0.8 * (marginalFrame.width - 70))) < 1);
check('the right marginal panel starts after the scatter ends',
  yMarginalBox.x0 >= scatterBox.x1, `scatter ends at ${scatterBox.x1}, panel starts at ${yMarginalBox.x0}`);
check('the right marginal panel is ~17% wide, not half the chart',
  Math.abs((yMarginalBox.x1 - yMarginalBox.x0) / (marginalFrame.width - 70) - 0.17) < 0.01);
check('the top marginal panel has real height',
  xMarginalBox.y1 - xMarginalBox.y0 > 60, `height ${xMarginalBox.y1 - xMarginalBox.y0}`);
check('the top marginal panel sits above the scatter',
  xMarginalBox.y1 <= scatterBox.y0, `panel ends at ${xMarginalBox.y1}, scatter starts at ${scatterBox.y0}`);
check('the panels stay inside the frame',
  marginalGrids.every((grid) => {
    const box = gridBox(grid);
    return box.x0 >= 0 && box.y0 >= 0 && box.x1 <= marginalFrame.width && box.y1 <= marginalFrame.height;
  }));

const marginalXAxes = records(marginalOption.xAxis);
const marginalYAxes = records(marginalOption.yAxis);
check('the shared marginal x axis repeats no title and no tick labels',
  marginalXAxes[1].name === '' && record(marginalXAxes[1].axisLabel).show === false);
check('the shared marginal y axis repeats no title and no tick labels',
  marginalYAxes[2].name === '' && record(marginalYAxes[2].axisLabel).show === false);
check('the main axes keep their titles',
  marginalXAxes[0].name === 'Fitness (eV/block)' && marginalYAxes[0].name === 'Enthalpy (eV)');
check('the density axes keep their own title',
  marginalYAxes[1].name === 'density' && marginalXAxes[2].name === 'density');

// A narrow/short container must not push a panel off the canvas either.
const smallFrame = { width: 640, height: 400 };
const smallOption = record(adaptToECharts(marginalData, marginalLayout, {}, smallFrame).option);
const smallBoxes = records(smallOption.grid).map((grid) => ({
  x0: Number(grid.left),
  x1: smallFrame.width - Number(grid.right),
  y0: Number(grid.top),
  y1: smallFrame.height - Number(grid.bottom),
}));
check('a small container keeps both panels visible',
  smallBoxes[1].y1 - smallBoxes[1].y0 > 20 && smallBoxes[2].x1 - smallBoxes[2].x0 > 20 && smallBoxes[2].x0 >= smallBoxes[0].x1);

// The panels must resolve identically whichever order their traces appear in.
const reversedOption = record(adaptToECharts([...marginalData].reverse(), marginalLayout, {}, marginalFrame).option);
const reversedGrids = records(reversedOption.grid).map(gridBox);
const reversedXAxes = records(reversedOption.xAxis);
const reversedYAxes = records(reversedOption.yAxis);
check('panel styling does not depend on trace order (right panel keeps the density axis)',
  reversedXAxes[1].name === 'density' && record(reversedYAxes[1].axisLabel).show === false);
check('panel styling does not depend on trace order (top panel hides the shared x axis)',
  reversedXAxes[2].name === '' && record(reversedXAxes[2].axisLabel).show === false && reversedYAxes[2].name === 'density');
check('panel geometry does not depend on trace order',
  reversedGrids[1].x0 >= reversedGrids[0].x1 && reversedGrids[2].y1 <= reversedGrids[0].y0);

// ── Chart text font ───────────────────────────────────────────────────────
// Plotly drew every chart text element with `layout.font.family`.  Titles,
// legends and axis names used to be forced to a serif family while the axis
// labels inherited ECharts' default, so one chart showed two typefaces.
const fontProbe = record(adaptToECharts([{
  type: 'scatter', mode: 'markers', x: [0, 1], y: [0, 1], name: 'probe',
}], {
  font: CHART_FONT,
  title: { text: 'Probe', font: { size: 15 } },
  xaxis: { title: { text: 'X', font: { size: 13 } }, tickfont: { size: 11 } },
  showlegend: true,
}, { displayModeBar: false }).option);
check('chart text inherits the app font family',
  record(fontProbe.textStyle).fontFamily === CHART_FONT.family
  && record(record(fontProbe.title).textStyle).fontFamily === CHART_FONT.family
  && record(record(records(fontProbe.xAxis)[0]).nameTextStyle).fontFamily === CHART_FONT.family);
check('no chart text is forced to a serif family',
  !JSON.stringify(fontProbe).includes('Times New Roman'));
check('a Plotly font family on the element still wins',
  record(record(adaptToECharts([{ type: 'scatter', mode: 'markers', x: [0], y: [0] }], {
    title: { text: 'T', font: { size: 15, family: 'Georgia, serif' } },
  }, { displayModeBar: false }).option).title).textStyle?.fontFamily === 'Georgia, serif');

// ── Toolbox "back" button ─────────────────────────────────────────────────
const backClick = { target: { __ec_inner_4: { componentMainType: 'toolbox', tooltipConfig: { name: 'back' } } } };
check('the toolbox back button is recognised from a zrender click', toolboxIconName(backClick) === 'back');
check('other toolbox buttons are named, not treated as back',
  toolboxIconName({ target: { __ec_inner_9: { componentMainType: 'toolbox', tooltipConfig: { name: 'zoom' } } } }) === 'zoom');
check('data points, blank space and empty events are not toolbox buttons',
  toolboxIconName({ target: { __ec_inner_4: { seriesIndex: 0 } } }) === null
  && toolboxIconName({ target: null }) === null
  && toolboxIconName(null) === null
  && toolboxIconName('back') === null);

// ── 3D scene axes ─────────────────────────────────────────────────────────
// Plotly hides a scene axis with `showgrid` / `zeroline` / `showticklabels`;
// ignoring them painted a light grid over the dark 3D scene.
const hiddenSceneOption = record(adaptToECharts([{
  type: 'scatter3d', mode: 'markers', x: [0], y: [0], z: [0], name: 'p',
}], {
  scene: { xaxis: { showgrid: false, zeroline: false, showticklabels: false, title: { text: '' } } },
}, { displayModeBar: false }).option);
const hiddenSceneAxis = record(hiddenSceneOption.xAxis3D);
check('3D scene axes honour showgrid / zeroline / showticklabels',
  record(hiddenSceneAxis.splitLine).show === false
  && record(hiddenSceneAxis.axisLabel).show === false
  && record(hiddenSceneAxis.axisTick).show === false);
// echarts-gl keeps a null `axisLineCoords` when a scene axis line is switched
// off and then dereferences it on every camera change, so the hidden line stays
// "shown" and is made invisible with opacity.
check('a hidden 3D scene axis line is transparent instead of removed',
  record(hiddenSceneAxis.axisLine).show === true
  && record(record(hiddenSceneAxis.axisLine).lineStyle).opacity === 0);
const visibleSceneOption = record(adaptToECharts([{
  type: 'scatter3d', mode: 'markers', x: [0], y: [0], z: [0], name: 'p',
}], {
  scene: {
    zaxis: {
      title: { text: 'E' },
      tickfont: { size: 10, color: '#a6adc8' },
      gridcolor: '#313244',
      linecolor: '#585b70',
    },
  },
}, { displayModeBar: false }).option);
const visibleSceneAxis = record(visibleSceneOption.zAxis3D);
check('3D scene axes keep the theme colours they are given',
  record(visibleSceneAxis.axisLabel).color === '#a6adc8'
  && record(record(visibleSceneAxis.splitLine).lineStyle).color === '#313244'
  && record(record(visibleSceneAxis.axisLine).lineStyle).color === '#585b70'
  && record(record(visibleSceneAxis.axisLine).lineStyle).opacity === 1
  && record(visibleSceneAxis.splitLine).show !== false);

console.log(`\nECharts adapter checks: ${passed} passed, ${failures.length} failed`);
if (failures.length) throw new Error(failures.join('; '));
