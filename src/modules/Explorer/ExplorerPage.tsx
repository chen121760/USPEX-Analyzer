import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT } from '@/lib/constants';
import GIF from 'gif.js';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadCsv } from '@/lib/exportCsv';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
import type { Structure } from '@/types/structure';

interface FieldOption {
  key: string;
  label: string;
  accessor: (s: Structure) => number | string | undefined;
  type: 'numeric' | 'categorical';
}

function getFieldOptions(t: (k: string) => string, hasML: boolean, hasPareto: boolean, extraPropKeys: string[], elements: string[], structureMap: Map<number, Structure>): FieldOption[] {
  const opts: FieldOption[] = [
    { key: 'enthalpy', label: t('col.enthalpy'), accessor: (s) => s.enthalpy, type: 'numeric' },
    { key: 'fitness', label: t('col.fitness'), accessor: (s) => s.fitness >= 0 ? s.fitness : undefined, type: 'numeric' },
    { key: 'volume', label: t('col.volume'), accessor: (s) => s.volume, type: 'numeric' },
    { key: 'density', label: t('col.density'), accessor: (s) => s.density > 0 ? s.density : undefined, type: 'numeric' },
    { key: 'spaceGroup', label: t('col.spaceGroup'), accessor: (s) => s.spaceGroup, type: 'numeric' },
    { key: 'generation', label: t('col.generation'), accessor: (s) => s.generation, type: 'numeric' },
    { key: 'qEntropy', label: t('col.qEntropy'), accessor: (s) => s.qEntropy, type: 'numeric' },
    { key: 'aOrder', label: t('col.aOrder'), accessor: (s) => s.aOrder, type: 'numeric' },
    { key: 'sOrder', label: t('col.sOrder'), accessor: (s) => s.sOrder, type: 'numeric' },
    { key: 'origin', label: t('col.origin'), accessor: (s) => s.origin, type: 'categorical' },
    { key: 'formula', label: t('col.formula'), accessor: (s) => s.formula, type: 'categorical' },
  ];

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
    opts.push(
      { key: 'youngModulus', label: t('col.young'), accessor: (s) => s.youngModulus, type: 'numeric' },
      { key: 'bulkModulus', label: t('col.bulk'), accessor: (s) => s.bulkModulus, type: 'numeric' },
      { key: 'shearModulus', label: t('col.shear'), accessor: (s) => s.shearModulus, type: 'numeric' },
      { key: 'poissonRatio', label: t('col.poisson'), accessor: (s) => s.poissonRatio, type: 'numeric' },
      { key: 'vickersHardness', label: t('col.hardness'), accessor: (s) => s.vickersHardness, type: 'numeric' },
    );
  }

  if (hasPareto) {
    opts.push(
      { key: 'paretoFront', label: t('col.paretoFront'), accessor: (s) => s.paretoFront, type: 'numeric' },
    );
  }

  for (const key of extraPropKeys) {
    opts.push({ key: `extra_${key}`, label: key, accessor: (s) => s.extraProps?.[key], type: 'numeric' });
  }

  opts.push({
    key: 'deltaE',
    label: t('col.deltaE'),
    accessor: (s) => {
      if (s.parentIds.length === 0) return undefined;
      const delta = s.enthalpy - s.parentEnthalpy;
      return isFinite(delta) ? delta : undefined;
    },
    type: 'numeric',
  });

  for (const key of extraPropKeys) {
    opts.push({
      key: `deltaObj_${key}`,
      label: `${t('col.deltaObj')} (${key})`,
      accessor: (s) => {
        if (s.parentIds.length === 0) return undefined;
        const childVal = s.extraProps?.[key];
        if (childVal == null) return undefined;
        const parentVals = s.parentIds
          .map((pid) => structureMap.get(pid)?.extraProps?.[key])
          .filter((v): v is number => v != null);
        if (parentVals.length === 0) return undefined;
        const avg = parentVals.reduce((a, b) => a + b, 0) / parentVals.length;
        return childVal - avg;
      },
      type: 'numeric',
    });
  }

  return opts;
}

const AXIS_STYLE = {
  tickfont: { size: 11, color: '#64748b' },
  gridcolor: '#e2e8f0',
  zerolinecolor: '#cbd5e1',
  linecolor: '#94a3b8',
};

const TITLE_FONT = { size: 13, color: '#334155' };

