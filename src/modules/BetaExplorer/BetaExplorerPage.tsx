import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT, getPlotlyTheme } from '@/lib/constants';
import GIF from 'gif.js';
import { layerClassification, computeHypervolume2D, autoReferencePoint } from '@/lib/paretoUtils';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadWideCsv, downloadCsv } from '@/lib/exportCsv';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
import type { Structure } from '@/types/structure';

interface FieldOption {
  key: string;
  label: string;
  accessor: (s: Structure) => number | string | undefined;
  type: 'numeric' | 'categorical';
}

function getFieldOptions(
  t: (k: string) => string,
  hasML: boolean,
  hasPareto: boolean,
  extraPropKeys: string[],
  elements: string[],
  structureMap: Map<number, Structure>,
  isVarcomp: boolean,
): FieldOption[] {
  const opts: FieldOption[] = [
    { key: 'enthalpy', label: t('col.enthalpy'), accessor: (s) => s.enthalpy, type: 'numeric' },
    { key: 'enthalpyTotal', label: t('col.enthalpyTotal'), accessor: (s) => s.enthalpyTotal, type: 'numeric' },
    { key: 'fitness', label: t('col.fitness'), accessor: (s) => (s.fitness >= 0 ? s.fitness : undefined), type: 'numeric' },
    { key: 'volume', label: t('col.volume'), accessor: (s) => s.volume, type: 'numeric' },
    { key: 'density', label: t('col.density'), accessor: (s) => (s.density > 0 ? s.density : undefined), type: 'numeric' },
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
    opts.push({ key: 'paretoFront', label: t('col.paretoFront'), accessor: (s) => s.paretoFront, type: 'numeric' });
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

const FRONT_COLORS = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280'];

export function BetaExplorerPage() {
  const { t } = useTranslation();
  const openViewer     = useUIStore((s) => s.openViewer);
  const markActiveTags = useUIStore((s) => s.markActiveTags);
  const markEaInput    = useUIStore((s) => s.markEaInput);
  const allTags        = useProjectStore((s) => s.tags);
  const structures     = useProjectStore((s) => s.structures);
  const systemInfo     = useProjectStore((s) => s.systemInfo);
  const theme          = useUIStore((s) => s.theme);

  const hasML     = structures.some((s) => s.youngModulus >= 0);
  const hasPareto = systemInfo?.optimizationType === 'multi';
  const isVarcomp = systemInfo?.compositionMode === 'varcomp';

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
    () => getFieldOptions(t, hasML, hasPareto, extraPropKeys, systemInfo?.elements ?? [], structureMap, isVarcomp),
    [t, hasML, hasPareto, extraPropKeys, systemInfo, structureMap, isVarcomp],
  );

  // --- Beta Explorer UIStore state ---
  const xKey           = useUIStore((s) => s.betaXKey);
  const setXKey        = useUIStore((s) => s.setBetaXKey);
  const yKey           = useUIStore((s) => s.betaYKey);
  const setYKey        = useUIStore((s) => s.setBetaYKey);
  const colorKey       = useUIStore((s) => s.betaColorKey);
  const setColorKey    = useUIStore((s) => s.setBetaColorKey);
  const xMinimize      = useUIStore((s) => s.betaXMinimize);
  const setXMinimize   = useUIStore((s) => s.setBetaXMinimize);
  const yMinimize      = useUIStore((s) => s.betaYMinimize);
  const setYMinimize   = useUIStore((s) => s.setBetaYMinimize);
  const colorByFront   = useUIStore((s) => s.betaColorByFront);
  const setColorByFront = useUIStore((s) => s.setBetaColorByFront);
  const numFronts      = useUIStore((s) => s.betaNumFronts);
  const setNumFronts   = useUIStore((s) => s.setBetaNumFronts);
  const refMode        = useUIStore((s) => s.betaRefMode);
  const setRefMode     = useUIStore((s) => s.setBetaRefMode);
  const refXStore      = useUIStore((s) => s.betaRefX);
  const setRefXStore   = useUIStore((s) => s.setBetaRefX);
  const refYStore      = useUIStore((s) => s.betaRefY);
  const setRefYStore   = useUIStore((s) => s.setBetaRefY);
  const showXMarginal    = useUIStore((s) => s.betaShowXMarginal);
  const setShowXMarginal = useUIStore((s) => s.setBetaShowXMarginal);
  const showYMarginal    = useUIStore((s) => s.betaShowYMarginal);
  const setShowYMarginal = useUIStore((s) => s.setBetaShowYMarginal);
  const marginalBins     = useUIStore((s) => s.betaMarginalBins);
  const setMarginalBins  = useUIStore((s) => s.setBetaMarginalBins);
  const xExcludeZero     = useUIStore((s) => s.betaXMarginalExcludeZero);
  const setXExcludeZero  = useUIStore((s) => s.setBetaXMarginalExcludeZero);
  const yExcludeZero     = useUIStore((s) => s.betaYMarginalExcludeZero);
  const setYExcludeZero  = useUIStore((s) => s.setBetaYMarginalExcludeZero);

  const xField     = fields.find((f) => f.key === xKey) ?? fields[0];
  const yField     = fields.find((f) => f.key === yKey) ?? fields[1];
  const colorField = fields.find((f) => f.key === colorKey);

  const [xMin, setXMin] = useState('');
  const [xMax, setXMax] = useState('');
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');
  const [cMin, setCMin] = useState<number | null>(null);
  const [cMax, setCMax] = useState<number | null>(null);

  useEffect(() => { setXMin(''); setXMax(''); }, [xKey]);
  useEffect(() => { setYMin(''); setYMax(''); }, [yKey]);
  useEffect(() => { setCMin(null); setCMax(null); }, [colorKey]);

  const colorDataRange = useMemo(() => {
    if (!colorField || colorField.type !== 'numeric') return null;
    const vals = structures
      .map((s) => colorField.accessor(s) as number)
      .filter((v) => v != null && isFinite(v) && v < 900);
    if (vals.length === 0) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [structures, colorField]);

  // --- Autoplay & GIF ---
  const plotRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<any>(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [playStep, setPlayStep] = useState(1);
  const [playFps, setPlayFps]   = useState(10);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlay = useCallback(() => {
    if (!colorDataRange) return;
    const fixedLow = cMin ?? colorDataRange.min;
    let curHigh = cMax ?? colorDataRange.max;
    const delay = 1000 / playFps;
    setIsPlaying(true);
    const step = () => {
      curHigh += playStep;
      if (curHigh > colorDataRange.max) { setCMax(colorDataRange.max); setIsPlaying(false); return; }
      setCMin(fixedLow); setCMax(curHigh);
      playTimerRef.current = setTimeout(step, delay);
    };
    playTimerRef.current = setTimeout(step, delay);
  }, [colorDataRange, cMin, cMax, playStep, playFps]);

  const handleStop = useCallback(() => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    setIsPlaying(false);
  }, []);

  const handleExportGif = useCallback(async () => {
    if (!colorDataRange || !plotRef.current) return;
    const fixedLow  = cMin ?? colorDataRange.min;
    const startHigh = cMax ?? colorDataRange.max;
    const frameDelay = Math.round(1000 / playFps);
    const frames: number[] = [];
    for (let h = startHigh; h <= colorDataRange.max + playStep * 0.5; h += playStep)
      frames.push(Math.min(h, colorDataRange.max));
    if (frames.length === 0) return;
    setIsExporting(true);
    const PlotlyModule = await import('plotly.js-dist-min');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Plotly = (PlotlyModule as any).default ?? PlotlyModule;
    const graphDiv = plotRef.current.querySelector('.js-plotly-plot') as HTMLElement;
    if (!graphDiv) { setIsExporting(false); return; }
    const baseLayout = { ...layoutRef.current };
    const gif = new GIF({ workers: 2, quality: 10, workerScript: `${import.meta.env.BASE_URL}gif.worker.js` });
    for (const hi of frames) {
      const frameData = structures.filter((s) => {
        const xv = xField.accessor(s); const yv = yField.accessor(s);
        if (xv == null || yv == null || s.enthalpyTotal > 900) return false;
        if (colorField && colorField.type === 'numeric') {
          const cv = colorField.accessor(s) as number;
          if (cv == null || !isFinite(cv) || cv < fixedLow || cv > hi) return false;
        }
        return true;
      });
      const COLORS = ['#6366f1','#ec4899','#f97316','#14b8a6','#8b5cf6','#eab308','#06b6d4','#6b7280','#dc2626','#16a34a'];
      let frameTraces: PlotlyData[];
      if (!colorField || colorField.type === 'numeric') {
        frameTraces = [{ x: frameData.map((s) => xField.accessor(s)), y: frameData.map((s) => yField.accessor(s)), mode: 'markers', type: 'scatter',
          marker: { color: colorField ? frameData.map((s) => colorField.accessor(s)) : '#6366f1', colorscale: 'Viridis', cmin: colorDataRange.min, cmax: colorDataRange.max, size: 6, opacity: 0.7 }, hoverinfo: 'none' }];
      } else {
        const groups = new Map<string, typeof frameData>();
        for (const s of frameData) { const cat = String(colorField.accessor(s) ?? 'Unknown'); if (!groups.has(cat)) groups.set(cat, []); groups.get(cat)!.push(s); }
        frameTraces = Array.from(groups.entries()).map(([cat, pts], i) => ({ x: pts.map((s) => xField.accessor(s)), y: pts.map((s) => yField.accessor(s)), mode: 'markers', type: 'scatter', name: cat, marker: { color: COLORS[i % COLORS.length], size: 6, opacity: 0.7 }, hoverinfo: 'none' }));
      }
      if (showXMarginal) {
        const xVals = frameData.map((s) => xField.accessor(s) as number).filter((v) => v != null && isFinite(v) && !(xExcludeZero && v === 0));
        frameTraces = [...frameTraces, ...buildXMarginalTraces(xVals, marginalBins, xField.label)];
      }
      if (showYMarginal) {
        const yVals = frameData.map((s) => yField.accessor(s) as number).filter((v) => v != null && isFinite(v) && !(yExcludeZero && v === 0));
        frameTraces = [...frameTraces, ...buildYMarginalTraces(yVals, marginalBins, yField.label)];
      }
      await Plotly.react(graphDiv, frameTraces, baseLayout);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const dataUrl: string = await Plotly.toImage(graphDiv, { format: 'png', width: graphDiv.offsetWidth, height: graphDiv.offsetHeight });
      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = dataUrl; });
      gif.addFrame(img, { delay: frameDelay });
    }
    gif.on('finished', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'beta-explorer.gif'; a.click();
      URL.revokeObjectURL(url); setIsExporting(false);
    });
    gif.render();
  }, [colorDataRange, cMin, cMax, playStep, playFps, structures, xField, yField, colorField, showXMarginal, showYMarginal, marginalBins, xExcludeZero, yExcludeZero]);

  useEffect(() => () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); }, []);

  // --- Valid data for scatter ---
  const filteredData = useMemo(() => {
    return structures.filter((s) => {
      const xv = xField.accessor(s); const yv = yField.accessor(s);
      if (xv == null || yv == null || s.enthalpyTotal > 900) return false;
      if (colorField && colorField.type === 'numeric' && (cMin !== null || cMax !== null)) {
        const cv = colorField.accessor(s) as number;
        if (cv == null || !isFinite(cv)) return false;
        if (cMin !== null && cv < cMin) return false;
        if (cMax !== null && cv > cMax) return false;
      }
      return true;
    });
  }, [structures, xField, yField, colorField, cMin, cMax]);

  // --- Auto reference point from all valid data ---
  const allValidPoints = useMemo(() => {
    return structures
      .map((s) => ({ x: xField.accessor(s) as number, y: yField.accessor(s) as number }))
      .filter((p) => p.x != null && isFinite(p.x) && p.y != null && isFinite(p.y) && p.x < 900 && p.y < 900);
  }, [structures, xField, yField]);

  const autoRef = useMemo(
    () => autoReferencePoint(allValidPoints, xMinimize, yMinimize),
    [allValidPoints, xMinimize, yMinimize],
  );

  const refX = refMode === 'manual' && refXStore != null ? refXStore : autoRef.refX;
  const refY = refMode === 'manual' && refYStore != null ? refYStore : autoRef.refY;

  // --- Computed Pareto fronts for scatter coloring ---
  const frontMap = useMemo(() => {
    const pts = filteredData
      .map((s) => ({ id: s.id, x: xField.accessor(s) as number, y: yField.accessor(s) as number }))
      .filter((p) => p.x != null && isFinite(p.x) && p.y != null && isFinite(p.y));
    return layerClassification(pts, xMinimize, yMinimize);
  }, [filteredData, xField, yField, xMinimize, yMinimize]);

  // --- Scatter traces ---
  const EXPLORER_COLORS = ['#6366f1','#ec4899','#f97316','#14b8a6','#8b5cf6','#eab308','#06b6d4','#6b7280','#dc2626','#16a34a'];

  const traces: PlotlyData[] = useMemo(() => {
    if (colorByFront) {
      const result: PlotlyData[] = [];

      // Collect points grouped by front, sorted by x (normalized)
      const frontGroups = new Map<number, Structure[]>();
      for (const s of filteredData) {
        const f = frontMap.get(s.id) ?? 999;
        if (f > numFronts) continue;
        if (!frontGroups.has(f)) frontGroups.set(f, []);
        frontGroups.get(f)!.push(s);
      }

      const sortedFronts = Array.from(frontGroups.keys()).sort((a, b) => a - b);

      for (const front of sortedFronts) {
        const pts = frontGroups.get(front)!;
        const color = FRONT_COLORS[(front - 1) % FRONT_COLORS.length];

        // Sort by normalized x for line/fill
        const sorted = [...pts].sort((a, b) => {
          const xa = xMinimize ? xField.accessor(a) as number : -(xField.accessor(a) as number);
          const xb = xMinimize ? xField.accessor(b) as number : -(xField.accessor(b) as number);
          return xa - xb;
        });

        const xs = sorted.map((s) => xField.accessor(s) as number);
        const ys = sorted.map((s) => yField.accessor(s) as number);

        // Staircase hypervolume fill
        const rawPts = pts.map((s) => ({
          x: xField.accessor(s) as number,
          y: yField.accessor(s) as number,
        }));
        const { xs: fillXOrig, ys: fillYOrig } = buildHypervolumeStaircaseFill(
          rawPts, refX, refY, xMinimize, yMinimize,
        );
        result.push({
          x: fillXOrig, y: fillYOrig,
          mode: 'lines' as const, type: 'scatter' as const, fill: 'toself' as const,
          fillcolor: color + '30',
          line: { color: 'transparent', width: 0 },
          hoverinfo: 'skip', showlegend: false,
        });

        // Line trace (connect sorted points)
        result.push({
          x: xs, y: ys,
          mode: 'lines+markers' as const, type: 'scatter' as const,
          name: `${t('beta.front')} ${front}`,
          line: { color, width: 2 },
          marker: { color, size: 6, opacity: 0.8 },
          text: pts.map((s) =>
            `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
            `${xField.label}: ${xField.accessor(s)}<br>` +
            `${yField.label}: ${yField.accessor(s)}<br>` +
            `Front: ${frontMap.get(s.id) ?? '?'} | SG: ${s.spaceGroup}`,
          ),
          hoverinfo: 'text' as const,
          customdata: pts.map((s) => s.id),
        });
      }

      // Reference point crosshair lines
      result.push({
        x: [refX, refX],
        y: [Math.min(...allValidPoints.map((p) => p.y)), refY],
        mode: 'lines' as const, type: 'scatter' as const,
        name: t('beta.refPoint'),
        line: { color: '#374151', width: 1, dash: 'dot' as const },
        marker: { symbol: 'diamond', size: 8, color: '#374151' },
        hoverinfo: 'skip', showlegend: true,
      });
      result.push({
        x: [Math.min(...allValidPoints.map((p) => p.x)), refX],
        y: [refY, refY],
        mode: 'lines' as const, type: 'scatter' as const,
        name: t('beta.refPoint'),
        line: { color: '#374151', width: 1, dash: 'dot' as const },
        marker: { symbol: 'diamond', size: 8, color: '#374151' },
        hoverinfo: 'skip', showlegend: false,
      });

      // Scatter-only points (no line) for all shown fronts
      for (const front of sortedFronts) {
        const pts = frontGroups.get(front)!;
        const color = FRONT_COLORS[(front - 1) % FRONT_COLORS.length];
        result.push({
          x: pts.map((s) => xField.accessor(s) as number),
          y: pts.map((s) => yField.accessor(s) as number),
          mode: 'markers' as const, type: 'scatter' as const,
          name: `_${t('beta.front')} ${front}`,
          marker: { color, size: 7, opacity: 0.85 },
          text: pts.map((s) =>
            `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
            `${xField.label}: ${xField.accessor(s)}<br>` +
            `${yField.label}: ${yField.accessor(s)}<br>` +
            `Front: ${frontMap.get(s.id) ?? '?'} | SG: ${s.spaceGroup}`,
          ),
          hoverinfo: 'text' as const,
          customdata: pts.map((s) => s.id),
          showlegend: false,
        });
      }

      return result;
    }

    // Free Explorer coloring
    if (!colorField || colorField.type === 'numeric') {
      return [{
        x: filteredData.map((s) => xField.accessor(s) as number),
        y: filteredData.map((s) => yField.accessor(s) as number),
        mode: 'markers' as const, type: 'scatter' as const,
        marker: {
          color: colorField ? filteredData.map((s) => (colorField.accessor(s) as number) ?? 0) : '#6366f1',
          colorscale: 'Viridis',
          cmin: colorField && colorDataRange ? colorDataRange.min : undefined,
          cmax: colorField && colorDataRange ? colorDataRange.max : undefined,
          colorbar: colorField ? { title: colorField.label, thickness: 15 } : undefined,
          size: 6, opacity: 0.7,
        },
        text: filteredData.map((s) =>
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
    return Array.from(groups.entries()).map(([cat, pts], i) => ({
      x: pts.map((s) => xField.accessor(s) as number),
      y: pts.map((s) => yField.accessor(s) as number),
      mode: 'markers' as const, type: 'scatter' as const, name: cat,
      marker: { color: EXPLORER_COLORS[i % EXPLORER_COLORS.length], size: 6, opacity: 0.7 },
      text: pts.map((s) =>
        `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
        `${xField.label}: ${xField.accessor(s)}<br>` +
        `${yField.label}: ${yField.accessor(s)}<br>` +
        `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
      customdata: pts.map((s) => s.id),
    }));
  }, [filteredData, xField, yField, colorField, colorDataRange, colorByFront, frontMap, numFronts, refX, refY, xMinimize, yMinimize, allValidPoints, t]);

  // --- Mark overlay traces ---
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
        mode: 'markers', type: 'scatter', name: `★ ${t(tagDef.nameKey)}`,
        marker: { symbol: 'star', size: 14, color: tagDef.color, line: { width: 1, color: 'white' } },
        hoverinfo: 'skip', customdata: tagged.map((s) => s.id), showlegend: true,
      });
    }
    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = filteredData.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        result.push({
          x: eaMarked.map((s) => xField.accessor(s) as number),
          y: eaMarked.map((s) => yField.accessor(s) as number),
          mode: 'markers', type: 'scatter', name: t('mark.eaSearchName'),
          marker: { symbol: 'star', size: 14, color: '#FFD700', line: { width: 1, color: 'white' } },
          hoverinfo: 'skip', customdata: eaMarked.map((s) => s.id), showlegend: true,
        });
      }
    }
    return result;
  }, [filteredData, xField, yField, markActiveTags, markEaInput, allTags, t]);

  // --- Marginal distribution traces ---
  const marginalTraces: PlotlyData[] = useMemo(() => {
    const xRangeMin = xMin !== '' ? parseFloat(xMin) : null;
    const xRangeMax = xMax !== '' ? parseFloat(xMax) : null;
    const yRangeMin = yMin !== '' ? parseFloat(yMin) : null;
    const yRangeMax = yMax !== '' ? parseFloat(yMax) : null;
    const result: PlotlyData[] = [];
    if (showXMarginal) {
      const xVals = filteredData.map((s) => xField.accessor(s) as number).filter((v) => {
        if (v == null || !isFinite(v)) return false;
        if (xExcludeZero && v === 0) return false;
        if (xRangeMin !== null && v < xRangeMin) return false;
        if (xRangeMax !== null && v > xRangeMax) return false;
        return true;
      });
      result.push(...buildXMarginalTraces(xVals, marginalBins, xField.label));
    }
    if (showYMarginal) {
      const yVals = filteredData.map((s) => yField.accessor(s) as number).filter((v) => {
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

  // --- Hypervolume vs Generation ---
  const maxGen = useMemo(() => Math.max(0, ...structures.map((s) => s.generation)), [structures]);

  const hvTraces: PlotlyData[] = useMemo(() => {
    if (maxGen === 0 || allValidPoints.length === 0) return [];
    const hvByFront: Map<number, { gen: number; hv: number; count: number }[]> = new Map();

    for (let g = 1; g <= maxGen; g++) {
      const archivePts = structures
        .filter((s) => s.generation <= g)
        .map((s) => ({ id: s.id, x: xField.accessor(s) as number, y: yField.accessor(s) as number }))
        .filter((p) => p.x != null && isFinite(p.x) && p.y != null && isFinite(p.y) && p.x < 900 && p.y < 900);

      if (archivePts.length === 0) continue;

      const fm = layerClassification(archivePts, xMinimize, yMinimize);

      for (let k = 1; k <= numFronts; k++) {
        // Each line = HV of exactly Front k points only
        const frontPts = archivePts.filter((p) => fm.get(p.id) === k);
        if (frontPts.length === 0) continue;
        const hv = computeHypervolume2D(frontPts, refX, refY, xMinimize, yMinimize);
        if (!hvByFront.has(k)) hvByFront.set(k, []);
        hvByFront.get(k)!.push({ gen: g, hv, count: frontPts.length });
      }
    }

    return Array.from(hvByFront.entries())
      .sort(([a], [b]) => a - b)
      .map(([front, data]) => ({
        x: data.map((d) => d.gen),
        y: data.map((d) => d.hv),
        mode: 'lines+markers' as const,
        type: 'scatter' as const,
        name: `Front ${front}`,
        line: { color: FRONT_COLORS[(front - 1) % FRONT_COLORS.length], width: 2 },
        marker: { color: FRONT_COLORS[(front - 1) % FRONT_COLORS.length], size: 5 },
        text: data.map((d) =>
          `Gen ${d.gen}<br>Archive Front ${front}<br>HV: ${d.hv.toPrecision(4)}<br>n=${d.count}`,
        ),
        hoverinfo: 'text' as const,
      }));
  }, [structures, xField, yField, xMinimize, yMinimize, numFronts, refX, refY, maxGen, allValidPoints.length]);

  const inputStyle: React.CSSProperties = {
    width: 72, padding: '3px 6px', border: '1px solid var(--color-border)',
    borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)',
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
    const mainXDomain: [number, number] = showYMarginal ? [0, 0.80] : [0, 1];
    const mainYDomain: [number, number] = showXMarginal ? [0, 0.80] : [0, 1];
    const pt = getPlotlyTheme(theme);
    const axisStyle = {
      tickfont: { size: 11, color: pt.tickColor },
      gridcolor: pt.gridColor,
      zerolinecolor: pt.zerolineColor,
      linecolor: pt.lineColor,
    };
    const titleFont = { size: 13, color: pt.axisTitleColor };

    const base: any = {
      font: PLOTLY_FONT,
      title: hasMarginal ? undefined : { text: `${xField.label} vs ${yField.label}`, font: { size: 15, color: pt.titleColor } },
      xaxis: { title: { text: xField.label, font: titleFont }, ...(xRange ? { range: xRange } : {}), domain: mainXDomain, ...axisStyle },
      yaxis: { title: { text: yField.label, font: titleFont }, ...(yRange ? { range: yRange } : {}), domain: mainYDomain, ...axisStyle },
      hovermode: 'closest' as const, showlegend: true,
      legend: { bgcolor: 'rgba(255,255,255,0.4)', font: { size: 11, color: pt.legendColor } },
      dragmode: 'lasso' as const,
      margin: { t: showXMarginal ? 10 : 50, r: showYMarginal ? 10 : 20, l: 60, b: 60 },
      plot_bgcolor: pt.plotBg, paper_bgcolor: pt.paperBg,
    };
    if (showXMarginal) {
      base.xaxis2 = { domain: mainXDomain, matches: 'x', showticklabels: false, ...axisStyle };
      base.yaxis2 = { domain: [0.83, 1], title: { text: 'density', font: { size: 10, color: pt.tickColor } }, ...axisStyle };
    }
    if (showYMarginal) {
      base.xaxis3 = { domain: [0.83, 1], title: { text: 'density', font: { size: 10, color: pt.tickColor } }, ...axisStyle };
      base.yaxis3 = { domain: mainYDomain, matches: 'y', showticklabels: false, ...axisStyle };
    }
    return base;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xField, yField, xMin, xMax, yMin, yMax, showXMarginal, showYMarginal, theme]);

  layoutRef.current = layout;

  function handleExportScatter() {
    const metaKeys = ['EA_ID', 'Formula', 'SpaceGroup', 'Generation', 'Origin'];
    const frontGroups = new Map<number, { s: Structure; front: number }[]>();
    for (const s of filteredData) {
      const front = frontMap.get(s.id) ?? 999;
      if (front > numFronts) continue;
      if (!frontGroups.has(front)) frontGroups.set(front, []);
      frontGroups.get(front)!.push({ s, front });
    }
    const series = Array.from(frontGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([front, items]) => {
        const sorted = items.sort((a, b) => {
          const xa = xField.accessor(a.s) as number;
          const xb = xField.accessor(b.s) as number;
          return (xMinimize ? 1 : -1) * (xa - xb);
        });
        const points = sorted.map(({ s }) => ({
          [xField.label]: xField.accessor(s) as number,
          [yField.label]: yField.accessor(s) as number,
          'EA_ID': s.id,
          'Formula': s.formula,
          'SpaceGroup': s.spaceGroup,
          'Generation': s.generation,
          'Origin': s.origin,
        }));
        return {
          label: `Front${front}`,
          points,
          xKey: xField.label,
          yKey: yField.label,
          metaKeys,
        };
      });
    const elements = systemInfo?.elements.join('-') ?? 'data';
    const xLabel = xField.label.replace(/[^a-zA-Z0-9]/g, '_');
    const yLabel = yField.label.replace(/[^a-zA-Z0-9]/g, '_');
    downloadWideCsv(`${elements}_hv_scatter_${xLabel}_vs_${yLabel}_front1-${numFronts}`, series);
  }

  function handleExportHV() {
    if (hvTraces.length === 0) return;
    const series = hvTraces.map((trace: PlotlyData) => ({
      label: String(trace.name).replace(' ', ''),
      points: (trace.x as number[]).map((gen: number, i: number) => ({
        'Generation': gen,
        'Hypervolume': (trace.y as number[])[i],
      })),
      xKey: 'Generation',
      yKey: 'Hypervolume',
      metaKeys: [] as string[],
    }));
    const elements = systemInfo?.elements.join('-') ?? 'data';
    downloadWideCsv(`${elements}_hv_convergence`, series);
  }

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6,
    fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text)',
  };

  const btnStyle = (active: boolean, activeColor = 'var(--color-primary)'): React.CSSProperties => ({
    fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
    border: '1px solid var(--color-border)',
    background: active ? activeColor : 'transparent',
    color: active ? '#fff' : 'var(--color-text-muted)',
  });

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('beta.title')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportDataButton onClick={handleExportHV} label="Export HV Data" />
          <ExportDataButton onClick={handleExportScatter} label="Export Scatter" />
        </div>
      </div>

      {/* Axis selectors */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.xAxis')}:
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} style={selectStyle}>
            {fields.filter((f) => f.type === 'numeric').map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={() => setXMinimize(!xMinimize)} style={btnStyle(!xMinimize, '#f59e0b')} title="Toggle X direction">
            {xMinimize ? t('beta.xMinimize') : t('beta.xMaximize')}
          </button>
          <button onClick={() => setShowXMarginal(!showXMarginal)} style={btnStyle(showXMarginal)} title="Toggle X distribution">∫ dist</button>
          {showXMarginal && (
            <button onClick={() => setXExcludeZero(!xExcludeZero)} style={btnStyle(xExcludeZero, '#f59e0b')} title="Exclude zero">≠0</button>
          )}
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.yAxis')}:
          <select value={yKey} onChange={(e) => setYKey(e.target.value)} style={selectStyle}>
            {fields.filter((f) => f.type === 'numeric').map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={() => setYMinimize(!yMinimize)} style={btnStyle(!yMinimize, '#f59e0b')} title="Toggle Y direction">
            {yMinimize ? t('beta.xMinimize') : t('beta.xMaximize')}
          </button>
          <button onClick={() => setShowYMarginal(!showYMarginal)} style={btnStyle(showYMarginal)} title="Toggle Y distribution">∫ dist</button>
          {showYMarginal && (
            <button onClick={() => setYExcludeZero(!yExcludeZero)} style={btnStyle(yExcludeZero, '#f59e0b')} title="Exclude zero">≠0</button>
          )}
        </label>

        {!colorByFront && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('explorer.colorBy')}:
            <select value={colorKey} onChange={(e) => setColorKey(e.target.value)} style={selectStyle}>
              <option value="">{t('explorer.none')}</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
        )}

        {(showXMarginal || showYMarginal) && (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
            bins
            <input type="number" min={5} max={200} step={1} value={marginalBins}
              onChange={(e) => setMarginalBins(Math.max(5, Math.min(200, Number(e.target.value))))}
              style={{ width: 48, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </label>
        )}

        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{filteredData.length} pts</span>
      </div>

      {/* Pareto controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>Pareto</span>

        <button onClick={() => setColorByFront(!colorByFront)} style={btnStyle(colorByFront)}>
          {t('beta.colorByFront')}
        </button>

        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
          {t('beta.numFronts')}
          <input type="number" min={1} max={10} step={1} value={numFronts}
            onChange={(e) => setNumFronts(Math.max(1, Math.min(10, Number(e.target.value))))}
            style={{ width: 40, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </label>

        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('beta.refPoint')}:</span>
        <button onClick={() => setRefMode(refMode === 'auto' ? 'manual' : 'auto')} style={btnStyle(refMode === 'manual', '#f59e0b')}>
          {refMode === 'auto' ? t('beta.refAuto') : t('beta.refManual')}
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          X: {refMode === 'manual' ? '' : autoRef.refX.toPrecision(4)}
        </span>
        {refMode === 'manual' ? (
          <input type="number" placeholder="refX" value={refXStore ?? ''} onChange={(e) => setRefXStore(e.target.value === '' ? null : Number(e.target.value))}
            style={{ width: 80, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }} />
        ) : null}
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          Y: {refMode === 'manual' ? '' : autoRef.refY.toPrecision(4)}
        </span>
        {refMode === 'manual' ? (
          <input type="number" placeholder="refY" value={refYStore ?? ''} onChange={(e) => setRefYStore(e.target.value === '' ? null : Number(e.target.value))}
            style={{ width: 80, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }} />
        ) : null}
      </div>

      {/* Color range slider (free mode only) */}
      {!colorByFront && colorField && colorField.type === 'numeric' && colorDataRange && (
        <div style={{ marginBottom: 12 }}>
          <DualRangeSlider
            label={`Color: ${colorField.label}`}
            dataMin={colorDataRange.min} dataMax={colorDataRange.max}
            low={cMin ?? colorDataRange.min} high={cMax ?? colorDataRange.max}
            onChange={(lo, hi) => { setCMin(lo); setCMax(hi); }}
            isPlaying={isPlaying} isExporting={isExporting}
            onPlay={handlePlay} onStop={handleStop} onExportGif={handleExportGif}
            playStep={playStep} playFps={playFps}
            onPlayStepChange={setPlayStep} onPlayFpsChange={setPlayFps}
          />
        </div>
      )}

      {/* Hypervolume vs Generation */}
      {hvTraces.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <Plot
              data={hvTraces}
              layout={{
                font: PLOTLY_FONT,
                title: { text: t('beta.hvTitle'), font: { size: 15, color: getPlotlyTheme(theme).titleColor } },
                xaxis: { title: { text: t('col.generation'), font: { size: 13, color: getPlotlyTheme(theme).axisTitleColor } }, tickfont: { size: 11, color: getPlotlyTheme(theme).tickColor }, gridcolor: getPlotlyTheme(theme).gridColor, zerolinecolor: getPlotlyTheme(theme).zerolineColor, linecolor: getPlotlyTheme(theme).lineColor },
                yaxis: { title: { text: t('beta.hvYAxis'), font: { size: 13, color: getPlotlyTheme(theme).axisTitleColor } }, tickfont: { size: 11, color: getPlotlyTheme(theme).tickColor }, gridcolor: getPlotlyTheme(theme).gridColor, zerolinecolor: getPlotlyTheme(theme).zerolineColor, linecolor: getPlotlyTheme(theme).lineColor },
                hovermode: 'closest' as const,
                showlegend: true,
                legend: { bgcolor: 'rgba(255,255,255,0.4)', font: { size: 11, color: getPlotlyTheme(theme).legendColor } },
                margin: { t: 50, r: 20, l: 70, b: 60 },
                plot_bgcolor: getPlotlyTheme(theme).plotBg, paper_bgcolor: getPlotlyTheme(theme).paperBg,
              }}
              config={{ responsive: true, displayModeBar: true }}
              style={{ width: '100%', height: 400 }}
            />
          </div>
        </div>
      )}

      {/* Scatter plot */}
      <div className="card" ref={plotRef} style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={[...traces, ...overlayTraces, ...marginalTraces]}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: (showXMarginal || showYMarginal) ? 620 : 550 }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) openViewer(Number(point.customdata));
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
  return Math.max(0.9 * std * Math.pow(n, -0.2), 1e-12);
}

