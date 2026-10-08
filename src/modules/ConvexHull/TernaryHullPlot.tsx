import { useHullMetric } from './HullMetricContext';
import { useMemo, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ECharts } from 'echarts';
import type { Structure, SystemInfo } from '@/types/structure';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { useUIStore } from '@/store/useUIStore';
import { useThemeStore } from '@/theme/themeStore';
import { useMarkStore } from '@/store/useMarkStore';
import { useProjectStore } from '@/store/useProjectStore';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { CHART_FONT } from '@/lib/constants';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { downloadCsv } from '@/lib/exportCsv';
import { parseEaIds } from '@/lib/parseEaIds';
import { PlotFrame } from '@/charts/shared/PlotFrame';
import type { PlotData, PlotLayout } from '@/charts/shared/plotTypes';
import { mergePlotViewport, usePlotViewport } from '@/charts/shared/plotRange';
import { useTernaryZoom, type TernaryInteractionMode } from '@/charts/ternary/useTernaryZoom';
import { BASE_TERNARY_RANGES, MIN_TERNARY_SCALE, isInTernaryViewport, clipTernaryEdges, compositionAtTernaryPoint, ternaryViewportCentre, ternaryViewportVertices,
  panTernaryViewport, ternaryRangePatch, ternaryViewportScale, zoomTernaryViewport, type TernaryRanges } from '@/charts/ternary/ternaryZoom';
import { buildTernaryPlotModel, ternaryExportData, ternaryMarkGroups, type TernaryPlotEntry } from './ternaryPlotModel';
import { useFitnessLimit, type FitnessLimitProps } from './useFitnessLimit';
import { CONVEX_HULL_PLOT_HEIGHT } from './plotSizing';

interface Props extends FitnessLimitProps {
  structures: Structure[];
  systemInfo: SystemInfo;
  groupMap?: Map<number, string>;
  showExport?: boolean;
  showTags?: boolean;
  showFooter?: boolean;
  oldHullEdges?: { p1: [number, number]; p2: [number, number] }[];
  onStructureClick?: (structure: Structure) => void;
}

const PLOT_CONFIG = { rectZoom: false, displayModeBar: false };
const controlStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 };
const inputStyle = { width: 92, padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6,
  background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 };

