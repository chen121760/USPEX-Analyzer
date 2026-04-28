import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUIStore } from '@/store/useUIStore';
import { useAutoSave, useRestoreSession } from '@/hooks/usePersistence';
import { AppShell } from '@/components/Layout/AppShell';
import { UploadPage } from '@/modules/Upload/UploadPage';
import { DashboardPage } from '@/modules/Dashboard/DashboardPage';
import { DataTablePage } from '@/modules/DataTable/DataTablePage';
import { ConvexHullPage } from '@/modules/ConvexHull/ConvexHullPage';
import { ParetoPage } from '@/modules/Pareto/ParetoPage';
import { ExplorerPage } from '@/modules/Explorer/ExplorerPage';
import { BetaExplorerPage } from '@/modules/BetaExplorer/BetaExplorerPage';
import { FilterPage } from '@/modules/Filter/FilterPage';
import { ComparePage } from '@/modules/Compare/ComparePage';
import { StructureViewerModal } from '@/components/StructureViewer/StructureViewerModal';

function App() {
  const theme = useUIStore((s) => s.theme);
  const { loading: restoringSession } = useRestoreSession();

  // Auto-save project to IndexedDB
  useAutoSave();

  if (restoringSession) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
          background: 'var(--color-bg)',
          fontSize: 14,
        }}
        >
          正在恢复会话...
        </div>
      </div>
    );
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <HashRouter>
        <StructureViewerModal />
        <Routes>
          {/* Upload page — standalone, no sidebar */}
          <Route path="/" element={<UploadPage />} />

          {/* Main app with sidebar */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/table" element={<DataTablePage />} />
            <Route path="/convex-hull" element={<ConvexHullPage />} />
            <Route path="/pareto" element={<ParetoPage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/beta-explorer" element={<BetaExplorerPage />} />
            <Route path="/filter" element={<FilterPage />} />
            <Route path="/compare" element={<ComparePage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
