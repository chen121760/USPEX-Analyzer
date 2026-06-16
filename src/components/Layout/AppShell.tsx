import { lazy, Suspense, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useUIStore } from '@/store/useUIStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { HintDrawer } from '@/components/HintCard/HintDrawer';

const loadStructureViewerModal = () =>
  import('@/components/StructureViewer/StructureViewerModal').then((module) => ({
    default: module.StructureViewerModal,
  }));

const StructureViewerModal = lazy(loadStructureViewerModal);

export function AppShell() {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const hintPanelOpen = useLayoutStore((s) => s.hintPanelOpen);
  const viewerStructureId = useUIStore((s) => s.viewerStructureId);
  const closeViewer = useUIStore((s) => s.closeViewer);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const warmViewer = () => {
      if (cancelled) return;
      void loadStructureViewerModal();
      void import('@/components/StructureViewer/jsmol-loader').then(({ preloadJSmol }) => {
        if (!cancelled) preloadJSmol();
      });
    };

    if (win.requestIdleCallback) {
      idleId = win.requestIdleCallback(warmViewer, { timeout: 3000 });
    } else {
      timeoutId = window.setTimeout(warmViewer, 2500);
    }

    return () => {
      cancelled = true;
      if (idleId !== null) win.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!isDataLoaded) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div
        className="main-area"
        style={{ marginRight: hintPanelOpen ? 300 : 0, transition: 'margin-right 0.22s cubic-bezier(0.16,1,0.3,1)' }}
        onTransitionEnd={(event) => {
          // 只处理右侧外边距动画结束，避免被子元素的 transition 冒泡触发
          if (event.propertyName !== 'margin-right') return;

          // 等浏览器完成一帧布局后再通知 Plotly，尺寸结果更稳定
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
          });
        }}
      >
        <Header />
        <div className="content">
          <Outlet />
        </div>
      </div>
      <HintDrawer />
      {viewerStructureId !== null && (
        <Suspense fallback={<StructureViewerFallback onClose={closeViewer} />}>
          <StructureViewerModal />
        </Suspense>
      )}
    </div>
  );
}

function StructureViewerFallback({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 280,
          padding: 18,
          borderRadius: 8,
          background: 'var(--color-surface, #fff)',
          color: 'var(--color-text, #333)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        正在加载结构查看器……
      </div>
    </div>
  );
}
