import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useUIStore } from '@/store/useUIStore';
import { useSymmetryAutoAnalysis } from '@/hooks/useSymmetryAnalysis';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { HintDrawer } from '@/components/HintCard/HintDrawer';
import { Spinner } from '@/components/ui/Spinner';
import { SkeletonRows } from '@/components/ui/Skeleton';

const loadStructureViewerModal = () =>
  import('@/components/StructureViewer/StructureViewerModal').then((module) => ({
    default: module.StructureViewerModal,
  }));

const StructureViewerModal = lazy(loadStructureViewerModal);

export function AppShell() {
  const { t } = useTranslation();
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const desktopGuideOpen = useLayoutStore((s) => s.hintPanelOpen);
  const setDesktopGuideOpen = useLayoutStore((s) => s.setHintPanelOpen);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1120px)').matches);
  const [narrowGuideOpen, setNarrowGuideOpen] = useState(false);
  const hintPanelOpen = narrow ? narrowGuideOpen : desktopGuideOpen;
  const setHintPanelOpen = narrow ? setNarrowGuideOpen : setDesktopGuideOpen;
  const viewerStructureId = useUIStore((s) => s.viewerStructureId);
  const closeViewer = useUIStore((s) => s.closeViewer);

  const menuRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia('(width > 800px)');
    const overlayGuide = window.matchMedia('(max-width: 1120px)');
    const updateGuideLayout = () => setNarrow(overlayGuide.matches);
    overlayGuide.addEventListener('change', updateGuideLayout);
    const closeOnDesktop = () => {
      if (wide.matches) menuRef.current?.close();
    };
    wide.addEventListener('change', closeOnDesktop);
    return () => {
      wide.removeEventListener('change', closeOnDesktop);
      overlayGuide.removeEventListener('change', updateGuideLayout);
    };
  }, []);

  // Keep the moyo (spglib) symmetry analysis in sync with the loaded data.
  useSymmetryAutoAnalysis();

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
      <dialog ref={menuRef} id="workspace-navigation" className="navigation-drawer"
        aria-label={t('nav.menu')} onClose={() => setMenuOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <Sidebar onClose={() => menuRef.current?.close()} />
      </dialog>
      <div className={`main-area ${hintPanelOpen ? 'guide-open' : ''}`}>
        <Header guideOpen={hintPanelOpen} onToggleGuide={() => setHintPanelOpen(!hintPanelOpen)}
          menuOpen={menuOpen} onOpenMenu={() => {
            menuRef.current?.showModal();
            setMenuOpen(true);
          }} />
        <main className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <HintDrawer open={hintPanelOpen} onClose={() => setHintPanelOpen(false)} />
      {viewerStructureId !== null && (
        <Suspense fallback={<StructureViewerFallback onClose={closeViewer} />}>
          <StructureViewerModal />
        </Suspense>
      )}
    </div>
  );
}

function StructureViewerFallback({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
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
          width: 300,
          padding: 22,
          borderRadius: 10,
          background: 'var(--color-surface, #fff)',
          color: 'var(--color-text, #333)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'grid',
          justifyItems: 'center',
          gap: 12,
        }}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Spinner size={24} />
        <span style={{ fontSize: 13 }}>{t('viewer.loading')}</span>
        <SkeletonRows rows={2} height={10} />
      </div>
    </div>
  );
}
