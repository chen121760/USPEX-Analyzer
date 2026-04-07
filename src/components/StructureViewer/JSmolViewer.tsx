import { useEffect, useRef, useState } from 'react';
import { loadJSmol, J2S_PATH } from './jsmol-loader';

interface Props {
  poscarText: string;
  script?: string;
  width?: number | string;
  height?: number | string;
}

let appletCounter = 0;

export function JSmolViewer({
  poscarText,
  script = '',
  width = '100%',
  height = 500,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);
  const idRef = useRef(`jmolApp${appletCounter++}`);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadJSmol()
      .then((Jmol) => {
        if (cancelled || !containerRef.current) return;

        const loadCmd =
          'load DATA "model"\n' +
          poscarText +
          '\nend "model";\n' +
          'unitcell on;\n' +
          script;

        const Info = {
          width: typeof width === 'number' ? width : 600,
          height: typeof height === 'number' ? height : 500,
          debug: false,
          color: '0xFFFFFF',
          use: 'HTML5',
          j2sPath: J2S_PATH,
          serverURL: '',
          script: loadCmd,
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
    const loadCmd =
      'load DATA "model"\n' +
      poscarText +
      '\nend "model";\n' +
      'unitcell on;\n' +
      script;
    window.Jmol.script(appletRef.current, loadCmd);
  }, [poscarText, script, ready]);

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>JSmol 加载失败: {error}</div>;
  }

  return (
    <div>
      {!ready && <div style={{ padding: 12, color: '#666' }}>正在加载 JSmol……</div>}
      <div ref={containerRef} style={{ width, height }} />
    </div>
  );
}
