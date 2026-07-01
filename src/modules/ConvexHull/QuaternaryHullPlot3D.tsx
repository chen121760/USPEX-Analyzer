/**
 * 3D tetrahedron phase diagram for quaternary systems.
 *
 * Renders a regular tetrahedron with 4 element vertices, a thermodynamic
 * 4D convex hull surface (in composition + energy space) projected to 3D,
 * and scatter points for all structures colored by fitness.
 *
 * The hull is computed in (xB, xC, xD, E_form) 4D space — where xB,xC,xD are
 * normalised molar fractions of elements B,C,D (xA = 1 - sum) and E_form is
 * the formation enthalpy per atom (relative to pure element reference states).
 * Lower-hull 3-simplices (tetrahedra) are extracted and projected into the
 * tetrahedron to form the phase-diagram faces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import convexHull from 'convex-hull';
import type { Structure, SystemInfo } from '@/types/structure';
import { quaternaryToCartesian, formulaToHtml, TETRA_CENTROID, reducedCompositionKey } from '@/parsers/compositionUtils';
import { useUIStore } from '@/store/useUIStore';
import { useThemeStore } from '@/theme/themeStore';
import { useMarkStore } from '@/store/useMarkStore';
import { useProjectStore } from '@/store/useProjectStore';
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

/* ------------------------------------------------------------------ */
/*  Tetrahedron geometry                                               */
/* ------------------------------------------------------------------ */

/** Regular tetrahedron vertices in 3D, centered at origin (matches quaternaryToCartesian). */
const CX = TETRA_CENTROID[0];
const CY = TETRA_CENTROID[1];
const CZ = TETRA_CENTROID[2];
const TETRA_VERTICES: [number, number, number][] = [
  [0 - CX, 0 - CY, 0 - CZ],                                         // element 0 = A
  [1 - CX, 0 - CY, 0 - CZ],                                         // element 1 = B
  [0.5 - CX, Math.sqrt(3) / 2 - CY, 0 - CZ],                        // element 2 = C
  [0.5 - CX, Math.sqrt(3) / 6 - CY, Math.sqrt(6) / 3 - CZ],         // element 3 = D
];

/** Edge vertex pairs for the 6 tetrahedron edges. */
const TETRA_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3],
  [1, 2], [1, 3], [2, 3],
];

function buildTetraWireframe(): { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] } {
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const z: (number | null)[] = [];
  for (const [i, j] of TETRA_EDGES) {
    x.push(TETRA_VERTICES[i][0], TETRA_VERTICES[j][0], null);
    y.push(TETRA_VERTICES[i][1], TETRA_VERTICES[j][1], null);
    z.push(TETRA_VERTICES[i][2], TETRA_VERTICES[j][2], null);
  }
  return { x, y, z };
}

/* ------------------------------------------------------------------ */
/*  Thermodynamic 4D lower convex hull helpers                           */
/* ------------------------------------------------------------------ */

interface ThermoHullInput {
  id: number;
  composition: number[];   // atom counts [nA, nB, nC, nD]
  enthalpy: number;        // eV/atom
  formula: string;
}

interface HullSurface {
  /** All 3D vertex positions of the hull-defining points (in tetrahedron coords). */
  meshX: number[];
  meshY: number[];
  meshZ: number[];
  /** External envelope triangles (each triangle belongs to exactly 1 lower-hull tetrahedral cell). */
  envelopeI: number[];
  envelopeJ: number[];
  envelopeK: number[];
  /** Internal partition triangles (each shared by exactly 2 adjacent tetrahedral cells). */
  partitionI: number[];
  partitionJ: number[];
  partitionK: number[];
  /** Edge wireframe of all lower-hull tetrahedral cells. */
  edgeX: (number | null)[];
  edgeY: (number | null)[];
  edgeZ: (number | null)[];
}

/* ── 4×4 linear solver (Gaussian elimination with partial pivoting) ── */

function solve4x4(A: number[][], b: number[]): number[] | null {
  const n = 4;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-14) return null; // singular

    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j];
    }
    x[i] = sum / aug[i][i];
  }
  return x;
}

