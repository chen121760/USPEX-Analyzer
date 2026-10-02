import { useEffect, useRef, useState } from 'react';
import type { ECharts } from 'echarts';
import { panTernaryViewport, selectTernaryViewport, ternaryRangePatch, ternaryViewportVertices, type Point2D, type TernaryRanges } from './ternaryZoom';

export type TernaryInteractionMode = 'inspect' | 'select' | 'pan';
interface Options {
  chart: ECharts | null;
  ranges: TernaryRanges;
  mode: TernaryInteractionMode;
  onZoom: (patch: Record<string, unknown>) => void;
  onComplete: () => void;
  onPreview: (ranges: TernaryRanges | null) => void;
}
interface Drag { pointerId: number; start: Point2D; pixel: Point2D; ranges: TernaryRanges; unitsPerPixel: Point2D }

/** The selection preview is transient; the final image is entirely rendered by ECharts. */
export function useTernaryZoom({ chart, ranges, mode, onZoom, onComplete, onPreview }: Options) {
  const latest = useRef({ ranges, onZoom, onComplete, onPreview });
  latest.current = { ranges, onZoom, onComplete, onPreview };
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!chart || mode === 'inspect') return;
    const host = chart.getDom();
    const boundary = host.parentElement;
    if (!boundary) return;
    let drag: Drag | null = null;
    let animationFrame: number | null = null;
    let pendingPreview: TernaryRanges | null = null;
    const previousCursor = host.style.cursor;
    host.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
    const pixel = (event: PointerEvent): [number, number] => {
      const rect = host.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const data = (point: Point2D): [number, number] => chart.convertFromPixel({ gridIndex: 0 }, [point[0], point[1]]) as [number, number];
    const clear = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null; pendingPreview = null;
      if (drag && boundary.hasPointerCapture(drag.pointerId)) boundary.releasePointerCapture(drag.pointerId);
      drag = null; setPreview(null);
      latest.current.onPreview(null);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!(event.target instanceof HTMLCanvasElement) || !host.contains(event.target)) return;
      const px = pixel(event);
      const start = data(px);
      const bounds = latest.current.ranges;
      if (!start?.every(Number.isFinite) || start[0] < bounds.x[0] || start[0] > bounds.x[1]
        || start[1] < bounds.y[0] || start[1] > bounds.y[1]) return;
      event.preventDefault(); event.stopPropagation();
      const step = data([px[0] + 1, px[1] + 1]);
      drag = { pointerId: event.pointerId, start, pixel: px, ranges: latest.current.ranges,
        unitsPerPixel: [step[0] - start[0], step[1] - start[1]] };
      boundary.setPointerCapture(event.pointerId);
    };
    const dragEnd = (current: Drag, px: Point2D): [number, number] => [
      current.start[0] + (px[0] - current.pixel[0]) * current.unitsPerPixel[0],
      current.start[1] + (px[1] - current.pixel[1]) * current.unitsPerPixel[1],
    ];
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const px = pixel(event);
      const end = dragEnd(drag, px);
      if (!end?.every(Number.isFinite)) return;
      if (mode === 'select') {
        const viewport = selectTernaryViewport(drag.start, end);
        setPreview(ternaryViewportVertices(viewport).map((v) => {
          const pixel = chart.convertToPixel({ gridIndex: 0 }, [v[0], v[1]]) as number[];
          return `${pixel[0]},${pixel[1]}`;
        }).join(' '));
      } else {
        pendingPreview = panTernaryViewport(drag.ranges, [drag.start[0] - end[0], drag.start[1] - end[1]]);
        if (animationFrame === null) animationFrame = requestAnimationFrame(() => {
          animationFrame = null;
          latest.current.onPreview(pendingPreview);
        });
      }
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const current = drag;
      const px = pixel(event);
      const end = dragEnd(current, px);
      const dx = Math.abs(px[0] - current.pixel[0]);
      const dy = Math.abs(px[1] - current.pixel[1]);
      clear();
      if (!end?.every(Number.isFinite)) return;
      if (mode === 'select' ? dx < 12 || dy < 12 : Math.hypot(dx, dy) < 8) return;
      const next = mode === 'select' ? selectTernaryViewport(current.start, end)
        : panTernaryViewport(current.ranges, [current.start[0] - end[0], current.start[1] - end[1]]);
      latest.current.onZoom(ternaryRangePatch(next));
      if (mode === 'select') latest.current.onComplete();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { clear(); latest.current.onComplete(); } };
    const suppressClick = (event: MouseEvent) => {
      if (event.target instanceof HTMLCanvasElement || event.target === boundary) { event.preventDefault(); event.stopPropagation(); }
    };
    boundary.addEventListener('pointerdown', down, true);
    boundary.addEventListener('click', suppressClick, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', clear);
    window.addEventListener('keydown', key);
    return () => {
      clear(); host.style.cursor = previousCursor;
      boundary.removeEventListener('pointerdown', down, true);
      boundary.removeEventListener('click', suppressClick, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('keydown', key);
    };
  }, [chart, mode]);

  return { overlay: preview && (
    <svg aria-hidden="true" className="ternary-zoom-preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6 }}>
      <polygon points={preview} fill="var(--color-accent)" fillOpacity={0.12} stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="6 4" />
    </svg>
  ) };
}
