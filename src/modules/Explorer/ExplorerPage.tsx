import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { useChartSettingsStore } from '@/store/useChartSettingsStore';
import { useThemeStore } from '@/theme/themeStore';
import { useMarkStore } from '@/store/useMarkStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT, ML_FIELD_KEYS, ML_FIELD_I18N } from '@/lib/constants';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { exportAnimatedPlotlyGif } from '@/export/chartImageExport';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadCsv } from '@/lib/exportCsv';
import { PlotFrame } from '@/charts/shared/PlotFrame';
import { usePlotlyStructurePointClick } from '@/charts/shared/usePlotlyStructurePointClick';
import { RangeInputs } from '@/charts/shared/RangeControls';
import { buildXMarginalTraces, buildYMarginalTraces } from '@/charts/shared/marginalTraces';
import { collectDynamicFieldKeys } from '@/domain/structure/dynamicFields';
import { ExplorerControls } from './components/ExplorerControls';
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
    { key: 'qEntropy', label: t('col.qEntropy'), accessor: (s) => s.qEntropy, type: 'numeric' },
    { key: 'aOrder', label: t('col.aOrder'), accessor: (s) => s.aOrder, type: 'numeric' },
    { key: 'sOrder', label: t('col.sOrder'), accessor: (s) => s.sOrder, type: 'numeric' },
    { key: 'origin', label: t('col.origin'), accessor: (s) => s.origin, type: 'categorical' },
    { key: 'formula', label: t('col.formula'), accessor: (s) => s.formula, type: 'categorical' },
  ];

  if (hasVolume) {
    opts.push({ key: 'volume', label: t('col.volume'), accessor: (s) => s.volume, type: 'numeric' });
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
        accessor: (s) => s[key],
        type: 'numeric',
      });
    }
  }

  if (hasPareto) {
    opts.push(
      { key: 'paretoFront', label: t('col.paretoFront'), accessor: (s) => s.paretoFront, type: 'numeric' },
    );
  }

  if (isVarcomp) {
    opts.push(
      { key: 'eForm', label: t('col.eForm'), accessor: (s) => s.eForm !== -1 ? s.eForm : undefined, type: 'numeric' },
      { key: 'eHullRecons', label: t('col.eHullRecons'), accessor: (s) => s.eHullRecons >= 0 ? s.eHullRecons : undefined, type: 'numeric' },
    );
  }

  for (const key of extraPropKeys) {
    opts.push({ key: `extra_${key}`, label: key, accessor: (s) => s.extraProps?.[key], type: 'numeric' });
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
  const structures      = useProjectStore((s) => s.structures);
  const systemInfo      = useProjectStore((s) => s.systemInfo);

  const hasML = structures.some((s) => s.youngModulus >= 0);
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

  const xKey      = useChartSettingsStore((s) => s.explorerXKey);
  const setXKey   = useChartSettingsStore((s) => s.setExplorerXKey);
  const yKey      = useChartSettingsStore((s) => s.explorerYKey);
  const setYKey   = useChartSettingsStore((s) => s.setExplorerYKey);
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

  const xField = fields.find((f) => f.key === xKey) ?? fields[0];
  const yField = fields.find((f) => f.key === yKey) ?? fields[1];
  const colorField = fields.find((f) => f.key === colorKey);

  // X/Y axis range — string inputs
  const [xMin, setXMin] = useState('');
  const [xMax, setXMax] = useState('');
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');

  // Color range — numbers (null = use data extent)
  const [cMin, setCMin] = useState<number | null>(null);
  const [cMax, setCMax] = useState<number | null>(null);

  useEffect(() => { setXMin(''); setXMax(''); }, [xKey]);
  useEffect(() => { setYMin(''); setYMax(''); }, [yKey]);
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

  // GIF export: compute each frame directly and render it on an offscreen Plotly host.
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
      await exportAnimatedPlotlyGif({
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
            if (xv == null || yv == null || s.enthalpyTotal > 900) return false;
            if (colorField && colorField.type === 'numeric') {
              const cv = colorField.accessor(s) as number;
              if (cv == null || !isFinite(cv)) return false;
              if (cv < fixedLow || cv > hi) return false;
            }
            return true;
          });

          // Build trace for this frame
          let frameTraces: PlotlyData[];
          if (!colorField || colorField.type === 'numeric') {
            frameTraces = [{
              x: frameData.map((s) => xField.accessor(s) as number),
              y: frameData.map((s) => yField.accessor(s) as number),
              mode: 'markers', type: 'scatter',
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
              x: pts.map((s) => xField.accessor(s) as number),
              y: pts.map((s) => yField.accessor(s) as number),
              mode: 'markers', type: 'scatter', name: cat,
              marker: { color: colors[i % colors.length], size: 6, opacity: 0.7 },
              hoverinfo: 'none',
            }));
          }

          // Add marginal traces for this frame
          if (showXMarginal) {
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
          if (showYMarginal) {
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
  }, [colorDataRange, cMin, cMax, playStep, playFps, structures, xField, yField, colorField, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero, xMin, xMax, yMin, yMax, theme]);

  useEffect(() => () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); }, []);

  const filteredData = useMemo(() => {
    return structures.filter((s) => {
      const xv = xField.accessor(s);
      const yv = yField.accessor(s);
      if (xv == null || yv == null || s.enthalpyTotal > 900) return false;
      // color range filter
      if (colorField && colorField.type === 'numeric' && (cMin !== null || cMax !== null)) {
        const cv = colorField.accessor(s) as number;
        if (cv == null || !isFinite(cv)) return false;
        if (cMin !== null && cv < cMin) return false;
        if (cMax !== null && cv > cMax) return false;
      }
      return true;
    });
  }, [structures, xField, yField, colorField, cMin, cMax]);

  // Build traces
  const traces: PlotlyData[] = useMemo(() => {
    if (!colorField || colorField.type === 'numeric') {
      return [{
        x: filteredData.map((s) => xField.accessor(s) as number),
        y: filteredData.map((s) => yField.accessor(s) as number),
        mode: 'markers' as const,
        type: 'scatter' as const,
        marker: {
          color: colorField ? filteredData.map((s) => (colorField.accessor(s) as number) ?? 0) : getPlotlyTheme(theme).defaultMarkerColor,
          colorscale: 'Viridis',
          cmin: colorField && colorDataRange ? colorDataRange.min : undefined,
          cmax: colorField && colorDataRange ? colorDataRange.max : undefined,
          colorbar: colorField ? { title: colorField.label, thickness: 15 } : undefined,
          size: 6,
          opacity: 0.7,
        },
        text: filteredData.map(
          (s) =>
            `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
            `${xField.label}: ${xField.accessor(s)}<br>` +
            `${yField.label}: ${yField.accessor(s)}<br>` +
            `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
        ),
        hoverinfo: 'text' as const,
        customdata: filteredData.map((s) => s.id),
      }];
    }

    const groups = new Map<string, Structure[]>();
    for (const s of filteredData) {
      const cat = String(colorField.accessor(s) ?? 'Unknown');
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }

    const colors = getPlotlyTheme(theme).categoricalColors;

    return Array.from(groups.entries()).map(([cat, pts], i) => ({
      x: pts.map((s) => xField.accessor(s) as number),
      y: pts.map((s) => yField.accessor(s) as number),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: cat,
      marker: { color: colors[i % colors.length], size: 6, opacity: 0.7 },
      text: pts.map(
        (s) =>
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `${xField.label}: ${xField.accessor(s)}<br>` +
          `${yField.label}: ${yField.accessor(s)}<br>` +
          `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
      customdata: pts.map((s) => s.id),
    }));
  }, [filteredData, xField, yField, colorField, colorDataRange, theme]);

  // Mark overlay traces
  const overlayTraces: PlotlyData[] = useMemo(() => {
    const result: PlotlyData[] = [];
    const hoverText = (s: Structure) =>
      `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
      `${xField.label}: ${xField.accessor(s)}<br>` +
      `${yField.label}: ${yField.accessor(s)}<br>` +
      `SG: ${s.spaceGroup} | Origin: ${s.origin}`;

    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((tg) => tg.id === tagId);
      if (!tagDef) continue;
      const tagged = filteredData.filter((s) => s.tags.includes(tagId));
      if (tagged.length === 0) continue;
      result.push({
        x: tagged.map((s) => xField.accessor(s) as number),
        y: tagged.map((s) => yField.accessor(s) as number),
        mode: 'markers', type: 'scatter',
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
      const eaMarked = filteredData.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        result.push({
          x: eaMarked.map((s) => xField.accessor(s) as number),
          y: eaMarked.map((s) => yField.accessor(s) as number),
          mode: 'markers', type: 'scatter',
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
  }, [filteredData, xField, yField, markActiveTags, markEaInput, allTags, t]);

  // Marginal distribution traces (histogram + KDE)
  const marginalTraces: PlotlyData[] = useMemo(() => {
    const xRangeMin = xMin !== '' ? parseFloat(xMin) : null;
    const xRangeMax = xMax !== '' ? parseFloat(xMax) : null;
    const yRangeMin = yMin !== '' ? parseFloat(yMin) : null;
    const yRangeMax = yMax !== '' ? parseFloat(yMax) : null;

    const result: PlotlyData[] = [];
    if (showXMarginal) {
      const xVals = filteredData
        .map((s) => xField.accessor(s) as number)
        .filter((v) => {
          if (v == null || !isFinite(v)) return false;
          if (xExcludeZero && v === 0) return false;
          if (xRangeMin !== null && v < xRangeMin) return false;
          if (xRangeMax !== null && v > xRangeMax) return false;
          return true;
        });
      result.push(...buildXMarginalTraces(xVals, marginalBins, xField.label, 0, theme));
    }
    if (showYMarginal) {
      const yVals = filteredData
        .map((s) => yField.accessor(s) as number)
        .filter((v) => {
          if (v == null || !isFinite(v)) return false;
          if (yExcludeZero && v === 0) return false;
          if (yRangeMin !== null && v < yRangeMin) return false;
          if (yRangeMax !== null && v > yRangeMax) return false;
          return true;
        });
      result.push(...buildYMarginalTraces(yVals, marginalBins, yField.label, 0, theme));
    }
    return result;
  }, [filteredData, xField, yField, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero, xMin, xMax, yMin, yMax, theme]);

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

    const hasMarginal = showXMarginal || showYMarginal;

    // Main plot domain shrinks to make room for marginal panels
    const mainXDomain: [number, number] = showYMarginal ? [0, 0.80] : [0, 1];
    const mainYDomain: [number, number] = showXMarginal ? [0, 0.80] : [0, 1];

    const base: any = {
      font: PLOTLY_FONT,
      title: hasMarginal ? undefined : { text: `${xField.label} vs ${yField.label}`, font: { size: 15, color: pt.titleColor } },
      xaxis: {
        title: { text: xField.label, font: titleFont },
        ...(xRange ? { range: xRange } : {}),
        domain: mainXDomain,
        ...axisStyle,
      },
      yaxis: {
        title: { text: yField.label, font: titleFont },
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
  }, [xField, yField, xMin, xMax, yMin, yMax, showXMarginal, showYMarginal, theme]);

  layoutRef.current = layout;
  const scatterTraces = [...traces, ...overlayTraces, ...marginalTraces];
  const structurePointClick = usePlotlyStructurePointClick({
    traces: scatterTraces,
    onStructureClick: openViewer,
  });

  function handleExportData() {
    const headers = ['EA_ID', 'Formula', xField.label, yField.label];
    if (colorField) headers.push(colorField.label);
    headers.push('SpaceGroup', 'Generation', 'Origin');
    const rows = filteredData.map((s) => {
      const row: Record<string, string | number | null | undefined> = {
        'EA_ID': s.id,
        'Formula': s.formula,
        [xField.label]: xField.accessor(s) as number,
        [yField.label]: yField.accessor(s) as number,
      };
      if (colorField) row[colorField.label] = colorField.accessor(s) as number | string;
      row['SpaceGroup'] = s.spaceGroup;
      row['Generation'] = s.generation;
      row['Origin'] = s.origin;
      return row;
    });
    const elements = systemInfo?.elements.join('-') ?? 'data';
    const xLabel = xField.label.replace(/[^a-zA-Z0-9]/g, '_');
    const yLabel = yField.label.replace(/[^a-zA-Z0-9]/g, '_');
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
        xKey={xKey}
        yKey={yKey}
        colorKey={colorKey}
        xField={xField}
        yField={yField}
        colorField={colorField}
        showXMarginal={showXMarginal}
        showYMarginal={showYMarginal}
        xExcludeZero={xExcludeZero}
        yExcludeZero={yExcludeZero}
        marginalBins={marginalBins}
        filteredData={filteredData}
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        filteredCount={filteredData.length}
        colorDataRange={colorDataRange}
        cMin={cMin}
        cMax={cMax}
        isPlaying={isPlaying}
        isExporting={isExporting}
        playStep={playStep}
        playFps={playFps}
        setXKey={setXKey}
        setYKey={setYKey}
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
      />

      <div className="card" ref={plotRef} style={{ padding: 0, overflow: 'hidden' }}>
        <PlotFrame
          data={structurePointClick.plotTraces}
          layout={layout}
          style={{ width: '100%', height: (showXMarginal || showYMarginal) ? 620 : 550 }}
          boundaryStyle={{ width: '100%', height: (showXMarginal || showYMarginal) ? 620 : 550 }}
          boundaryHandlers={structurePointClick.boundaryHandlers}
          hoverTooltip={structurePointClick.hoverTooltip}
          {...structurePointClick.plotHandlers}
        />
      </div>

      {/* X/Y axis range inputs */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangeInputs label={`X: ${xField.label}`} min={xMin} max={xMax} onMin={setXMin} onMax={setXMax} inputStyle={inputStyle} />
        <RangeInputs label={`Y: ${yField.label}`} min={yMin} max={yMax} onMin={setYMin} onMax={setYMax} inputStyle={inputStyle} />
      </div>

      <MarkPanel />
    </div>
  );
}
