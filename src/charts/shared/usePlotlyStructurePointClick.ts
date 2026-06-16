/**
 * React-side Plotly point interaction resolver for structure viewer links.
 *
 * Plotly's native hover/click association depends on its transient SVG layer.
 * Browser extensions can rewrite that layer, so structure hover and click are
 * resolved here from raw pointer coordinates and the plotted trace data.
 */
import { Fragment, createElement, useCallback, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getStructureIdFromTracePoint } from './plotClick';

interface PlotAxis {
  _offset?: number;
  d2p?: (value: unknown) => number;
  c2p?: (value: unknown) => number;
}

interface PlotLayout {
  _size?: {
    l?: number;
    t?: number;
  };
  [key: string]: unknown;
}

interface PlotTraceLike {
  customdata?: unknown;
  hoverinfo?: unknown;
  hovertemplate?: unknown;
  hovertext?: unknown;
  marker?: {
    size?: unknown;
  };
  mode?: string;
  name?: string;
  text?: unknown;
  type?: string;
  visible?: boolean | 'legendonly';
  x?: unknown;
  xaxis?: unknown;
  y?: unknown;
  yaxis?: unknown;
}

interface PlotGraphDiv extends HTMLElement {
  _fullData?: PlotTraceLike[];
  _fullLayout?: PlotLayout;
}

interface UsePlotlyStructurePointClickOptions {
  traces: PlotTraceLike[];
  onStructureClick: (structureId: number) => void;
  hoverDistancePx?: number;
  maxDistancePx?: number;
}

interface StructurePointCandidate {
  distance: number;
  id: number;
  html: string;
  pointX: number;
  pointY: number;
}

interface HoverPoint {
  html: string;
  boundaryBounds: DOMRect;
  left: number;
  pointY: number;
  top: number;
  maxWidth: number;
}

const DEFAULT_POINT_CLICK_RADIUS_PX = 10;
const DEFAULT_POINT_HOVER_RADIUS_PX = 8;
const MAX_CLICK_DRAG_DISTANCE_PX = 6;
const POINT_CLICK_PADDING_PX = 3;
const POINT_HOVER_PADDING_PX = 2;
const DEFAULT_MARKER_RADIUS_PX = 5;
const TOOLTIP_OFFSET_PX = 12;
const TOOLTIP_MAX_WIDTH_PX = 280;
const TOOLTIP_ESTIMATED_HEIGHT_PX = 110;
const HOVER_LOCK_SIZE_PX = 18;

