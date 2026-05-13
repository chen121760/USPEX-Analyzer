import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import Plot from 'react-plotly.js';
import { ChevronDown, ChevronUp, Check, X, AlertTriangle, Info } from 'lucide-react';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { getPlotlyTheme } from '@/lib/constants';

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

function BarChart({ data, maxBars = 15, htmlLabels = false }: { data: Record<string, number>; maxBars?: number; htmlLabels?: boolean }) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBars);

  const max = Math.max(...sorted.map(([, v]) => v), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(([label, count]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ minWidth: 80, textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            {htmlLabels
              ? <span dangerouslySetInnerHTML={{ __html: formulaToHtml(label) }} />
              : label}
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

/** Compact key-value row */
function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

/** File status row: label + check/cross icon */
function FileStatusRow({ label, parsed }: { label: string; parsed: boolean | 'na' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
      {parsed === 'na' ? (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>—</span>
      ) : parsed ? (
        <Check size={14} color="#22c55e" />
      ) : (
        <X size={14} color="#ef4444" />
      )}
    </div>
  );
}

/** Coverage bar with percentage */
function CoverageBar({ label, covered, total }: { label: string; covered: number; total: number }) {
  const pct = total > 0 ? covered / total : 0;
  const color = pct >= 1 ? '#22c55e' : pct >= 0.5 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
          {covered}/{total} ({(pct * 100).toFixed(0)}%)
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--color-bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

/** Warning / info banner */
function Banner({ type, children }: { type: 'warning' | 'info'; children: React.ReactNode }) {
  const bg = type === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)';
  const border = type === 'warning' ? '#f59e0b' : '#3b82f6';
  const Icon = type === 'warning' ? AlertTriangle : Info;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderRadius: 6, background: bg, border: `1px solid ${border}`, fontSize: 12, color: 'var(--color-text)' }}>
      <Icon size={14} color={border} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const parsedFiles = useProjectStore((s) => s.parsedFiles);
  const parseWarnings = useProjectStore((s) => s.parseWarnings);
  const collapsed = useUIStore((s) => s.dashboardCollapsed);
  const toggleDashboard = useUIStore((s) => s.toggleDashboard);
  const theme = useUIStore((s) => s.theme);
  const plotTheme = getPlotlyTheme(theme);

  const stats = useMemo(() => {
    if (!structures.length || !systemInfo) return null;

    const originDist = countBy(structures, (s) => s.origin);
    const sgDist = countBy(structures, (s) => String(s.spaceGroup));

    // Composition distribution (reduced formula)
    const compDist = countBy(structures, (s) => s.formula);

    // Space group pie data: top 10 + Others
    const sgEntries = Object.entries(sgDist).sort((a, b) => b[1] - a[1]);
    const sgTop = sgEntries.slice(0, 10);
    const sgOtherCount = sgEntries.slice(10).reduce((s, [, v]) => s + v, 0);
    const sgPieLabels = sgTop.map(([sg]) => `SG ${sg}`);
    const sgPieValues = sgTop.map(([, v]) => v);
    if (sgOtherCount > 0) {
      sgPieLabels.push('Others');
      sgPieValues.push(sgOtherCount);
    }

    // Data completeness
    const poscarCount = structures.filter((s) => s.poscarData).length;
    const originCount = structures.filter((s) => s.origin !== 'Unknown').length;

    return {
      originDist,
      sgPieLabels,
      sgPieValues,
      compDist,
      poscarCount,
      originCount,
    };
  }, [structures, systemInfo]);

  if (!systemInfo || !stats) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('noData')}</div>;
  }

  const total = structures.length;
  const poscarMissing = total - stats.poscarCount;
  const isVarcomp = systemInfo.compositionMode === 'varcomp';
  const isMulti = systemInfo.optimizationType === 'multi';

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('dashboard.title')}</h1>
        <button className="btn btn-ghost btn-sm" onClick={toggleDashboard}>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          {collapsed ? t('dashboard.expand') : t('dashboard.collapse')}
        </button>
      </div>

      {/* ── Calculation Parameters + Data Completeness ── */}
      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 1.6fr', gap: 16, marginBottom: 20 }}>
          {/* Calculation Parameters */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.calcParams')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ParamRow label={t('system.elements')} value={systemInfo.elements.join(' ')} />
              <ParamRow label={t('system.systemType')} value={t(`system.${systemInfo.systemType}`)} />
              <ParamRow label={t('system.optimization')} value={t(`system.${systemInfo.optimizationType}`)} />
              <ParamRow label={t('system.composition')} value={t(`system.${systemInfo.compositionMode === 'varcomp' ? 'varcomp' : 'fixedComp'}`)} />
              <ParamRow label={t('system.externalPressure')} value={systemInfo.externalPressure != null ? `${systemInfo.externalPressure} GPa` : '—'} />
              <ParamRow label={t('system.calculationType')} value={String(systemInfo.calculationType)} />
            </div>
          </div>

          {/* Data Completeness */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.dataCompleteness')}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* File Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <FileStatusRow label={t('dashboard.fileStatus.parameters')} parsed={parsedFiles.parameters} />
                <FileStatusRow label={t('dashboard.fileStatus.individuals')} parsed={parsedFiles.individuals} />
                <FileStatusRow label={t('dashboard.fileStatus.poscar')} parsed={parsedFiles.gathered_poscars} />
                <FileStatusRow label={t('dashboard.fileStatus.origin')} parsed={parsedFiles.origin} />
                <FileStatusRow label={t('dashboard.fileStatus.extendedHull')} parsed={isVarcomp ? parsedFiles.extended_convex_hull : 'na'} />
                <FileStatusRow label={t('dashboard.fileStatus.pareto')} parsed={isMulti ? parsedFiles.pareto_ranking : 'na'} />
                <FileStatusRow label={t('dashboard.fileStatus.mlProperties')} parsed={parsedFiles.ml_properties ? true : 'na'} />
              </div>

              {/* Coverage Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CoverageBar label={t('dashboard.poscarCoverage')} covered={stats.poscarCount} total={total} />
                <CoverageBar label={t('dashboard.originCoverage')} covered={stats.originCount} total={total} />
              </div>
            </div>

            {/* Warnings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {systemInfo.isPickup && (
                <Banner type="warning">
                  {t('dashboard.pickupWarning', { gen: systemInfo.pickUpGen, folder: systemInfo.pickUpFolder })}
                </Banner>
              )}
              {poscarMissing > 0 && (
                <Banner type="warning">{t('dashboard.incompletePoscar', { count: poscarMissing })}</Banner>
              )}
              {parseWarnings.map((w, i) => (
                <Banner key={i} type="info">{w}</Banner>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label={t('system.totalStructures')} value={systemInfo.totalStructures} sub={`(${systemInfo.totalStructuresSource})`} />
        <StatCard label={t('system.stableStructures')} value={systemInfo.stableCount} sub="fitness = 0" />
        {systemInfo.unconvergedCount > 0 && (
          <StatCard label={t('system.unconvergedStructures')} value={systemInfo.unconvergedCount} sub="Enthalpy > 900 eV" />
        )}
        {systemInfo.totalGenerations > 0 && (
          <StatCard label={t('system.generations')} value={systemInfo.totalGenerations} />
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

          {/* Space group distribution — pie chart */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.spaceGroupDistribution')}
            </h3>
            <Plot
              data={[{
                type: 'pie',
                labels: stats.sgPieLabels,
                values: stats.sgPieValues,
                hole: 0.35,
                sort: false,
                textinfo: 'percent',
                textposition: 'inside',
                insidetextorientation: 'horizontal',
                hovertemplate: '%{label}: %{value} (%{percent})<extra></extra>',
                marker: {
                  line: { color: '#fff', width: 1.5 },
                },
              }]}
              layout={{
                showlegend: true,
                legend: { font: { size: 11, color: plotTheme.legendColor }, orientation: 'v', x: 1, y: 0.5 },
                margin: { t: 4, b: 4, l: 4, r: 80 },
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: { family: 'Times New Roman, serif', color: plotTheme.titleColor },
              }}
              useResizeHandler
              style={{ width: '100%', height: 260 }}
              config={{ displayModeBar: false, responsive: true }}
            />
          </div>

          {/* Composition distribution */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-secondary)' }}>
              {t('dashboard.compositionDistribution')}
            </h3>
            <BarChart data={stats.compDist} maxBars={20} htmlLabels />
          </div>
        </div>
      )}
    </div>
  );
}
