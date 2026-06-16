/**
 * React wrapper for the bundled JSmol applet.
 *
 * JSmol keeps part of its mouse state and load monitor in global DOM objects.
 * This component owns the applet lifecycle and explicitly removes those
 * globals on unmount so Plotly hover/click hit-testing is not blocked after the
 * structure modal closes.
 */
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { loadJSmol, J2S_PATH } from './jsmol-loader';

interface Props {
  poscarText: string;
  script?: string;
  loadScript?: string;
  width?: number | string;
  height?: number | string;
  backgroundColor?: 'white' | 'black';
}

export interface JSmolViewerHandle {
  /** Run a Jmol script on the current applet */
  runScript: (script: string) => void;
  /** Evaluate a Jmol expression and return the result */
  evalVar: (expr: string) => any;
}

let appletCounter = 0;
const JMOL_LOADER_STATUS_ID = '_Loader-status';
const FALLBACK_APPLET_WIDTH = 600;
const FALLBACK_APPLET_HEIGHT = 500;
const JMOL_BACKGROUND_HEX = {
  white: '0xFFFFFF',
  black: '0x000000',
} as const;

interface AppletSize {
  width: number;
  height: number;
}

function getAppletCanvas(applet: unknown): unknown {
  if (typeof applet !== 'object' || applet === null) return null;
  return (applet as { _canvas?: unknown })._canvas ?? null;
}

function removeAppletDom(appletId: string, container: HTMLElement | null): void {
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[id]'))) {
    if (node === container) continue;

    const nodeId = node.id;
    if (
      nodeId === JMOL_LOADER_STATUS_ID ||
      nodeId === appletId ||
      nodeId.startsWith(`${appletId}_`) ||
      nodeId.startsWith(`span_${appletId}`)
    ) {
      node.remove();
    }
  }
}

function cleanupJSmolInstance(
  appletId: string,
  applet: unknown,
  container: HTMLElement | null,
): void {
  const Jmol = typeof window !== 'undefined' ? window.Jmol : null;

  if (Jmol) {
    const canvas = getAppletCanvas(applet);

    try {
      Jmol._setMouseOwner?.(null);
    } catch {
      // JSmol cleanup must be best-effort because applet internals vary by load state.
    }

    try {
      if (canvas) Jmol._jsUnsetMouse?.(canvas);
    } catch {
      // Ignore partial teardown errors from JSmol internals.
    }

    try {
      if (canvas) Jmol._unsetMouse?.(canvas);
    } catch {
      // Ignore partial teardown errors from JSmol internals.
    }

    try {
      if (applet) Jmol._destroy?.(applet);
    } catch {
      // Ignore partial teardown errors from JSmol internals.
    }

    try {
      const applets = Jmol._applets as Record<string, unknown> | undefined;
      if (applets) {
        for (const key of Object.keys(applets)) {
          if (key === appletId || key.startsWith(`${appletId}__`)) {
            delete applets[key];
          }
        }
      }
    } catch {
      // Ignore registry cleanup errors from JSmol internals.
    }
  }

  removeAppletDom(appletId, container);

  if (container) {
    container.innerHTML = '';
  }

  try {
    delete (window as unknown as Record<string, unknown>)[appletId];
  } catch {
    (window as unknown as Record<string, unknown>)[appletId] = undefined;
  }
}

function getAppletSize(
  container: HTMLElement,
  width: number | string,
  height: number | string,
): AppletSize {
  const rect = container.getBoundingClientRect();

  return {
    width: resolveAppletDimension(width, rect.width, FALLBACK_APPLET_WIDTH),
    height: resolveAppletDimension(height, rect.height, FALLBACK_APPLET_HEIGHT),
  };
}

function resolveAppletDimension(value: number | string, measured: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (Number.isFinite(measured) && measured > 0) {
    return Math.round(measured);
  }

  return fallback;
}

function resizeJSmolApplet(applet: unknown, size: AppletSize): void {
  const Jmol = typeof window !== 'undefined' ? window.Jmol : null;
  if (!Jmol || !applet) return;

  try {
    Jmol.resizeApplet?.(applet, [size.width, size.height]);
  } catch {
    // Some JSmol load states cannot be resized yet; the next observer tick will retry.
  }
}

