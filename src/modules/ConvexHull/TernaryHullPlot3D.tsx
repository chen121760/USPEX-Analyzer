/**
 * 3D ternary phase diagram convex hull plot.
 *
 * Renders the full 3D convex hull (cartX, cartY, eForm) using Plotly's
 * scatter3d and mesh3d traces, instead of the 2D equilateral-triangle
 * projection used by TernaryHullPlot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Structure, SystemInfo } from '@/types/structure';
import { ternaryToCartesian, formulaToHtml } from '@/parsers/compositionUtils';
import { useUIStore } from '@/store/useUIStore';
import { useThemeStore } from '@/theme/themeStore';
import { useMarkStore } from '@/store/useMarkStore';
import { useProjectStore } from '@/store/useProjectStore';
import { uniqueHullPoints, type TernaryHullInput } from '@/lib/ternaryHull';
import { computeTernaryLowerFaces, type Point3D, type TernaryLowerFace } from '@/lib/convexHullReconstruction';
import { lowerFacesToMesh3D } from '@/lib/ternaryHull3D';
import { parseEaIds } from '@/lib/parseEaIds';
import { getStructureIdFromPlotClick, type PlotTraceLike } from '@/charts/shared/plotClick';
import type { PlotClickEvent } from '@/charts/shared/plotClick';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT } from '@/lib/constants';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { ExportDataButton } from '@/components/ExportDataButton';
import { downloadCsv } from '@/lib/exportCsv';
import { PlotFrame } from '@/charts/shared/PlotFrame';
import { CONVEX_HULL_PLOT_HEIGHT } from './plotSizing';

interface StructureWithCoords extends Structure {
  cartX: number;
  cartY: number;
}

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
  groupMap?: Map<number, string>;
  showExport?: boolean;
  showTags?: boolean;
  showFooter?: boolean;
  oldHullEdges?: { p1: [number, number]; p2: [number, number] }[];
  hullExpanded?: boolean;
  onStructureClick?: (structure: Structure) => void;
}

export function TernaryHullPlot3D({
  structures,
  systemInfo,
  groupMap,
  showExport = true,
  showTags = true,
  showFooter = true,
  onStructureClick,
}: Props) {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const markActiveTags = useMarkStore((s) => s.markActiveTags);
  const markEaInput = useMarkStore((s) => s.markEaInput);
  const allTags = useProjectStore((s) => s.tags);
  const theme = useThemeStore((s) => s.theme);

  const maxFitness = useMemo(() => {
    const vals = structures
      .filter((s) => s.fitness > 0 && s.enthalpyTotal <= 900)
      .map((s) => s.fitness);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [structures]);

  const [fitnessMax, setFitnessMax] = useState(() => maxFitness);
  const [revision, setRevision] = useState(0);

  // Camera persistence: save across slider changes, reset on project switch
  const cameraRef = useRef<{ eye: { x: number; y: number; z: number }; center: { x: number; y: number; z: number } } | null>(null);
  const prevStructuresRef = useRef<typeof structures>(structures);
  useEffect(() => {
    if (prevStructuresRef.current !== structures) {
      cameraRef.current = null;
      prevStructuresRef.current = structures;
    }
  }, [structures]);

  // Capture camera on user rotation/zoom via Plotly relayout events
  const handleRelayout = useCallback((event: any) => {
    const cam = event?.['scene.camera'] ?? event?.scene?.camera;
    if (cam) {
      cameraRef.current = {
        eye: { x: cam.eye?.x ?? 1.5, y: cam.eye?.y ?? 1.5, z: cam.eye?.z ?? 1.0 },
        center: { x: cam.center?.x ?? 0.5, y: cam.center?.y ?? Math.sqrt(3) / 6, z: cam.center?.z ?? 0 },
      };
    }
  }, []);

  function handleFitnessChange(val: number) {
    setFitnessMax(val);
    setRevision((r) => r + 1);
  }

  // ── Plot data ──
  const plotData = useMemo(() => {
    const elements = systemInfo.elements;
    const validStructures = structures.filter(
      (s) => s.enthalpyTotal <= 900 && !isNaN(s.enthalpy),
    );
    const userAdded = validStructures.filter((s) => s.isUserAdded);
    const nonUser = validStructures.filter((s) => !s.isUserAdded);
    const stable = nonUser.filter((s) => s.fitness === 0);
    const unstable = nonUser.filter(
      (s) => s.fitness > 0 && s.fitness <= fitnessMax,
    );

    const unstableWithCoords: StructureWithCoords[] = unstable.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      return { ...s, cartX: cx, cartY: cy };
    });

    // Hull points — fitness === 0 structures (including user-added that expanded hull)
    const hullInputs: TernaryHullInput[] = validStructures
      .filter((s) => s.fitness === 0)
      .map((s) => {
        const [cx, cy] = ternaryToCartesian(s.composition);
        return {
          id: s.id,
          composition: s.composition,
          eForm: s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy,
          cartX: cx,
          cartY: cy,
          _mergeSeq: (s as any)._mergeSeq,
        };
      });

    const uniqueStableInputs = uniqueHullPoints(hullInputs);

    // Compute lower hull faces for mesh3d
    const hullPoints3D: Point3D[] = uniqueStableInputs.map((p) => ({
      x: p.cartX,
      y: p.cartY,
      z: p.eForm,
    }));

    let lowerFaces: TernaryLowerFace[] = [];
    let meshData = { x: [] as number[], y: [] as number[], z: [] as number[], i: [] as number[], j: [] as number[], k: [] as number[] };
    let hullEdges3D: { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] } = { x: [], y: [], z: [] };

    if (hullPoints3D.length >= 4) {
      lowerFaces = computeTernaryLowerFaces(hullPoints3D);
      meshData = lowerFacesToMesh3D(lowerFaces);

      // Extract wireframe edges from lower hull faces
      const edgeKey = (a: Point3D, b: Point3D) =>
        `${Math.min(a.x, b.x).toFixed(10)},${Math.min(a.y, b.y).toFixed(10)},${Math.min(a.z, b.z).toFixed(10)}-${Math.max(a.x, b.x).toFixed(10)},${Math.max(a.y, b.y).toFixed(10)},${Math.max(a.z, b.z).toFixed(10)}`;
      const edgeSet = new Set<string>();
      const edgeXs: (number | null)[] = [];
      const edgeYs: (number | null)[] = [];
      const edgeZs: (number | null)[] = [];
      for (const { v0, v1, v2 } of lowerFaces) {
        for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]] as [Point3D, Point3D][]) {
          const key = edgeKey(a, b);
          if (edgeSet.has(key)) continue;
          edgeSet.add(key);
          edgeXs.push(a.x, b.x, null);
          edgeYs.push(a.y, b.y, null);
          edgeZs.push(a.z, b.z, null);
        }
      }
      hullEdges3D = { x: edgeXs, y: edgeYs, z: edgeZs };
    }

    // Display-only stable points (non-user-added)
    const displayStable: TernaryHullInput[] = stable.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      return {
        id: s.id,
        composition: s.composition,
        eForm: s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy,
        cartX: cx,
        cartY: cy,
        _mergeSeq: (s as any)._mergeSeq,
      };
    });

    const uniqueStable = uniqueHullPoints(displayStable);
    const structureMap = new Map<number, Structure>();
    for (const s of structures) {
      const key = (s as any)._mergeSeq ?? s.id;
      structureMap.set(key, s);
    }
    const uniqueStableFull = uniqueStable.map((p) => ({
      ...p,
      full: structureMap.get(p._mergeSeq ?? p.id),
    }));

    // User-added in 3D
    const userAddedWithCoords: {
      id: number;
      cartX: number;
      cartY: number;
      eForm: number;
      s: Structure;
    }[] = userAdded.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      const ef = s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy;
      return { id: s.id, cartX: cx, cartY: cy, eForm: ef, s };
    });

    // Min eForm for reference plane
    const allEForms = [
      ...uniqueStable.map((p) => p.eForm),
      ...unstableWithCoords.map((s) => s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy),
    ].filter((v) => isFinite(v));
    const minEForm = allEForms.length > 0 ? Math.min(...allEForms) : 0;

    // Vertical drop lines from each hull vertex down to the base triangle
    const dropXs: (number | null)[] = [];
    const dropYs: (number | null)[] = [];
    const dropZs: (number | null)[] = [];
    if (hullPoints3D.length >= 4 && lowerFaces.length > 0) {
      // Use deduplicated hull-surface vertices (from meshData) for pillar lines
      for (let i = 0; i < meshData.x.length; i++) {
        dropXs.push(meshData.x[i], meshData.x[i], null);
        dropYs.push(meshData.y[i], meshData.y[i], null);
        dropZs.push(meshData.z[i], minEForm, null);
      }
    }
    const verticalDrops = { x: dropXs, y: dropYs, z: dropZs };

    return {
      unstableWithCoords,
      uniqueStableFull,
      meshData,
      hasHull: lowerFaces.length > 0,
      hullEdges3D,
      verticalDrops,
      elements,
      userAddedWithCoords,
      minEForm,
    };
  }, [structures, systemInfo, fitnessMax]);

  const {
    unstableWithCoords,
    uniqueStableFull,
    meshData,
    hasHull,
    hullEdges3D,
    verticalDrops,
    elements,
    userAddedWithCoords,
    minEForm,
  } = plotData;

  const structureById = useMemo(
    () => new Map(structures.map((s) => [s.id, s])),
    [structures],
  );

  // ── Hover text helpers ──
  const getStructureHoverText = useCallback(
    (id: number, fallbackFormula = '') => {
      const s = structureById.get(id);
      return (
        (s?.groupName || groupMap
          ? `Group: ${s?.groupName ?? groupMap?.get(id) ?? '-'}<br>`
          : '') +
        `EA${id}: ${formulaToHtml(s?.formula ?? fallbackFormula)}<br>` +
        `E_form: ${s?.eForm !== undefined && s?.eForm !== -1 ? s.eForm.toFixed(4) : s?.enthalpy.toFixed(4) ?? '-'} eV/atom<br>` +
        `Fitness: ${s?.fitness.toFixed(4) ?? '-'} eV/atom<br>` +
        `SG: ${s?.spaceGroup ?? '-'} | Gen: ${s?.generation ?? '-'}<br>` +
        `Origin: ${s?.origin ?? '-'}`
      );
    },
    [structureById, groupMap],
  );

  // ── Build coord map for tag/EA overlays ──
  const coordMap = useMemo(() => {
    const map = new Map<number, { cartX: number; cartY: number; eForm: number }>();
    for (const s of unstableWithCoords)
      map.set(s.id, {
        cartX: s.cartX,
        cartY: s.cartY,
        eForm: s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy,
      });
    for (const p of uniqueStableFull)
      map.set(p.id, { cartX: p.cartX, cartY: p.cartY, eForm: p.eForm });
    for (const u of userAddedWithCoords)
      map.set(u.id, { cartX: u.cartX, cartY: u.cartY, eForm: u.eForm });
    return map;
  }, [unstableWithCoords, uniqueStableFull, userAddedWithCoords]);

  // ── Tag overlay traces ──
  const tagOverlayTraces: PlotlyData[] = useMemo(() => {
    const result: PlotlyData[] = [];
    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((tg) => tg.id === tagId);
      if (!tagDef) continue;
      const tagged = structures.filter(
        (s) => s.tags.includes(tagId) && coordMap.has(s.id),
      );
      if (tagged.length === 0) continue;
      result.push({
        type: 'scatter3d',
        x: tagged.map((s) => coordMap.get(s.id)!.cartX),
        y: tagged.map((s) => coordMap.get(s.id)!.cartY),
        z: tagged.map((s) => coordMap.get(s.id)!.eForm),
        mode: 'markers',
        name: `★ ${t(tagDef.nameKey)}`,
        marker: {
          symbol: 'circle',
          size: 4,
          color: tagDef.color,
          line: { width: 1, color: 'white' },
        },
        text: tagged.map((s) => getStructureHoverText(s.id, s.formula)),
        hoverinfo: 'text',
        customdata: tagged.map((s) => s.id),
        showlegend: true,
      });
    }
    return result;
  }, [structures, coordMap, markActiveTags, allTags, getStructureHoverText, t]);

  // ── EA-ID overlay traces ──
  const eaOverlayTraces: PlotlyData[] = useMemo(() => {
    const result: PlotlyData[] = [];
    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = structures.filter(
        (s) => eaIds.has(s.id) && coordMap.has(s.id),
      );
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
          result.push({
            type: 'scatter3d',
            x: structs.map((s) => coordMap.get(s.id)!.cartX),
            y: structs.map((s) => coordMap.get(s.id)!.cartY),
            z: structs.map((s) => coordMap.get(s.id)!.eForm),
            mode: 'markers',
            name,
            marker: {
              symbol: 'circle',
              size: 4,
              color,
              line: { width: 1, color: 'white' },
            },
            text: structs.map((s) => getStructureHoverText(s.id, s.formula)),
            hoverinfo: 'text',
            customdata: structs.map((s) => s.id),
            showlegend: true,
          });
        }
      }
    }
    return result;
  }, [structures, coordMap, markEaInput, getStructureHoverText, t]);

  // ── Triangle vertices ──
  const triVerts = [
    [0, 0],
    [0.5, Math.sqrt(3) / 2],
    [1, 0],
    [0, 0],
  ];

  const pt = getPlotlyTheme(theme);

  // ── Build 3D traces ──
  // Mesh3d rendered BEFORE scatter3d so depth buffer occludes points behind the hull.
  const traces: PlotlyData[] = [
    // 1. Triangle base frame at z = minEForm
    {
      type: 'scatter3d',
      x: triVerts.map((v) => v[0]),
      y: triVerts.map((v) => v[1]),
      z: triVerts.map(() => minEForm),
      mode: 'lines',
      name: '',
      line: { color: pt.structureLineColor, width: 1.5 },
      hoverinfo: 'skip',
      showlegend: false,
    },

    // 2. Vertical drop lines from hull vertices to base triangle
    ...(hasHull
      ? [
          {
            type: 'scatter3d' as const,
            x: verticalDrops.x,
            y: verticalDrops.y,
            z: verticalDrops.z,
            mode: 'lines' as const,
            name: '',
            line: { color: '#999', width: 1.5, dash: 'dot' },
            hoverinfo: 'skip' as const,
            showlegend: false,
          },
        ]
      : []),

    // 3. Element labels at triangle corners
    ...(elements.length >= 3
      ? [
          {
            type: 'scatter3d' as const,
            x: [-0.08, 0.5, 1.08],
            y: [-0.08, Math.sqrt(3) / 2 + 0.08, -0.08],
            z: [minEForm, minEForm, minEForm],
            mode: 'text' as const,
            text: elements.slice(0, 3),
            textfont: { size: 22, color: pt.annotationColor },
            hoverinfo: 'skip' as const,
            showlegend: false,
          },
        ]
      : []),

    // 4. Convex hull surface (mesh3d) — rendered FIRST among geometry so depth-test occludes points behind it
    ...(hasHull
      ? [
          {
            type: 'mesh3d' as const,
            x: meshData.x,
            y: meshData.y,
            z: meshData.z,
            i: meshData.i,
            j: meshData.j,
            k: meshData.k,
            opacity: 0.85,
            color: '#aaa',
            flatshading: false,
            lighting: {
              ambient: 0.6,
              diffuse: 0.8,
              specular: 0.3,
              roughness: 0.5,
              fresnel: 0.2,
            },
            lightposition: { x: 2000, y: 3000, z: 4000 },
            name: t('hull.tieLines', 'Convex Hull'),
            hoverinfo: 'skip' as const,
            showlegend: true,
          },
        ]
      : []),

    // 5. Hull wireframe edges (black lines)
    ...(hasHull
      ? [
          {
            type: 'scatter3d' as const,
            x: hullEdges3D.x,
            y: hullEdges3D.y,
            z: hullEdges3D.z,
            mode: 'lines' as const,
            name: '',
            line: { color: 'black', width: 1 },
            hoverinfo: 'skip' as const,
            showlegend: false,
          },
        ]
      : []),

    // 6. Unstable points — after mesh, depth test hides those buried under hull
    {
      type: 'scatter3d',
      x: unstableWithCoords.map((s) => s.cartX),
      y: unstableWithCoords.map((s) => s.cartY),
      z: unstableWithCoords.map((s) =>
        s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy,
      ),
      mode: 'markers',
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
        cmax: Math.max(fitnessMax, 0.01),
        colorbar: {
          title: 'Fitness<br>(eV/block)',
          thickness: 14,
          len: 0.46,
          x: 0.73,
          xanchor: 'left',
          y: 0.52,
          yanchor: 'middle',
        },
        size: 2,
        opacity: 0.6,
      },
      text: unstableWithCoords.map((s) =>
        (s.groupName || groupMap
          ? `Group: ${s.groupName ?? groupMap?.get(s.id) ?? '-'}<br>`
          : '') +
        `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
        `E_form: ${s.eForm !== undefined && s.eForm !== -1 ? s.eForm.toFixed(4) : s.enthalpy.toFixed(4)} eV/atom<br>` +
        `Fitness: ${s.fitness.toFixed(4)} eV/atom<br>` +
        `SG: ${s.spaceGroup} | Gen: ${s.generation}<br>` +
        `Origin: ${s.origin}`,
      ),
      hoverinfo: 'text',
      customdata: unstableWithCoords.map((s: any) => s._mergeSeq ?? s.id),
    },

    // 7. Stable points — after mesh, visible on hull surface
    {
      type: 'scatter3d',
      x: uniqueStableFull.map((p) => p.cartX),
      y: uniqueStableFull.map((p) => p.cartY),
      z: uniqueStableFull.map((p) => p.eForm),
      mode: 'markers',
      name: 'Stable',
      marker: {
        color: 'red',
        size: 4,
        symbol: 'circle',
      },
      text: uniqueStableFull.map((p) => {
        const s = p.full;
        return (
          (s?.groupName || groupMap
            ? `Group: ${s?.groupName ?? groupMap?.get(p.id) ?? '-'}<br>`
            : '') +
          `EA${p.id}: ${formulaToHtml(s?.formula ?? '')}<br>` +
          `E_form: ${p.eForm.toFixed(4)} eV/atom<br>` +
          `Fitness: 0.0000 eV/atom<br>` +
          `SG: ${s?.spaceGroup ?? '-'} | Gen: ${s?.generation ?? '-'}<br>` +
          `Origin: ${s?.origin ?? '-'}`
        );
      }),
      hoverinfo: 'text',
      customdata: uniqueStableFull.map((p: any) => p.full?._mergeSeq ?? p.id),
    },

    // 8. User-added structures — after mesh, visible above hull
    {
      type: 'scatter3d',
      x: userAddedWithCoords.map((u) => u.cartX),
      y: userAddedWithCoords.map((u) => u.cartY),
      z: userAddedWithCoords.map((u) => u.eForm),
      mode: 'markers',
      name: 'Manual',
      marker: {
        color: pt.selectedMarkerFill,
        size: 4,
        symbol: 'circle',
        line: { width: 1.5, color: pt.selectedMarkerLine },
      },
      text: userAddedWithCoords.map((u) => {
        const s = u.s;
        return (
          `[Manual]<br>` +
          (s.groupName ? `Group: ${s.groupName}<br>` : '') +
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `E_form: ${u.eForm.toFixed(4)} eV/atom<br>` +
          `Fitness: ${s.fitness.toFixed(4)} eV/atom`
        );
      }),
      hoverinfo: 'text',
      customdata: userAddedWithCoords.map((u: any) => u.s._mergeSeq ?? u.id),
    },

    // 9-10. Overlay markers
    ...(showTags ? tagOverlayTraces : []),
    ...eaOverlayTraces,
  ];

  // ── Layout ──
  const layout: PlotlyLayout = {
    autosize: true,
    dragmode: 'turntable',
    hovermode: 'closest',
    font: PLOTLY_FONT,
    title: {
      text: `${elements.join('-')} 3D Ternary Phase Diagram`,
      font: { size: 15, color: pt.titleColor },
    },
    scene: {
      xaxis: {
        showspikes: false,
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        title: { text: '' },
        range: [-0.2, 1.2],
      },
      yaxis: {
        showspikes: false,
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        title: { text: '' },
        range: [-0.2, Math.sqrt(3) / 2 + 0.2],
      },
      zaxis: {
        title: { text: 'E_form (eV/atom)' },
        showspikes: false,
      },
      ...(cameraRef.current ? { camera: cameraRef.current } : {}),
      bgcolor: pt.plotBg,
      aspectmode: 'manual',
      aspectratio: { x: 1, y: 1, z: 0.6 },
    },
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor:
        theme === 'dark'
          ? 'rgba(24, 24, 37, 0.86)'
          : 'rgba(255,255,255,0.4)',
      bordercolor: theme === 'dark' ? '#313244' : '#e2e8f0',
      font: { size: 11, color: pt.legendColor },
    },
    margin: { t: 50, r: 20, l: 20, b: 20 },
    paper_bgcolor: pt.paperBg,
  };

  // ── Plotly config ──
  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    scrollZoom: true,
    doubleClick: 'reset',
    modeBarButtonsToRemove: [
      'zoom2d',
      'pan2d',
      'select2d',
      'lasso2d',
      'zoomIn2d',
      'zoomOut2d',
      'autoScale2d',
      'hoverClosestCartesian',
      'hoverCompareCartesian',
    ],
  };

  // ── Click handling (native Plotly onClick, 3D-compatible) ──
  const handlePlotClick = useCallback(
    (event: PlotClickEvent) => {
      const structureId = getStructureIdFromPlotClick(
        event,
        traces as unknown as PlotTraceLike[],
      );
      if (structureId === null) return;

      if (onStructureClick) {
        const structure = structures.find(
          (s) => Number((s as any)._mergeSeq ?? s.id) === structureId,
        );
        if (structure) onStructureClick(structure);
        return;
      }

      openViewer(structureId);
    },
    [structures, onStructureClick, openViewer, traces],
  );

  // ── Export ──
  function handleExport() {
    const elA = elements[0] || 'A';
    const elB = elements[1] || 'B';
    const elC = elements[2] || 'C';
    const hasGroup =
      groupMap != null || structures.some((s) => s.groupName != null);
    const groupCol = hasGroup ? ['Group'] : [];
    const headers = [
      ...groupCol,
      'EA_ID',
      'Formula',
      `x_${elA}`,
      `x_${elB}`,
      `x_${elC}`,
      'E_form(eV/atom)',
      'Fitness(eV/atom)',
      'SpaceGroup',
      'Generation',
      'Origin',
      'Type',
    ];

    const stableRows = uniqueStableFull.map((p) => {
      const total = p.composition.reduce((a: number, b: number) => a + b, 0) || 1;
      const s = p.full;
      return {
        ...(hasGroup ? { Group: s?.groupName ?? '' } : {}),
        EA_ID: p.id,
        Formula: s?.formula ?? '',
        [`x_${elA}`]: (p.composition[0] / total).toFixed(6),
        [`x_${elB}`]: (p.composition[1] / total).toFixed(6),
        [`x_${elC}`]: (p.composition[2] / total).toFixed(6),
        'E_form(eV/atom)': p.eForm,
        'Fitness(eV/atom)': 0,
        SpaceGroup: s?.spaceGroup ?? '',
        Generation: s?.generation ?? '',
        Origin: s?.origin ?? '',
        Type: 'Stable',
      };
    });

    const unstableRows = unstableWithCoords.map((s) => {
      const total =
        s.composition.reduce((a: number, b: number) => a + b, 0) || 1;
      const ef =
        s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy;
      return {
        ...(hasGroup ? { Group: s.groupName ?? '' } : {}),
        EA_ID: s.id,
        Formula: s.formula,
        [`x_${elA}`]: (s.composition[0] / total).toFixed(6),
        [`x_${elB}`]: (s.composition[1] / total).toFixed(6),
        [`x_${elC}`]: (s.composition[2] / total).toFixed(6),
        'E_form(eV/atom)': ef,
        'Fitness(eV/atom)': s.fitness,
        SpaceGroup: s.spaceGroup,
        Generation: s.generation,
        Origin: s.origin,
        Type: 'Unstable',
      };
    });

    const tag = fitnessMax.toFixed(3).replace('.', 'p');
    downloadCsv(
      `${elements.join('-')}_ternary_3d_hull_fitness${tag}`,
      headers,
      [...stableRows, ...unstableRows],
    );
  }

  // ── UI ──
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
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
        <input
          type="number"
          min={0}
          max={maxFitness}
          step={0.001}
          value={Math.round(fitnessMax * 1000) / 1000}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) handleFitnessChange(v);
          }}
          style={{
            width: 72,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'right',
            padding: '2px 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          eV
        </span>
        {showExport && (
          <ExportDataButton
            onClick={handleExport}
            style={{ marginLeft: 'auto' }}
          />
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <PlotFrame
          data={traces}
          layout={layout}
          revision={revision}
          config={config}
          style={{ width: '100%', height: CONVEX_HULL_PLOT_HEIGHT }}
          onClick={handlePlotClick}
          onRelayout={handleRelayout}
        />
      </div>

      <MarkPanel showTags={showTags} />

      {showFooter && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              color: 'var(--color-text-secondary)',
            }}
          >
            {t('hull.stablePhases')} ({uniqueStableFull.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {uniqueStableFull.map((p) => {
              const formula =
                elements.length >= 3
                  ? elements
                      .map((el, i) =>
                        p.composition[i] === 0
                          ? ''
                          : p.composition[i] === 1
                            ? el
                            : `${el}${p.composition[i]}`,
                      )
                      .filter(Boolean)
                      .join('')
                  : `EA${p.id}`;
              return (
                <span
                  key={p.id}
                  className="tag-badge"
                  style={{
                    background: '#dc262620',
                    color: '#dc2626',
                    fontSize: 12,
                    padding: '3px 10px',
                  }}
                >
                  EA{p.id} · {formula} · {p.eForm.toFixed(4)} eV/atom
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
