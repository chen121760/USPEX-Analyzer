import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useLayoutStore } from '@/store/useLayoutStore';
import { UspexLogo } from '@/components/Logo/UspexLogo';
import { downloadBlob } from '@/export/exportFileNames';
import {
  LayoutDashboard,
  Table2,
  Triangle,
  Target,
  ScatterChart,
  ChartSpline,
  FlaskConical,
  Filter,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
} from 'lucide-react';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  hidden?: boolean;
  onNavigate?: () => void;
}

function NavItem({ to, icon, label, hidden, onNavigate }: NavItemProps) {
  if (hidden) return null;

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      title={label}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const collapsed = !onClose && sidebarCollapsed;
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const systemInfo = useProjectStore((s) => s.systemInfo);

  const isMulti = systemInfo?.optimizationType === 'multi';
  const isFixed = systemInfo?.compositionMode === 'fixed';

  const saveProject = () => {
    const projectFile = useProjectStore.getState().exportProjectFile();
    const blob = new Blob([JSON.stringify(projectFile, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`);
  };

  const iconSize = 18;

  return (
    <aside className={`sidebar ${onClose ? 'mobile' : collapsed ? 'desktop collapsed' : 'desktop'}`}>
      {/* Logo / Brand */}
      <div className="sidebar-brand">
        <UspexLogo className="sidebar-logo" />
        {onClose && <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={t('btn.close')} autoFocus><X size={19} /></button>}
      </div>


      {/* System info badge */}
      {!collapsed && systemInfo && (
        <div
          style={{
            padding: '8px 14px',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontWeight: 600 }}>{systemInfo.elements.join('-')}</div>
          <div>
            {t(`system.${systemInfo.systemType}`)} · {t(`system.${systemInfo.compositionMode === 'varcomp' ? 'varcomp' : 'fixedComp'}`)} · {t(`system.${systemInfo.optimizationType === 'multi' ? 'multi' : 'single'}`)}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        <NavItem to="/dashboard" icon={<LayoutDashboard size={iconSize} />} onNavigate={onClose} label={t('nav.dashboard')} />
        <NavItem to="/table" icon={<Table2 size={iconSize} />} onNavigate={onClose} label={t('nav.table')} />
        <NavItem to="/convex-hull" icon={<Triangle size={iconSize} />} onNavigate={onClose} label={isFixed ? t('nav.energyRanking', 'Energy Ranking') : t('nav.hull')} />
        <NavItem to="/pareto" icon={<Target size={iconSize} />} onNavigate={onClose} label={t('nav.pareto')} hidden={!isMulti} />
        <NavItem to="/explorer" icon={<ScatterChart size={iconSize} />} onNavigate={onClose} label={t('nav.explorer')} />
        <NavItem to="/filter" icon={<Filter size={iconSize} />} onNavigate={onClose} label={t('nav.filter')} />
        <NavItem to="/beta-explorer" icon={<ChartSpline size={iconSize} />} onNavigate={onClose} label={t('nav.betaExplorer')} />
        <NavItem to="/hull-workshop" icon={<FlaskConical size={iconSize} />} onNavigate={onClose} label={t('nav.hullWorkshop', 'Hull Workshop')} />
      </nav>

      {/* Bottom actions */}
      <div className="sidebar-actions">
        <button type="button" className="nav-item" onClick={saveProject} aria-label={t('btn.save')} title={t('btn.save')}>
          <Save size={iconSize} />
          {!collapsed && <span>{t('btn.save')}</span>}
        </button>

        {!onClose && <button
          type="button"
          className="nav-item"
          onClick={toggleSidebar}
          aria-label={t(collapsed ? 'dashboard.expand' : 'dashboard.collapse')}
        >
          {collapsed ? <ChevronRight size={iconSize} /> : <ChevronLeft size={iconSize} />}
          {!collapsed && <span>{t('dashboard.collapse')}</span>}
        </button>}
      </div>
    </aside>
  );
}
