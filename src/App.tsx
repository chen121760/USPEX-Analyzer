import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useThemeStore, watchSystemThemePreference } from '@/theme/themeStore';
import { useAutoSave, useRestoreSession } from '@/hooks/usePersistence';
import { AppShell } from '@/components/Layout/AppShell';
import { LoadingOverlay, LoadingScreen } from '@/components/ui/LoadingOverlay';
import { PageSkeleton } from '@/components/ui/Skeleton';

/**
 * Analysis pages are code-split: each one is imported when its route is first
 * visited, so the entry bundle no longer carries echarts/echarts-gl, the
 * `convex-hull` solver, the table engine or the structure viewer. The upload
 * page stays eager because it *is* the entry point.
 */
const UploadPage = lazy(async () => ({ default: (await import('@/modules/Upload/UploadPage')).UploadPage }));
const DashboardPage = lazy(async () => ({ default: (await import('@/modules/Dashboard/DashboardPage')).DashboardPage }));
const DataTablePage = lazy(async () => ({ default: (await import('@/modules/DataTable/DataTablePage')).DataTablePage }));
const ConvexHullPage = lazy(async () => ({ default: (await import('@/modules/ConvexHull/ConvexHullPage')).ConvexHullPage }));
const HullWorkshopPage = lazy(async () => ({ default: (await import('@/modules/HullWorkshop/HullWorkshopPage')).HullWorkshopPage }));
const ParetoPage = lazy(async () => ({ default: (await import('@/modules/Pareto/ParetoPage')).ParetoPage }));
const ExplorerPage = lazy(async () => ({ default: (await import('@/modules/Explorer/ExplorerPage')).ExplorerPage }));
const BetaExplorerPage = lazy(async () => ({ default: (await import('@/modules/BetaExplorer/BetaExplorerPage')).BetaExplorerPage }));
const FilterPage = lazy(async () => ({ default: (await import('@/modules/Filter/FilterPage')).FilterPage }));
const ComparePage = lazy(async () => ({ default: (await import('@/modules/Compare/ComparePage')).ComparePage }));

function App() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const { loading: restoringSession } = useRestoreSession();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => watchSystemThemePreference(), []);

  // Auto-save project to IndexedDB
  useAutoSave();

  /**
   * The Suspense boundary sits *inside* the shell, so a page chunk loading
   * shows a skeleton in the content area and never unmounts the sidebar/header.
   */
  const page = (element: ReactNode) => (
    <Suspense fallback={<PageSkeleton label={t('loading')} />}>{element}</Suspense>
  );

  if (restoringSession) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <LoadingScreen title={t('app.restoringSession')} detail={t('app.restoringSessionHint')} />
      </div>
    );
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <HashRouter>
        <Routes>
          {/* Upload page — standalone, no sidebar */}
          <Route path="/" element={page(<UploadPage />)} />

          {/* Main app with sidebar */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={page(<DashboardPage />)} />
            <Route path="/table" element={page(<DataTablePage />)} />
            <Route path="/convex-hull" element={page(<ConvexHullPage />)} />
            <Route path="/hull-workshop" element={page(<HullWorkshopPage />)} />
            <Route path="/pareto" element={page(<ParetoPage />)} />
            <Route path="/explorer" element={page(<ExplorerPage />)} />
            <Route path="/beta-explorer" element={page(<BetaExplorerPage />)} />
            <Route path="/filter" element={page(<FilterPage />)} />
            <Route path="/compare" element={page(<ComparePage />)} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      {/* Long-running work (archive parsing, project restore) blocks the main
          thread; this overlay is the animated feedback for it. */}
      <LoadingOverlay />
    </div>
  );
}

export default App;
