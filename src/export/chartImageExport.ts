import GIF from 'gif.js';
import { downloadBlob, ensureFileExtension } from './exportFileNames';

export type PlotlyExportData = unknown;
export type PlotlyExportLayout = Record<string, unknown>;
export type PlotlyExportConfig = Record<string, unknown>;

interface PlotlyRenderer {
  react: (
    element: HTMLElement,
    data: PlotlyExportData[],
    layout: PlotlyExportLayout,
    config?: PlotlyExportConfig,
  ) => Promise<unknown>;
  toImage: (
    element: HTMLElement,
    options: { format: 'png'; width: number; height: number },
  ) => Promise<string>;
  purge?: (element: HTMLElement) => void;
}

export interface ExportAnimatedPlotlyGifOptions<TFrame> {
  filename: string;
  frames: readonly TFrame[];
  sourceElement?: HTMLElement | null;
  width?: number;
  height?: number;
  layout?: PlotlyExportLayout;
  delayMs: number;
  workerScript?: string;
  workers?: number;
  quality?: number;
  buildFrameData: (frame: TFrame, index: number) => PlotlyExportData[] | Promise<PlotlyExportData[]>;
}

export async function exportAnimatedPlotlyGif<TFrame>({
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
}: ExportAnimatedPlotlyGifOptions<TFrame>): Promise<void> {
  if (frames.length === 0) return;

  const size = resolvePlotlyExportSize(sourceElement, width, height);
  const Plotly = await loadPlotlyRenderer();
  const renderHost = createOffscreenPlotHost(size.width, size.height);

  try {
    const gif = new GIF({ workers, quality, workerScript });
    const baseLayout = clonePlotlyValue({
      ...layout,
      width: size.width,
      height: size.height,
      autosize: false,
    });

    for (const [index, frame] of frames.entries()) {
      const frameData = await buildFrameData(frame, index);
      await Plotly.react(
        renderHost,
        clonePlotlyValue(frameData),
        clonePlotlyValue(baseLayout),
        { staticPlot: true, displayModeBar: false, responsive: false },
      );
      await waitForAnimationFrame();

      const dataUrl = await Plotly.toImage(renderHost, {
        format: 'png',
        width: size.width,
        height: size.height,
      });
      const image = await loadImage(dataUrl);
      gif.addFrame(image, { delay: delayMs });
    }

    const blob = await renderGif(gif);
    downloadBlob(blob, ensureFileExtension(filename, '.gif'));
  } finally {
    Plotly.purge?.(renderHost);
    renderHost.remove();
  }
}

function resolvePlotlyExportSize(
  sourceElement?: HTMLElement | null,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const graphElement = sourceElement?.querySelector<HTMLElement>('.js-plotly-plot') ?? sourceElement;
  const rect = graphElement?.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(width ?? rect?.width ?? graphElement?.offsetWidth ?? 900)),
    height: Math.max(1, Math.round(height ?? rect?.height ?? graphElement?.offsetHeight ?? 550)),
  };
}

function createOffscreenPlotHost(width: number, height: number): HTMLElement {
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

async function loadPlotlyRenderer(): Promise<PlotlyRenderer> {
  const module = await import('plotly.js-dist-min');
  const maybeDefault = module as unknown as { default?: PlotlyRenderer };
  return maybeDefault.default ?? (module as unknown as PlotlyRenderer);
}

function clonePlotlyValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load Plotly frame image.'));
    image.src = src;
  });
}

function renderGif(gif: GIF): Promise<Blob> {
  return new Promise((resolve) => {
    gif.on('finished', (blob: Blob) => resolve(blob));
    gif.render();
  });
}
