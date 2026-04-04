import { Outlet, Navigate } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppShell() {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);

  // Redirect to upload if no data loaded
  if (!isDataLoaded) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
