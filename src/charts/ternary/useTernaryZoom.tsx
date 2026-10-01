import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ECharts } from 'echarts';
import {
  isInsideTernary,
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

export interface TernaryZoomOptions {
  /** Live ECharts instance, captured through `PlotFrame`'s `onInitialized`. */
  chart: ECharts | null;
  /** Receives the same relayout patch shape the rest of the app already uses. */
  onZoom: (patch: Record<string, unknown>) => void;
  enabled?: boolean;
}

/**
 * Magnifier-style triangle zoom for the ternary phase diagram.
 *
 * Press anywhere in the diagram: that point becomes the centre of the new view.
 * Drag outwards and an upright equilateral triangle grows around it; release
 * and the chart zooms to exactly that triangle, so the frame that comes out is
 * the same triangle shape the diagram started with.  Undo, the toolbox restore
 * button and the blank double-click keep working because the result is an
 * ordinary viewport range patch.
 */
export function useTernaryZoom({ chart, onZoom, enabled = true }: TernaryZoomOptions): { overlay: ReactNode } {
  const [preview, setPreview] = useState<{ points: string; text: string; x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useEffect(() => {
    if (!enabled || !chart) return undefined;

    const host = chart.getDom() as HTMLElement | null;
    const boundary = host?.parentElement ?? null;
    const canvas = host?.querySelector('canvas') ?? null;
    if (!host || !boundary || !canvas) return undefined;

    const hostOffset = (): [number, number] => {
      const hostRect = host.getBoundingClientRect();
      const boundaryRect = boundary.getBoundingClientRect();
      return [hostRect.left - boundaryRect.left, hostRect.top - boundaryRect.top];
    };

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
      // chart's own pointer handling (Pan/Zoom roaming, hover, brush).
      event.preventDefault();
      event.stopPropagation();

      const current = toData(px, py);
      if (!current) return;

      const distance = Math.hypot(current[0] - drag.anchor[0], current[1] - drag.anchor[1]);
      const window = ternaryZoomWindow(drag.anchor, ternaryZoomScale(distance));
      drag.window = window;

      const [offsetX, offsetY] = hostOffset();
      const points = window.vertices
        .map((vertex) => toPixel(vertex))
        .filter((pixel): pixel is [number, number] => pixel !== null)
        .map(([x, y]) => `${(x + offsetX).toFixed(1)},${(y + offsetY).toFixed(1)}`);
      const centre = toPixel(drag.anchor);

      if (points.length === 3 && centre) {
        setPreview({
          points: points.join(' '),
          x: centre[0] + offsetX + 10,
          y: centre[1] + offsetY - 8,
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

  const overlay = preview ? (
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
  ) : null;

  return { overlay };
}