export function usePlotlyStructurePointClick({
  traces,
  onStructureClick,
  hoverDistancePx = DEFAULT_POINT_HOVER_RADIUS_PX,
  maxDistancePx = DEFAULT_POINT_CLICK_RADIUS_PX,
}: UsePlotlyStructurePointClickOptions) {
  const { t } = useTranslation();
  const graphDivRef = useRef<PlotGraphDiv | null>(null);
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  const lockRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const clickHint = t('plot.clickToViewStructure', 'Click to view structure');

  const plotTraces = useMemo(
    () => traces.map(disableNativeStructureHover),
    [traces],
  );

  const hoverTooltip = useMemo(
    () => createStructureHoverOverlay(lockRef, tooltipRef),
    [],
  );

  const setGraphDiv = useCallback((_figure: unknown, graphDiv: unknown) => {
    if (isPlotGraphDiv(graphDiv)) {
      graphDivRef.current = graphDiv;
    }
  }, []);

  const handlePointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (shouldIgnoreClickTarget(event.target)) return;

    const pointerDown = pointerDownRef.current;
    pointerDownRef.current = null;

    if (
      pointerDown &&
      getDistance(pointerDown.x, pointerDown.y, event.clientX, event.clientY) > MAX_CLICK_DRAG_DISTANCE_PX
    ) {
      return;
    }

    const structurePoint = getStructurePointFromGraphEvent(
      event.nativeEvent,
      graphDivRef.current,
      traces,
      maxDistancePx,
      POINT_CLICK_PADDING_PX,
    );

    if (structurePoint === null) return;

    event.preventDefault();
    event.stopPropagation();
    hideStructureHoverState(lockRef.current, tooltipRef.current, boundaryRef.current);
    onStructureClick(structurePoint.id);
  }, [maxDistancePx, onStructureClick, traces]);

  const handlePointerMoveCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    boundaryRef.current = event.currentTarget;

    if (shouldIgnoreClickTarget(event.target)) {
      hideStructureHoverState(lockRef.current, tooltipRef.current, boundaryRef.current);
      return;
    }

    const structurePoint = getStructurePointFromGraphEvent(
      event.nativeEvent,
      graphDivRef.current,
      traces,
      hoverDistancePx,
      POINT_HOVER_PADDING_PX,
    );

    if (structurePoint === null || !graphDivRef.current) {
      hideStructureHoverState(lockRef.current, tooltipRef.current, boundaryRef.current);
      return;
    }

    const graphBounds = graphDivRef.current.getBoundingClientRect();
    const boundaryBounds = event.currentTarget.getBoundingClientRect();
    const boundaryX = graphBounds.left - boundaryBounds.left + structurePoint.pointX;
    const boundaryY = graphBounds.top - boundaryBounds.top + structurePoint.pointY;
    const maxWidth = Math.min(TOOLTIP_MAX_WIDTH_PX, Math.max(160, boundaryBounds.width - 16));

    showStructureHoverLock(lockRef.current, boundaryX, boundaryY);
    showStructureHoverTooltip(tooltipRef.current, {
      html: formatTooltipHtml(structurePoint.html, clickHint),
      boundaryBounds,
      left: clamp(boundaryX + TOOLTIP_OFFSET_PX, 8, Math.max(8, boundaryBounds.width - maxWidth - 8)),
      pointY: boundaryY,
      top: boundaryY + TOOLTIP_OFFSET_PX,
      maxWidth,
    });
    setStructurePointHoverActive(boundaryRef.current, true);
  }, [clickHint, hoverDistancePx, traces]);

  const handlePointerLeaveCapture = useCallback(() => {
    hideStructureHoverState(lockRef.current, tooltipRef.current, boundaryRef.current);
  }, []);

  return {
    boundaryHandlers: {
      onPointerDownCapture: handlePointerDownCapture,
      onClickCapture: handleClickCapture,
      onPointerLeave: handlePointerLeaveCapture,
      onPointerMoveCapture: handlePointerMoveCapture,
    },
    hoverTooltip,
    plotHandlers: {
      onInitialized: setGraphDiv,
      onUpdate: setGraphDiv,
    },
    plotTraces,
  };
}

function getStructurePointFromGraphEvent(
  event: MouseEvent,
  graphDiv: PlotGraphDiv | null,
  fallbackTraces: PlotTraceLike[],
  maxDistancePx: number,
  pointPaddingPx: number,
): StructurePointCandidate | null {
  if (!graphDiv?._fullLayout) return null;

  const bounds = graphDiv.getBoundingClientRect();
  const clickX = event.clientX - bounds.left;
  const clickY = event.clientY - bounds.top;
  const traces = graphDiv._fullData?.length ? graphDiv._fullData : fallbackTraces;
  let best: StructurePointCandidate | null = null;

  for (let traceIndex = traces.length - 1; traceIndex >= 0; traceIndex--) {
    const trace = traces[traceIndex];
    if (!isClickablePointTrace(trace)) continue;

    const xValues = asArray(trace.x);
    const yValues = asArray(trace.y);
    const pointCount = Math.min(xValues.length, yValues.length);
    const xAxis = getAxis(graphDiv._fullLayout, trace.xaxis, 'x');
    const yAxis = getAxis(graphDiv._fullLayout, trace.yaxis, 'y');
    if (!xAxis || !yAxis) continue;

    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const structureId = getStructureIdFromTracePoint(trace, pointIndex);
      if (structureId === null) continue;

      const pointX = axisValueToPagePixel(xAxis, xValues[pointIndex], graphDiv._fullLayout, 'x');
      const pointY = axisValueToPagePixel(yAxis, yValues[pointIndex], graphDiv._fullLayout, 'y');
      if (pointX === null || pointY === null) continue;

      const distance = getDistance(clickX, clickY, pointX, pointY);
      const threshold = Math.max(maxDistancePx, getMarkerRadius(trace, pointIndex) + pointPaddingPx);
      if (distance > threshold) continue;

      if (best === null || distance < best.distance) {
        best = {
          distance,
          id: structureId,
          html: getPointHtml(trace, pointIndex, structureId),
          pointX,
          pointY,
        };
      }
    }
  }

  return best;
}