export function ExplorerPage() {
  const { t } = useTranslation();
  const openViewer      = useUIStore((s) => s.openViewer);
  const markActiveTags  = useUIStore((s) => s.markActiveTags);
  const markEaInput     = useUIStore((s) => s.markEaInput);
  const allTags         = useProjectStore((s) => s.tags);
  const structures      = useProjectStore((s) => s.structures);
  const systemInfo      = useProjectStore((s) => s.systemInfo);

  const hasML = structures.some((s) => s.youngModulus != null && s.youngModulus! > 0);
  const hasPareto = systemInfo?.optimizationType === 'multi';

  const extraPropKeys = useMemo(() => {
    const keys = new Set<string>();
    structures.forEach((s) => { if (s.extraProps) Object.keys(s.extraProps).forEach((k) => keys.add(k)); });
    return Array.from(keys).sort();
  }, [structures]);

  const structureMap = useMemo(() => {
    const m = new Map<number, Structure>();
    structures.forEach((s) => m.set(s.id, s));
    return m;
  }, [structures]);

  const fields = useMemo(
    () => getFieldOptions(t, hasML, hasPareto, extraPropKeys, systemInfo?.elements ?? [], structureMap),
    [t, hasML, hasPareto, extraPropKeys, systemInfo, structureMap],
  );

  const xKey      = useUIStore((s) => s.explorerXKey);
  const setXKey   = useUIStore((s) => s.setExplorerXKey);
  const yKey      = useUIStore((s) => s.explorerYKey);
  const setYKey   = useUIStore((s) => s.setExplorerYKey);
  const colorKey  = useUIStore((s) => s.explorerColorKey);
  const setColorKey = useUIStore((s) => s.setExplorerColorKey);
  const showXMarginal    = useUIStore((s) => s.explorerShowXMarginal);
  const setShowXMarginal = useUIStore((s) => s.setExplorerShowXMarginal);
  const showYMarginal    = useUIStore((s) => s.explorerShowYMarginal);
  const setShowYMarginal = useUIStore((s) => s.setExplorerShowYMarginal);
  const marginalBins     = useUIStore((s) => s.explorerMarginalBins);
  const setMarginalBins  = useUIStore((s) => s.setExplorerMarginalBins);
  const xExcludeZero     = useUIStore((s) => s.explorerXMarginalExcludeZero);
  const setXExcludeZero  = useUIStore((s) => s.setExplorerXMarginalExcludeZero);
  const yExcludeZero     = useUIStore((s) => s.explorerYMarginalExcludeZero);
  const setYExcludeZero  = useUIStore((s) => s.setExplorerYMarginalExcludeZero);

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

  // GIF export: bypass React state — compute each frame directly and force-render via Plotly.react()
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
    const PlotlyModule = await import('plotly.js-dist-min');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Plotly = (PlotlyModule as any).default ?? PlotlyModule;
    const graphDiv = plotRef.current.querySelector('.js-plotly-plot') as HTMLElement;
    if (!graphDiv) { setIsExporting(false); return; }

    const baseLayout = { ...layoutRef.current };

    const gif = new GIF({
      workers: 2,
      quality: 10,
      workerScript: `${import.meta.env.BASE_URL}gif.worker.js`,
    });

    for (const hi of frames) {
      // Compute filtered data for this frame directly (no React state)
      const frameData = structures.filter((s) => {
        const xv = xField.accessor(s);
        const yv = yField.accessor(s);
        if (xv == null || yv == null || s.enthalpy >= 900) return false;
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
            color: colorField ? frameData.map((s) => (colorField.accessor(s) as number) ?? 0) : '#6366f1',
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
        const COLORS = ['#6366f1', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6', '#eab308', '#06b6d4', '#6b7280', '#dc2626', '#16a34a'];
        frameTraces = Array.from(groups.entries()).map(([cat, pts], i) => ({
          x: pts.map((s) => xField.accessor(s) as number),
          y: pts.map((s) => yField.accessor(s) as number),
          mode: 'markers', type: 'scatter', name: cat,
          marker: { color: COLORS[i % COLORS.length], size: 6, opacity: 0.7 },
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
        frameTraces = [...frameTraces, ...buildXMarginalTraces(xVals, marginalBins, xField.label)];
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
        frameTraces = [...frameTraces, ...buildYMarginalTraces(yVals, marginalBins, yField.label)];
      }

      await Plotly.react(graphDiv, frameTraces, baseLayout);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const dataUrl: string = await Plotly.toImage(graphDiv, {
        format: 'png',
        width: graphDiv.offsetWidth,
        height: graphDiv.offsetHeight,
      });
      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = dataUrl; });
      gif.addFrame(img, { delay: frameDelay });
    }

    gif.on('finished', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'explorer.gif';
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    });
    gif.render();
  }, [colorDataRange, cMin, cMax, playStep, playFps, structures, xField, yField, colorField, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero, xMin, xMax, yMin, yMax]);

  useEffect(() => () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); }, []);

  const filteredData = useMemo(() => {
    return structures.filter((s) => {
      const xv = xField.accessor(s);
      const yv = yField.accessor(s);
      if (xv == null || yv == null || s.enthalpy >= 900) return false;
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
          color: colorField ? filteredData.map((s) => (colorField.accessor(s) as number) ?? 0) : '#6366f1',
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

    const COLORS = ['#6366f1', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6', '#eab308', '#06b6d4', '#6b7280', '#dc2626', '#16a34a'];

    return Array.from(groups.entries()).map(([cat, pts], i) => ({
      x: pts.map((s) => xField.accessor(s) as number),
      y: pts.map((s) => yField.accessor(s) as number),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: cat,
      marker: { color: COLORS[i % COLORS.length], size: 6, opacity: 0.7 },
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
  }, [filteredData, xField, yField, colorField, colorDataRange]);

  // Mark overlay traces
  const overlayTraces: PlotlyData[] = useMemo(() => {
    const result: PlotlyData[] = [];

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
        hoverinfo: 'skip',
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
          hoverinfo: 'skip',
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
      result.push(...buildXMarginalTraces(xVals, marginalBins, xField.label));
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
      result.push(...buildYMarginalTraces(yVals, marginalBins, yField.label));
    }
    return result;
  }, [filteredData, xField, yField, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero, xMin, xMax, yMin, yMax]);

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
      title: hasMarginal ? undefined : { text: `${xField.label} vs ${yField.label}`, font: { size: 15, color: '#0f172a' } },
      xaxis: {
        title: { text: xField.label, font: TITLE_FONT },
        ...(xRange ? { range: xRange } : {}),
        domain: mainXDomain,
        ...AXIS_STYLE,
      },
      yaxis: {
        title: { text: yField.label, font: TITLE_FONT },
        ...(yRange ? { range: yRange } : {}),
        domain: mainYDomain,
        ...AXIS_STYLE,
      },
      hovermode: 'closest' as const,
      showlegend: true,
      legend: { font: { size: 11, color: '#334155' } },
      dragmode: 'lasso' as const,
      margin: { t: showXMarginal ? 10 : 50, r: showYMarginal ? 10 : 20, l: 60, b: 60 },
      plot_bgcolor: '#ffffff',
      paper_bgcolor: '#ffffff',
    };

    if (showXMarginal) {
      base.xaxis2 = {
        domain: mainXDomain,
        matches: 'x',
        showticklabels: false,
        ...AXIS_STYLE,
      };
      base.yaxis2 = {
        domain: [0.83, 1],
        title: { text: 'density', font: { size: 10, color: '#94a3b8' } },
        ...AXIS_STYLE,
      };
    }

    if (showYMarginal) {
      base.xaxis3 = {
        domain: [0.83, 1],
        title: { text: 'density', font: { size: 10, color: '#94a3b8' } },
        ...AXIS_STYLE,
      };
      base.yaxis3 = {
        domain: mainYDomain,
        matches: 'y',
        showticklabels: false,
        ...AXIS_STYLE,
      };
    }

    return base;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xField, yField, xMin, xMax, yMin, yMax, showXMarginal, showYMarginal]);

  layoutRef.current = layout;

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

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('explorer.title')}</h2>
        <ExportDataButton onClick={handleExportData} />
      </div>

      {/* Axis selectors */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.xAxis')}:
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} style={selectStyle}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button
            onClick={() => setShowXMarginal(!showXMarginal)}
            title="Toggle X distribution"
            style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--color-border)',
              background: showXMarginal ? 'var(--color-primary)' : 'transparent',
              color: showXMarginal ? '#fff' : 'var(--color-text-muted)',
            }}
          >∫ dist</button>
          {showXMarginal && (
            <button
              onClick={() => setXExcludeZero(!xExcludeZero)}
              title="Exclude zero values from X distribution"
              style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: xExcludeZero ? '#f59e0b' : 'transparent',
                color: xExcludeZero ? '#fff' : 'var(--color-text-muted)',
              }}
            >≠0</button>
          )}
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.yAxis')}:
          <select value={yKey} onChange={(e) => setYKey(e.target.value)} style={selectStyle}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button
            onClick={() => setShowYMarginal(!showYMarginal)}
            title="Toggle Y distribution"
            style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--color-border)',
              background: showYMarginal ? 'var(--color-primary)' : 'transparent',
              color: showYMarginal ? '#fff' : 'var(--color-text-muted)',
            }}
          >∫ dist</button>
          {showYMarginal && (
            <button
              onClick={() => setYExcludeZero(!yExcludeZero)}
              title="Exclude zero values from Y distribution"
              style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: yExcludeZero ? '#f59e0b' : 'transparent',
                color: yExcludeZero ? '#fff' : 'var(--color-text-muted)',
              }}
            >≠0</button>
          )}
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.colorBy')}:
          <select value={colorKey} onChange={(e) => setColorKey(e.target.value)} style={selectStyle}>
            <option value="">{t('explorer.none')}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        {(showXMarginal || showYMarginal) && (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
            bins
            <input
              type="number" min={5} max={200} step={1} value={marginalBins}
              onChange={(e) => setMarginalBins(Math.max(5, Math.min(200, Number(e.target.value))))}
              style={{ width: 48, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            {showXMarginal && (() => {
              const xRangeMin = xMin !== '' ? parseFloat(xMin) : null;
              const xRangeMax = xMax !== '' ? parseFloat(xMax) : null;
              const n = filteredData.map((s) => xField.accessor(s) as number).filter((v) => {
                if (v == null || !isFinite(v)) return false;
                if (xExcludeZero && v === 0) return false;
                if (xRangeMin !== null && v < xRangeMin) return false;
                if (xRangeMax !== null && v > xRangeMax) return false;
                return true;
              }).length;
              return <span style={{ color: 'var(--color-text-muted)' }}>X: n={n}</span>;
            })()}
            {showYMarginal && (() => {
              const yRangeMin = yMin !== '' ? parseFloat(yMin) : null;
              const yRangeMax = yMax !== '' ? parseFloat(yMax) : null;
              const n = filteredData.map((s) => yField.accessor(s) as number).filter((v) => {
                if (v == null || !isFinite(v)) return false;
                if (yExcludeZero && v === 0) return false;
                if (yRangeMin !== null && v < yRangeMin) return false;
                if (yRangeMax !== null && v > yRangeMax) return false;
                return true;
              }).length;
              return <span style={{ color: 'var(--color-text-muted)' }}>Y: n={n}</span>;
            })()}
          </label>
        )}

        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {filteredData.length} pts
        </span>
      </div>

      {/* Color range dual slider */}
      {colorField && colorField.type === 'numeric' && colorDataRange && (
        <div style={{ marginBottom: 12 }}>
          <DualRangeSlider
            label={`Color: ${colorField.label}`}
            dataMin={colorDataRange.min}
            dataMax={colorDataRange.max}
            low={cMin ?? colorDataRange.min}
            high={cMax ?? colorDataRange.max}
            onChange={(lo, hi) => { setCMin(lo); setCMax(hi); }}
            isPlaying={isPlaying}
            isExporting={isExporting}
            onPlay={handlePlay}
            onStop={handleStop}
            onExportGif={handleExportGif}
            playStep={playStep}
            playFps={playFps}
            onPlayStepChange={setPlayStep}
            onPlayFpsChange={setPlayFps}
          />
        </div>
      )}

      <div className="card" ref={plotRef} style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={[...traces, ...overlayTraces, ...marginalTraces]}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: (showXMarginal || showYMarginal) ? 620 : 550 }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) {
              openViewer(Number(point.customdata));
            }
          }}
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

