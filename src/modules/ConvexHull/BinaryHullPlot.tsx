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
import type { Structure, SystemInfo } from '@/types/structure';
import { useUIStore } from '@/store/useUIStore';
import { useThemeStore } from '@/theme/themeStore';
import { useMarkStore } from '@/store/useMarkStore';
import { useProjectStore } from '@/store/useProjectStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT } from '@/lib/constants';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadMultiSectionCsv } from '@/lib/exportCsv';
import { computeLowerHull2D } from '@/lib/convexHullReconstruction';
import { PlotFrame } from '@/charts/shared/PlotFrame';
import { usePlotViewport } from '@/charts/shared/plotRange';
import { usePlotlyStructurePointClick } from '@/charts/shared/usePlotlyStructurePointClick';
import { CONVEX_HULL_PLOT_HEIGHT } from './plotSizing';

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
  /** Structure ID → group name (for workshop multi-group display) */
  groupMap?: Map<number, string>;
  /** Show the export button (default true, set false in HullWorkshop) */
  showExport?: boolean;
  /** Show tag buttons in MarkPanel (default true) */
  showTags?: boolean;
  /** Show stable-phases footer (default true) */
  showFooter?: boolean;
  /** Old hull line (dashed) — shown when user-added expanded the hull */
  oldHullLine?: { x: number; y: number }[];
  /** Whether user-added structures expanded the hull */
  hullExpanded?: boolean;
  /** Called when a structure point is clicked (HullWorkshop: pass full structure, not just ID) */
  onStructureClick?: (structure: Structure) => void;
}

function makeStarTrace(
  x: number[], y: number[], color: string, name: string, ids: number[], text: string[],
): PlotlyData {
  return {
    x, y,
    mode: 'markers',
    type: 'scatter',
    name,
    marker: { symbol: 'star', size: 14, color, line: { width: 1, color: 'white' } },
    text,
    hoverinfo: 'text',
    customdata: ids,
    showlegend: true,
  };
}

