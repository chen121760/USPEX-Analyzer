/**
 * Master parser index.
 *
 * Orchestrates individual file parsers and merges their results into
 * a unified Structure[] array that powers the entire application.
 */

import type {
  Structure,
  SystemInfo,
  SystemType,
  OptimizationType,
  CompositionMode,
  USPEXFileType,
  DetectedFile,
  HullGeneration,
  ParsedExtendedHull,
  ParsedIndividual,
  ParsedPareto,
  ParsedMLProperties,
  ParsedOrigin,
  ParsedPoscar,
  OriginMethod,
} from '@/types/structure';

import { parseParameters } from './parametersParser';
import type { ParsedParameters } from '@/types/structure';
import { parseExtendedConvexHull } from './extendedHullParser';
import { parseIndividuals, type IndividualsParseResult } from './individualsParser';
import { parseParetoRanking, type ParetoParseResult } from './paretoParser';
import { parseMLProperties } from './mlPropertiesParser';
import { parseOrigin } from './originParser';
import { parseGatheredPoscars } from './poscarParser';
import { parseConvexHullGenerations } from './convexHullParser';
import { buildFormula, totalAtoms } from './compositionUtils';
import { reconstructConvexHull } from '@/lib/convexHullReconstruction';

// Re-export individual parsers for direct use
export {
  parseParameters,
  parseExtendedConvexHull,
  parseIndividuals,
  parseParetoRanking,
  parseMLProperties,
  parseOrigin,
  parseGatheredPoscars,
  parseConvexHullGenerations,
};

/** File contents keyed by detected type */
export interface FileContents {
  parameters?: string;
  extended_convex_hull?: string;
  individuals?: string;
  pareto_ranking?: string;
  ml_properties?: string;
  origin?: string;
  gathered_poscars?: string;
  gathered_poscars_unrelaxed?: string;
  convex_hull?: string;
}

/** Result of the full parsing pipeline */
export interface ParseResult {
  structures: Structure[];
  systemInfo: SystemInfo;
  hullGenerations: HullGeneration[];
  warnings: string[];
}

/**
 * Run the full parsing pipeline on all detected files.
 */