function evalKDE(values: number[], bw: number, pts: number[]): number[] {
  const inv = 1 / (values.length * bw * Math.sqrt(2 * Math.PI));
  return pts.map((x) => inv * values.reduce((acc, v) => acc + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0));
}

function linspace(lo: number, hi: number, n: number): number[] {
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + i * step);
}

/** Build a standard 2D hypervolume staircase fill polygon. Returns {xs, ys} in original coordinates. */
function buildHypervolumeStaircaseFill(
  points: { x: number; y: number }[],
  refX: number,
  refY: number,
  xMinimize: boolean,
  yMinimize: boolean,
): { xs: number[]; ys: number[] } {
  const nRefX = xMinimize ? refX : -refX;
  const nRefY = yMinimize ? refY : -refY;

  // Normalize to minimize-minimize space
  const norm = points.map((p) => ({
    nx: xMinimize ? p.x : -p.x,
    ny: yMinimize ? p.y : -p.y,
  }));

  // Keep only points dominated by reference (strictly inside)
  const inside = norm.filter((p) => p.nx < nRefX && p.ny < nRefY);
  if (inside.length === 0) return { xs: [], ys: [] };

  // Non-dominated filter in minimize-minimize space
  const nonDom = inside.filter(
    (a) => !inside.some((b) => b.nx <= a.nx && b.ny <= a.ny && (b.nx < a.nx || b.ny < a.ny)),
  );

  // Sort by nx ascending; for ties keep only the one with smallest ny
  nonDom.sort((a, b) => a.nx - b.nx || a.ny - b.ny);
  const deduped: typeof nonDom = [];
  for (const p of nonDom) {
    if (deduped.length > 0 && deduped[deduped.length - 1].nx === p.nx) continue;
    deduped.push(p);
  }

  // Build staircase polygon in normalize space
  const pxs: number[] = [];
  const pys: number[] = [];

  // Start: top of first point at reference y
  pxs.push(deduped[0].nx); pys.push(nRefY);
  // Down to first point
  pxs.push(deduped[0].nx); pys.push(deduped[0].ny);

  for (let i = 1; i < deduped.length; i++) {
    // Horizontal step to next x at previous y
    pxs.push(deduped[i].nx); pys.push(deduped[i - 1].ny);
    // Vertical step down to next y
    pxs.push(deduped[i].nx); pys.push(deduped[i].ny);
  }

  // Extend to reference x at last y
  pxs.push(nRefX); pys.push(deduped[deduped.length - 1].ny);
  // Up to reference corner
  pxs.push(nRefX); pys.push(nRefY);
  // Close back to start
  pxs.push(deduped[0].nx); pys.push(nRefY);

  // Map back to original coordinates
  return {
    xs: pxs.map((nx) => xMinimize ? nx : -nx),
    ys: pys.map((ny) => yMinimize ? ny : -ny),
  };
}

