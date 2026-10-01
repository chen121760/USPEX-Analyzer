import type { EChartsOption } from 'echarts';
import { CHART_FONT } from '@/lib/constants';
import type { PlotData, PlotLayout, PlotTrace } from './plotTypes';

type Dict = Record<string, unknown>;

const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];

/**
 * Family every chart text element falls back to.
 *
 * Plotly drew all chart text with `layout.font.family` (the app's system-first
 * sans-serif stack).  A hardcoded serif here left titles, legends and axis
 * names in a different family from the axis labels, which inherit ECharts' own
 * default.
 */
const CHART_FONT_FAMILY = CHART_FONT.family;

export interface EChartsAdaptedOption {
  option: EChartsOption;
  axisRanges: { x: [number, number] | null; y: [number, number] | null };
  is3D: boolean;
}

/** Measured size of the chart host, needed to honour `scaleanchor`. */
export interface PlotFrameSize {
  width: number;
  height: number;
}

export function adaptToECharts(
  data: PlotData,
  layout: PlotLayout = {},
  config: Dict = {},
  frame: PlotFrameSize | null = null,
): EChartsAdaptedOption {
  const is3D = data.some((trace) => ['scatter3d', 'mesh3d'].includes(asString(trace.type)));
  return is3D ? adapt3D(data, layout, config) : adapt2D(data, layout, config, frame);
}

/**
 * True when an axis pins its scale to another axis (`scaleanchor`), i.e. the
 * chart needs a plot box whose pixel aspect matches its data aspect.
 *
 * Plotly enforced this itself; ECharts has no equivalent, so the adapter
 * letterboxes the grid and `PlotFrame` supplies the measured container size.
 * Without that, a ternary phase diagram stretches to the container's shape.
 */
export function layoutNeedsEqualScale(layout: PlotLayout): boolean {
  return Object.entries(layout).some(([key, value]) =>
    /^[xy]axis\d*$/.test(key) && asString(asDict(value).scaleanchor) !== '');
}

