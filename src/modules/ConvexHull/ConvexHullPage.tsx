import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import Plot from 'react-plotly.js';
import type { Structure } from '@/types/structure';

type ViewMode = '2d' | '3d';

/**
 * Compute 2D lower convex hull for binary system.
 * Returns sorted hull points (x, y) pairs.
 */
function computeLowerHull2D(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 2) return points;

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const hull: { x: number; y: number }[] = [];

  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      // Cross product — keep only left turns (lower hull)
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

export function ConvexHullPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');

  const isBinary = systemInfo?.systemType === 'binary';
  const isTernary = systemInfo?.systemType === 'ternary';

  const plotData = useMemo(() => {
    if (!structures.length) return null;

    const stable = structures.filter((s) => s.fitness === 0);
    const unstable = structures.filter((s) => s.fitness > 0 && s.enthalpy < 900);

    if (isBinary) {
      // 2D hull
      const hullPoints = stable.map((s) => ({ x: s.hullX, y: s.hullY }));
      const hullLine = computeLowerHull2D(hullPoints);

      return { stable, unstable, hullLine };
    }

    return { stable, unstable, hullLine: [] };
  }, [structures, isBinary]);

  if (!plotData || !systemInfo) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('noData')}</div>;
  }

  const { stable, unstable, hullLine } = plotData;
  const elements = systemInfo.elements;

  // ---- Binary 2D Plot ----
  if (isBinary && viewMode === '2d') {
    const traces: Plotly.Data[] = [
      // Unstable points
      {
        x: unstable.map((s) => s.hullX),
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
      // Hull line
      {
        x: hullLine.map((p) => p.x),
        y: hullLine.map((p) => p.y),
        mode: 'lines' as const,
        type: 'scatter' as const,
        name: 'Convex Hull',
        line: { color: '#1e293b', width: 2 },
        hoverinfo: 'skip' as const,
      },
      // Stable points
      {
        x: stable.map((s) => s.hullX),
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

    const layout: Partial<Plotly.Layout> = {
      title: `${elements.join('-')} ${t('hull.title')}`,
      xaxis: { title: `${t('hull.composition')} (${elements[1] || 'B'} fraction)` },
      yaxis: { title: t('hull.formationEnergy') },
      hovermode: 'closest' as const,
      showlegend: true,
      legend: { x: 0.02, y: 0.98 },
      margin: { t: 50, r: 80 },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
    };

    return (
      <div className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('hull.title')}</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`btn btn-sm ${viewMode === '2d' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('2d')}>
              {t('hull.view2D')}
            </button>
            <button className={`btn btn-sm ${viewMode === '3d' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('3d')}>
              {t('hull.view3D')}
            </button>
          </div>
        </div>

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
      </div>
    );
  }

  // ---- Ternary or 3D view (placeholder) ----
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('hull.title')}</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-sm ${viewMode === '2d' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('2d')}>
            {isTernary ? t('hull.viewTernary') : t('hull.view2D')}
          </button>
          <button className={`btn btn-sm ${viewMode === '3d' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('3d')}>
            {t('hull.view3D')}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        {isTernary
          ? 'Ternary phase diagram — 3D Convex Hull visualization coming soon'
          : '3D Convex Hull view coming soon'}
      </div>
    </div>
  );
}
