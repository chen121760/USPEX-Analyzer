import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import { adaptToECharts } from './echartsAdapter';
import type { PlotFrameProps } from './plotTypes';

const DEFAULT_PLOT_STYLE: CSSProperties = { width: '100%', height: '100%' };

/** Shared Apache ECharts renderer for every analysis chart. */
export function PlotFrame({
  boundaryClassName,
  boundaryHandlers,
  boundaryStyle,
  editableAxisTitles,
  axisTitleEditHint,
  className,
  config = {},
  data,
  hoverTooltip,
  layout = {},
  onClick,
  onInitialized,
  onRelayout,
  onAxisTitleDoubleClick,
  onStructureClick,
  onUpdate,
  revision,
  style,
}: PlotFrameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const callbacksRef = useRef({ onClick, onInitialized, onRelayout, onStructureClick, onUpdate });
  callbacksRef.current = { onClick, onInitialized, onRelayout, onStructureClick, onUpdate };

  // Chart layouts are expressed in Plotly domains (fractions of the plot area),
  // so the adapter needs the measured container for two things: letterboxing a
  // fixed-aspect box (ECharts has no `scaleanchor`) and turning a domain into
  // ECharts' pixel insets.  Passing it only for the former left marginal panels
  // laid out against a fictional 1000x700 canvas.
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const reportFrameSize = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!(width > 0) || !(height > 0)) return;
    setFrameSize((current) => (
      current && current.width === width && current.height === height ? current : { width, height }
    ));
  }, []);
  useLayoutEffect(() => { reportFrameSize(); }, [reportFrameSize]);

  const measuredFrame = frameSize;
  const adapted = useMemo(
    () => adaptToECharts(data, layout, config, measuredFrame),
    [config, data, layout, revision, measuredFrame],
  );
  const adaptedRef = useRef(adapted);
  adaptedRef.current = adapted;
  const plotStyle = useMemo(() => ({ ...DEFAULT_PLOT_STYLE, ...style }), [style]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    echarts.getInstanceByDom(host)?.dispose();
    const chart = echarts.init(host, undefined, {
      renderer: 'canvas',
      useDirtyRect: !adaptedRef.current.is3D,
    });
    chartRef.current = chart;
    chart.setOption(adaptedRef.current.option, { notMerge: true, lazyUpdate: false });
    callbacksRef.current.onInitialized?.(adaptedRef.current.option, chart);

    const handleClick = (params: unknown) => {
      const record = isRecord(params) ? params : {};
      const datum = isRecord(record.data) ? record.data : {};
      const structureId = coerceStructureId(datum.customdata);
      if (structureId !== null) callbacksRef.current.onStructureClick?.(structureId);

      callbacksRef.current.onClick?.({
        points: [{
          customdata: datum.customdata,
          curveNumber: optionalFinite(record.seriesIndex),
          pointIndex: optionalFinite(record.dataIndex),
          pointNumber: optionalFinite(record.dataIndex),
          data: { customdata: datum.customdata },
        }],
      });
    };

    const handleDataZoom = (event: unknown) => {
      const callback = callbacksRef.current.onRelayout;
      if (!callback) return;
      const zoom = readZoomEvent(event);
      const patch: Record<string, unknown> = {};
      const ranges = adaptedRef.current.axisRanges;
      if (ranges.x && zoom.axis !== 'y') {
        patch['xaxis.range[0]'] = interpolate(ranges.x[0], ranges.x[1], zoom.start);
        patch['xaxis.range[1]'] = interpolate(ranges.x[0], ranges.x[1], zoom.end);
      }
      if (ranges.y && zoom.axis !== 'x') {
        patch['yaxis.range[0]'] = interpolate(ranges.y[0], ranges.y[1], zoom.start);
        patch['yaxis.range[1]'] = interpolate(ranges.y[0], ranges.y[1], zoom.end);
      }
      callback(patch);
    };

    const handleRestore = () => callbacksRef.current.onRelayout?.({
      'xaxis.autorange': true,
      'yaxis.autorange': true,
    });

    const handleCamera = (event: unknown) => {
      const callback = callbacksRef.current.onRelayout;
      if (!callback || !isRecord(event)) return;
      const alpha = finite(event.alpha, 20);
      const beta = finite(event.beta, 40);
      const distance = Math.max(1, finite(event.distance, 140));
      const radial = distance / 70;
      const alphaRad = alpha * Math.PI / 180;
      const betaRad = beta * Math.PI / 180;
      callback({
        'scene.camera': {
          eye: {
            x: radial * Math.cos(alphaRad) * Math.cos(betaRad),
            y: radial * Math.cos(alphaRad) * Math.sin(betaRad),
            z: radial * Math.sin(alphaRad),
          },
          center: { x: 0, y: 0, z: 0 },
        },
      });
    };

    chart.on('click', handleClick);
    chart.on('datazoom', handleDataZoom);
    chart.on('restore', handleRestore);
    chart.on('grid3dcamerachanged', handleCamera);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          chart.resize();
          reportFrameSize();
        });
    resizeObserver?.observe(host);
    if (host.parentElement) resizeObserver?.observe(host.parentElement);

    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [reportFrameSize]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(adapted.option, { notMerge: true, lazyUpdate: false });
    callbacksRef.current.onUpdate?.(adapted.option, chart);
  }, [adapted]);

  return (
    <div
      className={['chart-interaction-boundary', 'notranslate', boundaryClassName].filter(Boolean).join(' ')}
      translate="no"
      style={{ position: 'relative', ...boundaryStyle }}
      {...boundaryHandlers}
    >
      <div ref={hostRef} className={className} style={plotStyle} data-chart-engine="echarts" />
      {editableAxisTitles && onAxisTitleDoubleClick && (
        adapted.is3D ? (
          <div style={{ position: 'absolute', left: 10, bottom: 8, display: 'flex', gap: 6, zIndex: 4 }}>
            {(['x', 'y', 'z'] as const).map((axis) => editableAxisTitles[axis] ? (
              <button
                key={axis}
                type="button"
                aria-label={`${axis.toUpperCase()}: ${editableAxisTitles[axis]}`}
                title={axisTitleEditHint}
                onDoubleClick={() => onAxisTitleDoubleClick(axis)}
                style={axisChipStyle}
              >
                <strong>{axis.toUpperCase()}</strong> · {editableAxisTitles[axis]}
              </button>
            ) : null)}
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={`X: ${editableAxisTitles.x}`}
              title={axisTitleEditHint}
              onDoubleClick={() => onAxisTitleDoubleClick('x')}
              style={{ ...axisOverlayStyle, left: '50%', bottom: 7, transform: 'translateX(-50%)' }}
            >
              {editableAxisTitles.x}
            </button>
            <button
              type="button"
              aria-label={`Y: ${editableAxisTitles.y}`}
              title={axisTitleEditHint}
              onDoubleClick={() => onAxisTitleDoubleClick('y')}
              style={{ ...axisOverlayStyle, left: 2, top: '50%', transform: 'translate(-35%, -50%) rotate(-90deg)' }}
            >
              {editableAxisTitles.y}
            </button>
          </>
        )
      )}
      {hoverTooltip}
    </div>
  );
}

const axisOverlayStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 4,
  padding: '2px 5px',
  border: 0,
  borderRadius: 4,
  background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
  color: 'var(--color-text-secondary)',
  fontSize: 12,
  cursor: 'text',
  whiteSpace: 'nowrap',
};

const axisChipStyle: CSSProperties = {
  padding: '3px 7px',
  border: '1px solid var(--color-border)',
  borderRadius: 5,
  background: 'color-mix(in srgb, var(--color-bg) 82%, transparent)',
  color: 'var(--color-text-secondary)',
  fontSize: 11,
  cursor: 'text',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceStructureId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = coerceStructureId(entry);
      if (id !== null) return id;
    }
  }
  if (isRecord(value)) return coerceStructureId(value.structureId ?? value.id ?? value.eaId);
  return null;
}

function readZoomEvent(event: unknown): { start: number; end: number; axis: 'x' | 'y' | null } {
  if (!isRecord(event)) return { start: 0, end: 100, axis: null };
  const source = Array.isArray(event.batch) && isRecord(event.batch[0]) ? event.batch[0] : event;
  const id = typeof source.dataZoomId === 'string' ? source.dataZoomId : '';
  const index = typeof source.dataZoomIndex === 'number' ? source.dataZoomIndex : null;
  const axis = id === 'zoom-x' || index === 0 ? 'x' : id === 'zoom-y' || index === 1 ? 'y' : null;
  return { start: finite(source.start, 0), end: finite(source.end, 100), axis };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function interpolate(min: number, max: number, percent: number): number {
  return min + (max - min) * Math.min(100, Math.max(0, percent)) / 100;
}
