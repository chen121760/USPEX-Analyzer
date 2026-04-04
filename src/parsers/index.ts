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
    // Infer elements from Individuals if Parameters.txt not provided
    if (elements.length === 0 && individualsResult.data.length > 0) {
      const compLen = individualsResult.data[0].composition.length;
      elements = Array.from({ length: compLen }, (_, i) => `Elem${i + 1}`);
      warnings.push('Parameters.txt not found — using placeholder element names');
    }
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
    hullData = individualsResult.data.map((ind) => ({
      id: ind.id,
      composition: ind.composition,
      enthalpy: ind.enthalpy / Math.max(1, totalAtoms(ind.composition)),
      volume: ind.volume / Math.max(1, totalAtoms(ind.composition)),
      fitness: -1, // unknown / not meaningful for fixed
      symm: ind.symm,
      x: [0], // no meaningful composition coordinate
      y: 0,
    }));
  } else if (hullData.length === 0 && !individualsResult) {
    warnings.push('No extended_convex_hull or Individuals file found — very limited functionality');
  }

  // Infer elements from POSCAR if still unknown
  if (elements.length === 0 && poscarMap.size > 0) {
    const firstPoscar = poscarMap.values().next().value;
    if (firstPoscar && firstPoscar.elements.length > 0) {
      elements = firstPoscar.elements;
    }
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
      paretoFront: pareto?.paretoFront,
      secondObjective: pareto?.secondObjective ?? ind?.secondObjective,

      // ML Properties
      bulkModulus: ml?.bulkModulus,
      shearModulus: ml?.shearModulus,
      youngModulus: ml?.youngModulus,
      poissonRatio: ml?.poissonRatio,
      pughRatio: ml?.pughRatio,
      vickersHardness: ml?.vickersHardness,
      fractureToughness: ml?.fractureToughness,

      // Fingerprint
      qEntropy: ind?.qEntropy,
      aOrder: ind?.aOrder,
      sOrder: ind?.sOrder,

      // KPOINTS
      kpoints: ind?.kpoints,

      // POSCAR
      poscarData: poscar?.poscarText,
      latticeParams: poscar?.latticeParams,

      // User data (empty by default)
      tags: [],
      isUserAdded: false,
      notes: '',
    };

    return structure;
  });

  // ---- Step 4: Build system info ----

  const fitnessValues = structures.map((s) => s.fitness).filter((f) => f >= 0);
  const enthalpyValues = structures.map((s) => s.enthalpy).filter((e) => !isNaN(e) && e < 900);

  const primarySource = hullContent ? 'extended_convex_hull' : (indContent ? 'Individuals' : 'unknown');

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
    minEnthalpy: enthalpyValues.length > 0 ? Math.min(...enthalpyValues) : 0,
    maxFitness: fitnessValues.length > 0 ? Math.max(...fitnessValues) : 0,
  };

  return {
    structures,
    systemInfo,
    hullGenerations,
    warnings,
  };
}
