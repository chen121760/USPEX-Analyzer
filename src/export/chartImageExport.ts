import GIF from 'gif.js';
import * as echarts from 'echarts';
import { adaptToECharts } from '@/charts/shared/echartsAdapter';
import type { PlotData, PlotLayout } from '@/charts/shared/plotTypes';
import { downloadBlob, ensureFileExtension } from './exportFileNames';

export interface ExportAnimatedEChartsGifOptions<TFrame> {
  filename: string;
  frames: readonly TFrame[];
  sourceElement?: HTMLElement | null;
  width?: number;
  height?: number;
  layout?: PlotLayout;
  delayMs: number;
  workerScript?: string;
  workers?: number;
  quality?: number;
  buildFrameData: (frame: TFrame, index: number) => PlotData | Promise<PlotData>;
}

/** Render an animated chart entirely with Apache ECharts. */
export async function exportAnimatedEChartsGif<TFrame>({
  filename,
  frames,
  sourceElement,
  width,
  height,
  layout = {},
  delayMs,
  workerScript = `${import.meta.env.BASE_URL}gif.worker.js`,
  workers = 2,
  quality = 10,
  buildFrameData,
}: ExportAnimatedEChartsGifOptions<TFrame>): Promise<void> {
  if (frames.length === 0) return;

  const size = resolveExportSize(sourceElement, width, height);
  const renderHost = createOffscreenChartHost(size.width, size.height);
  const chart = echarts.init(renderHost, undefined, { renderer: 'canvas', width: size.width, height: size.height });

  try {
    const gif = new GIF({ workers, quality, workerScript });
    for (const [index, frame] of frames.entries()) {
      const frameData = await buildFrameData(frame, index);
      const adapted = adaptToECharts(frameData, { ...layout }, { displayModeBar: false });
      chart.setOption(adapted.option, { notMerge: true, lazyUpdate: false });
      await waitForAnimationFrame();

      const dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: 1,
        backgroundColor: resolveBackground(layout),
      });
      const image = await loadImage(dataUrl);
      gif.addFrame(image, { delay: delayMs });
    }

    const blob = await renderGif(gif);
    downloadBlob(blob, ensureFileExtension(filename, '.gif'));
  } finally {
    chart.dispose();
    renderHost.remove();
  }
}

function resolveExportSize(
  sourceElement?: HTMLElement | null,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const graphElement = sourceElement?.querySelector<HTMLElement>('[data-chart-engine="echarts"]') ?? sourceElement;
  const rect = graphElement?.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(width ?? rect?.width ?? graphElement?.offsetWidth ?? 900)),
    height: Math.max(1, Math.round(height ?? rect?.height ?? graphElement?.offsetHeight ?? 550)),
  };
}

function createOffscreenChartHost(width: number, height: number): HTMLElement {
  const element = document.createElement('div');
  Object.assign(element.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  });
  document.body.appendChild(element);
  return element;
}

function resolveBackground(layout: PlotLayout): string {
  return typeof layout.paper_bgcolor === 'string' ? layout.paper_bgcolor : '#fff';
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load ECharts frame image.'));
    image.src = src;
  });
}

function renderGif(gif: GIF): Promise<Blob> {
  return new Promise((resolve) => {
    gif.on('finished', (blob: Blob) => resolve(blob));
    gif.render();
  });
}