function adapt2D(
  data: PlotData,
  layout: PlotLayout,
  config: Dict,
  frame: PlotFrameSize | null,
): EChartsAdaptedOption {
  const axisPairs = collectAxisPairs(data);
  const margin = asDict(layout.margin);
  const legend = asDict(layout.legend);
  const hasTitle = Boolean(asString(asDict(layout.title).text));
  // Plotly anchors the legend with `y`/`yanchor`; `y: 0.02` is this app's
  // shorthand for "bottom-left inside the plot".
  const legendAtBottom = asString(legend.yanchor) === 'bottom' || legend.y === 0.02;
  const reservesTopLegend = layout.showlegend !== false && !legendAtBottom;
  const plotLeft = asNumber(margin.l, 60);
  const plotRight = asNumber(margin.r, 30);
  const plotTop = Math.max(
    asNumber(margin.t, 45),
    reservesTopLegend ? (hasTitle ? 58 : 42) : (hasTitle ? 36 : 10),
  );
  const plotBottom = asNumber(margin.b, 55);
  const measuredRanges = dataRanges(data);
  const grids: Dict[] = [];
  const xAxes: Dict[] = [];
  const yAxes: Dict[] = [];
  const pairIndex = new Map<string, number>();

  for (const [index, pair] of axisPairs.entries()) {
    // Pair `index` is subplot `index + 1`, so its own axis declarations are
    // `xaxis{index+1}` / `yaxis{index+1}`.
    const slot = index + 1;
    const xLayout = subplotAxisLayout(layout, pair.x, slot > 1 ? `x${slot}` : pair.x);
    const yLayout = subplotAxisLayout(layout, pair.y, slot > 1 ? `y${slot}` : pair.y);
    const xDomain = asNumberPair(xLayout.domain) ?? [0, 1];
    const yDomain = asNumberPair(yLayout.domain) ?? [0, 1];
    const grid = domainGrid(xDomain, yDomain, plotLeft, plotRight, plotTop, plotBottom, frame);
    // Fixed-aspect axes (ternary diagrams) need a square-data box instead of
    // the full margin area, so the drawn triangle stays equilateral.
    const constraint = frame ? equalScaleConstraint(xLayout, yLayout, measuredRanges) : null;
    const letterboxed = constraint ? constrainGridToAspect(grid, frame as PlotFrameSize, constraint) : null;
    grids.push({ ...(letterboxed ?? grid), containLabel: index === 0 && letterboxed === null });
    xAxes.push(convertAxis(xLayout, index, 'x'));
    yAxes.push(convertAxis(yLayout, index, 'y'));
    pairIndex.set(`${pair.x}|${pair.y}`, index);
  }

  const series: Dict[] = [];
  const visualMaps: Dict[] = [];
  let colorBarOffset = 10;

  data.forEach((trace) => {
    if (trace.visible === false || trace.visible === 'legendonly') return;
    const xName = axisName(trace.xaxis, 'x');
    const yName = axisName(trace.yaxis, 'y');
    const axesIndex = pairIndex.get(`${xName}|${yName}`) ?? 0;
    const converted = convert2DTrace(trace, series.length, axesIndex, visualMaps, colorBarOffset);
    if (converted.length > 0 && hasNumericColors(trace)) colorBarOffset += 48;
    series.push(...converted);
  });

  // Annotations and guide shapes are positioned on the cartesian grid, so they
  // only make sense when there is one.
  if (axisPairs.length > 0) {
    series.push(...annotationSeries(layout, 0));
    series.push(...shapeSeries(layout, 0));
  }

  const title = asDict(layout.title);
  const titleText = plainText(asString(title.text));
  const displayModeBar = config.displayModeBar !== false;
  // Charts that own their zoom gesture (the ternary triangle magnifier) opt out
  // of ECharts' rectangle brush so the two never fight over a drag.
  const allowRectZoom = config.rectZoom !== false;
  const axisRanges = {
    x: explicitAxisRange(asDict(layout.xaxis)) ?? measuredRanges.x,
    y: explicitAxisRange(asDict(layout.yaxis)) ?? measuredRanges.y,
  };
  const palette = colorway(layout);

  const option: EChartsOption = {
    animation: false,
    backgroundColor: asString(layout.paper_bgcolor) || 'transparent',
    // Axis labels and tooltips carry no family of their own, so the layout font
    // has to reach them through the global text style (Plotly's `layout.font`).
    textStyle: chartTextStyle(layout),
    // Omit `color` entirely when no palette is supplied.  An explicit
    // `color: undefined` key wipes the palette, and every element that relies on
    // it (pie slices, legend swatches, uncoloured series) is then drawn with
    // `fill="none"` — invisible on the light card, faint outlines on the dark one.
    ...(palette.length ? { color: palette } : {}),
    title: titleText
      ? {
          text: titleText,
          left: 'center',
          top: 8,
          textStyle: fontStyle(asDict(title.font), 15),
        }
      : undefined,
    legend: layout.showlegend === false
      ? { show: false }
      : {
          show: true,
          type: 'scroll',
          // Plotly positions the legend with `x`/`xanchor`; ECharts has no anchor
          // concept, so resolve it to exactly one edge.  Setting `left` and
          // `right` together stretched the legend across the plot and drew its
          // entries straight over the space-group pie.
          ...legendHorizontalPlacement(legend),
          top: legendAtBottom ? undefined : titleText ? 34 : 8,
          bottom: legendAtBottom ? 8 : undefined,
          orient: legend.orientation === 'v' ? 'vertical' : 'horizontal',
          textStyle: fontStyle(asDict(legend.font), 11),
          backgroundColor: asString(legend.bgcolor) || 'transparent',
          borderColor: asString(legend.bordercolor) || 'transparent',
          borderWidth: asString(legend.bordercolor) ? 1 : 0,
          padding: 6,
        },
    tooltip: {
      trigger: 'item',
      confine: true,
      appendToBody: false,
      formatter: tooltipFormatter,
    },
    toolbox: displayModeBar
      ? {
          show: true,
          right: 8,
          top: 6,
          feature: {
            ...(allowRectZoom ? { dataZoom: { yAxisIndex: 'all' } } : {}),
            restore: {},
            saveAsImage: { pixelRatio: 2, backgroundColor: asString(layout.paper_bgcolor) || '#fff' },
          },
        }
      : { show: false },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    // `inside` dataZoom installs ECharts' RoamController.  Left-drag is not taken
    // over (`moveOnMouseMove: 'shift'` keeps panning on Shift+drag) because it
    // painted a grab cursor over the whole plot and swallowed shaky clicks on a
    // structure point.  The wheel is not taken over either: `zoomOnMouseWheel:
    // false` makes the roam handler return before it calls `preventDefault`, so
    // scrolling the page over a chart scrolls the page instead of zooming the
    // x axis.  Zooming stays available through the toolbox rectangle zoom, the
    // Explorer/Beta Explorer axis range inputs, and the `dataZoom` events that
    // feed `onRelayout`.
    dataZoom: displayModeBar && allowRectZoom && axisPairs.length > 0
      ? [
          {
            id: 'zoom-x',
            type: 'inside',
            xAxisIndex: xAxes.map((_, index) => index),
            filterMode: 'none',
            zoomOnMouseWheel: false,
            moveOnMouseMove: 'shift',
            cursorGrab: 'default',
            cursorGrabbing: 'default',
          },
          {
            id: 'zoom-y',
            type: 'inside',
            yAxisIndex: yAxes.map((_, index) => index),
            filterMode: 'none',
            zoomOnMouseWheel: false,
            moveOnMouseMove: 'shift',
            cursorGrab: 'default',
            cursorGrabbing: 'default',
          },
        ]
      : undefined,
    visualMap: visualMaps.length ? visualMaps : undefined,
    series,
  };

  return { option, axisRanges, is3D: false };
}

function adapt3D(data: PlotData, layout: PlotLayout, config: Dict): EChartsAdaptedOption {
  const scene = asDict(layout.scene);
  const camera = asDict(scene.camera);
  const eye = asDict(camera.eye);
  const view = eyeToViewControl(eye);
  const series: Dict[] = [];
  const visualMaps: Dict[] = [];
  let colorBarOffset = 10;

  data.forEach((trace) => {
    if (trace.visible === false || trace.visible === 'legendonly') return;
    const type = asString(trace.type);
    if (type === 'mesh3d') {
      series.push(...meshToSurfaceSeries(trace));
      return;
    }
    if (type !== 'scatter3d') return;

    const mode = asString(trace.mode) || 'lines';
    if (mode.includes('lines')) series.push(...line3DSeries(trace));
    if (mode.includes('markers') || mode.includes('text')) {
      const converted = scatter3DSeries(trace, series.length, visualMaps, colorBarOffset);
      series.push(converted);
      if (hasNumericColors(trace)) colorBarOffset += 48;
    }
  });

  const title = asDict(layout.title);
  const titleText = plainText(asString(title.text));
  const displayModeBar = config.displayModeBar !== false;
  const option = {
    animation: false,
    backgroundColor: asString(layout.paper_bgcolor) || 'transparent',
    textStyle: chartTextStyle(layout),
    title: titleText
      ? { text: titleText, left: 'center', top: 6, textStyle: fontStyle(asDict(title.font), 15) }
      : undefined,
    legend: layout.showlegend === false
      ? { show: false }
      : {
          show: true,
          type: 'scroll',
          left: 'center',
          top: titleText ? 32 : 8,
          // Plotly used the theme legend colour here; a fixed slate value is
          // the tick colour and drifted from it.
          textStyle: fontStyle(asDict(asDict(layout.legend).font), 11),
        },
    tooltip: { trigger: 'item', confine: true, formatter: tooltipFormatter },
    toolbox: displayModeBar
      ? { show: true, right: 8, top: 6, feature: { restore: {}, saveAsImage: { pixelRatio: 2 } } }
      : { show: false },
    visualMap: visualMaps.length ? visualMaps : undefined,
    grid3D: {
      show: true,
      boxWidth: 120,
      boxDepth: 105,
      boxHeight: 90,
      environment: asString(layout.paper_bgcolor) || 'transparent',
      viewControl: {
        projection: 'perspective',
        autoRotate: false,
        damping: 0.85,
        rotateSensitivity: 1.2,
        zoomSensitivity: 1.1,
        panSensitivity: 0.8,
        ...view,
      },
      light: { main: { intensity: 1.1, shadow: false }, ambient: { intensity: 0.45 } },
    },
    xAxis3D: convertAxis3D(asDict(scene.xaxis), 'x'),
    yAxis3D: convertAxis3D(asDict(scene.yaxis), 'y'),
    zAxis3D: convertAxis3D(asDict(scene.zaxis), 'z'),
    series,
  } as EChartsOption;

  return { option, axisRanges: { x: null, y: null }, is3D: true };
}

