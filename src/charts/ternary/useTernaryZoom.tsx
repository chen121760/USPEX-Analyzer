import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ECharts } from 'echarts';
import {
  isInsideTernary,
  ternaryFrameFromRanges,
  ternaryZoomScale,
  ternaryZoomWindow,
  type Point2D,
  type TernaryZoomWindow,
} from './ternaryZoom';

/** Below this the gesture is a click (structure points stay clickable). */
const DRAG_THRESHOLD_PX = 4;
/** ECharts paints its toolbox in the top-right corner of the host. */
const TOOLBOX_WIDTH_PX = 140;
const TOOLBOX_HEIGHT_PX = 46;

interface DragState {
  anchor: Point2D;
  start: [number, number];
  active: boolean;
  window: TernaryZoomWindow | null;
}

/** Pixel geometry of the triangle the chart is currently showing. */
interface ZoomFrame {
  /** Grid box with the triangle punched out (even-odd), in host pixels. */
  maskPath: string;
  /** The triangle outline itself. */
  outlinePoints: string;
  /** Corner labels of the zoomed view (the diagram's own ones get blanked). */
  labels: Array<{ key: string; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }>;
  /** Identity of the frame, used to skip redundant state updates. */
  signature: string;
}

export interface TernaryZoomOptions {
  /** Live ECharts instance, captured through `PlotFrame`'s `onInitialized`. */
  chart: ECharts | null;
  /** Receives the same relayout patch shape the rest of the app already uses. */
  onZoom: (patch: Record<string, unknown>) => void;
  /** Axis ranges the chart is currently drawn with — drives the zoom frame. */
  ranges?: { x: [number, number]; y: [number, number] } | null;
  /** Paper colour, used to blank everything outside the zoom triangle. */
  background?: string;
  /** Diagram edge colour, used for the frame outline. */
  frameColor?: string;
  /** Element symbol per triangle vertex, drawn on the zoomed frame's corners. */
  cornerLabels?: readonly [string, string, string];
  labelColor?: string;
  enabled?: boolean;
}

/**
 * Triangle-shaped zoom for the ternary phase diagram.
 *
 * A rectangle brush cannot frame a triangle: the diagram's edges run out of the
 * frame and the corners show neighbouring compositions.  So the view is always
 * an upright equilateral sub-triangle of the diagram — press a point to centre
 * on it, drag outwards to size the window, release to zoom.  While zoomed the
 * area outside the current triangle is blanked and the triangle is outlined, so
 * the frame the user gets is the same triangle shape as the initial view.
 *
 * Undo, the toolbox restore button and the blank double-click keep working
 * because the result is an ordinary viewport range patch.
 */