function isClickablePointTrace(trace: PlotTraceLike): boolean {
  if (trace.visible === false || trace.visible === 'legendonly') return false;
  if (!trace.customdata) return false;

  const type = trace.type ?? 'scatter';
  if (type !== 'scatter' && type !== 'scattergl') return false;

  const mode = trace.mode ?? 'lines';
  return mode.includes('markers');
}

function getAxis(layout: PlotLayout, axisId: unknown, direction: 'x' | 'y'): PlotAxis | null {
  const key = axisIdToLayoutKey(axisId, direction);
  const axis = layout[key];
  if (isPlotAxis(axis)) return axis;
  const defaultAxis = layout[`${direction}axis`];
  return isPlotAxis(defaultAxis) ? defaultAxis : null;
}

function axisIdToLayoutKey(axisId: unknown, direction: 'x' | 'y'): string {
  if (typeof axisId !== 'string' || axisId === direction) {
    return `${direction}axis`;
  }

  return `${direction}axis${axisId.slice(1)}`;
}

function axisValueToPagePixel(
  axis: PlotAxis,
  value: unknown,
  layout: PlotLayout,
  direction: 'x' | 'y',
): number | null {
  const axisPixel = axis.d2p ? axis.d2p(value) : axis.c2p ? axis.c2p(value) : null;
  if (typeof axisPixel !== 'number' || !Number.isFinite(axisPixel)) return null;

  const defaultOffset = direction === 'x' ? layout._size?.l : layout._size?.t;
  return (axis._offset ?? defaultOffset ?? 0) + axisPixel;
}

function getMarkerRadius(trace: PlotTraceLike, pointIndex: number): number {
  const size = trace.marker?.size;
  const value = Array.isArray(size) ? size[pointIndex] : size;
  return typeof value === 'number' && Number.isFinite(value) ? value / 2 : DEFAULT_MARKER_RADIUS_PX;
}

function getPointHtml(trace: PlotTraceLike, pointIndex: number, structureId: number): string {
  const hoverText = resolveIndexedText(trace.hovertext, pointIndex);
  if (hoverText) return hoverText;

  const text = resolveIndexedText(trace.text, pointIndex);
  if (text) return text;

  return `EA${structureId}`;
}

function resolveIndexedText(value: unknown, pointIndex: number): string | null {
  const resolved = Array.isArray(value) ? value[pointIndex] : value;
  return typeof resolved === 'string' && resolved.trim() ? resolved : null;
}

function disableNativeStructureHover(trace: PlotTraceLike): PlotTraceLike {
  if (!isClickablePointTrace(trace)) return trace;

  return {
    ...trace,
    hoverinfo: 'skip',
    hovertemplate: null,
  };
}