// ── KDE helpers ──────────────────────────────────────────────────────────────

function silvermanBandwidth(values: number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return 0.9 * std * Math.pow(n, -0.2);
}

function evalKDE(values: number[], bw: number, pts: number[]): number[] {
  const inv = 1 / (values.length * bw * Math.sqrt(2 * Math.PI));
  return pts.map((x) =>
    inv * values.reduce((acc, v) => acc + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0),
  );
}

function linspace(lo: number, hi: number, n: number): number[] {
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + i * step);
}

/** Build X-marginal traces (histogram + KDE) for subplot xaxis2/yaxis2 */
function buildXMarginalTraces(xVals: number[], bins: number, label: string): PlotlyData[] {
  if (xVals.length < 2) return [];
  const bw = silvermanBandwidth(xVals);
  const lo = Math.min(...xVals);
  const hi = Math.max(...xVals);
  const pts = linspace(lo, hi, 200);
  const density = evalKDE(xVals, bw, pts);

  return [
    {
      x: xVals,
      type: 'histogram',
      nbinsx: bins,
      histnorm: 'probability density',
      marker: { color: 'rgba(99,102,241,0.45)', line: { color: 'rgba(99,102,241,0.8)', width: 1 } },
      name: `${label} dist`,
      showlegend: false,
      xaxis: 'x',
      yaxis: 'y2',
      hoverinfo: 'skip',
    },
    {
      x: pts,
      y: density,
      type: 'scatter',
      mode: 'lines',
      line: { color: '#6366f1', width: 2 },
      name: `${label} KDE`,
      showlegend: false,
      xaxis: 'x',
      yaxis: 'y2',
      hoverinfo: 'skip',
    },
  ];
}

