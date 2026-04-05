/**
 * Energy ranking chart for fixed-composition calculations.
 *
 * Since all structures have the same composition, there is no convex hull to plot.
 * Instead, we show a horizontal bar chart sorted by enthalpy (per-atom).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Plot from 'react-plotly.js';
import type { Structure, SystemInfo } from '@/types/structure';

/** Distinct colors for origin methods */
const ORIGIN_COLORS: Record<string, string> = {
  Random: '#6366f1',
  Heredity: '#16a34a',
  Mutation: '#f59e0b',
  Permutate: '#ec4899',
  softmutate: '#06b6d4',
  RandTop: '#8b5cf6',
  TransMutate: '#64748b',
  Seeds: '#dc2626',
  latticeMutation: '#0ea5e9',
};

function getOriginColor(origin: string): string {
  return ORIGIN_COLORS[origin] ?? '#94a3b8';
}

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
}

export function EnergyRankingChart({ structures, systemInfo }: Props) {
  const { t } = useTranslation();

  const plotData = useMemo(() => {
    const all = structures
      .filter((s) => !isNaN(s.enthalpy) && s.enthalpy < 900)
      .sort((a, b) => a.enthalpy - b.enthalpy);

    const top100 = all.slice(0, 100); // 只截一次，后面全用 top100

    return {
      ranks: top100.map((_, i) => i + 1),
      fitness: top100.map((s) => s.fitness ?? 0),
      colors: top100.map((s) => getOriginColor(s.origin)),
      hoverTexts: top100.map((s) =>
        `EA${s.id}: ${s.formula}<br>` +
        `ΔH: ${(s.fitness ?? 0).toFixed(4)} eV/atom<br>` +
        `Enthalpy: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
        `SG: ${s.spaceGroup}<br>` +
        `Origin: ${s.origin}<br>` +
        `Gen: ${s.generation}`,
      ),
      totalAll: all.length,
      total: top100.length,
    };
  }, [structures]);


  const trace: PlotlyData = {
    x: plotData.ranks,           // 排名序号 1, 2, 3...
    y: plotData.fitness,         // eV/atom above ground state
    mode: 'markers' as const,
    type: 'scatter' as const,
    marker: {
      color: plotData.colors,
      size: 8,
      opacity: 0.85,
      line: { width: 0.5, color: '#ffffff' },
    },
    text: plotData.hoverTexts,
    hoverinfo: 'text' as const,
  };


  const layout: PlotlyLayout = {
    title: {
      text: `${systemInfo.elements.join('-')} ${t('hull.energyRanking', 'Energy Ranking')}`,
      font: { size: 15, color: '#0f172a' },
    },
    xaxis: {
      title: 'Rank',
      tickfont: { size: 11, color: '#64748b' },
      gridcolor: '#e2e8f0',
    },
    yaxis: {
      title: 'ΔH (eV/atom above ground state)',
      titlefont: { size: 13, color: '#334155' },
      tickfont: { size: 11, color: '#64748b' },
      gridcolor: '#e2e8f0',
      rangemode: 'tozero' as const,
      zerolinecolor: '#cbd5e1',
      automargin: true,
    },
    margin: { t: 50, r: 40, l: 80 },
    height: 500,  // 散点图固定高度就够了
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    showlegend: false,
  };


  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {t('hull.energyRankingDesc', 'Fixed composition — showing enthalpy ranking')}
        {plotData.totalAll > 100 && ` (showing top 100 of ${plotData.totalAll})`}
      </p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={[trace]}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: layout.height }}
        />
      </div>

      {/* Legend for origin colors */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
          Origin methods
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(ORIGIN_COLORS).map(([origin, color]) => {
            const count = structures.filter((s) => s.origin === origin).length;
            if (count === 0) return null;
            return (
              <span key={origin} className="tag-badge" style={{ background: `${color}20`, color, fontSize: 12, padding: '3px 10px' }}>
                {origin} ({count})
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