function createStructureHoverOverlay(
  lockRef: RefObject<HTMLDivElement | null>,
  tooltipRef: RefObject<HTMLDivElement | null>,
) {
  return createElement(
    Fragment,
    null,
    createElement('div', {
      ref: lockRef,
      'aria-hidden': 'true',
      className: 'plotly-structure-hover-lock notranslate',
      translate: 'no',
      style: {
        position: 'absolute',
        display: 'none',
        left: 0,
        top: 0,
        zIndex: 29,
        width: HOVER_LOCK_SIZE_PX,
        height: HOVER_LOCK_SIZE_PX,
        border: '2px solid var(--color-primary)',
        borderRadius: '999px',
        background: 'rgba(37, 99, 235, 0.10)',
        boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.14)',
        pointerEvents: 'none',
        transform: 'translate(-50%, -50%)',
      },
    }),
    createElement('div', {
      ref: tooltipRef,
      className: 'plotly-structure-hover-tooltip notranslate',
      translate: 'no',
      style: {
        position: 'absolute',
        display: 'none',
        left: 0,
        top: 0,
        zIndex: 30,
        maxWidth: TOOLTIP_MAX_WIDTH_PX,
        padding: '8px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        background: 'var(--color-surface)',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
        color: 'var(--color-text)',
        fontSize: 12,
        lineHeight: 1.45,
        pointerEvents: 'none',
        whiteSpace: 'normal',
      },
    }),
  );
}

function showStructureHoverLock(element: HTMLDivElement | null, left: number, top: number) {
  if (!element) return;

  element.style.display = 'block';
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

function showStructureHoverTooltip(element: HTMLDivElement | null, hoverPoint: HoverPoint) {
  if (!element) return;

  element.innerHTML = hoverPoint.html;
  element.style.display = 'block';
  element.style.left = `${hoverPoint.left}px`;
  element.style.maxWidth = `${hoverPoint.maxWidth}px`;

  const tooltipHeight = Math.max(element.offsetHeight, TOOLTIP_ESTIMATED_HEIGHT_PX);
  const visibleBottom = Math.min(
    hoverPoint.boundaryBounds.height,
    window.innerHeight - hoverPoint.boundaryBounds.top,
  );
  const belowTop = hoverPoint.top;
  const aboveTop = hoverPoint.pointY - tooltipHeight - TOOLTIP_OFFSET_PX;
  const hasRoomBelow = belowTop + tooltipHeight <= visibleBottom - 8;
  const nextTop = hasRoomBelow ? belowTop : aboveTop;

  element.style.top = `${clamp(nextTop, 8, Math.max(8, visibleBottom - tooltipHeight - 8))}px`;
}

function hideStructureHoverTooltip(element: HTMLDivElement | null) {
  if (!element) return;

  element.style.display = 'none';
}

function hideStructureHoverLock(element: HTMLDivElement | null) {
  if (!element) return;

  element.style.display = 'none';
}

function hideStructureHoverState(
  lockElement: HTMLDivElement | null,
  tooltipElement: HTMLDivElement | null,
  boundaryElement: HTMLDivElement | null,
) {
  hideStructureHoverLock(lockElement);
  hideStructureHoverTooltip(tooltipElement);
  setStructurePointHoverActive(boundaryElement, false);
}

function setStructurePointHoverActive(boundaryElement: HTMLDivElement | null, isActive: boolean) {
  boundaryElement?.classList.toggle('plotly-structure-point-hover', isActive);
}

function formatTooltipHtml(html: string, clickHint: string): string {
  return [
    `<div class="plotly-structure-hover-hint">${escapeHtml(clickHint)}</div>`,
    html,
  ].join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value) && 'length' in value) {
    return Array.from(value as unknown as ArrayLike<unknown>);
  }
  return [];
}

function shouldIgnoreClickTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest([
    '.modebar-container',
    '.modebar',
    '.modebar-btn',
    'button',
    'a',
    'input',
    'select',
    'textarea',
  ].join(',')));
}

function isPlotGraphDiv(value: unknown): value is PlotGraphDiv {
  return value instanceof HTMLElement;
}

function isPlotAxis(value: unknown): value is PlotAxis {
  if (typeof value !== 'object' || value === null) return false;
  const axis = value as PlotAxis;
  return typeof axis.d2p === 'function' || typeof axis.c2p === 'function';
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