export function useTernaryZoom({
  chart,
  onZoom,
  ranges = null,
  background,
  frameColor,
  cornerLabels,
  labelColor,
  enabled = true,
}: TernaryZoomOptions): { overlay: ReactNode } {
  const [preview, setPreview] = useState<{ points: string; text: string; x: number; y: number } | null>(null);
  const [frame, setFrame] = useState<ZoomFrame | null>(null);
  const frameRef = useRef<ZoomFrame | null>(null);
  const [revision, setRevision] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  // The grid box keeps its aspect ratio at every zoom level, but it still moves
  // when the container resizes, so the frame has to be recomputed there too.
  useEffect(() => {
    if (!chart) return undefined;
    const host = chart.getDom();
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    let lastSize = '';
    const observer = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      if (size === lastSize) return;
      lastSize = size;
      setRevision((value) => value + 1);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [chart]);

  // Ranges arrive as a fresh object on every render, so the effect keys off the
  // four numbers instead — depending on the object re-ran it forever.
  const rangeX0 = ranges?.x[0];
  const rangeX1 = ranges?.x[1];
  const rangeY0 = ranges?.y[0];
  const rangeY1 = ranges?.y[1];
  const commitFrame = (next: ZoomFrame | null) => {
    const previous = frameRef.current;
    const unchanged = next && previous ? next.signature === previous.signature : next === previous;
    if (unchanged) return;
    frameRef.current = next;
    setFrame(next);
  };

  // Runs after PlotFrame has pushed the new ranges into ECharts, so the pixel
  // conversions below describe the frame that is actually on screen.
  useEffect(() => {
    if (
      !chart
      || rangeX0 === undefined || rangeX1 === undefined
      || rangeY0 === undefined || rangeY1 === undefined
    ) {
      commitFrame(null);
      return;
    }

    const xRange: [number, number] = [rangeX0, rangeX1];
    const yRange: [number, number] = [rangeY0, rangeY1];
    const window = ternaryFrameFromRanges(xRange, yRange);
    if (!window) {
      commitFrame(null);
      return;
    }

    const toPixel = (point: Point2D): [number, number] | null => {
      try {
        const pixel = chart.convertToPixel({ gridIndex: 0 }, [point[0], point[1]]) as number[];
        return Array.isArray(pixel) && Number.isFinite(pixel[0]) && Number.isFinite(pixel[1])
          ? [pixel[0], pixel[1]]
          : null;
      } catch {
        return null;
      }
    };

    const corners = [
      toPixel([xRange[0], yRange[1]]),
      toPixel([xRange[1], yRange[1]]),
      toPixel([xRange[1], yRange[0]]),
      toPixel([xRange[0], yRange[0]]),
    ];
    const triangle = window.vertices.map(toPixel);
    if (corners.some((corner) => corner === null) || triangle.some((vertex) => vertex === null)) {
      commitFrame(null);
      return;
    }

    const path = (points: Array<[number, number]>): string =>
      points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
    const vertices = triangle as Array<[number, number]>;
    const maskPath = `${path(corners as Array<[number, number]>)} ${path(vertices)}`;
    const outlinePoints = vertices.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const centrePixel: [number, number] = [
      (vertices[0][0] + vertices[1][0] + vertices[2][0]) / 3,
      (vertices[0][1] + vertices[1][1] + vertices[2][1]) / 3,
    ];
    const labels = (cornerLabels ?? []).slice(0, 3).map((text, index) => {
      const [x, y] = vertices[index];
      const dx = x - centrePixel[0];
      const dy = y - centrePixel[1];
      const length = Math.hypot(dx, dy) || 1;
      const anchor = dx > length * 0.35 ? 'start' as const : dx < -length * 0.35 ? 'end' as const : 'middle' as const;
      return { key: text + index, x: x + (dx / length) * 16, y: y + (dy / length) * 16, text, anchor };
    });

    commitFrame({
      maskPath,
      outlinePoints,
      labels,
      signature: `${maskPath}|${outlinePoints}|${labels.map((label) => label.text).join(',')}`,
    });
  }, [chart, rangeX0, rangeX1, rangeY0, rangeY1, revision, cornerLabels]);

  useEffect(() => {
    if (!enabled || !chart) return undefined;

    const host = chart.getDom() as HTMLElement | null;
    const boundary = host?.parentElement ?? null;
    const canvas = host?.querySelector('canvas') ?? null;
    if (!host || !boundary || !canvas) return undefined;

    const toData = (px: number, py: number): Point2D | null => {
      try {
        const point = chart.convertFromPixel({ gridIndex: 0 }, [px, py]) as number[];
        return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
          ? [point[0], point[1]]
          : null;
      } catch {
        return null;
      }
    };

    const toPixel = (point: Point2D): [number, number] | null => {
      try {
        const pixel = chart.convertToPixel({ gridIndex: 0 }, [point[0], point[1]]) as number[];
        return Array.isArray(pixel) && Number.isFinite(pixel[0]) && Number.isFinite(pixel[1])
          ? [pixel[0], pixel[1]]
          : null;
      } catch {
        return null;
      }
    };

    const cursorPixel = (event: PointerEvent): [number, number] => {
      const rect = host.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };

    const clear = () => {
      dragRef.current = null;
      setPreview(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      // Only plain canvas presses: axis chips, tooltips and buttons keep their own gestures.
      if (event.target !== canvas && event.target !== host) return;

      const [px, py] = cursorPixel(event);
      const rect = host.getBoundingClientRect();
      if (px > rect.width - TOOLBOX_WIDTH_PX && py < TOOLBOX_HEIGHT_PX) return;

      const anchor = toData(px, py);
      if (!anchor || !isInsideTernary(anchor)) return;

      dragRef.current = { anchor, start: [px, py], active: false, window: null };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const [px, py] = cursorPixel(event);
      if (!drag.active) {
        if (Math.hypot(px - drag.start[0], py - drag.start[1]) < DRAG_THRESHOLD_PX) return;
        drag.active = true;
        boundary.setPointerCapture?.(event.pointerId);
      }

      // The drag belongs to the zoom tool from here on: keep it away from the
      // chart's own pointer handling (roaming, hover, brush).
      event.preventDefault();
      event.stopPropagation();

      const current = toData(px, py);
      if (!current) return;

      const distance = Math.hypot(current[0] - drag.anchor[0], current[1] - drag.anchor[1]);
      const window = ternaryZoomWindow(drag.anchor, ternaryZoomScale(distance));
      drag.window = window;

      const points = window.vertices
        .map((vertex) => toPixel(vertex))
        .filter((pixel): pixel is [number, number] => pixel !== null);
      const centre = toPixel(drag.anchor);

      if (points.length === 3 && centre) {
        setPreview({
          points: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
          x: centre[0] + 10,
          y: centre[1] - 8,
          text: `×${(1 / window.scale).toFixed(window.scale < 0.1 ? 0 : 1)}`,
        });
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.active) {
        event.preventDefault();
        event.stopPropagation();
        boundary.releasePointerCapture?.(event.pointerId);
      }

      const committed = drag.active ? drag.window : null;
      clear();

      if (!committed) return;
      onZoomRef.current({
        'xaxis.range[0]': committed.ranges.x[0],
        'xaxis.range[1]': committed.ranges.x[1],
        'yaxis.range[0]': committed.ranges.y[0],
        'yaxis.range[1]': committed.ranges.y[1],
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) clear();
    };

    boundary.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', clear, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      boundary.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', clear, true);
      window.removeEventListener('keydown', handleKeyDown);
      clear();
    };
  }, [chart, enabled]);

  const overlay = (
    <>
      {frame && (
        <svg
          className="ternary-zoom-frame notranslate"
          aria-hidden="true"
          // The root has to stay transparent to pointer events or it swallows
          // every later gesture; the blanked corners opt back in below.
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}
        >
          {/* Everything outside the current triangle is blanked, so the frame the
              user sees is the triangle itself rather than a rectangle that cuts
              it off. */}
          <path
            d={frame.maskPath}
            fillRule="evenodd"
            fill={background || '#fff'}
            // `painted` + `evenodd` keeps the triangle itself clickable while the
            // blanked corners stop hover/click on points that are no longer shown.
            style={{ pointerEvents: 'painted' }}
          />
          <polygon
            points={frame.outlinePoints}
            fill="none"
            stroke={frameColor || 'currentColor'}
            strokeWidth={1.5}
            style={{ pointerEvents: 'none' }}
          />
          {frame.labels.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              dominantBaseline="middle"
              style={{ fill: labelColor || frameColor, fontSize: 13, fontWeight: 700, pointerEvents: 'none' }}
            >
              {label.text}
            </text>
          ))}
        </svg>
      )}
      {preview && (
        <svg
          className="ternary-zoom-preview notranslate"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6 }}
        >
          <polygon
            points={preview.points}
            style={{
              fill: 'color-mix(in srgb, var(--color-primary) 16%, transparent)',
              stroke: 'var(--color-primary)',
              strokeWidth: 1.6,
              strokeDasharray: '6 4',
            }}
          />
          <text
            x={preview.x}
            y={preview.y}
            style={{ fill: 'var(--color-primary)', fontSize: 12, fontWeight: 600 }}
          >
            {preview.text}
          </text>
        </svg>
      )}
    </>
  );

  return { overlay };
}
