import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { useChartSettingsStore } from '@/store/useChartSettingsStore';
import { useFilterStore } from '@/store/useFilterStore';
import { useThemeStore } from '@/theme/themeStore';
import { useMarkStore } from '@/store/useMarkStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { CHART_FONT, ML_FIELD_KEYS, ML_FIELD_I18N } from '@/lib/constants';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { exportAnimatedEChartsGif } from '@/export/chartImageExport';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadCsv } from '@/lib/exportCsv';
import { PlotFrame } from '@/charts/shared/PlotFrame';
import { useStructurePointClick } from '@/charts/shared/useStructurePointClick';
import { RangeInputs } from '@/charts/shared/RangeControls';
import { buildXMarginalTraces, buildYMarginalTraces } from '@/charts/shared/marginalTraces';
import { collectDynamicFieldKeys, numericStructureFieldValue } from '@/domain/structure/dynamicFields';
import { hasMLProperties, mlPropertyValue } from '@/domain/structure/mlProperties';
import { ExplorerControls } from './components/ExplorerControls';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import { useProgressiveData } from '@/hooks/useProgressiveData';
import { matchesActiveFilter } from '@/modules/Filter/filterLogic';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
import type { Structure } from '@/types/structure';

interface FieldOption {
  key: string;
  label: string;
  accessor: (s: Structure) => number | string | undefined;
  type: 'numeric' | 'categorical';
}

function getFieldOptions(t: (k: string) => string, hasML: boolean, hasPareto: boolean, extraPropKeys: string[], elements: string[], structureMap: Map<number, Structure>, isVarcomp: boolean, hasVolume: boolean, hasDensity: boolean): FieldOption[] {
  const opts: FieldOption[] = [
    { key: 'enthalpy', label: t('col.enthalpy'), accessor: (s) => s.enthalpy, type: 'numeric' },
    { key: 'enthalpyTotal', label: t('col.enthalpyTotal'), accessor: (s) => s.enthalpyTotal, type: 'numeric' },
    { key: 'fitness', label: t('col.fitness'), accessor: (s) => s.fitness >= 0 ? s.fitness : undefined, type: 'numeric' },
    { key: 'spaceGroup', label: t('col.spaceGroup'), accessor: (s) => s.spaceGroup, type: 'numeric' },
    { key: 'generation', label: t('col.generation'), accessor: (s) => s.generation, type: 'numeric' },
    { key: 'qEntropy', label: t('col.qEntropy'), accessor: (s) => s.qEntropy > 0 ? s.qEntropy : undefined, type: 'numeric' },
    { key: 'aOrder', label: t('col.aOrder'), accessor: (s) => s.qEntropy > 0 && s.aOrder >= 0 ? s.aOrder : undefined, type: 'numeric' },
    { key: 'sOrder', label: t('col.sOrder'), accessor: (s) => s.qEntropy > 0 && s.sOrder >= 0 ? s.sOrder : undefined, type: 'numeric' },
    { key: 'origin', label: t('col.origin'), accessor: (s) => s.origin, type: 'categorical' },
    { key: 'formula', label: t('col.formula'), accessor: (s) => s.formula, type: 'categorical' },
  ];

  if (hasVolume) {
    opts.push({ key: 'volume', label: t('col.volume'), accessor: (s) => s.volume > 0 ? s.volume : undefined, type: 'numeric' });
  }
  if (hasDensity) {
    opts.push({ key: 'density', label: t('col.density'), accessor: (s) => s.density > 0 ? s.density : undefined, type: 'numeric' });
  }

  for (const [i, el] of elements.entries()) {
    opts.push({
      key: `xfrac_${el}`,
      label: `x(${el})`,
      accessor: (s) => {
        const total = s.composition.reduce((a, b) => a + b, 0);
        return total > 0 ? s.composition[i] / total : undefined;
      },
      type: 'numeric',
    });
  }

  if (hasML) {
    for (const key of ML_FIELD_KEYS) {
      opts.push({
        key,
        label: t(ML_FIELD_I18N[key]),
        // Negative ML predictions are real data (unstable structures); only a
        // non-finite value means "this structure has no MLProperties row".
        accessor: (s) => mlPropertyValue(s, key),
        type: 'numeric',
      });
    }
  }

  if (hasPareto) {
    opts.push(
      { key: 'paretoFront', label: t('col.paretoFront'), accessor: (s) => s.paretoFront >= 0 ? s.paretoFront : undefined, type: 'numeric' },
    );
  }

  if (isVarcomp) {
    opts.push(
      { key: 'eForm', label: t('col.eForm'), accessor: (s) => s.eForm !== -1 ? s.eForm : undefined, type: 'numeric' },
      { key: 'eHullRecons', label: t('col.eHullRecons'), accessor: (s) => s.eHullRecons >= 0 ? s.eHullRecons : undefined, type: 'numeric' },
    );
  }

  for (const key of extraPropKeys) {
    opts.push({ key: `extra_${key}`, label: key, accessor: (s) => numericStructureFieldValue(s, key), type: 'numeric' });
  }

  // Generate Δ (delta) variants for all numeric fields
  const numericFields = opts.filter((f) => f.type === 'numeric');
  for (const field of numericFields) {
    opts.push({
      key: `delta_${field.key}`,
      label: `Δ ${field.label}`,
      accessor: (s) => {
        if (s.parentIds.length === 0) return undefined;
        const parent = structureMap.get(s.parentIds[0]);
        if (!parent) return undefined;
        const childVal = field.accessor(s);
        const parentVal = field.accessor(parent);
        if (childVal == null || parentVal == null || !isFinite(childVal as number) || !isFinite(parentVal as number)) return undefined;
        return (childVal as number) - (parentVal as number);
      },
      type: 'numeric',
    });
  }

  return opts;
}

