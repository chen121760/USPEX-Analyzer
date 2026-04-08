import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Count occurrences of a field value */
function countBy<T>(items: T[], accessor: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = accessor(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, maxBars = 15 }: { data: Record<string, number>; maxBars?: number }) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBars);

  const max = Math.max(...sorted.map(([, v]) => v), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(([label, count]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ minWidth: 80, textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            {label}
          </span>
          <div style={{ flex: 1, background: 'var(--color-bg-tertiary)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(count / max) * 100}%`,
                height: '100%',
                background: 'var(--color-primary)',
                borderRadius: 3,
                minWidth: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <span style={{ minWidth: 36, fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const collapsed = useUIStore((s) => s.dashboardCollapsed);
  const toggleDashboard = useUIStore((s) => s.toggleDashboard);

  const stats = useMemo(() => {
    if (!structures.length || !systemInfo) return null;

    const validEnthalpies = structures.filter((s) => s.enthalpy < 900);
    const originDist = countBy(structures, (s) => s.origin);
    const sgDist = countBy(structures, (s) => String(s.spaceGroup));

    // Composition distribution (reduced formula)
    const compDist = countBy(structures, (s) => s.formula);

    // Best young's modulus
    const youngValues = structures.filter((s) => s.youngModulus != null && s.youngModulus > 0);
    const maxYoung = youngValues.length > 0
      ? Math.max(...youngValues.map((s) => s.youngModulus!))
      : null;

    return {
      originDist,
      sgDist,
      compDist,
      maxYoung,
      minEnthalpy: validEnthalpies.length > 0 ? Math.min(...validEnthalpies.map((s) => s.enthalpy)) : 0,
    };
  }, [structures, systemInfo]);

  if (!systemInfo || !stats) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('noData')}</div>;
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('dashboard.title')}</h2>
        <button className="btn btn-ghost btn-sm" onClick={toggleDashboard}>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          {collapsed ? t('dashboard.expand') : t('dashboard.collapse')}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label={t('system.totalStructures')} value={systemInfo.totalStructures} sub={`(${systemInfo.totalStructuresSource})`} />
        <StatCard label={t('system.stableStructures')} value={systemInfo.stableCount} sub="fitness = 0" />
        <StatCard label={t('system.minEnthalpy')} value={`${stats.minEnthalpy.toFixed(4)}`} sub="eV/atom" />
        {systemInfo.totalGenerations > 0 && (
          <StatCard label={t('system.generations')} value={systemInfo.totalGenerations} />
        )}
        {stats.maxYoung !== null && (
          <StatCard label={`Max ${systemInfo.secondObjectiveName || "Young's"}`} value={stats.maxYoung.toFixed(1)} sub="GPa" />
        )}
      </div>

      {/* Charts (collapsible) */}
      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Origin distribution */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.originDistribution')}
            </h3>
            <BarChart data={stats.originDist} />
          </div>

          {/* Space group distribution */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.spaceGroupDistribution')}
            </h3>
            <BarChart data={stats.sgDist} maxBars={12} />
          </div>

          {/* Composition distribution */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.compositionDistribution')}
            </h3>
            <BarChart data={stats.compDist} maxBars={20} />
          </div>
        </div>
      )}
    </div>
  );
}