/** Build Y-marginal traces (horizontal histogram + KDE) for subplot xaxis3/yaxis3 */
function buildYMarginalTraces(yVals: number[], bins: number, label: string): PlotlyData[] {
  if (yVals.length < 2) return [];
  const bw = silvermanBandwidth(yVals);
  const lo = Math.min(...yVals);
  const hi = Math.max(...yVals);
  const pts = linspace(lo, hi, 200);
  const density = evalKDE(yVals, bw, pts);

  return [
    {
      y: yVals,
      type: 'histogram',
      nbinsy: bins,
      histnorm: 'probability density',
      orientation: 'h',
      marker: { color: 'rgba(236,72,153,0.45)', line: { color: 'rgba(236,72,153,0.8)', width: 1 } },
      name: `${label} dist`,
      showlegend: false,
      xaxis: 'x3',
      yaxis: 'y',
      hoverinfo: 'skip',
    },
    {
      x: density,
      y: pts,
      type: 'scatter',
      mode: 'lines',
      line: { color: '#ec4899', width: 2 },
      name: `${label} KDE`,
      showlegend: false,
      xaxis: 'x3',
      yaxis: 'y',
      hoverinfo: 'skip',
    },
  ];
}


function RangeInputs({ label, min, max, onMin, onMax, inputStyle }: {
  label: string;
  min: string; max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  inputStyle: React.CSSProperties;
}) {
  return (
    <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
      {label}:
      <input type="number" placeholder="min" value={min} onChange={(e) => onMin(e.target.value)} style={inputStyle} />
      –
      <input type="number" placeholder="max" value={max} onChange={(e) => onMax(e.target.value)} style={inputStyle} />
    </span>
  );
}