export function ExplorerPage() {
  const { t } = useTranslation();
  const openViewer      = useUIStore((s) => s.openViewer);
  const markActiveTags  = useMarkStore((s) => s.markActiveTags);
  const markEaInput     = useMarkStore((s) => s.markEaInput);
  const theme           = useThemeStore((s) => s.theme);
  const allTags         = useProjectStore((s) => s.tags);
  const rawStructures   = useProjectStore((s) => s.structures);
  // Building every trace for 7677 points is the expensive part of this page, so
  // it runs one frame after mount: the controls paint first, the chart box shows
  // a same-size skeleton, then the traces arrive inside a transition.
  const { data: structures, ready } = useProgressiveData(rawStructures);
  const systemInfo      = useProjectStore((s) => s.systemInfo);

  const hasML = hasMLProperties(structures);
  const hasPareto = systemInfo?.optimizationType === 'multi';
  const isVarcomp = systemInfo?.compositionMode === 'varcomp';
  const hasVolume  = structures.some((s) => s.volume > 0);
  const hasDensity = structures.some((s) => s.density > 0);

  const extraPropKeys = useMemo(() => collectDynamicFieldKeys(structures), [structures]);

  const structureMap = useMemo(() => {
    const m = new Map<number, Structure>();
    structures.forEach((s) => m.set(s.id, s));
    return m;
  }, [structures]);

  const fields = useMemo(
    () => getFieldOptions(t, hasML, hasPareto, extraPropKeys, systemInfo?.elements ?? [], structureMap, isVarcomp, hasVolume, hasDensity),
    [t, hasML, hasPareto, extraPropKeys, systemInfo, structureMap, isVarcomp, hasVolume, hasDensity],
  );

  const dimension = useChartSettingsStore((s) => s.explorerDimension);
  const setDimension = useChartSettingsStore((s) => s.setExplorerDimension);
  const xKey      = useChartSettingsStore((s) => s.explorerXKey);
  const setXKey   = useChartSettingsStore((s) => s.setExplorerXKey);
  const yKey      = useChartSettingsStore((s) => s.explorerYKey);
  const setYKey   = useChartSettingsStore((s) => s.setExplorerYKey);
  const zKey      = useChartSettingsStore((s) => s.explorerZKey);
  const setZKey   = useChartSettingsStore((s) => s.setExplorerZKey);
  const colorKey  = useChartSettingsStore((s) => s.explorerColorKey);
  const setColorKey = useChartSettingsStore((s) => s.setExplorerColorKey);
  const showXMarginal    = useChartSettingsStore((s) => s.explorerShowXMarginal);
  const setShowXMarginal = useChartSettingsStore((s) => s.setExplorerShowXMarginal);
  const showYMarginal    = useChartSettingsStore((s) => s.explorerShowYMarginal);
  const setShowYMarginal = useChartSettingsStore((s) => s.setExplorerShowYMarginal);
  const marginalBins     = useChartSettingsStore((s) => s.explorerMarginalBins);
  const setMarginalBins  = useChartSettingsStore((s) => s.setExplorerMarginalBins);
  const xExcludeZero     = useChartSettingsStore((s) => s.explorerXMarginalExcludeZero);
  const setXExcludeZero  = useChartSettingsStore((s) => s.setExplorerXMarginalExcludeZero);
  const yExcludeZero     = useChartSettingsStore((s) => s.explorerYMarginalExcludeZero);
  const setYExcludeZero  = useChartSettingsStore((s) => s.setExplorerYMarginalExcludeZero);
  // Axis titles/ranges live in the project store: they are typed for one
  // project's fields and must not appear on another project's chart.
  const axisRanges       = useProjectStore((s) => s.explorerAxisRanges);
  const setAxisRange     = useProjectStore((s) => s.setExplorerAxisRange);
  const axisLabels       = useProjectStore((s) => s.explorerAxisLabels);
  const setAxisLabel     = useProjectStore((s) => s.setExplorerAxisLabel);
  const focusMode        = useChartSettingsStore((s) => s.explorerFocusMode);
  const setFocusMode     = useChartSettingsStore((s) => s.setExplorerFocusMode);
  const dimOpacity       = useChartSettingsStore((s) => s.explorerDimOpacity);
  const setDimOpacity    = useChartSettingsStore((s) => s.setExplorerDimOpacity);
  const filterGroups     = useFilterStore((s) => s.filterConditionGroups);
  const filterTagStates  = useFilterStore((s) => s.filterTagStates);

  const numericFields = fields.filter((field) => field.type === 'numeric');
  const xField = numericFields.find((f) => f.key === xKey) ?? numericFields[0] ?? fields[0];
  const yField = numericFields.find((f) => f.key === yKey) ?? numericFields[1] ?? numericFields[0] ?? fields[0];
  const zField = fields.find((f) => f.key === zKey && f.type === 'numeric')
    ?? fields.find((f) => f.key === 'spaceGroup')
    ?? fields.find((f) => f.type === 'numeric')
    ?? fields[0];
  const colorField = fields.find((f) => f.key === colorKey);

  const xAxisTitle = axisLabels[xField.key]?.trim() || xField.label;
  const yAxisTitle = axisLabels[yField.key]?.trim() || yField.label;
  const zAxisTitle = axisLabels[zField.key]?.trim() || zField.label;
  const [axisEditor, setAxisEditor] = useState<{
    axis: 'x' | 'y' | 'z';
    fieldKey: string;
    defaultLabel: string;
  } | null>(null);
  const [axisTitleDraft, setAxisTitleDraft] = useState('');

  const startAxisTitleEdit = useCallback((axis: 'x' | 'y' | 'z') => {
    const field = axis === 'x' ? xField : axis === 'y' ? yField : zField;
    const currentTitle = axisLabels[field.key]?.trim() || field.label;
    setAxisEditor({ axis, fieldKey: field.key, defaultLabel: field.label });
    setAxisTitleDraft(currentTitle);
  }, [axisLabels, xField, yField, zField]);

  const saveAxisTitle = useCallback(() => {
    if (!axisEditor) return;
    setAxisLabel(axisEditor.fieldKey, axisTitleDraft);
    setAxisEditor(null);
  }, [axisEditor, axisTitleDraft, setAxisLabel]);

  const resetAxisTitle = useCallback(() => {
    if (!axisEditor) return;
    setAxisLabel(axisEditor.fieldKey, '');
    setAxisTitleDraft(axisEditor.defaultLabel);
    setAxisEditor(null);
  }, [axisEditor, setAxisLabel]);

  // Axis ranges are persisted per field, so a field keeps its range even when
  // moved between X/Y/Z or after navigating away from Explorer.
  const xRangeInput = axisRanges[xField.key] ?? { min: '', max: '' };
  const yRangeInput = axisRanges[yField.key] ?? { min: '', max: '' };
  const zRangeInput = axisRanges[zField.key] ?? { min: '', max: '' };
  const xMin = xRangeInput.min;
  const xMax = xRangeInput.max;
  const yMin = yRangeInput.min;
  const yMax = yRangeInput.max;
  const zMin = zRangeInput.min;
  const zMax = zRangeInput.max;
  const setXMin = useCallback((min: string) => setAxisRange(xField.key, { ...xRangeInput, min }), [setAxisRange, xField.key, xRangeInput]);
  const setXMax = useCallback((max: string) => setAxisRange(xField.key, { ...xRangeInput, max }), [setAxisRange, xField.key, xRangeInput]);
  const setYMin = useCallback((min: string) => setAxisRange(yField.key, { ...yRangeInput, min }), [setAxisRange, yField.key, yRangeInput]);
  const setYMax = useCallback((max: string) => setAxisRange(yField.key, { ...yRangeInput, max }), [setAxisRange, yField.key, yRangeInput]);
  const setZMin = useCallback((min: string) => setAxisRange(zField.key, { ...zRangeInput, min }), [setAxisRange, zField.key, zRangeInput]);
  const setZMax = useCallback((max: string) => setAxisRange(zField.key, { ...zRangeInput, max }), [setAxisRange, zField.key, zRangeInput]);

  // Color range — numbers (null = use data extent)
  const [cMin, setCMin] = useState<number | null>(null);
  const [cMax, setCMax] = useState<number | null>(null);

  useEffect(() => { setCMin(null); setCMax(null); }, [colorKey]);

  // Compute color data range from all structures (not filtered), so slider range is stable
  const colorDataRange = useMemo(() => {
    if (!colorField || colorField.type !== 'numeric') return null;
    const vals = structures
      .map((s) => colorField.accessor(s) as number)
      .filter((v) => v != null && isFinite(v) && v < 900);
    if (vals.length === 0) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [structures, colorField]);

  // --- Autoplay & GIF export ---
  const plotRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [playStep, setPlayStep] = useState(1);       // step size per frame
  const [playFps, setPlayFps] = useState(10);        // frames per second
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play: only high moves, low is fixed. high steps by playStep until dataMax, then stops.
  // If upper limit is already at max, reset it to min first so the animation is visible.
  const handlePlay = useCallback(() => {
    if (!colorDataRange) return;
    const fixedLow = cMin ?? colorDataRange.min;
    let curHigh = cMax ?? colorDataRange.max;
    // If already at max, restart from the bottom so the user sees something happen
    if (curHigh >= colorDataRange.max) {
      curHigh = colorDataRange.min;
      setCMax(curHigh);
    }
    const delay = 1000 / playFps;
    setIsPlaying(true);
    const step = () => {
      curHigh += playStep;
      if (curHigh > colorDataRange.max) {
        setCMax(colorDataRange.max);
        setIsPlaying(false);
        return;
      }
      setCMin(fixedLow);
      setCMax(curHigh);
      playTimerRef.current = setTimeout(step, delay);
    };
    playTimerRef.current = setTimeout(step, delay);
  }, [colorDataRange, cMin, cMax, playStep, playFps]);

  const handleStop = useCallback(() => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    setIsPlaying(false);
  }, []);

  // GIF export: compute each frame directly and render it on an offscreen ECharts host.
  // If upper limit is already at max, start from min so the GIF captures the full animation.
  const handleExportGif = useCallback(async () => {
    if (!colorDataRange || !plotRef.current) return;
    const fixedLow  = cMin ?? colorDataRange.min;
    const rawHigh   = cMax ?? colorDataRange.max;
    const startHigh = rawHigh >= colorDataRange.max ? colorDataRange.min : rawHigh;
    const frameDelay = Math.round(1000 / playFps);

    const frames: number[] = [];
    for (let h = startHigh; h <= colorDataRange.max + playStep * 0.5; h += playStep) {
      frames.push(Math.min(h, colorDataRange.max));
    }
    if (frames.length === 0) return;

    setIsExporting(true);
    try {
      await exportAnimatedEChartsGif({
        filename: 'explorer.gif',
        sourceElement: plotRef.current,
        frames,
        delayMs: frameDelay,
        layout: { ...layoutRef.current },
        buildFrameData: (hi) => {
          // Compute filtered data for this frame directly (no React state)
          const frameData = structures.filter((s) => {
            const xv = xField.accessor(s);
            const yv = yField.accessor(s);
            const zv = zField.accessor(s);
            if (xv == null || yv == null || s.enthalpyTotal > 900) return false;
            if (dimension === '3d' && (zv == null || !Number.isFinite(Number(zv)))) return false;
            if (colorField && colorField.type === 'numeric') {
              const cv = colorField.accessor(s) as number;
              if (cv == null || !isFinite(cv)) return false;
              if (cv < fixedLow || cv > hi) return false;
            }
            return true;
          });

          // Build trace for this frame
          let frameTraces: PlotlyData[];
          const frameCoordinates = (points: Structure[]) => ({
            x: points.map((s) => xField.accessor(s) as number),
            y: points.map((s) => yField.accessor(s) as number),
            ...(dimension === '3d' ? { z: points.map((s) => zField.accessor(s) as number) } : {}),
          });
          const frameType = dimension === '3d' ? 'scatter3d' : 'scatter';
          if (!colorField || colorField.type === 'numeric') {
            frameTraces = [{
              ...frameCoordinates(frameData),
              mode: 'markers', type: frameType,
              marker: {
                color: colorField ? frameData.map((s) => (colorField.accessor(s) as number) ?? 0) : getPlotlyTheme(theme).defaultMarkerColor,
                colorscale: 'Viridis',
                cmin: colorDataRange.min,
                cmax: colorDataRange.max,
                colorbar: colorField ? { title: colorField.label, thickness: 15 } : undefined,
                size: 6, opacity: 0.7,
              },
              hoverinfo: 'none',
            }];
          } else {
            const groups = new Map<string, typeof frameData>();
            for (const s of frameData) {
              const cat = String(colorField.accessor(s) ?? 'Unknown');
              if (!groups.has(cat)) groups.set(cat, []);
              groups.get(cat)!.push(s);
            }
            const colors = getPlotlyTheme(theme).categoricalColors;
            frameTraces = Array.from(groups.entries()).map(([cat, pts], i) => ({
              ...frameCoordinates(pts),
              mode: 'markers', type: frameType, name: cat,
              marker: { color: colors[i % colors.length], size: 6, opacity: 0.7 },
              hoverinfo: 'none',
            }));
          }

          // Add marginal traces for this frame
          if (dimension === '2d' && showXMarginal) {
            const xRangeMin = xMin !== '' ? parseFloat(xMin) : null;
            const xRangeMax = xMax !== '' ? parseFloat(xMax) : null;
            const xVals = frameData.map((s) => xField.accessor(s) as number).filter((v) => {
              if (v == null || !isFinite(v)) return false;
              if (xExcludeZero && v === 0) return false;
              if (xRangeMin !== null && v < xRangeMin) return false;
              if (xRangeMax !== null && v > xRangeMax) return false;
              return true;
            });
            frameTraces = [...frameTraces, ...buildXMarginalTraces(xVals, marginalBins, xField.label, 0, theme)];
          }
          if (dimension === '2d' && showYMarginal) {
            const yRangeMin = yMin !== '' ? parseFloat(yMin) : null;
            const yRangeMax = yMax !== '' ? parseFloat(yMax) : null;
            const yVals = frameData.map((s) => yField.accessor(s) as number).filter((v) => {
              if (v == null || !isFinite(v)) return false;
              if (yExcludeZero && v === 0) return false;
              if (yRangeMin !== null && v < yRangeMin) return false;
              if (yRangeMax !== null && v > yRangeMax) return false;
              return true;
            });
            frameTraces = [...frameTraces, ...buildYMarginalTraces(yVals, marginalBins, yField.label, 0, theme)];
          }

          return frameTraces;
        },
      });
    } finally {
      setIsExporting(false);
    }
  }, [colorDataRange, cMin, cMax, playStep, playFps, structures, dimension, xField, yField, zField, colorField, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero, xMin, xMax, yMin, yMax, theme]);

  useEffect(() => () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); }, []);

  const filteredData = useMemo(() => {
    return structures.filter((s) => {
      const xv = xField.accessor(s);
      const yv = yField.accessor(s);
      const zv = zField.accessor(s);
      if (xv == null || yv == null || !Number.isFinite(Number(xv)) || !Number.isFinite(Number(yv)) || s.enthalpyTotal > 900) return false;
      if (dimension === '3d' && (zv == null || !Number.isFinite(Number(zv)))) return false;
      // color range filter
      if (colorField && colorField.type === 'numeric' && (cMin !== null || cMax !== null)) {
        const cv = colorField.accessor(s) as number;
        if (cv == null || !isFinite(cv)) return false;
        if (cMin !== null && cv < cMin) return false;
        if (cMax !== null && cv > cMax) return false;
      }
      return true;
    });
  }, [structures, xField, yField, zField, dimension, colorField, cMin, cMax]);

  const filterActive = useMemo(
    () => filterGroups.some((group) => group.conditions.length > 0) || Object.keys(filterTagStates).length > 0,
    [filterGroups, filterTagStates],
  );
  const focusMatches = useMemo(() => {
    const ids = new Set<number>();
    if (!filterActive) return ids;
    for (const structure of filteredData) {
      if (matchesActiveFilter(structure, systemInfo?.elements ?? [], filterGroups, filterTagStates)) {
        ids.add(structure.id);
      }
    }
    return ids;
  }, [filteredData, filterActive, filterGroups, filterTagStates, systemInfo]);
  const effectiveFocusMode = filterActive ? focusMode : 'off';
  const displayedData = useMemo(
    () => effectiveFocusMode === 'hide'
      ? filteredData.filter((structure) => focusMatches.has(structure.id))
      : filteredData,
    [filteredData, effectiveFocusMode, focusMatches],
  );

  // Build traces
  const traces: PlotlyData[] = useMemo(() => {
    const traceType = dimension === '3d' ? 'scatter3d' : 'scatter';
    const coordinates = (points: Structure[]) => ({
      x: points.map((s) => xField.accessor(s) as number),
      y: points.map((s) => yField.accessor(s) as number),
      ...(dimension === '3d' ? { z: points.map((s) => zField.accessor(s) as number) } : {}),
    });
    const hoverText = (s: Structure) =>
      `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
      `${xField.label}: ${xField.accessor(s)}<br>` +
      `${yField.label}: ${yField.accessor(s)}<br>` +
      (dimension === '3d' ? `${zField.label}: ${zField.accessor(s)}<br>` : '') +
      `SG: ${s.spaceGroup} | Origin: ${s.origin}`;
    const common = (points: Structure[]) => ({
      ...coordinates(points),
      mode: 'markers' as const,
      type: traceType,
      text: points.map(hoverText),
      hoverinfo: 'text' as const,
      customdata: points.map((s) => s.id),
    });
    const buildColored = (points: Structure[], opacity = 0.7): PlotlyData[] => {
      if (points.length === 0) return [];
      if (!colorField || colorField.type === 'numeric') {
        return [{
          ...common(points),
          marker: {
            color: colorField ? points.map((s) => colorField.accessor(s) as number) : getPlotlyTheme(theme).defaultMarkerColor,
            colorscale: 'Viridis',
            cmin: colorField && colorDataRange ? colorDataRange.min : undefined,
            cmax: colorField && colorDataRange ? colorDataRange.max : undefined,
            colorbar: colorField ? { title: colorField.label, thickness: 15 } : undefined,
            size: dimension === '3d' ? 5 : 6,
            opacity,
          },
        }];
      }
      const groups = new Map<string, Structure[]>();
      for (const structure of points) {
        const category = String(colorField.accessor(structure) ?? 'Unknown');
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category)!.push(structure);
      }
      const colors = getPlotlyTheme(theme).categoricalColors;
      return Array.from(groups.entries()).map(([category, categoryPoints], index) => ({
        ...common(categoryPoints),
        name: category,
        marker: { color: colors[index % colors.length], size: dimension === '3d' ? 5 : 6, opacity },
      }));
    };

    const result: PlotlyData[] = [];
    if (effectiveFocusMode === 'dim') {
      const matches = displayedData.filter((s) => focusMatches.has(s.id));
      const background = displayedData.filter((s) => !focusMatches.has(s.id));
      if (background.length > 0) {
        result.push({
          ...common(background),
          name: t('explorer.filterDim'),
          showlegend: false,
          marker: { color: '#94a3b8', size: dimension === '3d' ? 4 : 5, opacity: dimOpacity },
        });
      }
      result.push(...buildColored(matches, 0.9));
    } else {
      result.push(...buildColored(displayedData));
    }

    if (effectiveFocusMode === 'highlight') {
      const matches = displayedData.filter((s) => focusMatches.has(s.id));
      if (matches.length > 0) {
        result.push({
          ...common(matches),
          name: t('explorer.filterHighlight'),
          marker: {
            color: '#f59e0b',
            symbol: 'diamond',
            size: dimension === '3d' ? 9 : 11,
            opacity: 0.95,
            line: { color: '#ffffff', width: 1 },
          },
        });
      }
    }
    return result;
  }, [displayedData, dimension, xField, yField, zField, colorField, colorDataRange, theme, effectiveFocusMode, focusMatches, dimOpacity, t]);

  // Mark overlay traces
  const overlayTraces: PlotlyData[] = useMemo(() => {
    const result: PlotlyData[] = [];
    const traceType = dimension === '3d' ? 'scatter3d' : 'scatter';
    const coordinates = (points: Structure[]) => ({
      x: points.map((s) => xField.accessor(s) as number),
      y: points.map((s) => yField.accessor(s) as number),
      ...(dimension === '3d' ? { z: points.map((s) => zField.accessor(s) as number) } : {}),
    });
    const hoverText = (s: Structure) =>
      `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
      `${xField.label}: ${xField.accessor(s)}<br>` +
      `${yField.label}: ${yField.accessor(s)}<br>` +
      (dimension === '3d' ? `${zField.label}: ${zField.accessor(s)}<br>` : '') +
      `SG: ${s.spaceGroup} | Origin: ${s.origin}`;

    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((tg) => tg.id === tagId);
      if (!tagDef) continue;
      const tagged = displayedData.filter((s) => s.tags.includes(tagId));
      if (tagged.length === 0) continue;
      result.push({
        ...coordinates(tagged),
        mode: 'markers', type: traceType,
        name: `★ ${t(tagDef.nameKey)}`,
        marker: { symbol: 'star', size: 14, color: tagDef.color, line: { width: 1, color: 'white' } },
        text: tagged.map(hoverText),
        hoverinfo: 'text',
        customdata: tagged.map((s) => s.id),
        showlegend: true,
      });
    }

    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = displayedData.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        result.push({
          ...coordinates(eaMarked),
          mode: 'markers', type: traceType,
          name: t('mark.eaSearchName'),
          marker: { symbol: 'star', size: 14, color: '#FFD700', line: { width: 1, color: 'white' } },
          text: eaMarked.map(hoverText),
          hoverinfo: 'text',
          customdata: eaMarked.map((s) => s.id),
          showlegend: true,
        });
      }
    }
    return result;
  }, [displayedData, dimension, xField, yField, zField, markActiveTags, markEaInput, allTags, t]);

  // Marginal distribution traces (histogram + KDE)
  const marginalTraces: PlotlyData[] = useMemo(() => {
    if (dimension === '3d') return [];
    const xRangeMin = xMin !== '' ? parseFloat(xMin) : null;
    const xRangeMax = xMax !== '' ? parseFloat(xMax) : null;
    const yRangeMin = yMin !== '' ? parseFloat(yMin) : null;
    const yRangeMax = yMax !== '' ? parseFloat(yMax) : null;

    const result: PlotlyData[] = [];
    if (showXMarginal) {
      const xVals = displayedData
        .map((s) => xField.accessor(s) as number)
        .filter((v) => {
          if (v == null || !isFinite(v)) return false;
          if (xExcludeZero && v === 0) return false;
          if (xRangeMin !== null && v < xRangeMin) return false;
          if (xRangeMax !== null && v > xRangeMax) return false;
          return true;
        });
      result.push(...buildXMarginalTraces(xVals, marginalBins, xAxisTitle, 0, theme));
    }
    if (showYMarginal) {
      const yVals = displayedData
        .map((s) => yField.accessor(s) as number)
        .filter((v) => {
          if (v == null || !isFinite(v)) return false;
          if (yExcludeZero && v === 0) return false;
          if (yRangeMin !== null && v < yRangeMin) return false;
          if (yRangeMax !== null && v > yRangeMax) return false;
          return true;
        });
      result.push(...buildYMarginalTraces(yVals, marginalBins, yAxisTitle, 0, theme));
    }
    return result;
  }, [displayedData, dimension, xField, yField, xAxisTitle, yAxisTitle, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero, xMin, xMax, yMin, yMax, theme]);

  const inputStyle: React.CSSProperties = {
    width: 72,
    padding: '3px 6px',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    fontSize: 11,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: any = useMemo(() => {
    const pt = getPlotlyTheme(theme);

    const axisStyle = {
      tickfont: { size: 11, color: pt.tickColor },
      gridcolor: pt.gridColor,
      zerolinecolor: pt.zerolineColor,
      linecolor: pt.lineColor,
    };
    const titleFont = { size: 13, color: pt.axisTitleColor };

    const xRange = (xMin !== '' || xMax !== '')
      ? [xMin !== '' ? parseFloat(xMin) : undefined, xMax !== '' ? parseFloat(xMax) : undefined]
      : undefined;
    const yRange = (yMin !== '' || yMax !== '')
      ? [yMin !== '' ? parseFloat(yMin) : undefined, yMax !== '' ? parseFloat(yMax) : undefined]
      : undefined;
    const zRange = (zMin !== '' || zMax !== '')
      ? [zMin !== '' ? parseFloat(zMin) : undefined, zMax !== '' ? parseFloat(zMax) : undefined]
      : undefined;

    if (dimension === '3d') {
      return {
        font: CHART_FONT,
        title: { text: `${xAxisTitle} vs ${yAxisTitle} vs ${zAxisTitle}`, font: { size: 15, color: pt.titleColor } },
        scene: {
          xaxis: { title: { text: xAxisTitle, font: titleFont }, ...(xRange ? { range: xRange } : {}), ...axisStyle },
          yaxis: { title: { text: yAxisTitle, font: titleFont }, ...(yRange ? { range: yRange } : {}), ...axisStyle },
          zaxis: { title: { text: zAxisTitle, font: titleFont }, ...(zRange ? { range: zRange } : {}), ...axisStyle },
        },
        hovermode: 'closest' as const,
        showlegend: true,
        legend: {
          bgcolor: theme === 'dark' ? 'rgba(24, 24, 37, 0.86)' : 'rgba(255,255,255,0.4)',
          bordercolor: theme === 'dark' ? '#313244' : '#e2e8f0',
          font: { size: 11, color: pt.legendColor },
        },
        margin: { t: 50, r: 20, l: 20, b: 20 },
        paper_bgcolor: pt.paperBg,
      };
    }

    const hasMarginal = showXMarginal || showYMarginal;

    // Main plot domain shrinks to make room for marginal panels
    const mainXDomain: [number, number] = showYMarginal ? [0, 0.80] : [0, 1];
    const mainYDomain: [number, number] = showXMarginal ? [0, 0.80] : [0, 1];

    const base: any = {
      font: CHART_FONT,
      title: hasMarginal ? undefined : { text: `${xAxisTitle} vs ${yAxisTitle}`, font: { size: 15, color: pt.titleColor } },
      xaxis: {
        title: { text: xAxisTitle, font: titleFont },
        ...(xRange ? { range: xRange } : {}),
        domain: mainXDomain,
        ...axisStyle,
      },
      yaxis: {
        title: { text: yAxisTitle, font: titleFont },
        ...(yRange ? { range: yRange } : {}),
        domain: mainYDomain,
        ...axisStyle,
      },
      hovermode: 'closest' as const,
      showlegend: true,
      legend: {
        bgcolor: theme === 'dark' ? 'rgba(24, 24, 37, 0.86)' : 'rgba(255,255,255,0.4)',
        bordercolor: theme === 'dark' ? '#313244' : '#e2e8f0',
        font: { size: 11, color: pt.legendColor },
      },
      margin: { t: showXMarginal ? 10 : 50, r: showYMarginal ? 10 : 20, l: 60, b: 60 },
      plot_bgcolor: pt.plotBg,
      paper_bgcolor: pt.paperBg,
    };

    if (showXMarginal) {
      base.xaxis2 = {
        domain: mainXDomain,
        matches: 'x',
        showticklabels: false,
        ...axisStyle,
      };
      base.yaxis2 = {
        domain: [0.83, 1],
        title: { text: 'density', font: { size: 10, color: pt.tickColor } },
        ...axisStyle,
      };
    }

    if (showYMarginal) {
      base.xaxis3 = {
        domain: [0.83, 1],
        title: { text: 'density', font: { size: 10, color: pt.tickColor } },
        ...axisStyle,
      };
      base.yaxis3 = {
        domain: mainYDomain,
        matches: 'y',
        showticklabels: false,
        ...axisStyle,
      };
    }

    return base;
  }, [dimension, xAxisTitle, yAxisTitle, zAxisTitle, xMin, xMax, yMin, yMax, zMin, zMax, showXMarginal, showYMarginal, theme]);

  layoutRef.current = layout;
  const scatterTraces = [...traces, ...overlayTraces, ...marginalTraces];
  const structurePointClick = useStructurePointClick({
    traces: scatterTraces,
    onStructureClick: openViewer,
  });

  const handleRelayout = useCallback((event: Record<string, unknown>) => {
    const persistRange = (axis: 'xaxis' | 'yaxis', fieldKey: string) => {
      if (event[`${axis}.autorange`] === true) {
        setAxisRange(fieldKey, { min: '', max: '' });
        return;
      }
      const pair = event[`${axis}.range`];
      const start = Array.isArray(pair) ? pair[0] : event[`${axis}.range[0]`];
      const end = Array.isArray(pair) ? pair[1] : event[`${axis}.range[1]`];
      if (typeof start === 'number' && Number.isFinite(start) && typeof end === 'number' && Number.isFinite(end)) {
        setAxisRange(fieldKey, { min: String(start), max: String(end) });
      }
    };
    persistRange('xaxis', xField.key);
    persistRange('yaxis', yField.key);
  }, [setAxisRange, xField.key, yField.key]);

  function handleExportData() {
    const headers = ['EA_ID', 'Formula', xAxisTitle, yAxisTitle];
    if (dimension === '3d') headers.push(zAxisTitle);
    if (colorField) headers.push(colorField.label);
    headers.push('SpaceGroup', 'Generation', 'Origin');
    const rows = displayedData.map((s) => {
      const row: Record<string, string | number | null | undefined> = {
        'EA_ID': s.id,
        'Formula': s.formula,
        [xAxisTitle]: xField.accessor(s) as number,
        [yAxisTitle]: yField.accessor(s) as number,
      };
      if (dimension === '3d') row[zAxisTitle] = zField.accessor(s) as number;
      if (colorField) row[colorField.label] = colorField.accessor(s) as number | string;
      row['SpaceGroup'] = s.spaceGroup;
      row['Generation'] = s.generation;
      row['Origin'] = s.origin;
      return row;
    });
    const elements = systemInfo?.elements.join('-') ?? 'data';
    const xLabel = xAxisTitle.replace(/[^a-zA-Z0-9]/g, '_');
    const yLabel = yAxisTitle.replace(/[^a-zA-Z0-9]/g, '_');
    downloadCsv(`${elements}_explorer_${xLabel}_vs_${yLabel}`, headers, rows);
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('explorer.title')}</h1>
        <ExportDataButton onClick={handleExportData} />
      </div>

      <ExplorerControls
        t={t}
        fields={fields}
        dimension={dimension}
        xKey={xKey}
        yKey={yKey}
        zKey={zField.key}
        colorKey={colorKey}
        xField={xField}
        yField={yField}
        colorField={colorField}
        showXMarginal={showXMarginal}
        showYMarginal={showYMarginal}
        xExcludeZero={xExcludeZero}
        yExcludeZero={yExcludeZero}
        marginalBins={marginalBins}
        filteredData={displayedData}
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        filteredCount={displayedData.length}
        filterTotalCount={filteredData.length}
        focusMode={focusMode}
        filterActive={filterActive}
        filterMatchedCount={focusMatches.size}
        dimOpacity={dimOpacity}
        colorDataRange={colorDataRange}
        cMin={cMin}
        cMax={cMax}
        isPlaying={isPlaying}
        isExporting={isExporting}
        playStep={playStep}
        playFps={playFps}
        setDimension={setDimension}
        setXKey={setXKey}
        setYKey={setYKey}
        setZKey={setZKey}
        setColorKey={setColorKey}
        setShowXMarginal={setShowXMarginal}
        setShowYMarginal={setShowYMarginal}
        setXExcludeZero={setXExcludeZero}
        setYExcludeZero={setYExcludeZero}
        setMarginalBins={setMarginalBins}
        setCMin={setCMin}
        setCMax={setCMax}
        handlePlay={handlePlay}
        handleStop={handleStop}
        handleExportGif={handleExportGif}
        setPlayStep={setPlayStep}
        setPlayFps={setPlayFps}
        setFocusMode={setFocusMode}
        setDimOpacity={setDimOpacity}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t('explorer.axisNames')}</span>
        <button type="button" className="btn btn-secondary" title={t('explorer.axisRenameHint')} onClick={() => startAxisTitleEdit('x')}>✎ X: {xAxisTitle}</button>
        <button type="button" className="btn btn-secondary" title={t('explorer.axisRenameHint')} onClick={() => startAxisTitleEdit('y')}>✎ Y: {yAxisTitle}</button>
        {dimension === '3d' && (
          <button type="button" className="btn btn-secondary" title={t('explorer.axisRenameHint')} onClick={() => startAxisTitleEdit('z')}>✎ Z: {zAxisTitle}</button>
        )}
      </div>

      <div className="card" ref={plotRef} style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {ready ? (
          <PlotFrame
            data={structurePointClick.plotTraces}
            layout={layout}
            style={{ width: '100%', height: (showXMarginal || showYMarginal) ? 620 : 550 }}
            boundaryStyle={{ width: '100%', height: (showXMarginal || showYMarginal) ? 620 : 550 }}
            boundaryHandlers={structurePointClick.boundaryHandlers}
            hoverTooltip={structurePointClick.hoverTooltip}
            onRelayout={handleRelayout}
            editableAxisTitles={{ x: xAxisTitle, y: yAxisTitle, ...(dimension === '3d' ? { z: zAxisTitle } : {}) }}
            axisTitleEditHint={t('explorer.axisRenameHint')}
            onAxisTitleDoubleClick={startAxisTitleEdit}
            {...structurePointClick.plotHandlers}
          />
        ) : (
          <ChartSkeleton
            height={(showXMarginal || showYMarginal) ? 620 : 550}
            label={t('loading')}
          />
        )}
        {axisEditor && (
          <div
            role="dialog"
            aria-label={t('explorer.axisRenameTitle', { axis: axisEditor.axis.toUpperCase() })}
            style={axisEditorStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 600 }}>
              {t('explorer.axisRenameTitle', { axis: axisEditor.axis.toUpperCase() })}
              <input
                autoFocus
                value={axisTitleDraft}
                placeholder={axisEditor.defaultLabel}
                onChange={(event) => setAxisTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveAxisTitle();
                  if (event.key === 'Escape') setAxisEditor(null);
                }}
                style={{ ...inputStyle, width: 240, fontSize: 13, padding: '7px 9px' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={resetAxisTitle}>{t('explorer.axisResetDefault')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setAxisEditor(null)}>{t('btn.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={saveAxisTitle}>{t('explorer.axisSave')}</button>
            </div>
          </div>
        )}
      </div>

      {/* X/Y axis range inputs */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangeInputs label={`X: ${xAxisTitle}`} min={xMin} max={xMax} onMin={setXMin} onMax={setXMax} inputStyle={inputStyle} />
        <RangeInputs label={`Y: ${yAxisTitle}`} min={yMin} max={yMax} onMin={setYMin} onMax={setYMax} inputStyle={inputStyle} />
        {dimension === '3d' && (
          <RangeInputs label={`Z: ${zAxisTitle}`} min={zMin} max={zMax} onMin={setZMin} onMax={setZMax} inputStyle={inputStyle} />
        )}
      </div>

      <MarkPanel />
    </div>
  );
}

const axisEditorStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 10,
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'grid',
  gap: 10,
  padding: 12,
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
};
