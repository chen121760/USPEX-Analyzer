import { Outlet, Navigate } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StructureViewerModal } from '@/components/StructureViewer/StructureViewerModal';
import { HintDrawer } from '@/components/HintCard/HintDrawer';

export function AppShell() {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const hintPanelOpen = useUIStore((s) => s.hintPanelOpen);

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
      <StructureViewerModal />
    </div>
  );
}
