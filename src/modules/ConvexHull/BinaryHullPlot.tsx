/**
 * Binary 2D convex hull plot — extracted from original ConvexHullPage.
 * Uses hullX[0] as the X coordinate (composition) and hullY as formation energy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Plot from 'react-plotly.js';
import type { Structure, SystemInfo } from '@/types/structure';

/**
 * Compute 2D lower convex hull (Andrew's monotone chain).
 */
function computeLowerHull2D(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 2) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const hull: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(p);
  }
  return hull;
}

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
}

export function BinaryHullPlot({ structures, systemInfo }: Props) {
  const { t } = useTranslation();

  const plotData = useMemo(() => {
    const stable = structures.filter((s) => s.fitness === 0 && s.enthalpy < 900);
    const unstable = structures.filter((s) => s.fitness > 0 && s.enthalpy < 900);
    const hullPoints = stable.map((s) => ({ x: s.hullX[0] ?? 0, y: s.hullY }));
    const hullLine = computeLowerHull2D(hullPoints);
    return { stable, unstable, hullLine };
  }, [structures]);

  const { stable, unstable, hullLine } = plotData;
  const elements = systemInfo.elements;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traces: PlotlyData[] = [
    {
      x: unstable.map((s) => s.hullX[0] ?? 0),
      y: unstable.map((s) => s.hullY),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: 'Unstable',
      marker: {
        color: unstable.map((s) => s.fitness),
        colorscale: 'Viridis',
        colorbar: { title: 'Fitness\n(eV/block)', thickness: 15, len: 0.6 },
        size: 6,
        opacity: 0.6,
      },
      text: unstable.map(
        (s) =>
          `EA${s.id}: ${s.formula}<br>` +
          `Enthalpy: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)}<br>` +
          `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
    },
    {
      x: hullLine.map((p) => p.x),
      y: hullLine.map((p) => p.y),
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: 'Convex Hull',
      line: { color: '#1e293b', width: 2 },
      hoverinfo: 'skip' as const,
    },
    {
      x: stable.map((s) => s.hullX[0] ?? 0),
      y: stable.map((s) => s.hullY),
      mode: 'markers+text' as const,
      type: 'scatter' as const,
      name: 'Stable',
      marker: { color: '#dc2626', size: 10, symbol: 'diamond' },
      text: stable.map((s) => s.formula),
      textposition: 'top center' as const,
      textfont: { size: 10 },
      hovertext: stable.map(
        (s) =>
          `EA${s.id}: ${s.formula}<br>` +
          `Enthalpy: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `SG: ${s.spaceGroup}`,
      ),
      hoverinfo: 'text' as const,
    },
  ];

  const axisStyle = {
    titlefont: { size: 13, color: '#334155' },
    tickfont: { size: 11, color: '#64748b' },
    gridcolor: '#e2e8f0',
    zerolinecolor: '#cbd5e1',
    linecolor: '#94a3b8',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: PlotlyLayout = {
    title: { text: `${elements.join('-')} ${t('hull.title')}`, font: { size: 15, color: '#0f172a' } },
    xaxis: { title: `x(${elements[1] || 'B'})`, ...axisStyle },
    yaxis: { title: t('hull.formationEnergy'), ...axisStyle },
    hovermode: 'closest' as const,
    showlegend: true,
    legend: { x: 0.02, y: 0.98, font: { size: 11, color: '#334155' } },
    margin: { t: 50, r: 80 },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
  };

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={traces}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: 550 }}
        />
      </div>

      {/* Stable phases list */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
          {t('hull.stablePhases')} ({stable.length})
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {stable.map((s) => (
            <span
              key={s.id}
              className="tag-badge"
              style={{ background: '#dc262620', color: '#dc2626', fontSize: 12, padding: '3px 10px' }}
            >
              EA{s.id} · {s.formula} · SG{s.spaceGroup} · {s.enthalpy.toFixed(4)} eV/atom
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