/* ── 4D hyperplane a·xB + b·xC + c·xD + E + d = 0 through 4 points ── */

function computeHyperplaneCoefs(
  pts4D: number[][],
  tet: number[],
): [number, number, number, number] | null {
  // For each vertex v_i: a*xB_i + b*xC_i + c*xD_i + d = -E_i
  // Solve 4×4 system: [xB_i, xC_i, xD_i, 1] · [a,b,c,d]ᵀ = -E_i
  const A = tet.map((i) => [...pts4D[i].slice(0, 3), 1]);
  const b = tet.map((i) => -pts4D[i][3]);
  const x = solve4x4(A, b);
  return x as [number, number, number, number] | null;
}

/* ── Lower hull filter ── */

function isLowerHullCell(
  pts4D: number[][],
  tet: number[],
  coefs: number[],
): boolean {
  const [a, b, c, dd] = coefs;
  for (const p of pts4D) {
    const val = a * p[0] + b * p[1] + c * p[2] + p[3] + dd;
    if (val < -1e-10) return false;
  }
  return true;
}

/* ── Triangle key for counting shared faces ── */

function triKey(i: number, j: number, k: number): string {
  const sorted = [i, j, k].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
}

/* ── Main: compute the 4D thermodynamic lower convex hull ── */

/**
 * Compute the true thermodynamic lower convex hull for a quaternary system.
 *
 * The hull lives in 4D space (xB, xC, xD, E_form), where xB/xC/xD are molar
 * fractions of elements B,C,D and E_form is the formation enthalpy.
 *
 * Steps:
 * 1. Deduplicate stable (fitness===0) structures by reduced composition.
 * 2. Build 4D point cloud: [xB, xC, xD, E_form].
 * 3. Run 4D convexHull() → tetrahedral facets (3-simplices).
 * 4. Filter to lower-hull cells: solve each facet's 4D hyperplane and verify
 *    that all points lie above or on it.
 * 5. Extract all triangular faces from the lower-hull tetrahedral cells.
 *    - External envelope: triangles appearing exactly once (hull boundary).
 *    - Internal partitions: triangles appearing exactly twice (between adjacent
 *      tetrahedral cells — these are the internal phase-region boundaries).
 * 6. Project all vertices to 3D tetrahedron coordinates for rendering.
 */
