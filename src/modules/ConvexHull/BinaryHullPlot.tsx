/**
 * Binary 2D convex hull plot — extracted from original ConvexHullPage.
 * Uses hullX[0] as the X coordinate (composition) and hullY as formation energy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import type { Structure, SystemInfo } from '@/types/structure';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT, getPlotlyTheme } from '@/lib/constants';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadMultiSectionCsv } from '@/lib/exportCsv';

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

function makeStarTrace(
  x: number[], y: number[], color: string, name: string, ids: number[],
): PlotlyData {
  return {
    x, y,
    mode: 'markers',
    type: 'scatter',
    name,
    marker: { symbol: 'star', size: 14, color, line: { width: 1, color: 'white' } },
    hoverinfo: 'skip',
    customdata: ids,
    showlegend: true,
  };
}

export function BinaryHullPlot({ structures, systemInfo }: Props) {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const markActiveTags  = useUIStore((s) => s.markActiveTags);
  const markEaInput     = useUIStore((s) => s.markEaInput);
  const theme           = useUIStore((s) => s.theme);
  const allTags         = useProjectStore((s) => s.tags);

  const maxFitness = useMemo(() => {
    const vals = structures.filter((s) => s.fitness > 0 && s.enthalpyTotal <= 900).map((s) => s.fitness);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [structures]);

  const [fitnessMax, setFitnessMax] = useState(() => maxFitness);

  const plotData = useMemo(() => {
    const stable = structures.filter((s) => s.fitness === 0 && s.enthalpyTotal <= 900);
    const unstable = structures.filter((s) => s.fitness > 0 && s.fitness <= fitnessMax && s.enthalpyTotal <= 900);
    const hullPoints = stable.map((s) => ({ x: s.hullX[0] ?? 0, y: s.hullY }));
    const hullLine = computeLowerHull2D(hullPoints);
    return { stable, unstable, hullLine };
  }, [structures, fitnessMax]);

  const { stable, unstable, hullLine } = plotData;
  const elements = systemInfo.elements;

  // --- Mark overlay traces ---
  const overlayTraces = useMemo(() => {
    const result: PlotlyData[] = [];
    const allVisible = [...stable, ...unstable];

    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((t) => t.id === tagId);
      if (!tagDef) continue;
      const tagged = allVisible.filter((s) => s.tags.includes(tagId));
      if (tagged.length === 0) continue;
      result.push(makeStarTrace(
        tagged.map((s) => s.hullX[0] ?? 0),
        tagged.map((s) => s.hullY),
        tagDef.color,
        `★ ${t(tagDef.nameKey)}`,
        tagged.map((s) => s.id),
      ));
    }

    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = allVisible.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        result.push(makeStarTrace(
          eaMarked.map((s) => s.hullX[0] ?? 0),
          eaMarked.map((s) => s.hullY),
          '#FFD700',
          t('mark.eaSearchName'),
          eaMarked.map((s) => s.id),
        ));
      }
    }
    return result;
  }, [stable, unstable, markActiveTags, markEaInput, allTags, t]);

  function handleExport() {
    const pointHeaders = ['EA_ID', 'Formula', `x(${elements[1] || 'B'})`, 'Formation_Energy(eV/atom)', 'Fitness(eV/atom)', 'SpaceGroup', 'Generation', 'Origin', 'Type'];
    const stableRows = stable.map((s) => ({
      'EA_ID': s.id,
      'Formula': s.formula,
      [`x(${elements[1] || 'B'})`]: s.hullX[0] ?? 0,
      'Formation_Energy(eV/atom)': s.hullY,
      'Fitness(eV/atom)': 0,
      'SpaceGroup': s.spaceGroup,
      'Generation': s.generation,
      'Origin': s.origin,
      'Type': 'Stable',
    }));
    const unstableRows = unstable.map((s) => ({
      'EA_ID': s.id,
      'Formula': s.formula,
      [`x(${elements[1] || 'B'})`]: s.hullX[0] ?? 0,
      'Formation_Energy(eV/atom)': s.hullY,
      'Fitness(eV/atom)': s.fitness,
      'SpaceGroup': s.spaceGroup,
      'Generation': s.generation,
      'Origin': s.origin,
      'Type': 'Unstable',
    }));
    const hullHeaders = [`x(${elements[1] || 'B'})`, 'Formation_Energy(eV/atom)'];
    const hullRows = hullLine.map((p) => ({
      [`x(${elements[1] || 'B'})`]: p.x,
      'Formation_Energy(eV/atom)': p.y,
    }));
    const tag = fitnessMax.toFixed(3).replace('.', 'p');
    downloadMultiSectionCsv(`${elements.join('-')}_binary_hull_fitness${tag}`, [
      { title: 'All Points (Stable + Unstable)', headers: pointHeaders, rows: [...stableRows, ...unstableRows] },
      { title: 'Convex Hull Line', headers: hullHeaders, rows: hullRows },
    ]);
  }

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
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
          `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
          `Origin: ${s.origin}`,
      ),
      customdata: unstable.map((s) => s.id),
      hoverinfo: 'text' as const,
    },
    {
      x: hullLine.map((p) => p.x),
      y: hullLine.map((p) => p.y),
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: 'Convex Hull',
      line: { color: getPlotlyTheme(theme).structureLineColor, width: 2 },
      hoverinfo: 'skip' as const,
    },
    {
      x: stable.map((s) => s.hullX[0] ?? 0),
      y: stable.map((s) => s.hullY),
      mode: 'markers+text' as const,
      type: 'scatter' as const,
      name: 'Stable',
      marker: { color: '#dc2626', size: 10, symbol: 'diamond' },
      text: stable.map((s) => formulaToHtml(s.formula)),
      textposition: 'top center' as const,
      textfont: { size: 10 },
      hovertext: stable.map(
        (s) =>
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
          `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
          `Origin: ${s.origin}`,
      ),
      customdata: stable.map((s) => s.id),
      hoverinfo: 'text' as const,
    },
    ...overlayTraces,
  ];

  const axisStyle = {
    tickfont: { size: 11, color: getPlotlyTheme(theme).tickColor },
    gridcolor: getPlotlyTheme(theme).gridColor,
    zerolinecolor: getPlotlyTheme(theme).zerolineColor,
    linecolor: getPlotlyTheme(theme).lineColor,
  };

  const titleFont = { size: 13, color: getPlotlyTheme(theme).axisTitleColor };
  const pt = getPlotlyTheme(theme);

  const layout: PlotlyLayout = {
    font: PLOTLY_FONT,
    title: { text: `${elements.join('-')} ${t('hull.title')}`, font: { size: 15, color: pt.titleColor } },
    xaxis: { title: { text: `x(${elements[1] || 'B'}) = ${elements[1] || 'B'}/(${elements[0] || 'A'}+${elements[1] || 'B'})`, font: titleFont }, ...axisStyle },
    yaxis: { title: { text: t('hull.formationEnergy'), font: titleFont }, range: [-0.001, undefined], ...axisStyle },
    hovermode: 'closest' as const,
    showlegend: true,
    legend: { x: 0.02, y: 0.02, xanchor: 'left', yanchor: 'bottom', font: { size: 11, color: pt.legendColor } },
    margin: { t: 50, r: 80, l: 60, b: 60 },
    plot_bgcolor: pt.plotBg,
    paper_bgcolor: pt.paperBg,
  };

  return (
    <>
      {/* Fitness filter slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          Fitness max
        </span>
        <input
          type="range"
          min={0}
          max={maxFitness}
          step={maxFitness / 200}
          value={fitnessMax}
          onChange={(e) => setFitnessMax(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 300 }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 70 }}>
          ≤ {fitnessMax.toFixed(3)} eV
        </span>
        <ExportDataButton onClick={handleExport} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={traces}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: 550 }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) {
              openViewer(Number(point.customdata));
            }
          }}
        />
      </div>

      <MarkPanel />

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
