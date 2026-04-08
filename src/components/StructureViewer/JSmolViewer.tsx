import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { loadJSmol, J2S_PATH } from './jsmol-loader';

interface Props {
  poscarText: string;
  script?: string;
  loadScript?: string;
  width?: number | string;
  height?: number | string;
}

export interface JSmolViewerHandle {
  /** Run a Jmol script on the current applet */
  runScript: (script: string) => void;
  /** Evaluate a Jmol expression and return the result */
  evalVar: (expr: string) => any;
}

let appletCounter = 0;

export const JSmolViewer = forwardRef<JSmolViewerHandle, Props>(function JSmolViewer(
  { poscarText, script = '', loadScript, width = '100%', height = 500 },
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

        const Info = {
          width: typeof width === 'number' ? width : 600,
          height: typeof height === 'number' ? height : 500,
          debug: false,
          color: '0xFFFFFF',
          use: 'HTML5',
          j2sPath: J2S_PATH,
          serverURL: '',
          script: buildLoadCommand(),
          disableJ2SLoadMonitor: true,
          disableInitialConsole: true,
          allowJavaScript: true,
          readyFunction: () => {
            if (!cancelled) setReady(true);
          },
        };

        const html = Jmol.getAppletHtml(idRef.current, Info);
        containerRef.current.innerHTML = html;
        appletRef.current = (window as any)[idRef.current];
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
      appletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !appletRef.current || !window.Jmol) return;
    window.Jmol.script(appletRef.current, buildLoadCommand());
  }, [poscarText, script, loadScript, ready]);

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>JSmol 加载失败: {error}</div>;
  }

  return (
    <div>
      {!ready && <div style={{ padding: 12, color: '#666' }}>正在加载 JSmol……</div>}
      <div ref={containerRef} style={{ width, height }} />
    </div>
  );
});