function computeThermoHullSurface(entries: ThermoHullInput[]): HullSurface | null {
  // 1. Dedup by reduced composition, keep lowest enthalpy per composition.
  const dedup = new Map<string, ThermoHullInput>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.enthalpy)) continue;
    const key = reducedCompositionKey(entry.composition);
    if (!key) continue;
    const prev = dedup.get(key);
    if (!prev || entry.enthalpy < prev.enthalpy) {
      dedup.set(key, entry);
    }
  }
  const clean = Array.from(dedup.values());
  // Need at least 6 points in general position for a well-defined 4D hull
  if (clean.length < 6) return null;

  // 2. Build 4D point cloud.
  const pts4D: number[][] = clean.map((entry) => {
    const total = entry.composition.reduce((s, v) => s + v, 0);
    return [
      entry.composition[1] / total,  // xB
      entry.composition[2] / total,  // xC
      entry.composition[3] / total,  // xD
      entry.enthalpy,                // E_form
    ];
  });

  // 3. Run 4D convex hull → returns arrays of 4 vertex indices (tetrahedral facets).
  let tetFacets: number[][];
  try {
    tetFacets = convexHull(pts4D);
  } catch {
    return null;
  }
  if (!tetFacets || tetFacets.length === 0) return null;

  // 4. Filter to lower-hull cells.
  const lowerCells: number[][] = [];
  for (const tet of tetFacets) {
    if (tet.length < 4) continue;
    const coefs = computeHyperplaneCoefs(pts4D, tet);
    if (!coefs) continue;
    if (isLowerHullCell(pts4D, tet, coefs)) {
      lowerCells.push([...tet]);
    }
  }
  if (lowerCells.length === 0) return null;

  // 5a. Project all deduped vertices to 3D tetrahedron coordinates.
  const xyz: [number, number, number][] = clean.map((entry) =>
    quaternaryToCartesian(entry.composition),
  );

  const meshX = xyz.map((p) => p[0]);
  const meshY = xyz.map((p) => p[1]);
  const meshZ = xyz.map((p) => p[2]);

  // 5b. Collect all triangular faces from the lower-hull tetrahedral cells.
  const faceCount = new Map<string, number>();
  const faceVerts = new Map<string, [number, number, number]>();

  for (const tet of lowerCells) {
    // A tetrahedron has 4 triangular faces.
    const faces: [number, number, number][] = [
      [tet[0], tet[1], tet[2]],
      [tet[0], tet[1], tet[3]],
      [tet[0], tet[2], tet[3]],
      [tet[1], tet[2], tet[3]],
    ];
    for (const [a, b, c] of faces) {
      const key = triKey(a, b, c);
      faceCount.set(key, (faceCount.get(key) ?? 0) + 1);
      if (!faceVerts.has(key)) {
        faceVerts.set(key, [a, b, c]);
      }
    }
  }

  // 5c. Split into envelope (count=1) and partition (count=2).
  const envelopeI: number[] = [];
  const envelopeJ: number[] = [];
  const envelopeK: number[] = [];
  const partitionI: number[] = [];
  const partitionJ: number[] = [];
  const partitionK: number[] = [];

  for (const [key, count] of faceCount) {
    const verts = faceVerts.get(key)!;
    if (count === 1) {
      envelopeI.push(verts[0]);
      envelopeJ.push(verts[1]);
      envelopeK.push(verts[2]);
    } else {
      // count >= 2 → internal partition face
      partitionI.push(verts[0]);
      partitionJ.push(verts[1]);
      partitionK.push(verts[2]);
    }
  }

  // 5d. Collect unique edges from all lower-hull cells.
  const edgeX: (number | null)[] = [];
  const edgeY: (number | null)[] = [];
  const edgeZ: (number | null)[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (a: number, b: number) => {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edgeX.push(xyz[a][0], xyz[b][0], null);
    edgeY.push(xyz[a][1], xyz[b][1], null);
    edgeZ.push(xyz[a][2], xyz[b][2], null);
  };

  for (const tet of lowerCells) {
    // 6 unique edges from a tetrahedron
    addEdge(tet[0], tet[1]);
    addEdge(tet[0], tet[2]);
    addEdge(tet[0], tet[3]);
    addEdge(tet[1], tet[2]);
    addEdge(tet[1], tet[3]);
    addEdge(tet[2], tet[3]);
  }

  return {
    meshX,
    meshY,
    meshZ,
    envelopeI,
    envelopeJ,
    envelopeK,
    partitionI,
    partitionJ,
    partitionK,
    edgeX,
    edgeY,
    edgeZ,
  };
}

/** Fallback: 3D composition-space hull when not enough points for 4D hull. */
function computeCompositionHullSurface(entries: ThermoHullInput[]): {
  meshX: number[];
  meshY: number[];
  meshZ: number[];
  i: number[];
  j: number[];
  k: number[];
  edgeX: (number | null)[];
  edgeY: (number | null)[];
  edgeZ: (number | null)[];
} | null {
  if (entries.length < 4) return null;

  const dedup = new Map<string, ThermoHullInput>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.enthalpy)) continue;
    const key = reducedCompositionKey(entry.composition);
    if (!key) continue;
    const prev = dedup.get(key);
    if (!prev || entry.enthalpy < prev.enthalpy) {
      dedup.set(key, entry);
    }
  }

  const clean = Array.from(dedup.values());
  if (clean.length < 4) return null;

  const xyz: [number, number, number][] = clean.map((entry) =>
    quaternaryToCartesian(entry.composition),
  );

  let faces: number[][];
  try {
    faces = convexHull(xyz);
  } catch {
    return null;
  }
  if (!faces || faces.length === 0) return null;

  const edgeX: (number | null)[] = [];
  const edgeY: (number | null)[] = [];
  const edgeZ: (number | null)[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (a: number, b: number) => {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edgeX.push(xyz[a][0], xyz[b][0], null);
    edgeY.push(xyz[a][1], xyz[b][1], null);
    edgeZ.push(xyz[a][2], xyz[b][2], null);
  };

  const meshX = xyz.map((p) => p[0]);
  const meshY = xyz.map((p) => p[1]);
  const meshZ = xyz.map((p) => p[2]);
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];

  for (const face of faces) {
    if (face.length < 3) continue;
    for (let ei = 0; ei < face.length; ei++) {
      addEdge(face[ei], face[(ei + 1) % face.length]);
    }
    for (let ti = 1; ti < face.length - 1; ti++) {
      i.push(face[0]);
      j.push(face[ti]);
      k.push(face[ti + 1]);
    }
  }

  return { meshX, meshY, meshZ, i, j, k, edgeX, edgeY, edgeZ };
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
  groupMap?: Map<number, string>;
  showExport?: boolean;
  showTags?: boolean;
  onStructureClick?: (structure: Structure) => void;
}