function normalizeJSmolDom(appletId: string): void {
  const appletDiv = document.getElementById(`${appletId}_appletdiv`);
  if (appletDiv) {
    appletDiv.style.fontSize = '0';
    appletDiv.style.lineHeight = '0';
  }

  const canvas = document.getElementById(`${appletId}_canvas2d`) as HTMLCanvasElement | null;
  if (canvas) {
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
  }

  appletDiv
    ?.querySelectorAll<HTMLImageElement>('img[width="0"][height="0"]')
    .forEach((img) => {
      img.style.display = 'none';
    });
}

function setJSmolBackground(applet: unknown, backgroundColor: 'white' | 'black'): void {
  const Jmol = typeof window !== 'undefined' ? window.Jmol : null;
  if (!Jmol || !applet) return;

  try {
    Jmol.script(applet, `background ${backgroundColor};`);
  } catch {
    // JSmol may reject scripts while it is still finishing a model load.
  }
}

export const JSmolViewer = forwardRef<JSmolViewerHandle, Props>(function JSmolViewer(
  { poscarText, script = '', loadScript, width = '100%', height = 500, backgroundColor = 'white' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);
  const idRef = useRef(`jmolApp${appletCounter++}`);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const buildLoadCommand = () => (
    loadScript ??
    ('load DATA "model"\n' +
      poscarText +
      '\nend "model";\n' +
      'unitcell on;\n' +
      script)
  );

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    runScript(s: string) {
      if (ready && appletRef.current && window.Jmol) {
        window.Jmol.script(appletRef.current, s);
      }
    },
    evalVar(expr: string) {
      if (ready && appletRef.current && window.Jmol) {
        return window.Jmol.evaluateVar(appletRef.current, expr);
      }
      return null;
    },
  }), [ready]);

  useEffect(() => {
    let cancelled = false;

    loadJSmol()
      .then((Jmol) => {
        if (cancelled || !containerRef.current) return;
        cleanupJSmolInstance(idRef.current, null, containerRef.current);
        const appletSize = getAppletSize(containerRef.current, width, height);

        const Info = {
          width: appletSize.width,
          height: appletSize.height,
          zIndexBase: 1,
          debug: false,
          color: JMOL_BACKGROUND_HEX[backgroundColor],
          use: 'HTML5',
          j2sPath: J2S_PATH,
          serverURL: '',
          script: buildLoadCommand(),
          disableJ2SLoadMonitor: true,
          disableInitialConsole: true,
          allowJavaScript: true,
          readyFunction: () => {
            if (!cancelled) {
              normalizeJSmolDom(idRef.current);
              setJSmolBackground(appletRef.current, backgroundColor);
              setReady(true);
            }
          },
        };

        const html = Jmol.getAppletHtml(idRef.current, Info);
        containerRef.current.innerHTML = html;
        normalizeJSmolDom(idRef.current);
        appletRef.current = (window as any)[idRef.current];
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      cleanupJSmolInstance(idRef.current, appletRef.current, containerRef.current);
      appletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !appletRef.current || !containerRef.current || typeof ResizeObserver === 'undefined') return;

    let frameId: number | null = null;
    let lastSize: AppletSize | null = null;

    const scheduleResize = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (!containerRef.current) return;

        const nextSize = getAppletSize(containerRef.current, width, height);
        if (
          lastSize &&
          nextSize.width === lastSize.width &&
          nextSize.height === lastSize.height
        ) {
          return;
        }

        lastSize = nextSize;
        resizeJSmolApplet(appletRef.current, nextSize);
        normalizeJSmolDom(idRef.current);
      });
    };

    const observer = new ResizeObserver(scheduleResize);
    observer.observe(containerRef.current);
    if (containerRef.current.parentElement) observer.observe(containerRef.current.parentElement);
    scheduleResize();

    return () => {
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [height, ready, width]);

  useEffect(() => {
    if (!ready || !appletRef.current || !window.Jmol) return;
    window.Jmol.script(appletRef.current, buildLoadCommand());
  }, [poscarText, script, loadScript, ready]);

  useEffect(() => {
    if (!ready || !appletRef.current) return;
    setJSmolBackground(appletRef.current, backgroundColor);
  }, [backgroundColor, ready]);

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>JSmol 加载失败: {error}</div>;
  }

  return (
    <div style={{ position: 'relative', width, height, minHeight: 0, overflow: 'hidden', isolation: 'isolate', background: backgroundColor }}>
      {!ready && <div style={{ padding: 12, color: '#666' }}>正在加载 JSmol……</div>}
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
    </div>
  );
});