function collectAxisPairs(data: PlotData): { x: string; y: string }[] {
  // Pie (and 3D) series do not live on a cartesian grid.  A chart made only of
  // those must not emit axes: otherwise an empty pair of axis lines is painted
  // straight through the plot.
  const cartesian = data.filter((trace) => !['pie', 'mesh3d', 'scatter3d'].includes(asString(trace.type)));
  const pairs: { x: string; y: string }[] = cartesian.length ? [{ x: 'x', y: 'y' }] : [];
  const seen = new Set(['x|y']);
  for (const trace of cartesian) {
    const x = axisName(trace.xaxis, 'x');
    const y = axisName(trace.yaxis, 'y');
    const key = `${x}|${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ x, y });
    }
  }
  return pairs;
}

function convert2DTrace(
  trace: PlotTrace,
  traceIndex: number,
  axesIndex: number,
  visualMaps: Dict[],
  visualMapRight: number,
): Dict[] {
  const type = asString(trace.type) || 'scatter';
  if (type === 'pie') return [pieSeries(trace)];
  if (type === 'histogram') return [histogramSeries(trace, axesIndex)];

  const x = asArray(trace.x);
  const y = asArray(trace.y);
  const mode = asString(trace.mode) || 'lines';
  const marker = asDict(trace.marker);
  const numericColor = numericArray(marker.color);
  const customData = asArray(trace.customdata);
  const count = Math.max(x.length, y.length);
  const values = Array.from({ length: count }, (_, index) => {
    const label = indexedValue(trace.text, index);
    const hoverText = indexedValue(trace.hovertext, index) ?? label;
    const point: Dict = {
      value: [x[index] ?? index, y[index] ?? null, numericColor?.[index]],
      customdata: customData[index],
      __label: label,
      __text: hoverText,
    };
    const colors = Array.isArray(marker.color) ? marker.color : null;
    if (colors && typeof colors[index] === 'string') point.itemStyle = { color: colors[index] };
    return point;
  });

  if (numericColor && numericColor.length) {
    const finite = numericColor.filter(Number.isFinite);
    visualMaps.push({
      type: 'continuous',
      seriesIndex: traceIndex,
      dimension: 2,
      min: asNumber(marker.cmin, finite.length ? Math.min(...finite) : 0),
      max: asNumber(marker.cmax, finite.length ? Math.max(...finite) : 1),
      calculable: true,
      orient: 'vertical',
      right: visualMapRight,
      top: 'middle',
      itemWidth: 12,
      itemHeight: 120,
      precision: 3,
      formatter: (value: number) => formatAxisValue(value),
      text: [plainText(asString(asDict(marker.colorbar).title)), ''],
      textStyle: { fontSize: 10 },
      inRange: { color: colorscale(marker.colorscale) },
    });
  }

  const common: Dict = {
    name: seriesName(trace),
    xAxisIndex: axesIndex,
    yAxisIndex: axesIndex,
    data: values,
    silent: trace.hoverinfo === 'skip' && customData.length === 0,
    // Points that carry a structure id are clickable (they open the viewer), so
    // advertise it with the pointer cursor; the surrounding plot area stays a
    // plain arrow now that dragging no longer pans.
    cursor: customData.length > 0 ? 'pointer' : undefined,
    tooltip: trace.hoverinfo === 'skip' || trace.hoverinfo === 'none' ? { show: false } : undefined,
    label: mode.includes('text')
      ? {
          show: true,
          formatter: labelFormatter,
          position: textPosition(trace.textposition),
          color: asString(asDict(trace.textfont).color) || undefined,
          fontSize: asNumber(asDict(trace.textfont).size, 10),
        }
      : undefined,
    emphasis: { focus: 'self', scale: true },
  };

  if (trace.fill === 'toself') {
    return [polygonSeries(trace, axesIndex, x, y), lineSeries(trace, axesIndex, values, false)];
  }

  if (mode.includes('lines')) {
    return [lineSeries(trace, axesIndex, values, mode.includes('markers'))];
  }

  return [{
    ...common,
    type: 'scatter',
    symbol: markerSymbol(marker.symbol),
    symbolSize: asNumber(marker.size, 7),
    itemStyle: {
      color: markerFill(marker),
      opacity: asNumber(marker.opacity, 1),
      borderColor: markerBorderColor(marker),
      borderWidth: markerBorderWidth(marker),
    },
    large: values.length > 3000 && customData.length === 0,
    largeThreshold: 3000,
  }];

  function lineSeries(source: PlotTrace, axis: number, points: Dict[], showSymbol: boolean): Dict {
    const sourceLine = asDict(source.line);
    const sourceMarker = asDict(source.marker);
    return {
      ...common,
      type: 'line',
      xAxisIndex: axis,
      yAxisIndex: axis,
      data: points,
      showSymbol,
      symbol: markerSymbol(sourceMarker.symbol),
      symbolSize: asNumber(sourceMarker.size, 6),
      connectNulls: false,
      lineStyle: {
        color: asString(sourceLine.color) || asString(sourceMarker.color),
        width: asNumber(sourceLine.width, 2),
        type: dashType(sourceLine.dash),
        opacity: asNumber(sourceLine.opacity, 1),
      },
      itemStyle: {
        color: typeof sourceMarker.color === 'string' ? sourceMarker.color : asString(sourceLine.color),
        opacity: asNumber(sourceMarker.opacity, 1),
      },
      areaStyle: source.fill === 'tozeroy'
        ? { color: asString(source.fillcolor) || asString(sourceLine.color), opacity: 0.3 }
        : undefined,
    };
  }
}

function pieSeries(trace: PlotTrace): Dict {
  const labels = asArray(trace.labels);
  const values = asArray(trace.values);
  const line = asDict(asDict(trace.marker).line);
  return {
    type: 'pie',
    name: seriesName(trace),
    radius: trace.hole ? [`${asNumber(trace.hole, 0) * 100}%`, '72%'] : ['0%', '72%'],
    center: ['42%', '52%'],
    avoidLabelOverlap: true,
    label: { show: true, formatter: '{d}%', position: trace.textposition === 'inside' ? 'inside' : 'outside' },
    // Slice separators: honour the caller's border, defaulting to the Plotly
    // look.  Colours come from the palette, never from here.
    itemStyle: {
      borderColor: asString(line.color) || '#fff',
      borderWidth: asNumber(line.width, 1.5),
    },
    data: labels.map((name, index) => ({ name: String(name), value: asNumber(values[index], 0) })),
  };
}

function histogramSeries(trace: PlotTrace, axesIndex: number): Dict {
  const horizontal = trace.orientation === 'h';
  const source = numericArray(horizontal ? trace.y : trace.x) ?? [];
  const bins = Math.max(2, Math.round(asNumber(horizontal ? trace.nbinsy : trace.nbinsx, 20)));
  const min = source.length ? Math.min(...source) : 0;
  const max = source.length ? Math.max(...source) : 1;
  const width = max === min ? 1 : (max - min) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const value of source) counts[Math.min(bins - 1, Math.floor((value - min) / width))] += 1;
  const normalized = trace.histnorm === 'probability density'
    ? counts.map((count) => count / Math.max(1, source.length * width))
    : counts;
  const marker = asDict(trace.marker);
  const data = normalized.map((value, index) => {
    const center = min + (index + 0.5) * width;
    return horizontal ? [value, center, width] : [center, value, width];
  });
  return {
    type: 'custom',
    name: seriesName(trace),
    xAxisIndex: axesIndex,
    yAxisIndex: axesIndex,
    data,
    silent: true,
    renderItem: (_params: unknown, api: {
      value: (dimension: number) => number;
      coord: (point: number[]) => number[];
    }) => {
      const center = api.value(horizontal ? 1 : 0);
      const value = api.value(horizontal ? 0 : 1);
      const binWidth = api.value(2) * 0.92;
      const start = horizontal
        ? api.coord([0, center - binWidth / 2])
        : api.coord([center - binWidth / 2, 0]);
      const end = horizontal
        ? api.coord([value, center + binWidth / 2])
        : api.coord([center + binWidth / 2, value]);
      return {
        type: 'rect',
        shape: {
          x: Math.min(start[0], end[0]),
          y: Math.min(start[1], end[1]),
          width: Math.max(1, Math.abs(end[0] - start[0])),
          height: Math.max(1, Math.abs(end[1] - start[1])),
        },
        style: {
          fill: asString(marker.color),
          stroke: asString(asDict(marker.line).color),
          lineWidth: asNumber(asDict(marker.line).width, 0),
        },
      };
    },
  };
}

function polygonSeries(trace: PlotTrace, axesIndex: number, x: unknown[], y: unknown[]): Dict {
  const points = x.map((value, index) => [value, y[index]]).filter((point) => point.every(isFiniteNumber));
  return {
    type: 'custom',
    name: seriesName(trace),
    xAxisIndex: axesIndex,
    yAxisIndex: axesIndex,
    data: [0],
    silent: true,
    renderItem: (_params: unknown, api: { coord: (point: unknown[]) => number[] }) => ({
      type: 'polygon',
      shape: { points: points.map((point) => api.coord(point)) },
      style: {
        fill: asString(trace.fillcolor) || 'rgba(99,102,241,0.16)',
        stroke: asString(asDict(trace.line).color),
        lineWidth: asNumber(asDict(trace.line).width, 1),
      },
    }),
  };
}

function scatter3DSeries(trace: PlotTrace, traceIndex: number, visualMaps: Dict[], visualMapRight: number): Dict {
  const x = asArray(trace.x);
  const y = asArray(trace.y);
  const z = asArray(trace.z);
  const marker = asDict(trace.marker);
  const colors = numericArray(marker.color);
  const customData = asArray(trace.customdata);
  const mode = asString(trace.mode);
  const values = x.map((xValue, index) => ({
    value: [xValue, y[index], z[index], colors?.[index]],
    customdata: customData[index],
    __label: indexedValue(trace.text, index),
    __text: indexedValue(trace.hovertext, index) ?? indexedValue(trace.text, index),
    label: mode.includes('text')
      ? { show: true, formatter: plainText(String(indexedValue(trace.text, index) ?? '')), position: textPosition(trace.textposition) }
      : undefined,
  }));
  if (colors?.length) {
    const finite = colors.filter(Number.isFinite);
    visualMaps.push({
      type: 'continuous',
      seriesIndex: traceIndex,
      dimension: 3,
      min: asNumber(marker.cmin, finite.length ? Math.min(...finite) : 0),
      max: asNumber(marker.cmax, finite.length ? Math.max(...finite) : 1),
      calculable: true,
      right: visualMapRight,
      top: 'middle',
      itemWidth: 12,
      itemHeight: 120,
      precision: 3,
      formatter: (value: number) => formatAxisValue(value),
      text: [plainText(asString(asDict(marker.colorbar).title)), ''],
      inRange: { color: colorscale(marker.colorscale) },
    });
  }
  return {
    type: 'scatter3D',
    name: seriesName(trace),
    data: values,
    symbol: markerSymbol(marker.symbol),
    symbolSize: asNumber(marker.size, 7),
    itemStyle: {
      color: markerFill(marker),
      opacity: asNumber(marker.opacity, 1),
      borderColor: markerBorderColor(marker),
      borderWidth: markerBorderWidth(marker),
    },
    tooltip: trace.hoverinfo === 'skip' || trace.hoverinfo === 'none' ? { show: false } : undefined,
    emphasis: { focus: 'self', scale: true, itemStyle: { opacity: 1 } },
  };
}

function line3DSeries(trace: PlotTrace): Dict[] {
  const x = asArray(trace.x);
  const y = asArray(trace.y);
  const z = asArray(trace.z);
  const segments: number[][][] = [];
  let current: number[][] = [];
  for (let index = 0; index < x.length; index += 1) {
    if (![x[index], y[index], z[index]].every(isFiniteNumber)) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else {
      current.push([Number(x[index]), Number(y[index]), Number(z[index])]);
    }
  }
  if (current.length > 1) segments.push(current);
  const line = asDict(trace.line);
  return segments.map((coords, index) => ({
    type: 'line3D',
    name: index === 0 ? seriesName(trace) : '',
    coordinateSystem: 'cartesian3D',
    data: coords,
    lineStyle: {
      color: asString(line.color) || '#475569',
      width: asNumber(line.width, 1.5),
      opacity: asNumber(line.opacity, 1),
    },
    silent: true,
  }));
}

function meshToSurfaceSeries(trace: PlotTrace): Dict[] {
  const x = numericArray(trace.x) ?? [];
  const y = numericArray(trace.y) ?? [];
  const z = numericArray(trace.z) ?? [];
  const ii = numericArray(trace.i) ?? [];
  const jj = numericArray(trace.j) ?? [];
  const kk = numericArray(trace.k) ?? [];
  const color = normalizeColor(asString(trace.color) || '#7894d4');
  const opacity = asNumber(trace.opacity, 0.45);
  return ii.map((aIndex, faceIndex) => {
    const bIndex = jj[faceIndex];
    const cIndex = kk[faceIndex];
    const a = [x[aIndex], y[aIndex], z[aIndex]];
    const b = [x[bIndex], y[bIndex], z[bIndex]];
    const c = [x[cIndex], y[cIndex], z[cIndex]];
    return {
      type: 'surface',
      name: faceIndex === 0 ? seriesName(trace) : '',
      parametric: true,
      silent: true,
      wireframe: { show: false },
      shading: 'lambert',
      itemStyle: { color, opacity },
      parametricEquation: {
        u: { min: 0, max: 1, step: 0.5 },
        v: { min: 0, max: 1, step: 0.5 },
        x: (u: number, v: number) => triangleCoordinate(a, b, c, u, v, 0),
        y: (u: number, v: number) => triangleCoordinate(a, b, c, u, v, 1),
        z: (u: number, v: number) => triangleCoordinate(a, b, c, u, v, 2),
      },
    };
  });
}

function triangleCoordinate(a: number[], b: number[], c: number[], u: number, v: number, dimension: number): number {
  return a[dimension] + u * (b[dimension] - a[dimension]) + (1 - u) * v * (c[dimension] - a[dimension]);
}

function annotationSeries(layout: PlotLayout, axesIndex: number): Dict[] {
  const annotations = asArray(layout.annotations).filter((value): value is Dict => isDict(value));
  if (!annotations.length) return [];
  return [{
    type: 'custom',
    name: '',
    xAxisIndex: axesIndex,
    yAxisIndex: axesIndex,
    silent: true,
    z: 100,
    data: annotations.map((annotation) => [annotation.x, annotation.y]),
    renderItem: (
      params: { dataIndex?: number },
      api: { coord: (point: unknown[]) => number[] },
    ) => {
      const annotation = annotations[params.dataIndex ?? 0] ?? {};
      const [x, y] = api.coord([annotation.x, annotation.y]);
      const font = asDict(annotation.font);
      return {
        type: 'text',
        style: {
          text: plainText(asString(annotation.text)),
          x,
          y: y - 4,
          fill: asString(font.color) || '#334155',
          font: `${asString(font.weight) || '600'} ${asNumber(font.size, 12)}px ${fontStyle(font, 12).fontFamily}`,
          textAlign: 'center',
          textVerticalAlign: 'bottom',
        },
      };
    },
  }];
}

function shapeSeries(layout: PlotLayout, axesIndex: number): Dict[] {
  return asArray(layout.shapes)
    .filter((value): value is Dict => isDict(value) && value.type === 'line')
    .map((shape) => ({
      type: 'line',
      name: '',
      xAxisIndex: axesIndex,
      yAxisIndex: axesIndex,
      silent: true,
      showSymbol: false,
      data: [[shape.x0, shape.y0], [shape.x1, shape.y1]],
      lineStyle: {
        color: asString(asDict(shape.line).color),
        width: asNumber(asDict(shape.line).width, 1),
        type: dashType(asDict(shape.line).dash),
      },
    }));
}

function convertAxis(axis: Dict, gridIndex: number, direction: 'x' | 'y'): Dict {
  const title = asDict(axis.title);
  const range = asArray(axis.range);
  const autorange = axis.autorange;
  const isReversed = autorange === 'reversed';
  const min = range.length ? finiteOrUndefined(range[isReversed ? 1 : 0]) : undefined;
  const max = range.length > 1 ? finiteOrUndefined(range[isReversed ? 0 : 1]) : undefined;
  return {
    type: 'value',
    gridIndex,
    name: plainText(asString(title.text)),
    nameLocation: 'middle',
    nameGap: direction === 'x' ? 36 : 48,
    nameTextStyle: fontStyle(asDict(title.font), 13),
    min,
    max,
    inverse: isReversed,
    scale: true,
    axisLabel: {
      show: axis.showticklabels !== false,
      color: asString(asDict(axis.tickfont).color),
      fontSize: asNumber(asDict(axis.tickfont).size, 11),
      formatter: (value: number) => formatAxisValue(value),
    },
    axisLine: {
      show: axis.showline === true || axis.zeroline !== false,
      onZero: axis.zeroline !== false,
      lineStyle: { color: asString(axis.zerolinecolor) || asString(axis.linecolor) || '#94a3b8' },
    },
    axisTick: { show: axis.showticklabels !== false },
    splitLine: { show: axis.showgrid !== false, lineStyle: { color: asString(axis.gridcolor) || '#e2e8f0' } },
  };
}

function convertAxis3D(axis: Dict, direction: string): Dict {
  const title = asDict(axis.title);
  const range = asArray(axis.range);
  // Plotly hides individual scene axes with `showgrid` / `zeroline` /
  // `showticklabels`; without this the ternary 3D view painted a light grid on
  // top of its dark scene background that the Plotly version never drew.
  const showGrid = axis.showgrid !== false;
  const showZeroLine = axis.zeroline !== false;
  const showTickLabels = axis.showticklabels !== false;
  return {
    type: 'value',
    name: plainText(asString(title.text) || direction.toUpperCase()),
    min: range.length ? finiteOrUndefined(range[0]) : undefined,
    max: range.length > 1 ? finiteOrUndefined(range[1]) : undefined,
    scale: true,
    nameTextStyle: fontStyle(asDict(title.font), 12),
    axisLabel: {
      show: showTickLabels,
      color: asString(asDict(axis.tickfont).color) || '#64748b',
      fontSize: asNumber(asDict(axis.tickfont).size, 10),
      formatter: (value: number) => formatAxisValue(value),
    },
    axisLine: {
      // `show: false` leaves echarts-gl's saved `axisLineCoords` null and its
      // `_updateAxisLabelAlign` then dereferences `null[0]` on the next camera
      // change, which throws and leaves the WebGL scene half drawn.  Keep the
      // line "shown" and hide it with opacity.
      show: true,
      lineStyle: {
        color: asString(axis.linecolor) || '#94a3b8',
        opacity: showZeroLine ? 1 : 0,
      },
    },
    splitLine: {
      show: showGrid,
      lineStyle: { color: asString(axis.gridcolor) || '#e2e8f0' },
    },
    axisTick: { show: showTickLabels },
    axisPointer: { show: false },
  };
}

/**
 * Translate a Plotly `domain` fraction into ECharts' pixel insets.
 *
 * The fractions are relative to the **measured** container.  Mapping them onto a
 * fixed reference box instead put a `[0.83, 1]` marginal panel more than half
 * way across a wide chart (straight over the scatter plot) and collapsed a
 * `[0.83, 1]` vertical band to zero height on a short one.
 */
function domainGrid(
  xDomain: [number, number],
  yDomain: [number, number],
  left: number,
  right: number,
  top: number,
  bottom: number,
  frame: PlotFrameSize | null,
): Dict {
  const canvasWidth = frame && frame.width > 0 ? frame.width : 1000;
  const canvasHeight = frame && frame.height > 0 ? frame.height : 700;
  const horizontalSpace = Math.max(1, canvasWidth - left - right);
  const verticalSpace = Math.max(1, canvasHeight - top - bottom);
  return {
    left: left + xDomain[0] * horizontalSpace,
    right: right + (1 - xDomain[1]) * horizontalSpace,
    top: top + (1 - yDomain[1]) * verticalSpace,
    bottom: bottom + yDomain[0] * verticalSpace,
  };
}

/**
 * Resolve the layout entry that styles one subplot axis.
 *
 * Marginal panels share the main axis for positioning (`xaxis: 'x'` with
 * `yaxis: 'y2'`) but declare their own subplot axis — `xaxis2` / `yaxis3` — to
 * suppress the repeated title and tick labels.  Reading the axis the trace
 * happens to name would copy the main axis styling into the panel and paint the
 * main title a second time inside the chart, so a declared subplot axis wins —
 * but only when it describes the same band (same `domain`), otherwise it belongs
 * to a different subplot and the trace's own axis is the right one.  Range is
 * inherited: it belongs to the shared axis, not to the subplot declaration.
 */
function subplotAxisLayout(layout: PlotLayout, reference: string, slot: string): Dict {
  const base = axisLayout(layout, reference);
  const chosen = findSubplotAxis(layout, reference, slot);
  if (chosen === null) return base;
  const declared = axisLayout(layout, chosen);
  return {
    ...declared,
    ...(declared.range === undefined && base.range !== undefined ? { range: base.range } : {}),
    ...(declared.autorange === undefined && base.autorange !== undefined ? { autorange: base.autorange } : {}),
  };
}

/**
 * Find the subplot-local declaration of a shared axis: the declared axis of the
 * same direction whose `domain` is the band the trace's axis occupies.  The
 * subplot's own slot is tried first, then every other declared subplot axis, so
 * the result does not depend on the order marginal panels appear in the data.
 */
function findSubplotAxis(layout: PlotLayout, reference: string, slot: string): string | null {
  if (reference === slot) return null;
  const baseDomain = asNumberPair(axisLayout(layout, reference).domain);
  if (!baseDomain) return null;
  const direction = reference[0];
  const candidates = [slot];
  for (let index = 2; index <= 9; index += 1) candidates.push(`${direction}${index}`);
  for (const candidate of candidates) {
    if (candidate === reference) continue;
    const domain = asNumberPair(axisLayout(layout, candidate).domain);
    if (domain && sameDomain(domain, baseDomain)) return candidate;
  }
  return null;
}

function sameDomain(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/**
 * Read the chart's colour palette from Plotly's `layout.colorway`.
 *
 * Charts that colour their own series (scatter, hull, line) can omit it and let
 * ECharts use its default palette; charts that rely on the palette — pie charts
 * above all — must supply one, otherwise their slices have no fill.
 */
/**
 * Resolve Plotly's `legend.x` + `legend.xanchor` to one ECharts horizontal edge.
 *
 * Returns exactly one of `left` / `right`, or the centred default, because
 * ECharts grows the legend box between `left` and `right` when both are given.
 */
function legendHorizontalPlacement(legend: Dict): Dict {
  const x = legend.x;
  if (typeof x !== 'number' || !Number.isFinite(x)) return { left: 'center' };
  if (asString(legend.xanchor) === 'right' || x >= 0.95) return { right: 8 };
  if (x <= 0.05) return { left: 12 };
  return { left: 'center' };
}

function colorway(layout: PlotLayout): string[] {
  const value = layout.colorway;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

function axisLayout(layout: PlotLayout, axisNameValue: string): Dict {
  const suffix = axisNameValue.slice(1);
  return asDict(layout[`${axisNameValue[0]}axis${suffix}`]);
}

interface EqualScaleConstraint {
  xSpan: number;
  ySpan: number;
  /** Pixels per y unit ÷ pixels per x unit, from Plotly's `scaleratio`. */
  ratio: number;
}

/**
 * Read Plotly's `scaleanchor` / `scaleratio` pair.
 *
 * Prefers explicit ranges (what `convertAxis` hands to ECharts) and falls back
 * to the measured data extent, which is what an auto-scaled axis roughly shows.
 */
function equalScaleConstraint(
  xLayout: Dict,
  yLayout: Dict,
  measured: { x: [number, number] | null; y: [number, number] | null },
): EqualScaleConstraint | null {
  let ratio: number | null = null;
  if (asString(yLayout.scaleanchor) === 'x') {
    ratio = asNumber(yLayout.scaleratio, 1);
  } else if (asString(xLayout.scaleanchor) === 'y') {
    ratio = 1 / asNumber(xLayout.scaleratio, 1);
  }
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return null;

  const xRange = explicitAxisRange(xLayout) ?? measured.x;
  const yRange = explicitAxisRange(yLayout) ?? measured.y;
  if (!xRange || !yRange) return null;

  const xSpan = xRange[1] - xRange[0];
  const ySpan = yRange[1] - yRange[0];
  if (!(xSpan > 0) || !(ySpan > 0)) return null;

  return { xSpan, ySpan, ratio };
}

/**
 * Shrink a pixel grid box until its aspect matches the data aspect required by
 * `scaleanchor`, centring it in the space the margins leave (Plotly's
 * `constrain: 'domain'` behaviour).  Axis ranges are untouched, so the data
 * keeps its true proportions and the leftover space becomes margin.
 */
function constrainGridToAspect(
  grid: Dict,
  frame: PlotFrameSize,
  constraint: EqualScaleConstraint,
): Dict | null {
  const left = asNumber(grid.left, 0);
  const right = asNumber(grid.right, 0);
  const top = asNumber(grid.top, 0);
  const bottom = asNumber(grid.bottom, 0);
  const availableWidth = frame.width - left - right;
  const availableHeight = frame.height - top - bottom;
  if (!(availableWidth > 0) || !(availableHeight > 0)) return null;

  // boxWidth / boxHeight must equal (xSpan / ySpan) / ratio.
  const wantedAspect = (constraint.xSpan / constraint.ySpan) / constraint.ratio;
  if (!Number.isFinite(wantedAspect) || wantedAspect <= 0) return null;

  let boxWidth = availableWidth;
  let boxHeight = availableHeight;
  if (availableWidth / availableHeight > wantedAspect) {
    boxWidth = availableHeight * wantedAspect;
  } else {
    boxHeight = availableWidth / wantedAspect;
  }
  if (!(boxWidth > 0) || !(boxHeight > 0)) return null;

  const extraX = (availableWidth - boxWidth) / 2;
  const extraY = (availableHeight - boxHeight) / 2;
  return {
    left: left + extraX,
    right: right + extraX,
    top: top + extraY,
    bottom: bottom + extraY,
  };
}

function axisName(value: unknown, fallback: 'x' | 'y'): string {
  const text = asString(value);
  return text && new RegExp(`^${fallback}\\d*$`).test(text) ? text : fallback;
}

function dataRanges(data: PlotData): { x: [number, number] | null; y: [number, number] | null } {
  const x = data.flatMap((trace) => numericArray(trace.x) ?? []);
  const y = data.flatMap((trace) => numericArray(trace.y) ?? []);
  return {
    x: x.length ? [Math.min(...x), Math.max(...x)] : null,
    y: y.length ? [Math.min(...y), Math.max(...y)] : null,
  };
}

function explicitAxisRange(axis: Dict): [number, number] | null {
  const range = asArray(axis.range);
  if (range.length < 2) return null;
  const min = finiteOrUndefined(range[0]);
  const max = finiteOrUndefined(range[1]);
  return min === undefined || max === undefined ? null : [min, max];
}

function eyeToViewControl(eye: Dict): Dict {
  const x = asNumber(eye.x, 1.5);
  const y = asNumber(eye.y, 1.5);
  const z = asNumber(eye.z, 1);
  const radius = Math.max(0.1, Math.hypot(x, y, z));
  return {
    alpha: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI,
    beta: Math.atan2(y, x) * 180 / Math.PI,
    distance: Math.max(80, radius * 70),
  };
}

function tooltipFormatter(params: unknown): string {
  const param = isDict(params) ? params : {};
  const data = asDict(param.data);
  const html = asString(data.__text);
  if (html) return html;
  const seriesName = asString(param.seriesName);
  const name = asString(param.name);
  const value = data.value ?? param.value;
  const valueText = Array.isArray(value) ? value.slice(0, 3).map(formatValue).join(', ') : formatValue(value);
  return [seriesName || name, valueText].filter(Boolean).join('<br>');
}

function labelFormatter(params: unknown): string {
  const param = isDict(params) ? params : {};
  return plainText(asString(asDict(param.data).__label));
}

function indexedValue(value: unknown, index: number): unknown {
  const values = asArray(value);
  if (values.length) return values[index];
  return value;
}

function textPosition(value: unknown): string {
  const position = asString(value).toLowerCase();
  if (position.includes('top')) return 'top';
  if (position.includes('bottom')) return 'bottom';
  if (position.includes('left')) return 'left';
  if (position.includes('right')) return 'right';
  if (position.includes('middle') || position.includes('center')) return 'inside';
  return 'top';
}

function markerFill(marker: Dict): string | undefined {
  if (asString(marker.symbol).includes('open')) return 'rgba(0,0,0,0)';
  return typeof marker.color === 'string' ? marker.color : undefined;
}

function markerBorderColor(marker: Dict): string | undefined {
  const lineColor = asString(asDict(marker.line).color);
  if (lineColor) return lineColor;
  return asString(marker.symbol).includes('open') && typeof marker.color === 'string' ? marker.color : undefined;
}

function markerBorderWidth(marker: Dict): number {
  const width = asNumber(asDict(marker.line).width, 0);
  return asString(marker.symbol).includes('open') ? Math.max(1.5, width) : width;
}

function markerSymbol(value: unknown): string {
  const symbol = asString(value);
  if (symbol.includes('star')) return 'path://M512 64L627 397L979 404L698 617L800 954L512 754L224 954L326 617L45 404L397 397Z';
  if (symbol.includes('diamond')) return 'diamond';
  if (symbol.includes('square')) return 'rect';
  if (symbol.includes('triangle')) return 'triangle';
  if (symbol.includes('cross')) return 'path://M430 80h164v350h350v164H594v350H430V594H80V430h350z';
  return 'circle';
}

function seriesName(trace: PlotTrace): string {
  return trace.showlegend === false ? '' : asString(trace.name);
}

function dashType(value: unknown): 'solid' | 'dashed' | 'dotted' {
  const dash = asString(value);
  if (dash.includes('dot')) return 'dotted';
  if (dash.includes('dash')) return 'dashed';
  return 'solid';
}

function colorscale(value: unknown): string[] {
  if (Array.isArray(value)) {
    const colors = value.map((entry) => Array.isArray(entry) ? entry[1] : entry).filter((entry): entry is string => typeof entry === 'string');
    if (colors.length) return colors;
  }
  return VIRIDIS;
}

function normalizeColor(value: string): string {
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgba) return value;
  const parts = rgba[1].split(',').map((part) => part.trim());
  return `rgba(${parts.slice(0, 3).join(',')},${parts[3] ?? 1})`;
}

/** Base text style taken from Plotly's `layout.font`. */
function chartTextStyle(layout: PlotLayout): Dict {
  const font = asDict(layout.font);
  return {
    fontFamily: asString(font.family) || CHART_FONT_FAMILY,
    fontSize: asNumber(font.size, 13),
  };
}

function fontStyle(font: Dict, fallbackSize: number, family: string = CHART_FONT_FAMILY): Dict {
  return {
    color: asString(font.color) || undefined,
    fontSize: asNumber(font.size, fallbackSize),
    fontFamily: asString(font.family) || family,
    fontWeight: asString(font.weight).includes('bold') || asString(font.family).includes('bold') ? 'bold' : undefined,
  };
}

function hasNumericColors(trace: PlotTrace): boolean {
  return numericArray(asDict(trace.marker).color) !== null;
}

function numericArray(value: unknown): number[] | null {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return null;
  const array = Array.from(value as ArrayLike<unknown>);
  if (!array.length || !array.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null;
  return array as number[];
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<unknown>);
  return [];
}

function asDict(value: unknown): Dict {
  return isDict(value) ? value : {};
}

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNumberPair(value: unknown): [number, number] | null {
  const array = asArray(value);
  return array.length >= 2 && array.every(isFiniteNumber) ? [Number(array[0]), Number(array[1])] : null;
}

function finiteOrUndefined(value: unknown): number | undefined {
  return isFiniteNumber(value) ? Number(value) : undefined;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatValue(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : String(value ?? '');
}

function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 10_000 || magnitude < 0.001) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}

function plainText(value: string): string {
  return value
    // Canvas text cannot render HTML <sub> tags.  Preserve chemical notation
    // with Unicode subscript glyphs instead of flattening Ti<sub>4</sub>H<sub>10</sub>
    // to the ambiguous Ti4H10.
    .replace(/<sub>(.*?)<\/sub>/gi, (_match, content: string) => unicodeSubscript(content))
    .replace(/<sup>(.*?)<\/sup>/gi, '^$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&Delta;/g, 'Δ')
    .replace(/&minus;/g, '−')
    .replace(/&nbsp;/g, ' ');
}

const SUBSCRIPT_GLYPHS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

function unicodeSubscript(value: string): string {
  return [...value].map((character) => SUBSCRIPT_GLYPHS[character] ?? character).join('');
}