export function QuaternaryHullPlot3D({
  structures,
  systemInfo,
  groupMap,
  showExport = true,
  showTags = true,
  onStructureClick,
}: Props) {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const markActiveTags = useMarkStore((s) => s.markActiveTags);
  const markEaInput = useMarkStore((s) => s.markEaInput);
  const allTags = useProjectStore((s) => s.tags);
  const theme = useThemeStore((s) => s.theme);

  // ── Fitness slider ──
  const maxFitness = useMemo(() => {
    const vals = structures
      .filter((s) => s.fitness > 0 && s.enthalpyTotal <= 900)
      .map((s) => s.fitness);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [structures]);

  const [fitnessMax, setFitnessMax] = useState(() => maxFitness);
  const [showHullSurface, setShowHullSurface] = useState(true);
  const [revision, setRevision] = useState(0);

  // Camera persistence
  const cameraRef = useRef<{
    eye: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
  } | null>(null);
  const prevStructuresRef = useRef<typeof structures>(structures);
  useEffect(() => {
    if (prevStructuresRef.current !== structures) {
      cameraRef.current = null;
      prevStructuresRef.current = structures;
    }
  }, [structures]);

  const handleRelayout = useCallback((event: any) => {
    const cam = event?.['scene.camera'] ?? event?.scene?.camera;
    if (cam) {
      cameraRef.current = {
        eye: { x: cam.eye?.x ?? 1.5, y: cam.eye?.y ?? 1.5, z: cam.eye?.z ?? 0.8 },
        center: { x: cam.center?.x ?? 0, y: cam.center?.y ?? 0, z: cam.center?.z ?? 0 },
      };
    }
  }, []);

  function handleFitnessChange(val: number) {
    setFitnessMax(val);
    setRevision((r) => r + 1);
  }

  // ── Plot data ──
  interface PointInTetra {
    id: number;
    x: number;
    y: number;
    z: number;
    fitness: number;
    enthalpy: number;
    formula: string;
    spaceGroup: number;
    generation: number;
    origin: string;
    s: Structure;
  }

  // ── Hull surface (independent of fitness slider) ──
  const hullSurface = useMemo(() => {
    const nonUser = structures.filter(
      (s) => !s.isUserAdded && s.enthalpyTotal <= 900 && !isNaN(s.enthalpy),
    );
    const hullInput: ThermoHullInput[] = nonUser
      .filter((s) => s.fitness === 0)
      .map((s) => ({
        id: s.id,
        composition: s.composition,
        enthalpy:
          s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy,
        formula: s.formula,
      }));
    // Try 4D thermodynamic lower hull first; fall back to 3D compositon-space hull.
    const thermo = computeThermoHullSurface(hullInput);
    if (thermo) return thermo;
    // Fallback for degenerate cases.
    const fallback = computeCompositionHullSurface(hullInput);
    if (!fallback) return null;
    return {
      meshX: fallback.meshX,
      meshY: fallback.meshY,
      meshZ: fallback.meshZ,
      envelopeI: fallback.i,
      envelopeJ: fallback.j,
      envelopeK: fallback.k,
      partitionI: [],
      partitionJ: [],
      partitionK: [],
      edgeX: fallback.edgeX,
      edgeY: fallback.edgeY,
      edgeZ: fallback.edgeZ,
    };
  }, [structures]);

  // ── Plot points (reacts to fitness slider) ──
  const plotData = useMemo(() => {
    const elements = systemInfo.elements;
    const validStructures = structures.filter(
      (s) => s.enthalpyTotal <= 900 && !isNaN(s.enthalpy),
    );
    const nonUser = validStructures.filter((s) => !s.isUserAdded);

    /** Hull-consistent enthalpy: matches the value used by hullSurface. */
    const hullEnthalpy = (s: Structure): number =>
      s.eForm !== undefined && s.eForm !== -1 ? s.eForm : s.enthalpy;

    // Stable/unstable classification from USPEX's fitness, consistent with
    // BinaryHullPlot and TernaryHullPlot3D.
    const stable = nonUser.filter((s) => s.fitness === 0);
    const stableIdSet = new Set(stable.map((s) => s.id));
    const unstable = nonUser.filter(
      (s) =>
        !stableIdSet.has(s.id) &&
        s.fitness >= 0 &&
        s.fitness <= fitnessMax,
    );
    const userAdded = validStructures.filter((s) => s.isUserAdded);

    const stablePts: PointInTetra[] = stable.map((s) => {
      const [cx, cy, cz] = quaternaryToCartesian(s.composition);
      return {
        id: s.id, x: cx, y: cy, z: cz,
        fitness: s.fitness, enthalpy: hullEnthalpy(s),
        formula: s.formula, spaceGroup: s.spaceGroup,
        generation: s.generation, origin: s.origin, s,
      };
    });

    const unstablePts: PointInTetra[] = unstable.map((s) => {
      const [cx, cy, cz] = quaternaryToCartesian(s.composition);
      return {
        id: s.id, x: cx, y: cy, z: cz,
        fitness: s.fitness, enthalpy: hullEnthalpy(s),
        formula: s.formula, spaceGroup: s.spaceGroup,
        generation: s.generation, origin: s.origin, s,
      };
    });

    const userAddedPts: PointInTetra[] = userAdded.map((s) => {
      const [cx, cy, cz] = quaternaryToCartesian(s.composition);
      return {
        id: s.id, x: cx, y: cy, z: cz,
        fitness: s.fitness, enthalpy: hullEnthalpy(s),
        formula: s.formula, spaceGroup: s.spaceGroup,
        generation: s.generation, origin: s.origin, s,
      };
    });

    // Tetrahedron wireframe
    const wireframe = buildTetraWireframe();

    // Element vertex labels (pushed slightly outward from origin = centroid)
    const labelShift = 0.12;
    const vertexLabels = TETRA_VERTICES.map((v, i) => {
      const dx = v[0];
      const dy = v[1];
      const dz = v[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      return {
        x: v[0] + (dx / len) * labelShift,
        y: v[1] + (dy / len) * labelShift,
        z: v[2] + (dz / len) * labelShift,
        label: elements[i] ?? `El${i}`,
      };
    });

    return {
      stablePts,
      unstablePts,
      userAddedPts,
      wireframe,
      vertexLabels,
      elements,
    };
  }, [structures, systemInfo, fitnessMax]);

  const { stablePts, unstablePts, userAddedPts, wireframe, vertexLabels } = plotData;

  // ── Hover text ──
  const structureById = useMemo(
    () => new Map(structures.map((s) => [s.id, s])),
    [structures],
  );

  const getHoverText = useCallback(
    (id: number, fallbackFormula = '') => {
      const s = structureById.get(id);
      return (
        (s?.groupName || groupMap
          ? `Group: ${s?.groupName ?? groupMap?.get(id) ?? '-'}<br>`
          : '') +
        `EA${id}: ${formulaToHtml(s?.formula ?? fallbackFormula)}<br>` +
        `Enthalpy: ${(s?.eForm !== undefined && s?.eForm !== -1 ? s?.eForm : s?.enthalpy)?.toFixed(4) ?? '-'} eV/atom<br>` +
        `Fitness: ${s?.fitness.toFixed(4) ?? '-'} eV/block<br>` +
        `SG: ${s?.spaceGroup ?? '-'} | Gen: ${s?.generation ?? '-'}<br>` +
        `Origin: ${s?.origin ?? '-'}`
      );
    },
    [structureById, groupMap],
  );

  // ── Coordinate map for tag/EA overlays ──
  const coordMap = useMemo(() => {
    const map = new Map<number, { x: number; y: number; z: number }>();
    for (const pt of [...stablePts, ...unstablePts, ...userAddedPts]) {
      map.set(pt.id, { x: pt.x, y: pt.y, z: pt.z });
    }
    return map;
  }, [stablePts, unstablePts, userAddedPts]);

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
        x: tagged.map((s) => coordMap.get(s.id)!.x),
        y: tagged.map((s) => coordMap.get(s.id)!.y),
        z: tagged.map((s) => coordMap.get(s.id)!.z),
        mode: 'markers',
        name: `★ ${t(tagDef.nameKey)}`,
        marker: {
          symbol: 'circle',
          size: 4,
          color: tagDef.color,
          line: { width: 1, color: 'white' },
        },
        text: tagged.map((s) => getHoverText(s.id, s.formula)),
        hoverinfo: 'text',
        customdata: tagged.map((s) => s.id),
        showlegend: true,
      });
    }
    return result;
  }, [structures, coordMap, markActiveTags, allTags, getHoverText, t]);

  // ── EA-ID overlay traces ──
  const eaOverlayTraces: PlotlyData[] = useMemo(() => {
    const result: PlotlyData[] = [];
    const eaIds = parseEaIds(markEaInput);
    for (const id of eaIds) {
      const s = structures.find(
        (s2) => s2.id === id && !s2.isUserAdded && coordMap.has(s2.id) && s2.enthalpyTotal <= 900,
      );
      if (!s) continue;
      const pos = coordMap.get(s.id)!;
      result.push({
        type: 'scatter3d',
        x: [pos.x],
        y: [pos.y],
        z: [pos.z],
        mode: 'markers+text',
        name: `EA${id}`,
        text: [`EA${id}`],
        textposition: 'top center',
        textfont: { size: 9, color: 'var(--color-text)' },
        marker: {
          symbol: 'circle-open',
          size: 8,
          color: '#ff4444',
          line: { width: 2 },
        },
        hoverinfo: 'text',
        hovertext: getHoverText(s.id, s.formula),
        customdata: [s.id],
        showlegend: false,
      });
    }
    return result;
  }, [structures, coordMap, markEaInput, getHoverText]);

  // ── Build Plotly traces ──
  const traces: PlotlyData[] = useMemo(() => {
    const ts: PlotlyData[] = [];

    // 1a. Envelope surface (mesh3d) — external hull boundary faces
    if (showHullSurface && hullSurface && hullSurface.envelopeI.length > 0) {
      ts.push({
        type: 'mesh3d',
        x: hullSurface.meshX,
        y: hullSurface.meshY,
        z: hullSurface.meshZ,
        i: hullSurface.envelopeI,
        j: hullSurface.envelopeJ,
        k: hullSurface.envelopeK,
        name: 'Hull Envelope',
        color: 'rgba(80, 120, 220, 0.18)',
        opacity: 0.18,
        hoverinfo: 'skip',
        showlegend: true,
      });
    }

    // 1b. Internal partition faces (mesh3d) — shared between adjacent tetrahedral cells
    if (showHullSurface && hullSurface && hullSurface.partitionI.length > 0) {
      ts.push({
        type: 'mesh3d',
        x: hullSurface.meshX,
        y: hullSurface.meshY,
        z: hullSurface.meshZ,
        i: hullSurface.partitionI,
        j: hullSurface.partitionJ,
        k: hullSurface.partitionK,
        name: 'Internal Partitions',
        color: 'rgba(220, 120, 80, 0.25)',
        opacity: 0.25,
        hoverinfo: 'skip',
        showlegend: true,
      });
    }

    // 2. Hull edge wireframe
    if (hullSurface && hullSurface.edgeX.length > 0) {
      ts.push({
        type: 'scatter3d',
        x: hullSurface.edgeX,
        y: hullSurface.edgeY,
        z: hullSurface.edgeZ,
        mode: 'lines',
        name: 'Hull Edges',
        line: { color: 'rgba(80,80,160,0.8)', width: 1.5 },
        hoverinfo: 'skip',
        showlegend: true,
      });
    }

    // 3. Tetrahedron wireframe (grey, dashed)
    ts.push({
      type: 'scatter3d',
      x: wireframe.x,
      y: wireframe.y,
      z: wireframe.z,
      mode: 'lines',
      name: 'Tetrahedron',
      line: { color: 'rgba(128,128,128,0.35)', width: 1, dash: 'dot' },
      hoverinfo: 'skip',
      showlegend: false,
    });

    // 4. Stable points (fitness === 0) — red diamonds
    if (stablePts.length > 0) {
      ts.push({
        type: 'scatter3d',
        x: stablePts.map((p) => p.x),
        y: stablePts.map((p) => p.y),
        z: stablePts.map((p) => p.z),
        mode: 'markers',
        name: t('hull.stablePhases', 'Stable Phases'),
        marker: {
          symbol: 'diamond',
          size: 5,
          color: '#e63946',
          line: { width: 1, color: '#a00' },
        },
        text: stablePts.map((p) => getHoverText(p.id, p.formula)),
        hoverinfo: 'text',
        customdata: stablePts.map((p) => p.id),
        showlegend: true,
      });
    }

    // 5. Unstable points — colored by fitness (Viridis colorscale)
    if (unstablePts.length > 0) {
      const fitnessVals = unstablePts.map((p) => p.fitness);
      ts.push({
        type: 'scatter3d',
        x: unstablePts.map((p) => p.x),
        y: unstablePts.map((p) => p.y),
        z: unstablePts.map((p) => p.z),
        mode: 'markers',
        name: `Fitness ≤ ${fitnessMax.toFixed(3)}`,
        marker: {
          symbol: 'circle',
          size: 3,
          color: fitnessVals,
          colorscale: 'Viridis',
          colorbar: {
            title: { text: 'Fitness (eV/block)', font: PLOTLY_FONT },
            tickfont: PLOTLY_FONT,
            len: 0.5,
          },
          cmin: 0,
          cmax: fitnessMax,
        },
        text: unstablePts.map((p) => getHoverText(p.id, p.formula)),
        hoverinfo: 'text',
        customdata: unstablePts.map((p) => p.id),
        showlegend: true,
      });
    }

    // 6. User-added points
    if (userAddedPts.length > 0) {
      ts.push({
        type: 'scatter3d',
        x: userAddedPts.map((p) => p.x),
        y: userAddedPts.map((p) => p.y),
        z: userAddedPts.map((p) => p.z),
        mode: 'markers',
        name: 'User Added',
        marker: {
          symbol: 'circle-open',
          size: 4,
          color: '#ff6600',
          line: { width: 2 },
        },
        text: userAddedPts.map((p) => getHoverText(p.id, p.formula)),
        hoverinfo: 'text',
        customdata: userAddedPts.map((p) => p.id),
        showlegend: true,
      });
    }

    // 7. Vertex labels
    ts.push({
      type: 'scatter3d',
      x: vertexLabels.map((v) => v.x),
      y: vertexLabels.map((v) => v.y),
      z: vertexLabels.map((v) => v.z),
      mode: 'text',
      text: vertexLabels.map((v) => v.label),
      textfont: { size: 12, color: 'var(--color-text)' },
      hoverinfo: 'skip',
      showlegend: false,
    });

    // 8. Tag overlays
    for (const t of tagOverlayTraces) ts.push(t);

    // 9. EA overlays
    for (const ea of eaOverlayTraces) ts.push(ea);

    return ts;
  }, [
    wireframe, hullSurface, showHullSurface,
    stablePts, unstablePts, userAddedPts, vertexLabels,
    tagOverlayTraces, eaOverlayTraces,
    fitnessMax, maxFitness, getHoverText, t,
  ]);

  // ── Layout ──
  const layout: Partial<PlotlyLayout> = useMemo(() => {
    const plotlyTheme = getPlotlyTheme(theme);

    const initialCamera = cameraRef.current ?? {
      eye: { x: 1.2, y: 1.0, z: 0.9 },
      center: { x: 0, y: 0, z: 0 },
    };

    return {
      ...plotlyTheme,
      font: { ...PLOTLY_FONT },
      dragmode: 'turntable',
      scene: {
        xaxis: { title: '', showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
        yaxis: { title: '', showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
        zaxis: { title: '', showgrid: false, zeroline: false, showticklabels: false, showspikes: false },
        camera: initialCamera,
        aspectmode: 'data',
      },
      margin: { l: 0, r: 0, t: 30, b: 0 },
      showlegend: true,
      legend: { x: 0.01, y: 0.99, font: PLOTLY_FONT, bgcolor: 'rgba(0,0,0,0)' },
      hovermode: 'closest' as const,
    };
  }, [theme]);

  // ── Click handler ──
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
    [traces, structures, onStructureClick, openViewer],
  );

  // ── CSV export (current visible data) ──
  const handleExport = useCallback(() => {
    const allPts = [...stablePts, ...unstablePts, ...userAddedPts];
    const elements = systemInfo.elements;
    const tag = fitnessMax.toFixed(3).replace('.', 'p');
    const headers = ['EA', 'Formula', 'Composition', 'Enthalpy(eV/atom)', 'Fitness(eV/block)', 'SpaceGroup', 'Generation', 'Origin'];
    const rows = allPts.map((p) => ({
      EA: String(p.id),
      Formula: p.formula,
      Composition: `[${p.s.composition.join(', ')}]`,
      'Enthalpy(eV/atom)': p.enthalpy.toFixed(6),
      'Fitness(eV/block)': p.fitness.toFixed(6),
      SpaceGroup: String(p.spaceGroup),
      Generation: String(p.generation),
      Origin: p.origin,
    }));
    downloadCsv(
      `${elements.join('-')}_quaternary_hull_fitness${tag}`,
      headers,
      rows,
    );
  }, [stablePts, unstablePts, userAddedPts, systemInfo, fitnessMax]);

  // ── Config ──
  const config = useMemo(() => ({
    displayModeBar: false,
    responsive: true,
    scrollZoom: true,
  }), []);

  return (
    <div>
      {/* Fitness slider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {'Fitness (eV/block) ≤ '}
        </span>
        <input
          type="number"
          min={0}
          max={maxFitness}
          step={0.001}
          value={fitnessMax}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0 && v <= maxFitness) handleFitnessChange(v);
          }}
          style={{
            width: 80,
            padding: '2px 6px',
            fontSize: 12,
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
        <input
          type="range"
          min={0}
          max={maxFitness}
          step={0.001}
          value={fitnessMax}
          onChange={(e) => handleFitnessChange(parseFloat(e.target.value))}
          style={{ flex: 1, minWidth: 100, maxWidth: 300 }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {fitnessMax.toFixed(3)} / {maxFitness.toFixed(3)}
        </span>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={showHullSurface}
            onChange={(e) => {
              setShowHullSurface(e.target.checked);
              setRevision((r) => r + 1);
            }}
          />
          Hull Surfaces
        </label>
      </div>

      {/* Main chart */}
      <PlotFrame
        data={traces}
        layout={layout}
        config={config}
        revision={revision}
        style={{ height: CONVEX_HULL_PLOT_HEIGHT, width: '100%' }}
        onClick={handlePlotClick}
        onRelayout={handleRelayout}
      />

      {/* Bottom controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
        }}
      >
        <MarkPanel showTags={showTags} />
        {showExport && (
          <ExportDataButton onClick={handleExport} label={t('btn.exportCsv', 'Export CSV')} />
        )}
      </div>
    </div>
  );
}
