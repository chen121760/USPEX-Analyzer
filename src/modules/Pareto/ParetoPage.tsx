import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import { useUIStore } from '@/store/useUIStore';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;

const FRONT_COLORS = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280'];

export function ParetoPage() {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);

  const isMulti = systemInfo?.optimizationType === 'multi';
  const objName = systemInfo?.secondObjectiveName || 'Second Objective';

  // Get available front numbers
  const frontNumbers = useMemo(() => {
    const fronts = new Set<number>();
    structures.forEach((s) => {
      if (s.paretoFront != null) fronts.add(s.paretoFront);
    });
    return Array.from(fronts).sort((a, b) => a - b);
  }, [structures]);

  const [selectedFronts, setSelectedFronts] = useState<Set<number>>(new Set());
  const [showLines, setShowLines] = useState(true);

  // Sync selectedFronts when frontNumbers changes (e.g. data loads)
  useEffect(() => {
    setSelectedFronts(new Set(frontNumbers.slice(0, 3)));
  }, [frontNumbers]);

  const toggleFront = (n: number) => {
    const next = new Set(selectedFronts);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setSelectedFronts(next);
  };

  if (!isMulti) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        {t('pareto.singleObjectiveHint')}
      </div>
    );
  }

  const traces: PlotlyData[] = [];

  for (const front of frontNumbers) {
    if (!selectedFronts.has(front)) continue;

    const pts = structures
      .filter((s) => s.paretoFront === front && s.secondObjective != null)
      .sort((a, b) => (a.fitness ?? 0) - (b.fitness ?? 0));

    const color = FRONT_COLORS[(front - 1) % FRONT_COLORS.length];

    traces.push({
      x: pts.map((s) => s.fitness),
      y: pts.map((s) => s.secondObjective!),
      mode: showLines ? ('markers+lines' as const) : ('markers' as const),
      type: 'scatter' as const,
      name: `Front ${front}`,
      marker: { color, size: 8 },
      line: showLines ? { color, width: 1.5, dash: 'dot' } : undefined,
      text: pts.map(
        (s) =>
          `EA${s.id}: ${s.formula}<br>` +
          `Fitness: ${s.fitness.toFixed(4)}<br>` +
          `${objName}: ${s.secondObjective?.toFixed(3)}<br>` +
          `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
      customdata: pts.map((s) => s.id),
    });
  }

  const axisStyle = {
    titlefont: { size: 13, color: '#334155' },
    tickfont: { size: 11, color: '#64748b' },
    gridcolor: '#e2e8f0',
    zerolinecolor: '#cbd5e1',
    linecolor: '#94a3b8',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: any = {
    title: { text: `${systemInfo?.elements.join('-')} ${t('pareto.title')}`, font: { size: 15, color: '#0f172a' } },
    xaxis: { title: t('pareto.xAxis'), ...axisStyle },
    yaxis: { title: objName, ...axisStyle },
    hovermode: 'closest' as const,
    showlegend: true,
    legend: { font: { size: 11, color: '#334155' } },
    margin: { t: 50 },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('pareto.title')}</h2>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <Plot
          data={traces}
          layout={layout}
          config={{ responsive: true }}
          style={{ width: '100%', height: 550 }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) {
              openViewer(Number(point.customdata));
            }
          }}
        />
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {t('pareto.selectFronts')}:
          </span>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {frontNumbers.map((n) => (
              <button
                key={n}
                className={`btn btn-sm ${selectedFronts.has(n) ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => toggleFront(n)}
                style={selectedFronts.has(n) ? { background: FRONT_COLORS[(n - 1) % FRONT_COLORS.length] } : {}}
              >
                Front {n}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} />
            {t('pareto.connectLine')}
          </label>
        </div>
      </div>
    </div>
  );
}
