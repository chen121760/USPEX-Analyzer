import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUIStore } from '@/store/useUIStore';
import { useAutoSave } from '@/hooks/usePersistence';
import { AppShell } from '@/components/Layout/AppShell';
import { UploadPage } from '@/modules/Upload/UploadPage';
import { DashboardPage } from '@/modules/Dashboard/DashboardPage';
import { DataTablePage } from '@/modules/DataTable/DataTablePage';
import { ConvexHullPage } from '@/modules/ConvexHull/ConvexHullPage';
import { ParetoPage } from '@/modules/Pareto/ParetoPage';
import { ExplorerPage } from '@/modules/Explorer/ExplorerPage';
import { FilterPage } from '@/modules/Filter/FilterPage';
import { ComparePage } from '@/modules/Compare/ComparePage';

function App() {
  const theme = useUIStore((s) => s.theme);

  // Auto-save project to IndexedDB
  useAutoSave();

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <HashRouter>
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