function DualRangeSlider({ label, dataMin, dataMax, low, high, onChange, isPlaying, isExporting, onPlay, onStop, onExportGif, playStep, playFps, onPlayStepChange, onPlayFpsChange }: {
  label: string;
  dataMin: number;
  dataMax: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  isPlaying?: boolean;
  isExporting?: boolean;
  onPlay?: () => void;
  onStop?: () => void;
  onExportGif?: () => void;
  playStep?: number;
  playFps?: number;
  onPlayStepChange?: (v: number) => void;
  onPlayFpsChange?: (v: number) => void;
}) {
  const step = (dataMax - dataMin) / 200 || 1;
  const fmt = (v: number) => v.toPrecision(4);
  const numInputStyle: React.CSSProperties = {
    width: 48, padding: '1px 4px', border: '1px solid var(--color-border)',
    borderRadius: 4, fontSize: 10, background: 'var(--color-bg)', color: 'var(--color-text)',
  };

  return (
    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, textAlign: 'right' }}>▼</span>
          <input type="range" min={dataMin} max={dataMax} step={step} value={low}
            onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
            style={{ width: 200 }}
          />
          <span style={{ minWidth: 60, color: 'var(--color-text)' }}>{fmt(low)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, textAlign: 'right' }}>▲</span>
          <input type="range" min={dataMin} max={dataMax} step={step} value={high}
            onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
            style={{ width: 200 }}
          />
          <span style={{ minWidth: 60, color: 'var(--color-text)' }}>{fmt(high)}</span>
        </div>
      </div>
      <button
        onClick={() => onChange(dataMin, dataMax)}
        style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}
      >
        reset
      </button>
      {onPlayStepChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          step
          <input type="number" min={0.001} step={0.1} value={playStep}
            onChange={(e) => onPlayStepChange(Number(e.target.value))}
            style={numInputStyle}
          />
        </label>
      )}
      {onPlayFpsChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          fps
          <input type="number" min={1} max={60} step={1} value={playFps}
            onChange={(e) => onPlayFpsChange(Number(e.target.value))}
            style={numInputStyle}
          />
        </label>
      )}
      {onPlay && onStop && (
        <button
          onClick={isPlaying ? onStop : onPlay}
          disabled={isExporting}
          style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}
        >
          {isPlaying ? '⏹ stop' : '▶ play'}
        </button>
      )}
      {onExportGif && (
        <button
          onClick={onExportGif}
          disabled={isPlaying || isExporting}
          style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: isPlaying || isExporting ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)' }}
        >
          {isExporting ? '⏳ exporting…' : '🎞 export GIF'}
        </button>
      )}
    </div>
  );
}
