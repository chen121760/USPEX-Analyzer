/**
 * Ternary phase diagram convex hull plot.
 *
 * Uses 3D convex hull (cartX, cartY, enthalpy) to compute lower-hull tie-lines,
 * then projects to a 2D equilateral triangle for display.
 *
 * Algorithm ported from Plot_ternary_hull_corrected_2.py.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import type { Structure, SystemInfo } from '@/types/structure';
import { ternaryToCartesian, formulaToHtml } from '@/parsers/compositionUtils';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { computeTernaryHullEdges, uniqueHullPoints, type TernaryHullInput } from '@/lib/ternaryHull';
import { StructureViewerModal } from '@/components/StructureViewer/StructureViewerModal';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT, getPlotlyTheme } from '@/lib/constants';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadCsv } from '@/lib/exportCsv';

/** Structure with computed cartesian coordinates */
interface StructureWithCoords extends Structure {
  cartX: number;
  cartY: number;
}

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
}

export function TernaryHullPlot({ structures, systemInfo }: Props) {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const markActiveTags  = useUIStore((s) => s.markActiveTags);
  const markEaInput     = useUIStore((s) => s.markEaInput);
  const allTags         = useProjectStore((s) => s.tags);
  const theme           = useUIStore((s) => s.theme);

  const maxFitness = useMemo(() => {
    const vals = structures.filter((s) => s.fitness > 0 && s.enthalpyTotal <= 900).map((s) => s.fitness);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [structures]);

  const [fitnessMax, setFitnessMax] = useState(() => maxFitness);
  const [revision, setRevision] = useState(0);

  function handleFitnessChange(val: number) {
    setFitnessMax(val);
    setRevision((r) => r + 1);
  }

  const plotData = useMemo(() => {
    const elements = systemInfo.elements;
    const validStructures = structures.filter((s) => s.enthalpyTotal <= 900 && !isNaN(s.enthalpy));
    const stable = validStructures.filter((s) => s.fitness === 0);
    const unstable = validStructures.filter((s) => s.fitness > 0 && s.fitness <= fitnessMax);

    // Compute cartesian coords for unstable structures
    const unstableWithCoords: StructureWithCoords[] = unstable.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      return { ...s, cartX: cx, cartY: cy };
    });

    // Stable points for hull computation
    const stableInputs: TernaryHullInput[] = stable.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      return { id: s.id, composition: s.composition, enthalpy: s.enthalpy, cartX: cx, cartY: cy };
    });

    // Compute tie-lines
    const edges = computeTernaryHullEdges(stableInputs);

    // Unique stable points for display — join back to full Structure for hover info
    const uniqueStable = uniqueHullPoints(stableInputs);
    const structureMap = new Map(structures.map((s) => [s.id, s]));
    const uniqueStableFull = uniqueStable.map((p) => ({
      ...p,
      full: structureMap.get(p.id),
    }));

    return { unstableWithCoords, stableInputs, uniqueStableFull, edges, elements };
  }, [structures, systemInfo, fitnessMax]);

  const { unstableWithCoords, uniqueStableFull, edges, elements } = plotData;

  // Build coord lookup map for overlay traces
  const coordMap = useMemo(() => {
    const map = new Map<number, { cartX: number; cartY: number }>();
    for (const s of unstableWithCoords) map.set(s.id, { cartX: s.cartX, cartY: s.cartY });
    for (const p of uniqueStableFull) map.set(p.id, { cartX: p.cartX, cartY: p.cartY });
    return map;
  }, [unstableWithCoords, uniqueStableFull]);

  // --- Mark overlay traces ---
  const overlayTraces = useMemo(() => {
    const result: PlotlyData[] = [];

    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((tg) => tg.id === tagId);
      if (!tagDef) continue;
      const tagged = structures.filter((s) => s.tags.includes(tagId) && coordMap.has(s.id));
      if (tagged.length === 0) continue;
      result.push({
        x: tagged.map((s) => coordMap.get(s.id)!.cartX),
        y: tagged.map((s) => coordMap.get(s.id)!.cartY),
        mode: 'markers', type: 'scatter',
        name: `★ ${t(tagDef.nameKey)}`,
        marker: { symbol: 'star', size: 14, color: tagDef.color, line: { width: 1, color: 'white' } },
        hoverinfo: 'skip',
        customdata: tagged.map((s) => s.id),
        showlegend: true,
      });
    }

    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = structures.filter((s) => eaIds.has(s.id) && coordMap.has(s.id));
      if (eaMarked.length > 0) {
        result.push({
          x: eaMarked.map((s) => coordMap.get(s.id)!.cartX),
          y: eaMarked.map((s) => coordMap.get(s.id)!.cartY),
          mode: 'markers', type: 'scatter',
          name: t('mark.eaSearchName'),
          marker: { symbol: 'star', size: 14, color: '#FFD700', line: { width: 1, color: 'white' } },
          hoverinfo: 'skip',
          customdata: eaMarked.map((s) => s.id),
          showlegend: true,
        });
      }
    }
    return result;
  }, [structures, coordMap, markActiveTags, markEaInput, allTags, t]);

  // Triangle vertices
  const triVerts = [[0, 0], [0.5, Math.sqrt(3) / 2], [1, 0], [0, 0]];

  const traces: PlotlyData[] = [
    // Triangle outline
    {
      x: triVerts.map((v) => v[0]),
      y: triVerts.map((v) => v[1]),
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: '',
      line: { color: getPlotlyTheme(theme).structureLineColor, width: 1.5 },
      hoverinfo: 'skip' as const,
      showlegend: false,
    },

    // Unstable points
    {
      x: unstableWithCoords.map((s) => s.cartX),
      y: unstableWithCoords.map((s) => s.cartY),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: 'Unstable',
      marker: {
        color: unstableWithCoords.map((s) => s.fitness),
        colorscale: [
          [0, 'rgb(238,63,77)'],
          [0.25, 'rgb(252,183,10)'],
          [0.5, 'rgb(65,174,60)'],
          [0.75, 'rgb(81,196,211)'],
          [1, 'rgb(36,116,181)'],
        ],
        cmin: 0,
        cmax: Math.max(maxFitness, 0.01),
        colorbar: { title: 'Fitness\n(eV/block)', thickness: 15, len: 0.6 },
        size: 5,
        opacity: 0.6,
      },
      text: unstableWithCoords.map(
        (s) =>
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
          `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
          `Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
      customdata: unstableWithCoords.map((s) => s.id),
    },

    // Tie-lines (concatenated with null separators)
    {
      x: edges.flatMap((e) => [e.p1[0], e.p2[0], null]),
      y: edges.flatMap((e) => [e.p1[1], e.p2[1], null]),
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: t('hull.tieLines', 'Tie Lines'),
      line: { color: getPlotlyTheme(theme).structureLineColor, width: 0.8 },
      hoverinfo: 'skip' as const,
    },

    // Stable points
    {
      x: uniqueStableFull.map((p) => p.cartX),
      y: uniqueStableFull.map((p) => p.cartY),
      mode: 'markers+text' as const,
      type: 'scatter' as const,
      name: 'Stable',
      marker: { color: '#dc2626', size: 10, symbol: 'diamond' },
      text: uniqueStableFull.map((p) => {
        if (elements.length >= 3) {
          const plain = elements.map((el, i) => {
            const count = p.composition[i];
            return count === 0 ? '' : count === 1 ? el : `${el}${count}`;
          }).filter(Boolean).join('');
          return formulaToHtml(plain);
        }
        return `EA${p.id}`;
      }),
      textposition: 'top center' as const,
      textfont: { size: 8 },
      hovertext: uniqueStableFull.map((p) => {
        const s = p.full;
        return (
          `EA${p.id}: ${formulaToHtml(s?.formula ?? '')}<br>` +
          `ΔH: ${p.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: 0.0000 eV/atom<br>` +
          `SG: ${s?.spaceGroup ?? '—'} | Gen: ${s?.generation ?? '—'}<br>` +
          `Origin: ${s?.origin ?? '—'}`
        );
      }),
      hoverinfo: 'text' as const,
      customdata: uniqueStableFull.map((p) => p.id),
    },
    ...overlayTraces,
  ];

  // Element labels at triangle corners
  const labels = elements.length >= 3 ? elements : ['A', 'B', 'C'];
  const pt = getPlotlyTheme(theme);
  const labelAnnotations = [
    { x: -0.05, y: -0.05, text: labels[0], showarrow: false, font: { size: 13, color: pt.annotationColor, weight: 'bold' as const } },
    { x: 0.5, y: Math.sqrt(3) / 2 + 0.06, text: labels[1], showarrow: false, font: { size: 13, color: pt.annotationColor, weight: 'bold' as const } },
    { x: 1.05, y: -0.05, text: labels[2], showarrow: false, font: { size: 13, color: pt.annotationColor, weight: 'bold' as const } },
  ];

  const layout: PlotlyLayout = {
    font: PLOTLY_FONT,
    title: { text: `${elements.join('-')} ${t('hull.ternaryTitle', 'Ternary Phase Diagram')}`, font: { size: 15, color: pt.titleColor } },
    xaxis: {
      range: [-0.12, 1.12],
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      fixedrange: true,
    },
    yaxis: {
      range: [-0.12, Math.sqrt(3) / 2 + 0.12],
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      fixedrange: true,
      scaleanchor: 'x',
      scaleratio: 1,
    },
    annotations: labelAnnotations,
    hovermode: 'closest' as const,
    showlegend: true,
    legend: { x: 0.02, y: 0.98, font: { size: 11, color: pt.legendColor } },
    margin: { t: 50, r: 80 },
    plot_bgcolor: pt.plotBg,
    paper_bgcolor: pt.paperBg,
    width: 600,
    height: 550,
  };

  function handleExport() {
    const elA = elements[0] || 'A';
    const elB = elements[1] || 'B';
    const elC = elements[2] || 'C';
    const headers = ['EA_ID', 'Formula', `x_${elA}`, `x_${elB}`, `x_${elC}`, 'Enthalpy(eV/atom)', 'Fitness(eV/atom)', 'SpaceGroup', 'Generation', 'Origin', 'Type'];
    const stableRows = uniqueStableFull.map((p) => {
      const total = p.composition.reduce((a: number, b: number) => a + b, 0) || 1;
      return {
        'EA_ID': p.id,
        'Formula': p.full?.formula ?? '',
        [`x_${elA}`]: (p.composition[0] / total).toFixed(6),
        [`x_${elB}`]: (p.composition[1] / total).toFixed(6),
        [`x_${elC}`]: (p.composition[2] / total).toFixed(6),
        'Enthalpy(eV/atom)': p.enthalpy,
        'Fitness(eV/atom)': 0,
        'SpaceGroup': p.full?.spaceGroup ?? '',
        'Generation': p.full?.generation ?? '',
        'Origin': p.full?.origin ?? '',
        'Type': 'Stable',
      };
    });
    const unstableRows = unstableWithCoords.map((s) => {
      const total = s.composition.reduce((a: number, b: number) => a + b, 0) || 1;
      return {
        'EA_ID': s.id,
        'Formula': s.formula,
        [`x_${elA}`]: (s.composition[0] / total).toFixed(6),
        [`x_${elB}`]: (s.composition[1] / total).toFixed(6),
        [`x_${elC}`]: (s.composition[2] / total).toFixed(6),
        'Enthalpy(eV/atom)': s.enthalpy,
        'Fitness(eV/atom)': s.fitness,
        'SpaceGroup': s.spaceGroup,
        'Generation': s.generation,
        'Origin': s.origin,
        'Type': 'Unstable',
      };
    });
    const tag = fitnessMax.toFixed(3).replace('.', 'p');
    downloadCsv(`${elements.join('-')}_ternary_hull_fitness${tag}`, headers, [...stableRows, ...unstableRows]);
  }

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
          onChange={(e) => handleFitnessChange(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 300 }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 70 }}>
          ≤ {fitnessMax.toFixed(3)} eV
        </span>
        <ExportDataButton onClick={handleExport} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <Plot
          data={traces}
          layout={layout}
          revision={revision}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', maxWidth: 700, height: 550 }}
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
          {t('hull.stablePhases')} ({uniqueStableFull.length})
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {uniqueStableFull.map((p) => {
            const formula = elements.length >= 3
              ? elements.map((el, i) => p.composition[i] === 0 ? '' : p.composition[i] === 1 ? el : `${el}${p.composition[i]}`).filter(Boolean).join('')
              : `EA${p.id}`;
            return (
              <span
                key={p.id}
                className="tag-badge"
                style={{ background: '#dc262620', color: '#dc2626', fontSize: 12, padding: '3px 10px' }}
              >
                EA{p.id} · {formula} · {p.enthalpy.toFixed(4)} eV/atom
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
