import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import logoImg from '@/assets/logo.jpg';
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
} from 'lucide-react';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  hidden?: boolean;
}

function NavItem({ to, icon, label, hidden }: NavItemProps) {
  if (hidden) return null;

  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const systemInfo = useProjectStore((s) => s.systemInfo);

  const isMulti = systemInfo?.optimizationType === 'multi';
  const isFixed = systemInfo?.compositionMode === 'fixed';

  const saveProject = () => {
    const projectFile = useProjectStore.getState().exportProjectFile();
    const blob = new Blob([JSON.stringify(projectFile, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const iconSize = 18;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo / Brand */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 48,
        }}
      >
        <img
          src={logoImg}
          alt="USPEX Analyzer"
          style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 1, display: 'block' }}
        />

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
        <NavItem to="/dashboard" icon={<LayoutDashboard size={iconSize} />} label={t('nav.dashboard')} />
        <NavItem to="/table" icon={<Table2 size={iconSize} />} label={t('nav.table')} />
        <NavItem to="/convex-hull" icon={<Triangle size={iconSize} />} label={isFixed ? t('nav.energyRanking', 'Energy Ranking') : t('nav.hull')} />
        <NavItem to="/pareto" icon={<Target size={iconSize} />} label={t('nav.pareto')} hidden={!isMulti} />
        <NavItem to="/explorer" icon={<ScatterChart size={iconSize} />} label={t('nav.explorer')} />
        <NavItem to="/filter" icon={<Filter size={iconSize} />} label={t('nav.filter')} />
        <NavItem to="/beta-explorer" icon={<ChartSpline size={iconSize} />} label={t('nav.betaExplorer')} />
        <NavItem to="/hull-workshop" icon={<FlaskConical size={iconSize} />} label={t('nav.hullWorkshop', 'Hull Workshop')} />
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--color-border)' }}>
        <button className="nav-item" onClick={saveProject} style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <Save size={iconSize} />
          {!collapsed && <span>{t('btn.save')}</span>}
        </button>

        <button
          className="nav-item"
          onClick={toggleSidebar}
          style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          {collapsed ? <ChevronRight size={iconSize} /> : <ChevronLeft size={iconSize} />}
          {!collapsed && <span>{t('dashboard.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