function buildXMarginalTraces(xVals: number[], bins: number, label: string): PlotlyData[] {
  if (xVals.length < 2) return [];
  const bw = silvermanBandwidth(xVals);
  const lo = Math.min(...xVals);
  const hi = Math.max(...xVals);
  const pts = linspace(lo, hi, 200);
  const density = evalKDE(xVals, bw, pts);
  return [
    { x: xVals, type: 'histogram', nbinsx: bins, histnorm: 'probability density',
      marker: { color: 'rgba(99,102,241,0.45)', line: { color: 'rgba(99,102,241,0.8)', width: 1 } },
      name: `${label} dist`, showlegend: false, xaxis: 'x', yaxis: 'y2', hoverinfo: 'skip' },
    { x: pts, y: density, type: 'scatter', mode: 'lines', line: { color: '#6366f1', width: 2 },
      name: `${label} KDE`, showlegend: false, xaxis: 'x', yaxis: 'y2', hoverinfo: 'skip' },
  ];
}

function buildYMarginalTraces(yVals: number[], bins: number, label: string): PlotlyData[] {
  if (yVals.length < 2) return [];
  const bw = silvermanBandwidth(yVals);
  const lo = Math.min(...yVals);
  const hi = Math.max(...yVals);
  const pts = linspace(lo, hi, 200);
  const density = evalKDE(yVals, bw, pts);
  return [
    { y: yVals, type: 'histogram', nbinsy: bins, histnorm: 'probability density', orientation: 'h',
      marker: { color: 'rgba(236,72,153,0.45)', line: { color: 'rgba(236,72,153,0.8)', width: 1 } },
      name: `${label} dist`, showlegend: false, xaxis: 'x3', yaxis: 'y', hoverinfo: 'skip' },
    { x: density, y: pts, type: 'scatter', mode: 'lines', line: { color: '#ec4899', width: 2 },
      name: `${label} KDE`, showlegend: false, xaxis: 'x3', yaxis: 'y', hoverinfo: 'skip' },
  ];
}

