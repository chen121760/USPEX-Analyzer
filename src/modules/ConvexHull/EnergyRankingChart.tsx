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
    // Filter valid structures and sort by enthalpy
    const sorted = structures
      .filter((s) => !isNaN(s.enthalpy) && s.enthalpy < 900)
      .sort((a, b) => a.enthalpy - b.enthalpy);

    // Limit to top N for readability
    const topN = sorted.slice(0, 100);

    return {
      labels: topN.map((s) => `EA${s.id} SG${s.spaceGroup}`),
      enthalpies: topN.map((s) => s.enthalpy),
      colors: topN.map((s) => getOriginColor(s.origin)),
      hoverTexts: topN.map((s) =>
        `EA${s.id}: ${s.formula}<br>` +
        `Enthalpy: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
        `SG: ${s.spaceGroup}<br>` +
        `Origin: ${s.origin}<br>` +
        `Gen: ${s.generation}`,
      ),
      total: sorted.length,
    };
  }, [structures]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trace: PlotlyData = {
    y: plotData.labels,
    x: plotData.enthalpies,
    type: 'bar' as const,
    orientation: 'h' as const,
    marker: { color: plotData.colors },
    text: plotData.enthalpies.map((e) => e.toFixed(4)),
    textposition: 'outside' as const,
    textfont: { size: 9 },
    hovertext: plotData.hoverTexts,
    hoverinfo: 'text' as const,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: PlotlyLayout = {
    title: {
      text: `${systemInfo.elements.join('-')} ${t('hull.energyRanking', 'Energy Ranking')}`,
      font: { size: 15, color: '#0f172a' },
    },
    yaxis: {
      title: '',
      automargin: true,
      tickfont: { size: 10 },
      dtick: 1,
    },
    xaxis: {
      title: 'Enthalpy (eV/atom)',
      titlefont: { size: 13, color: '#334155' },
      tickfont: { size: 11, color: '#64748b' },
      gridcolor: '#e2e8f0',
      zerolinecolor: '#cbd5e1',
    },
    margin: { t: 50, r: 100, l: 120 },
    height: Math.max(400, Math.min(plotData.labels.length * 22, 1200)),
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    showlegend: false,
  };

  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {t('hull.energyRankingDesc', 'Fixed composition — showing enthalpy ranking')}
        {plotData.total > 100 && ` (showing top 100 of ${plotData.total})`}
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