export function BinaryHullPlot({ structures, systemInfo, groupMap, showExport = true, showTags = true, showFooter = true, oldHullLine, hullExpanded, onStructureClick }: Props) {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const markActiveTags  = useMarkStore((s) => s.markActiveTags);
  const markEaInput     = useMarkStore((s) => s.markEaInput);
  const theme           = useThemeStore((s) => s.theme);
  const allTags         = useProjectStore((s) => s.tags);

  const maxFitness = useMemo(() => {
    const vals = structures.filter((s) => s.fitness > 0 && s.enthalpyTotal <= 900).map((s) => s.fitness);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [structures]);

  const [fitnessMax, setFitnessMax] = useState(() => maxFitness);

  const plotData = useMemo(() => {
    const userAdded = structures.filter((s) => s.isUserAdded && s.enthalpyTotal <= 900);
    const stable = structures.filter((s) => !s.isUserAdded && s.fitness === 0 && s.enthalpyTotal <= 900);
    const unstable = structures.filter((s) => !s.isUserAdded && s.fitness > 0 && s.fitness <= fitnessMax && s.enthalpyTotal <= 900);
    // Hull computation: include ALL fitness=0 structures, including user-added ones
    // that expanded the hull.  Display layers stay separate.
    const hullPoints = structures
      .filter((s) => s.fitness === 0 && s.enthalpyTotal <= 900)
      .map((s) => ({ x: s.hullX[0] ?? 0, y: s.hullY }));
    const hullLine = computeLowerHull2D(hullPoints);
    return { stable, unstable, userAdded, hullLine };
  }, [structures, fitnessMax]);

  const { stable, unstable, userAdded, hullLine } = plotData;
  const elements = systemInfo.elements;
  const getStructureHoverText = (s: Structure) =>
    (s.groupName || groupMap ? `Group: ${s.groupName ?? groupMap?.get(s.id) ?? '—'}<br>` : '') +
    `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
    `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
    `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
    `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
    `Origin: ${s.origin}`;

  // --- Mark overlay traces: tag-based (controlled by showTags) ---
  const tagOverlayTraces = useMemo(() => {
    const result: PlotlyData[] = [];
    const allVisible = [...stable, ...unstable, ...userAdded];

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
        tagged.map(getStructureHoverText),
      ));
    }
    return result;
  }, [stable, unstable, userAdded, markActiveTags, allTags, groupMap, t]);

  // --- Mark overlay traces: EA-ID search (always active) ---
  const eaOverlayTraces = useMemo(() => {
    const result: PlotlyData[] = [];
    const allVisible = [...stable, ...unstable, ...userAdded];

    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = allVisible.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        const byGroup = new Map<string, typeof eaMarked>();
        for (const s of eaMarked) {
          const key = s.groupName || '';
          if (!byGroup.has(key)) byGroup.set(key, []);
          byGroup.get(key)!.push(s);
        }
        for (const [gn, structs] of byGroup) {
          const color = structs[0].groupColor ?? '#FFD700';
          const name = gn
            ? `★ ${t('mark.eaSearchName')} · ${gn}`
            : `★ ${t('mark.eaSearchName')}`;
          result.push(makeStarTrace(
            structs.map((s) => s.hullX[0] ?? 0),
            structs.map((s) => s.hullY),
            color,
            name,
            structs.map((s) => s.id),
            structs.map(getStructureHoverText),
          ));
        }
      }
    }
    return result;
  }, [stable, unstable, userAdded, markEaInput, groupMap, t]);

  function handleExport() {
    const hasGroup = groupMap != null || structures.some((s) => s.groupName != null);
    const groupCol = hasGroup ? ['Group'] : [];
    const pointHeaders = [...groupCol, 'EA_ID', 'Formula', `x(${elements[1] || 'B'})`, 'Formation_Energy(eV/atom)', 'Enthalpy(eV/atom)', 'Fitness(eV/atom)', 'SpaceGroup', 'Generation', 'Origin', 'Type'];
    const groupField = (s: Structure) => hasGroup ? { 'Group': s.groupName ?? '' } : {};
    const stableRows = stable.map((s) => ({
      ...groupField(s),
      'EA_ID': s.id,
      'Formula': s.formula,
      [`x(${elements[1] || 'B'})`]: s.hullX[0] ?? 0,
      'Formation_Energy(eV/atom)': s.hullY,
      'Enthalpy(eV/atom)': s.enthalpy,
      'Fitness(eV/atom)': 0,
      'SpaceGroup': s.spaceGroup,
      'Generation': s.generation,
      'Origin': s.origin,
      'Type': 'Stable',
    }));
    const unstableRows = unstable.map((s) => ({
      ...groupField(s),
      'EA_ID': s.id,
      'Formula': s.formula,
      [`x(${elements[1] || 'B'})`]: s.hullX[0] ?? 0,
      'Formation_Energy(eV/atom)': s.hullY,
      'Enthalpy(eV/atom)': s.enthalpy,
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
          (s.groupName || groupMap ? `Group: ${s.groupName ?? groupMap?.get(s.id) ?? '—'}<br>` : '') +
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
          `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
          `Origin: ${s.origin}`,
      ),
      customdata: unstable.map((s: any) => s._mergeSeq ?? s.id),
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
    // Old hull (dashed) — shown when user-added expanded the hull
    ...(oldHullLine && oldHullLine.length >= 2 ? [{
      x: oldHullLine.map((p) => p.x),
      y: oldHullLine.map((p) => p.y),
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: 'Previous Hull',
      line: { color: getPlotlyTheme(theme).structureLineColor, width: 1.5, dash: 'dash' as const },
      hoverinfo: 'skip' as const,
    }] : []),
    {
      x: stable.map((s) => s.hullX[0] ?? 0),
      y: stable.map((s) => s.hullY),
      mode: 'markers+text' as const,
      type: 'scatter' as const,
      name: 'Stable',
      marker: { color: getPlotlyTheme(theme).frontColors[0], size: 10, symbol: 'diamond' },
      text: stable.map((s) => formulaToHtml(s.formula)),
      textposition: 'top center' as const,
      textfont: { size: 10 },
      hovertext: stable.map(
        (s) =>
          (s.groupName || groupMap ? `Group: ${s.groupName ?? groupMap?.get(s.id) ?? '—'}<br>` : '') +
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
          `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
          `Origin: ${s.origin}`,
      ),
      customdata: stable.map((s: any) => s._mergeSeq ?? s.id),
      hoverinfo: 'text' as const,
    },
    // User-added structures — white circles with black border
    {
      x: userAdded.map((s) => s.hullX[0] ?? 0),
      y: userAdded.map((s) => s.hullY),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: 'Manual',
      marker: {
        color: getPlotlyTheme(theme).selectedMarkerFill,
        size: 10,
        symbol: 'circle' as const,
        line: { width: 1.5, color: getPlotlyTheme(theme).selectedMarkerLine },
      },
      text: userAdded.map(
        (s) =>
          `[Manual]<br>` +
          (s.groupName ? `Group: ${s.groupName}<br>` : '') +
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom`,
      ),
      hoverinfo: 'text' as const,
      customdata: userAdded.map((s: any) => s._mergeSeq ?? s.id),
    },
    ...(showTags ? tagOverlayTraces : []),
    ...eaOverlayTraces,
  ];

  const axisStyle = {
    tickfont: { size: 11, color: getPlotlyTheme(theme).tickColor },
    gridcolor: getPlotlyTheme(theme).gridColor,
    zerolinecolor: getPlotlyTheme(theme).zerolineColor,
    linecolor: getPlotlyTheme(theme).lineColor,
  };

  const titleFont = { size: 13, color: getPlotlyTheme(theme).axisTitleColor };
  const pt = getPlotlyTheme(theme);

  const { viewportLayout, handleRelayout } = usePlotViewport();

  const layout: PlotlyLayout = {
    font: PLOTLY_FONT,
    title: { text: `${elements.join('-')} ${t('hull.title')}`, font: { size: 15, color: pt.titleColor } },
    xaxis: { title: { text: `x(${elements[1] || 'B'}) = ${elements[1] || 'B'}/(${elements[0] || 'A'}+${elements[1] || 'B'})`, font: titleFont }, ...axisStyle },
    yaxis: { title: { text: t('hull.formationEnergy'), font: titleFont }, range: [-0.001, undefined], ...axisStyle },
    hovermode: 'closest' as const,
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.02,
      xanchor: 'left',
      yanchor: 'bottom',
      bgcolor: theme === 'dark' ? 'rgba(24, 24, 37, 0.86)' : 'rgba(255,255,255,0.4)',
      bordercolor: theme === 'dark' ? '#313244' : '#e2e8f0',
      font: { size: 11, color: pt.legendColor },
    },
    margin: { t: 50, r: 80, l: 60, b: 60 },
    plot_bgcolor: pt.plotBg,
    paper_bgcolor: pt.paperBg,
    ...viewportLayout,
  };

  const handleStructurePointClick = (structureId: number) => {
    if (onStructureClick) {
      const structure = structures.find((s) => Number((s as Structure & { _mergeSeq?: number })._mergeSeq ?? s.id) === structureId);
      if (structure) onStructureClick(structure);
      return;
    }

    openViewer(structureId);
  };

  const structurePointClick = usePlotlyStructurePointClick({
    traces,
    onStructureClick: handleStructurePointClick,
  });

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
        {showExport && <ExportDataButton onClick={handleExport} style={{ marginLeft: 'auto' }} />}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <PlotFrame
          data={structurePointClick.plotTraces}
          layout={layout}
          style={{ width: '100%', height: CONVEX_HULL_PLOT_HEIGHT }}
          boundaryStyle={{ width: '100%', height: CONVEX_HULL_PLOT_HEIGHT }}
          boundaryHandlers={structurePointClick.boundaryHandlers}
          hoverTooltip={structurePointClick.hoverTooltip}
          {...structurePointClick.plotHandlers}
          onRelayout={handleRelayout}
        />
      </div>

      <MarkPanel showTags={showTags} />

      {/* Stable phases list */}
      {showFooter && <div className="card" style={{ marginTop: 16 }}>
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
      </div>}
    </>
  );
}