function RangeInputs({ label, min, max, onMin, onMax, inputStyle }: {
  label: string; min: string; max: string;
  onMin: (v: string) => void; onMax: (v: string) => void;
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
  label: string; dataMin: number; dataMax: number; low: number; high: number;
  onChange: (low: number, high: number) => void;
  isPlaying?: boolean; isExporting?: boolean;
  onPlay?: () => void; onStop?: () => void; onExportGif?: () => void;
  playStep?: number; playFps?: number;
  onPlayStepChange?: (v: number) => void; onPlayFpsChange?: (v: number) => void;
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
            onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)} style={{ width: 200 }} />
          <span style={{ minWidth: 60, color: 'var(--color-text)' }}>{fmt(low)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, textAlign: 'right' }}>▲</span>
          <input type="range" min={dataMin} max={dataMax} step={step} value={high}
            onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))} style={{ width: 200 }} />
          <span style={{ minWidth: 60, color: 'var(--color-text)' }}>{fmt(high)}</span>
        </div>
      </div>
      <button onClick={() => onChange(dataMin, dataMax)} style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
        reset
      </button>
      {onPlayStepChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          step<input type="number" min={0.001} step={0.1} value={playStep}
            onChange={(e) => onPlayStepChange(Number(e.target.value))} style={numInputStyle} />
        </label>
      )}
      {onPlayFpsChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          fps<input type="number" min={1} max={60} step={1} value={playFps}
            onChange={(e) => onPlayFpsChange(Number(e.target.value))} style={numInputStyle} />
        </label>
      )}
      {onPlay && onStop && (
        <button onClick={isPlaying ? onStop : onPlay} disabled={isExporting}
          style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
          {isPlaying ? '⏹ stop' : '▶ play'}
        </button>
      )}
      {onExportGif && (
        <button onClick={onExportGif} disabled={isPlaying || isExporting}
          style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'not-allowed', color: 'var(--color-text-muted)' }}>
          {isExporting ? '⏳ exporting…' : '🎞 export GIF'}
        </button>
      )}
    </div>
  );
}