export function TernaryHullPlot(props: Props) {
  const { structures, systemInfo, groupMap, showExport = true, showTags = true, showFooter = true, oldHullEdges, onStructureClick } = props;
  const { t } = useTranslation();
  const metric = useHullMetric();
  const inputId = useId();
  const theme = useThemeStore((s) => s.theme);
  const openViewer = useUIStore((s) => s.openViewer);
  const activeTags = useMarkStore((s) => s.markActiveTags);
  const eaInput = useMarkStore((s) => s.markEaInput);
  const tags = useProjectStore((s) => s.tags);
  const model = useMemo(() => buildTernaryPlotModel(structures, systemInfo), [structures, systemInfo]);
  const { fitnessMax, handleFitnessChange } = useFitnessLimit(model.maxFitness, props);
  const { viewportLayout, handleRelayout, undoViewport, resetViewport, canUndo } = usePlotViewport();
  const [chart, setChart] = useState<ECharts | null>(null);
  const [mode, setMode] = useState<TernaryInteractionMode>('inspect');
  const [showLabels, setShowLabels] = useState(true);
  const [legendSelection, setLegendSelection] = useState<Record<string, boolean>>({});
  const [panPreview, setPanPreview] = useState<TernaryRanges | null>(null);
  const pt = getPlotlyTheme(theme);
  const ranges: TernaryRanges = panPreview ?? {
    x: (viewportLayout.xaxis as { range?: [number, number] })?.range ?? BASE_TERNARY_RANGES.x,
    y: (viewportLayout.yaxis as { range?: [number, number] })?.range ?? BASE_TERNARY_RANGES.y,
  };
  const scale = ternaryViewportScale(ranges);
  const magnification = 1 / scale;
  const zoomed = scale < 1 - 1e-8;
  const centreComposition = compositionAtTernaryPoint(ternaryViewportCentre(ranges));
  const filtered = useMemo(() => [...model.stable, ...model.unstable.filter((e) => e.structure.fitness <= fitnessMax), ...model.manual], [model, fitnessMax]);
  const inViewport = filtered.filter((e) => isInTernaryViewport([e.cartX, e.cartY], ranges));
  const visible = inViewport.filter((e) => legendSelection[t(e.structure.isUserAdded ? 'hull.manual' : e.structure.fitness === 0 ? 'hull.stable' : 'hull.unstable')] !== false);
  const stable = inViewport.filter((e) => !e.structure.isUserAdded && e.structure.fitness === 0);
  const unstable = inViewport.filter((e) => !e.structure.isUserAdded && e.structure.fitness > 0);
  const manual = inViewport.filter((e) => e.structure.isUserAdded);
  const energyText = (e: TernaryPlotEntry) => e.eForm === null ? t('hull.unavailable') : `${e.eForm.toFixed(4)} ${model.energyUnit}`;
  const hoverText = (e: TernaryPlotEntry) => {
    const s = e.structure;
    const group = s.groupName ?? groupMap?.get(s.id);
    return `${group ? `${t('hull.group')}: ${group}<br>` : ''}EA${s.id}: ${formulaToHtml(s.formula)}<br>`
      + model.components.map((label, i) => `${formulaToHtml(label)}: ${(100 * e.composition[i]).toFixed(2)}%`).join(' · ') + '<br>'
      + `E_form: ${energyText(e)}<br>ΔH: ${s.enthalpy.toFixed(4)} eV/atom<br>${metric.name}: ${s.fitness.toFixed(4)} ${metric.unit}<br>`
      + `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>Origin: ${s.origin}`;
  };
  const scatter = (entries: TernaryPlotEntry[], name: string, marker: Record<string, unknown>, labels = false) => ({
    type: 'scatter', mode: labels ? 'markers+text' : 'markers', name,
    x: entries.map((e) => e.cartX), y: entries.map((e) => e.cartY), marker,
    text: entries.map((e) => labels ? formulaToHtml(e.structure.formula) : hoverText(e)),
    hovertext: entries.map(hoverText), hoverinfo: 'text', customdata: entries.map((e) => e.key),
    textposition: 'top center', textfont: { size: 12, color: pt.annotationColor },
    showlegend: entries.length > 0,
  });
  const lineTrace = (source: { p1: [number, number]; p2: [number, number] }[], name: string, dash = 'solid') => {
    const edges = clipTernaryEdges(source, ranges);
    return {
      type: 'scatter', mode: 'lines', name,
      x: edges.flatMap((e) => [e.p1[0], e.p2[0], null]), y: edges.flatMap((e) => [e.p1[1], e.p2[1], null]),
      line: { color: pt.structureLineColor, width: 0.8, dash }, hoverinfo: 'skip', showlegend: source.length > 0,
    };
  };
  const marks = ternaryMarkGroups(visible, activeTags, tags, parseEaIds(eaInput), showTags);
  const corners = ternaryViewportVertices(ranges);
  const outline = [...corners, corners[0]];
  const traces: PlotData = [
    { type: 'scatter', mode: 'lines', x: outline.map((v) => v[0]), y: outline.map((v) => v[1]),
      line: { color: pt.structureLineColor, width: 1.5 }, showlegend: false, hoverinfo: 'skip' },
    scatter(unstable, t('hull.unstable'), { size: 5, opacity: 0.6, color: unstable.map((e) => e.structure.fitness),
      colorscale: [[0, 'rgb(238,63,77)'], [0.25, 'rgb(252,183,10)'], [0.5, 'rgb(65,174,60)'], [0.75, 'rgb(81,196,211)'], [1, 'rgb(36,116,181)']],
      cmin: 0, cmax: Math.max(fitnessMax, 0.001), colorbar: { title: `${metric.name}\n(${metric.unit})` } }),
    lineTrace(model.edges, t('hull.tieLines')),
    ...(oldHullEdges?.length ? [lineTrace(oldHullEdges, t('hull.previousTieLines'), 'dash')] : []),
    scatter(stable, t('hull.stable'), { symbol: 'diamond', size: 10, color: pt.frontColors[0] }, showLabels),
    ...(manual.length ? [scatter(manual, t('hull.manual'), { symbol: 'circle', size: 10,
      color: pt.selectedMarkerFill, line: { width: 1.5, color: pt.selectedMarkerLine } })] : []),
    ...marks.map((group) => scatter(group.entries,
      `★ ${[...group.tags.map((tag) => t(tag.nameKey)), ...(group.byEa ? [t('mark.eaSearchName')] : []), group.groupName].filter(Boolean).join(' · ')}`,
      { symbol: 'star', size: 14, color: group.color, line: { width: 1, color: pt.paperBg } })),
  ];
  const cornerAnnotations = corners.map((point, index) => ({
    x: point[0] + (index === 0 ? -0.035 : index === 2 ? 0.035 : 0) * scale,
    y: point[1] + (index === 1 ? zoomed ? 0.035 : 0.065 : zoomed ? -0.12 : -0.025) * scale,
    text: zoomed ? compositionAtTernaryPoint(point).map((n, i) => `${formulaToHtml(model.components[i])} ${(Math.max(0, n) * 100).toFixed(1)}%`).join('\n') : formulaToHtml(model.components[index]),
    showarrow: false, font: { size: zoomed ? 10 : 13, color: pt.annotationColor, weight: 'bold' },
  }));
  const layout: PlotLayout = mergePlotViewport({
    autosize: true, font: { ...CHART_FONT, color: pt.legendColor },
    title: { text: `${model.components.map(formulaToHtml).join('-')} ${t('hull.ternaryTitle')}${zoomed ? ` · ${magnification.toFixed(1)}×` : ''}`,
      font: { size: 15, color: pt.titleColor } },
    xaxis: { range: BASE_TERNARY_RANGES.x, showgrid: false, zeroline: false, showticklabels: false, constrain: 'domain' },
    yaxis: { range: BASE_TERNARY_RANGES.y, showgrid: false, zeroline: false, showticklabels: false,
      scaleanchor: 'x', scaleratio: 1, constrain: 'domain' },
    annotations: cornerAnnotations, showlegend: true,
    legend: { x: 0.5, y: 0.92, bgcolor: pt.paperBg, font: { size: 11, color: pt.legendColor } },
    margin: { t: 64, r: 80, l: 64, b: 64 }, plot_bgcolor: pt.plotBg, paper_bgcolor: pt.paperBg,
  }, panPreview ? { xaxis: { range: ranges.x }, yaxis: { range: ranges.y } } : viewportLayout);
  const { overlay } = useTernaryZoom({ chart, ranges, mode, onZoom: handleRelayout,
    onComplete: () => setMode('inspect'), onPreview: setPanPreview });
  const handleClick = (key: number) => {
    const entry = model.entries.find((e) => e.key === key);
    if (!entry) return;
    if (onStructureClick) onStructureClick(entry.structure);
    else openViewer(entry.structure.id);
  };
  const reset = () => { resetViewport(); setMode('inspect'); };
  const zoomBy = (factor: number) => { setMode('inspect'); handleRelayout(ternaryRangePatch(zoomTernaryViewport(ranges, factor))); };
  const pan = (dx: number, dy: number) => handleRelayout(ternaryRangePatch(panTernaryViewport(ranges,
    [dx * (ranges.x[1] - ranges.x[0]) * 0.2, dy * (ranges.y[1] - ranges.y[0]) * 0.2])));
  const filename = `${model.components.join('-')}_ternary_hull_${metric.name === 'Fitness' ? 'fitness' : 'Ed'}${fitnessMax.toFixed(3).replace('.', 'p')}`;
  const exportCsv = () => {
    const { headers, rows } = ternaryExportData(filtered, model.components, model.energyUnit, !!groupMap || structures.some((s) => !!s.groupName), metric.header);
    downloadCsv(filename, headers, rows);
  };
  const exportImage = () => {
    if (!chart) return;
    const link = document.createElement('a');
    link.href = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: pt.paperBg });
    link.download = `${filename}_zoom${magnification.toFixed(1)}.png`;
    link.click();
  };

  return <>
    <div style={{ ...controlStyle, marginBottom: 12 }}>
      <label htmlFor={`${inputId}-number`} style={{ fontSize: 13 }}>{metric.limitLabel}</label>
      <input type="range" aria-label={metric.limitLabel} min={0} max={model.maxFitness} step="any"
        value={fitnessMax} disabled={model.maxFitness === 0} onChange={(e) => handleFitnessChange(Number(e.target.value))}
        style={{ flex: '1 1 140px', maxWidth: 280 }} />
      <input id={`${inputId}-number`} type="number" min={0} max={model.maxFitness} step="any" value={fitnessMax}
        onChange={(e) => { if (e.target.value !== '') handleFitnessChange(Number(e.target.value)); }} style={inputStyle} />
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{metric.unit}</span>
      {showExport && <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} title={t('hull.csvScope')} style={{ marginLeft: 'auto' }}>{t('hull.exportFiltered')}</button>}
    </div>
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div role="group" aria-label={t('hull.viewControls')} style={{ ...controlStyle, padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
        <button type="button" className="btn btn-outline btn-sm" aria-pressed={mode === 'select'} onClick={() => setMode(mode === 'select' ? 'inspect' : 'select')}>{t('hull.boxZoom')}</button>
        <button type="button" className="btn btn-outline btn-sm" aria-pressed={mode === 'pan'} disabled={!zoomed} onClick={() => setMode(mode === 'pan' ? 'inspect' : 'pan')}>{t('hull.pan')}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={scale <= MIN_TERNARY_SCALE + 1e-8} onClick={() => zoomBy(0.5)}>{t('hull.zoomIn')}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!zoomed} onClick={() => zoomBy(2)}>{t('hull.zoomOut')}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!canUndo} onClick={() => { undoViewport(); setMode('inspect'); }}>{t('hull.back')}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!zoomed && !canUndo && mode === 'inspect'} onClick={reset}>{t('btn.reset')}</button>
        <label style={{ ...controlStyle, fontSize: 12 }}><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />{t('hull.formulaLabels')}</label>
        <button type="button" className="btn btn-outline btn-sm" disabled={!chart} onClick={exportImage} style={{ marginLeft: 'auto' }}>{t('hull.exportImage')}</button>
      </div>
      <div role="status" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {magnification.toFixed(1)}× · {t(`hull.${mode}Hint`)} · {t('hull.visibleCount', { count: visible.length })}
        {zoomed && centreComposition.every((n) => n >= 0) && <> · {t('hull.viewCentre')}: {model.components.map((label, i) => `${label} ${(centreComposition[i] * 100).toFixed(1)}%`).join(' / ')}</>}
      </div>
      {zoomed && <div role="group" aria-label={t('hull.panDirections')} style={{ ...controlStyle, padding: '0 14px' }}>
        {([[-1, 0, '←', 'left'], [1, 0, '→', 'right'], [0, 1, '↑', 'up'], [0, -1, '↓', 'down']] as const).map(([dx, dy, symbol, direction]) =>
          <button key={direction} type="button" className="btn btn-ghost btn-sm" aria-label={t(`hull.pan${direction}`)} onClick={() => pan(dx, dy)}>{symbol}</button>)}
      </div>}
      <PlotFrame data={traces} layout={layout} config={PLOT_CONFIG}
        style={{ width: '100%', height: CONVEX_HULL_PLOT_HEIGHT }} boundaryStyle={{ width: '100%', height: CONVEX_HULL_PLOT_HEIGHT, touchAction: mode === 'inspect' ? 'auto' : 'none' }}
        onStructureClick={(key) => { if (mode === 'inspect') handleClick(key); }}
        onRelayout={(event) => { handleRelayout(event); if (event['xaxis.autorange'] === true) setMode('inspect'); }} onLegendSelectionChange={setLegendSelection} overlay={overlay}
        onInitialized={(_figure, instance) => setChart(instance as ECharts)} />
    </div>
    <details className="card" style={{ marginTop: 12, padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 13 }}>{t('mark.title')}{marks.length > 0 ? ` · ${marks.reduce((sum, group) => sum + group.entries.length, 0)}` : ''}</summary>
      <MarkPanel showTags={showTags} visibleStructures={visible.map((e) => e.structure)} />
    </details>
    {showFooter && <details className="card" style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13 }}>{t('hull.stablePhases')} ({model.stable.length})</summary>
      <div style={{ ...controlStyle, marginTop: 10 }}>{model.stable.map((e) => <button key={e.key} type="button" className="btn btn-outline btn-sm" onClick={() => handleClick(e.key)}>
        EA{e.structure.id} · {e.structure.formula} · {energyText(e)}
      </button>)}</div>
    </details>}
  </>;
}