export function parseAllFiles(
  detectedFiles: DetectedFile[],
  fileContents: Map<USPEXFileType, string>,
): ParseResult {
  const warnings: string[] = [];

  // ---- Step 1: Parse each file ----

  // Parameters.txt
  let paramsResult: ParsedParameters | null = null;
  const paramContent = fileContents.get('parameters');
  if (paramContent) {
    paramsResult = parseParameters(paramContent);
  }

  // Elements: primary from Parameters.txt
  let elements = paramsResult?.elements ?? [];

  // Extended convex hull (primary data source for varcomp)
  let hullData: ParsedExtendedHull[] = [];
  const hullContent = fileContents.get('extended_convex_hull');
  if (hullContent) {
    hullData = parseExtendedConvexHull(hullContent);
  }

  // Individuals
  let individualsResult: IndividualsParseResult | null = null;
  const indContent = fileContents.get('individuals');
  if (indContent) {
    individualsResult = parseIndividuals(indContent);
  }

  // Pareto ranking
  let paretoResult: ParetoParseResult | null = null;
  const paretoContent = fileContents.get('pareto_ranking');
  if (paretoContent) {
    paretoResult = parseParetoRanking(paretoContent);
  }

  // ML Properties
  let mlData: ParsedMLProperties[] = [];
  const mlContent = fileContents.get('ml_properties');
  if (mlContent) {
    mlData = parseMLProperties(mlContent);
  }

  // Origin
  let originData: ParsedOrigin[] = [];
  const originContent = fileContents.get('origin');
  if (originContent) {
    originData = parseOrigin(originContent);
  }

  // POSCAR data
  let poscarMap = new Map<number, ParsedPoscar>();
  const poscarContent = fileContents.get('gathered_poscars');
  if (poscarContent) {
    poscarMap = parseGatheredPoscars(poscarContent);
  } else {
    warnings.push('gatheredPOSCARS not found — structure viewing will be unavailable');
  }

  // Convex hull generations
  let hullGenerations: HullGeneration[] = [];
  const hullGenContent = fileContents.get('convex_hull');
  if (hullGenContent) {
    hullGenerations = parseConvexHullGenerations(hullGenContent);
  }

  // ---- Step 1b: Determine system properties ----
  // Priority: Parameters.txt → inference from file presence/content

  let systemType: SystemType = 'binary';
  let optimizationType: OptimizationType = 'single';
  let compositionMode: CompositionMode = 'varcomp';
  let secondObjectiveName = '';

  if (paramsResult) {
    // From Parameters.txt
    const numComp = paramsResult.numComponents;
    if (numComp >= 3) systemType = 'ternary';
    else if (numComp === 2) systemType = 'binary';
    else if (numComp === 1) systemType = 'unary';

    compositionMode = paramsResult.isVarcomp ? 'varcomp' : 'fixed';
    optimizationType = paramsResult.optType.length > 1 ? 'multi' : 'single';
  }

  // Fallback inference when Parameters.txt is missing or incomplete
  if (!paramsResult || paramsResult.numComponents === 0) {
    // systemType from composition length
    const compLen = hullData.length > 0
      ? hullData[0].composition.length
      : individualsResult && individualsResult.data.length > 0
        ? individualsResult.data[0].composition.length
        : 0;
    systemType = compLen <= 1 ? 'unary' : compLen === 2 ? 'binary' : 'ternary';
  }

  if (!paramsResult) {
    // compositionMode from hull file presence
    compositionMode = hullContent ? 'varcomp' : 'fixed';
    // optimizationType from Pareto file presence
    const hasPareto = paretoResult !== null && paretoResult.data.length > 0;
    optimizationType = hasPareto ? 'multi' : 'single';
  }

  // Second objective name from Pareto or Individuals
  secondObjectiveName =
    paretoResult?.secondObjectiveName ??
    individualsResult?.secondObjectiveName ??
    '';

  // ---- Step 1c: If no extended_convex_hull but have Individuals, build from Individuals ----

  if (hullData.length === 0 && individualsResult) {
    if (compositionMode === 'fixed') {
      warnings.push('Fixed composition — no convex hull. Building structure list from Individuals file');
    } else {
      warnings.push('extended_convex_hull file not found — building from Individuals file');
    }
    const minEnthalpy = Math.min(
      ...individualsResult.data.map(
        (ind) => ind.enthalpy / Math.max(1, totalAtoms(ind.composition))
      )
    );
    hullData = individualsResult.data.map((ind) => ({
      id: ind.id,
      composition: ind.composition,
      enthalpy: ind.enthalpy / Math.max(1, totalAtoms(ind.composition)),
      volume: ind.volume / Math.max(1, totalAtoms(ind.composition)),
      fitness: ind.enthalpy / Math.max(1, totalAtoms(ind.composition)) - minEnthalpy, // unknown / not meaningful for fixed
      symm: ind.symm,
      x: [0], // no meaningful composition coordinate
      y: 0,
    }));
  } else if (hullData.length === 0 && !individualsResult) {
    warnings.push('No extended_convex_hull or Individuals file found — very limited functionality');
  }

  // Override systemType from actual composition data if Parameters.txt was wrong/missing
  if (hullData.length > 0) {
    const actualCompLen = hullData[0].composition.length;
    const inferred: SystemType = actualCompLen <= 1 ? 'unary' : actualCompLen === 2 ? 'binary' : 'ternary';
    if (!paramsResult || paramsResult.numComponents === 0) {
      systemType = inferred;
    }
  }

  // ---- Step 2: Build lookup maps ----

  const individualsMap = new Map<number, ParsedIndividual>();
  if (individualsResult) {
    for (const ind of individualsResult.data) {
      // Keep the one with lowest enthalpy if duplicates
      const existing = individualsMap.get(ind.id);
      if (!existing || ind.enthalpy < existing.enthalpy) {
        individualsMap.set(ind.id, ind);
      }
    }
  }

  const paretoMap = new Map<number, ParsedPareto>();
  if (paretoResult) {
    for (const p of paretoResult.data) {
      paretoMap.set(p.id, p);
    }
  }

  const mlMap = new Map<number, ParsedMLProperties>();
  for (const ml of mlData) {
    mlMap.set(ml.id, ml);
  }

  const originMap = new Map<number, ParsedOrigin>();
  for (const o of originData) {
    originMap.set(o.id, o);
  }

  // ---- Step 3: Merge into unified Structure records ----

  const structures: Structure[] = hullData.map((hull) => {
    const ind = individualsMap.get(hull.id);
    const pareto = paretoMap.get(hull.id);
    const ml = mlMap.get(hull.id);
    const orig = originMap.get(hull.id);
    const poscar = poscarMap.get(hull.id);

    const nAtoms = totalAtoms(hull.composition);
    const formula =
      poscar?.formula ??
      (elements.length > 0 ? buildFormula(hull.composition, elements) : `ID${hull.id}`);

    // Build dynamic extraProps from second objective values
    const extraProps: Record<string, number> = {};
    if (secondObjectiveName) {
      if (ind !== undefined) {
        extraProps[`${secondObjectiveName}-Individuals`] = ind.secondObjectiveValue;
      }
      if (pareto !== undefined) {
        extraProps[`${secondObjectiveName}-Pareto_ranking`] = pareto.secondObjectiveValue;
      }
    }

    const structure: Structure = {
      // Identity
      id: hull.id,
      formula,
      composition: hull.composition,
      generation: ind?.generation ?? 0,

      // Thermodynamic
      enthalpy: hull.enthalpy,
      enthalpyTotal: ind?.enthalpy ?? hull.enthalpy * nAtoms,
      volume: hull.volume,
      volumeTotal: ind?.volume ?? hull.volume * nAtoms,
      fitness: hull.fitness,
      spaceGroup: hull.symm || ind?.symm || 0,
      hullX: hull.x,
      hullY: hull.y,

      // Origin
      origin: (orig?.origin ?? ind?.origin ?? 'Unknown') as OriginMethod,
      parentIds: orig?.parentIds ?? [],
      parentEnthalpy: orig?.parentEnthalpy ?? 0,

      // Density
      density: ind?.density ?? pareto?.density ?? 0,

      // Pareto
      paretoFront: pareto?.paretoFront ?? -1,
      extraProps: Object.keys(extraProps).length > 0 ? extraProps : undefined,

      // ML Properties
      bulkModulus: ml?.bulkModulus ?? -1,
      shearModulus: ml?.shearModulus ?? -1,
      youngModulus: ml?.youngModulus ?? -1,
      poissonRatio: ml?.poissonRatio ?? -1,
      pughRatio: ml?.pughRatio ?? -1,
      vickersHardness: ml?.vickersHardness ?? -1,
      fractureToughness: ml?.fractureToughness ?? -1,

      // Fingerprint
      qEntropy: ind?.qEntropy ?? 0,
      aOrder: ind?.aOrder ?? 0,
      sOrder: ind?.sOrder ?? 0,

      // KPOINTS
      kpoints: ind?.kpoints,

      // POSCAR
      poscarData: poscar?.poscarText,
      latticeParams: poscar?.latticeParams,

      // Convex hull reconstruction (computed later)
      eForm: 0,
      eHullRecons: 0,

      // User data (empty by default)
      tags: [],
      isUserAdded: false,
      notes: '',
    };

    return structure;
  });

  // ---- Step 3b: Add Individuals-only structures (not in hull) ----

  if (individualsResult && hullData.length > 0) {
    const hullIdSet = new Set(hullData.map((h) => h.id));

    for (const [id, ind] of individualsMap) {
      if (hullIdSet.has(id)) continue;

      const nAtoms = totalAtoms(ind.composition);
      const enthalpyPerAtom = nAtoms > 0 ? ind.enthalpy / nAtoms : ind.enthalpy;
      const volumePerAtom = nAtoms > 0 ? ind.volume / nAtoms : ind.volume;

      let hullX: number[];
      if (systemType === 'binary' && ind.composition.length === 2) {
        hullX = [ind.composition[1] / Math.max(1, nAtoms)];
      } else if (systemType === 'ternary' && ind.composition.length >= 3) {
        hullX = ind.composition.slice(1).map((c) => c / Math.max(1, nAtoms));
      } else {
        hullX = [0];
      }

      const pareto = paretoMap.get(id);
      const ml = mlMap.get(id);
      const orig = originMap.get(id);
      const poscar = poscarMap.get(id);
      const formula =
        poscar?.formula ??
        (elements.length > 0 ? buildFormula(ind.composition, elements) : `ID${id}`);

      structures.push({
        id,
        formula,
        composition: ind.composition,
        generation: ind.generation,
        enthalpy: enthalpyPerAtom,
        enthalpyTotal: ind.enthalpy,
        volume: volumePerAtom,
        volumeTotal: ind.volume,
        fitness: NaN,
        spaceGroup: ind.symm,
        hullX,
        hullY: enthalpyPerAtom,
        origin: (orig?.origin ?? ind.origin ?? 'Unknown') as OriginMethod,
        parentIds: orig?.parentIds ?? [],
        parentEnthalpy: orig?.parentEnthalpy ?? 0,
        density: ind.density ?? pareto?.density ?? 0,
        paretoFront: pareto?.paretoFront ?? -1,
        extraProps: (() => {
          if (!secondObjectiveName) return undefined;
          const ep: Record<string, number> = {};
          ep[`${secondObjectiveName}-Individuals`] = ind.secondObjectiveValue;
          if (pareto !== undefined) ep[`${secondObjectiveName}-Pareto_ranking`] = pareto.secondObjectiveValue;
          return ep;
        })(),
        bulkModulus: ml?.bulkModulus ?? -1,
        shearModulus: ml?.shearModulus ?? -1,
        youngModulus: ml?.youngModulus ?? -1,
        poissonRatio: ml?.poissonRatio ?? -1,
        pughRatio: ml?.pughRatio ?? -1,
        vickersHardness: ml?.vickersHardness ?? -1,
        fractureToughness: ml?.fractureToughness ?? -1,
        qEntropy: ind.qEntropy ?? 0,
        aOrder: ind.aOrder ?? 0,
        sOrder: ind.sOrder ?? 0,
        kpoints: ind.kpoints,
        poscarData: poscar?.poscarText,
        latticeParams: poscar?.latticeParams,
        // Convex hull reconstruction (computed later)
        eForm: 0,
        eHullRecons: 0,
        tags: [],
        isUserAdded: false,
        notes: '',
      });
    }
  }

  // ---- Step 3c: Reconstruct convex hull (compute eForm / eHullRecons) ----
  reconstructConvexHull(structures, systemType, compositionMode, elements);

  // ---- Step 4: Build system info ----

  const fitnessValues = structures.map((s) => s.fitness).filter((f) => f >= 0);
  const unconvergedCount = structures.filter((s) => s.enthalpyTotal > 900).length;
  const enthalpyValues = structures
    .filter((s) => !isNaN(s.enthalpy) && isFinite(s.enthalpy) && s.enthalpyTotal <= 900)
    .map((s) => s.enthalpy);

  const primarySource = hullContent && indContent
    ? 'extended_convex_hull + Individuals'
    : hullContent ? 'extended_convex_hull'
    : indContent ? 'Individuals'
    : 'unknown';

  const systemInfo: SystemInfo = {
    elements,
    systemType,
    optimizationType,
    compositionMode,
    secondObjectiveName,
    totalStructures: structures.length,
    totalStructuresSource: primarySource,
    totalGenerations: individualsResult?.maxGeneration ?? hullGenerations.length,
    stableCount: structures.filter((s) => s.fitness === 0).length,
    unconvergedCount,
    minEnthalpy: enthalpyValues.length > 0 ? Math.min(...enthalpyValues) : 0,
    maxFitness: fitnessValues.length > 0 ? Math.max(...fitnessValues) : 0,
    calculationType: paramsResult?.calculationType ?? 0,
    externalPressure: paramsResult?.externalPressure ?? null,
    isPickup: paramsResult?.isPickup ?? false,
    pickUpGen: paramsResult?.pickUpGen ?? 0,
    pickUpFolder: paramsResult?.pickUpFolder ?? 0,
  };

  return {
    structures,
    systemInfo,
    hullGenerations,
    warnings,
  };
}
