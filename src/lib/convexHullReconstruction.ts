/**
 * Convex hull reconstruction for USPEX Analyzer.
 *
 * Computes independently:
 *   - eForm: formation enthalpy per atom, or per numSpecies block
 *   - eHullRecons: distance above the reconstructed convex hull in the same unit,
 *     or relative per-atom enthalpy for fixed composition (no references needed)
 *
 * When the run supplies its own hull distances (`extended_convex_hull`), the
 * hull geometry is the set of `fitness === 0` structures and we only recompute
 * E_form with our own reference potentials, plus the distance to that known
 * hull.  When it does not — an interrupted run leaves `extended_convex_hull`
 * header-only — no structure has a hull distance and the lower hull is rebuilt
 * from all converged structures instead.
 */
import {
  buildFormula,
  componentAmountsFromComposition,
  compositionBasisRank,
  ternaryToCartesian,
  totalAtoms,
} from '@/parsers/compositionUtils';
import {
  computeQuaternaryLowerPlanes,
  quaternaryHullDistance,
  type Point4D,
} from '@/lib/quaternaryHull';
import type { Structure, SystemType, CompositionMode } from '@/types/structure';
import { binaryHullDistance, computeLowerHull2D, type Point2D, type Point3D } from './hullGeometry';
import { buildTernaryHullGeometry } from '@/domain/hull/ternaryHullGeometry';
export { binaryHullDistance, computeLowerHull2D, computeTernaryLowerFaces, ternaryHullDistanceFromFaces, ternaryHullDistance } from './hullGeometry';
export type { Point2D, Point3D, TernaryLowerFace } from './hullGeometry';

// ── Reference potentials ──

/**
 * Reference chemical potentials are extracted from exact endmembers only: a
 * structure whose composition consists solely of one component — a pure
 * elemental phase for the atomic basis, a single numSpecies block for the
 * composition-block basis.
 *
 * Near-endmember phases are deliberately rejected.  Using A19B1 as the "A"
 * reference shifts every reported formation enthalpy by roughly
 * (mu_B - mu_A + dHf(A19B1)) / 20, which is the same order of magnitude as the
 * physics being reported, and it makes E_form depend on which phases the search
 * happened to visit rather than on the elements themselves.  When a component
 * has no exact endmember the potential is reported as missing and the affected
 * structures are marked invalid instead of receiving a pseudo-reference.
 *
 * Reference extraction is a pure function of the structure set: it must be
 * invariant under any permutation of the input rows.  The previous
 * implementation nested the enthalpy update inside the purity update
 * (`if (frac > maxFrac) { maxFrac = frac; if (frac >= 0.95 && ...) }`), so two
 * equally pure phases could never be compared and the extracted potential was
 * decided by which row of Individuals came first.
 */
export interface ReferenceResolution {
  /** Normalization the potentials are expressed in. */
  kind: 'elemental' | 'component';
  /** Energy unit of formation enthalpies computed with these potentials. */
  unit: 'eV/atom' | 'eV/block';
  /** Component labels aligned with `potentials`. */
  labels: string[];
  /** Known potentials; NaN for every index listed in `missing`. */
  potentials: number[];
  /** Component indices that have no exact endmember in this dataset. */
  missing: number[];
  /** Convenience flag: `missing.length === 0`. */
  complete: boolean;
  /** Why the resolution is incomplete (or 'ok'). */
  reason: 'ok' | 'missing-endmember' | 'rank-deficient';
}

/** Relative tolerance for "all other components are zero". */
const ENDMEMBER_TOLERANCE = 1e-9;

/**
 * Distances at or below this value are reported as exactly zero.
 *
 * USPEX prints Ed with four decimals and treats a printed 0.0000 as "on the
 * hull"; the hull views select stable structures with `fitness === 0`, so the
 * reconstructed distance has to be snapped to the same grid instead of relying
 * on raw floating-point noise.
 */
const HULL_ZERO_TOLERANCE = 1e-4;

/** True when the declared numSpecies basis is usable for this dataset. */
export function usesComponentBasis(
  compositionMode: CompositionMode,
  compositionBasis: number[][],
): boolean {
  return compositionMode === 'varcomp' &&
    compositionBasis.length >= 2 &&
    compositionBasisRank(compositionBasis) === compositionBasis.length;
}

/** True when every component except `index` is zero. */
function isEndmemberOf(amounts: number[], index: number): boolean {
  if (!(amounts[index] > 0)) return false;
  for (let i = 0; i < amounts.length; i++) {
    if (i !== index && Math.abs(amounts[i]) > ENDMEMBER_TOLERANCE) return false;
  }
  return true;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Integer composition reduced by its gcd, e.g. `[2 4 0 6]` → `1-2-0-3`. */
function reducedCompositionKey(composition: readonly number[]): string {
  let divisor = 0;
  for (const value of composition) {
    const count = Math.round(value);
    if (count !== 0) divisor = greatestCommonDivisor(divisor, count);
  }
  if (!(divisor > 0)) return composition.map(() => '0').join('-');
  return composition.map((value) => Math.round(value) / divisor).join('-');
}

/**
 * Keep only the lowest-E_form structure per composition.
 *
 * A structure that is not the minimum at its own composition cannot lie on the
 * lower envelope (the minimum at that composition is a feasible convex
 * combination and sits strictly below it), so dropping the rest leaves the hull
 * — and therefore every distance — unchanged.  A USPEX run stores thousands of
 * duplicates, and the hull algorithms are super-linear, so this is the
 * difference between a snappy parse and a slow one.
 */
function lowestPerComposition(
  structures: readonly Structure[],
  keyOf: (structure: Structure) => string,
): Structure[] {
  const best = new Map<string, Structure>();
  for (const structure of structures) {
    const key = keyOf(structure);
    const current = best.get(key);
    if (!current || structure.eForm < current.eForm) best.set(key, structure);
  }
  return Array.from(best.values());
}

/** Total energy of one structure in eV (cell), not per atom. */
function totalEnergyOf(s: Structure): number {
  return Number.isFinite(s.enthalpyTotal)
    ? s.enthalpyTotal
    : s.enthalpy * totalAtoms(s.composition);
}

function missingIndices(potentials: number[]): number[] {
  const missing: number[] = [];
  for (let i = 0; i < potentials.length; i++) {
    if (!Number.isFinite(potentials[i])) missing.push(i);
  }
  return missing;
}

/**
 * Resolve the reference potentials of a dataset.
 *
 * `kind: 'component'` is used when a valid numSpecies basis is declared,
 * otherwise the atomic (elemental) basis is used.  Callers that need to report
 * missing references must use this function: the -1 written into `eForm` is a
 * display sentinel and must never be used to infer reference availability.
 */
export function resolveReferences(
  structures: Structure[],
  elements: string[],
  compositionMode: CompositionMode,
  compositionBasis: number[][] = [],
): ReferenceResolution {
  // Only converged USPEX structures define a reference, and never user-added
  // ones: a user-added enthalpy is a hypothesis, not a measurement.
  const usable = structures.filter(
    (s) => !s.isUserAdded && s.enthalpyTotal <= 900,
  );

  if (usesComponentBasis(compositionMode, compositionBasis)) {
    const componentCount = compositionBasis.length;
    const labels = compositionBasis.map((row) => buildFormula(row, elements));
    const potentials: number[] = new Array(componentCount).fill(Number.NaN);
    for (const s of usable) {
      const amounts = componentAmountsFromComposition(s.composition, compositionBasis);
      if (!amounts) continue;
      const totalBlocks = amounts.reduce((sum, value) => sum + value, 0);
      if (!(totalBlocks > 0)) continue;
      const perBlock = totalEnergyOf(s) / totalBlocks;
      for (let i = 0; i < componentCount; i++) {
        if (!isEndmemberOf(amounts, i)) continue;
        // Several polymorphs of one endmember may exist: keep the ground state.
        if (!Number.isFinite(potentials[i]) || perBlock < potentials[i]) {
          potentials[i] = perBlock;
        }
      }
    }
    const missing = missingIndices(potentials);
    return {
      kind: 'component',
      unit: 'eV/block',
      labels,
      potentials,
      missing,
      complete: missing.length === 0,
      reason: missing.length === 0 ? 'ok' : 'missing-endmember',
    };
  }

  const labels = [...elements];
  const potentials: number[] = new Array(elements.length).fill(Number.NaN);
  for (const s of usable) {
    const total = totalAtoms(s.composition);
    if (!(total > 0)) continue;
    for (let i = 0; i < elements.length; i++) {
      if (!isEndmemberOf(s.composition, i)) continue;
      if (!Number.isFinite(potentials[i]) || s.enthalpy < potentials[i]) {
        potentials[i] = s.enthalpy;
      }
    }
  }
  const missing = missingIndices(potentials);
  return {
    kind: 'elemental',
    unit: 'eV/atom',
    labels,
    potentials,
    missing,
    complete: missing.length === 0,
    reason: missing.length === 0 ? 'ok' : 'missing-endmember',
  };
}

// ── Formation enthalpy ──

/**
 * Standard formation enthalpy of one structure, in the resolution's unit.
 *
 * Returns null when the value is not defined for this structure: either its
 * composition needs a reference potential the dataset does not provide, or the
 * composition cannot be expressed in the declared composition basis.  Callers
 * must treat null as "not available" and must not decide membership by
 * comparing a computed value against the -1 sentinel.
 */
export function computeFormationEnthalpyWith(
  s: Structure,
  references: ReferenceResolution,
  compositionBasis: number[][] = [],
): number | null {
  if (references.kind === 'component') {
    const amounts = componentAmountsFromComposition(s.composition, compositionBasis);
    if (!amounts) return null;
    const totalBlocks = amounts.reduce((sum, value) => sum + value, 0);
    if (!(totalBlocks > 0)) return null;
    let eForm = totalEnergyOf(s) / totalBlocks;
    for (let i = 0; i < amounts.length; i++) {
      if (amounts[i] === 0) continue;
      const potential = references.potentials[i];
      if (!Number.isFinite(potential)) return null;
      eForm -= (amounts[i] / totalBlocks) * potential;
    }
    return eForm;
  }

  const total = totalAtoms(s.composition);
  if (!(total > 0)) return null;
  let eForm = totalEnergyOf(s) / total; // eV/atom
  for (let i = 0; i < s.composition.length; i++) {
    if (s.composition[i] === 0) continue;
    const potential = references.potentials[i];
    if (!Number.isFinite(potential)) return null;
    eForm -= (s.composition[i] / total) * potential;
  }
  return eForm;
}

// ── Main orchestrator ──

/**
 * Compute eForm and eHullRecons for all USPEX structures.
 * Mutates the structures array in place and returns the reference resolution
 * used, so callers can report missing references instead of guessing from the
 * -1 sentinel written into `eForm`.
 */
export function reconstructConvexHull(
  structures: Structure[],
  systemType: SystemType,
  compositionMode: CompositionMode,
  elements: string[],
  compositionBasis: number[][] = [],
): ReferenceResolution {
  const declaredBasis = compositionMode === 'varcomp' && compositionBasis.length >= 2;
  const basisLabels = declaredBasis
    ? compositionBasis.map((row) => buildFormula(row, elements))
    : [];
  const rankDeficient: ReferenceResolution = {
    kind: 'component',
    unit: 'eV/block',
    labels: basisLabels,
    potentials: new Array(compositionBasis.length).fill(Number.NaN),
    missing: compositionBasis.map((_, index) => index),
    complete: false,
    reason: 'rank-deficient',
  };
  if (declaredBasis && compositionBasisRank(compositionBasis) !== compositionBasis.length) {
    // Linearly dependent blocks: no structure has unique block coordinates, so
    // neither E_form nor E_hull is defined for this dataset.
    for (const s of structures) {
      s.eForm = -1;
      s.eHullRecons = -1;
    }
    return rankDeficient;
  }

  // A composition-block hull is normalized per block; the atomic basis
  // naturally reduces to the ordinary elemental eV/atom formulation.
  const references = resolveReferences(structures, elements, compositionMode, compositionBasis);
  const useCompositionBasis = references.kind === 'component';

  // Structures whose E_form is not defined.  This set — not a comparison
  // against the -1 sentinel — decides hull membership, so a legitimate E_form
  // of exactly -1 is not mistaken for a missing value.
  const undefinedFormation = new Set<Structure>();

  // Step 1: Compute E_form for all structures
  for (const s of structures) {
    const formation = !Number.isFinite(s.enthalpyTotal) || s.enthalpyTotal > 900
      ? null
      : computeFormationEnthalpyWith(s, references, compositionBasis);
    if (formation === null) {
      s.eForm = -1;
      s.eHullRecons = -1;
      undefinedFormation.add(s);
    } else {
      s.eForm = formation;
    }
  }

  // Relative energy at a fixed stoichiometry does not need elemental references.
  // Group proportional cells together and keep genuine USPEX fitness where supplied.
  if (compositionMode === 'fixed') {
    const valid = structures.filter(s => !s.isUserAdded && Number.isFinite(s.enthalpyTotal)
      && s.enthalpyTotal <= 900 && totalAtoms(s.composition) > 0);
    const minima = new Map<string, number>();
    const keyOf = (s: Structure) => s.composition.map(n => (n / totalAtoms(s.composition)).toFixed(10)).join(',');
    const energyOf = (s: Structure) => s.enthalpyTotal / totalAtoms(s.composition);
    for (const s of valid) minima.set(keyOf(s), Math.min(minima.get(keyOf(s)) ?? Infinity, energyOf(s)));
    for (const s of valid) {
      // A real relative distance cannot disambiguate the legacy -1 E_form
      // sentinel: use NaN when the formation reference itself is unavailable.
      if (undefinedFormation.has(s)) s.eForm = Number.NaN;
      const distance = Math.max(0, energyOf(s) - minima.get(keyOf(s))!);
      s.eHullRecons = distance <= HULL_ZERO_TOLERANCE ? 0 : distance;
    }
    return references;
  }

  const converged = structures.filter(
    (s) => !s.isUserAdded && s.enthalpyTotal <= 900 && !undefinedFormation.has(s),
  );

  // Does any structure carry a genuine hull distance?  Only USPEX's own output
  // (extended_convex_hull, or an Individuals Fitness column) provides one.  An
  // interrupted run has none — it writes the extended_convex_hull header but no
  // rows — and then the hull must come from the structures themselves.  (The
  // energy above the run's single lowest per-atom enthalpy is NOT a hull
  // distance: outside a single composition it makes the most cohesive pure
  // element the only "stable" phase.)
  const hasKnownFitness = structures.some((s) => s.fitness >= 0);

  // ...but "some structures have an Ed" is not "every structure has one".
  // USPEX's extended_convex_hull lists only the near-hull subset of a run (the
  // MgO–HfO2 sample has 350 rows for 4150 structures), so a run can be partly
  // measured.  Rows without an Ed are *unknown*, not "on the hull": they stay
  // hull candidates, and their distance has to come from the reconstruction
  // instead of being left at NaN — otherwise most of the data set is never
  // classified and the hull is built from a subset that may miss its vertices.
  const partialFitness = hasKnownFitness && converged.some((s) => !(s.fitness >= 0));

  /**
   * Snap reconstructed distances to the hull grid. Raw USPEX fitness is never
   * filled from this result: missing measurements must remain missing.
   */
  const finalize = (): ReferenceResolution => {
    for (const s of converged) {
      if (s.eHullRecons >= 0 && s.eHullRecons <= HULL_ZERO_TOLERANCE) s.eHullRecons = 0;
    }
    return references;
  };

  // Hull geometry: every structure that is not *known* to sit above the hull.
  // With a complete set of hull distances that is exactly the stable subset;
  // with a partial (or empty) one, the structures without a distance are
  // candidates too, so a hull vertex the file omitted is still found.  Either
  // way only the lowest-E_form structure per composition can be a vertex.
  const hullGeometry = lowestPerComposition(
    hasKnownFitness && !partialFitness ? converged.filter((s) => s.fitness <= 0) : converged,
    (s) => reducedCompositionKey(s.composition),
  );

  // Variable composition
  if (systemType === 'binary') {
    // Binary: hull from fitness=0 structures (or from all of them when unknown)
    const hullCandidates: Point2D[] = hullGeometry
      .map((s) => ({ x: s.hullX[0] ?? 0, y: s.eForm }))
      .sort((a, b) => a.x - b.x);
    const hullPoints = computeLowerHull2D(hullCandidates);

    for (const s of converged) {
      const x = s.hullX[0] ?? 0;
      s.eHullRecons = binaryHullDistance(x, s.eForm, hullPoints);
    }
  } else if (systemType === 'ternary') {
    // Ternary: hull from fitness=0 structures in 3D
    const hullPoints3D: Point3D[] = hullGeometry.map((s) => {
      const plotComposition = useCompositionBasis
        ? componentAmountsFromComposition(s.composition, compositionBasis) ?? s.composition
        : s.composition;
      const [cx, cy] = ternaryToCartesian(plotComposition);
      return { x: cx, y: cy, z: s.eForm };
    });

    // Use the same projection-rank-aware lower envelope as the workshop/tie lines.
    const geometry = buildTernaryHullGeometry(hullPoints3D);

    for (const s of converged) {
      const plotComposition = useCompositionBasis
        ? componentAmountsFromComposition(s.composition, compositionBasis) ?? s.composition
        : s.composition;
      const [cx, cy] = ternaryToCartesian(plotComposition);
      const distance = geometry.distance({ x: cx, y: cy, z: s.eForm });
      s.eHullRecons = Number.isFinite(distance) ? distance : -1;
    }
  } else if (systemType === 'quaternary') {
    if (hasKnownFitness && !partialFitness) {
      // USPEX already provides the hull distance for the whole run; reuse it.
      for (const s of converged) {
        s.eHullRecons = s.fitness >= 0 ? s.fitness : 0;
      }
    } else {
      // Rebuild the 4D lower hull of (3 mole fractions, E_form) and measure the
      // vertical distance to it.
      const coordinateOf = (s: Structure): [number, number, number] | null => {
        const plotComposition = useCompositionBasis
          ? componentAmountsFromComposition(s.composition, compositionBasis) ?? s.composition
          : s.composition;
        if (plotComposition.length !== 4) return null;
        const total = plotComposition.reduce((sum, value) => sum + value, 0);
        if (!(total > 0)) return null;
        return [
          plotComposition[0] / total,
          plotComposition[1] / total,
          plotComposition[2] / total,
        ];
      };

      const points: Point4D[] = [];
      for (const s of hullGeometry) {
        const xyz = coordinateOf(s);
        if (xyz) points.push({ x: xyz[0], y: xyz[1], z: xyz[2], e: s.eForm });
      }
      const lowerPlanes = computeQuaternaryLowerPlanes(points);

      for (const s of converged) {
        const xyz = coordinateOf(s);
        if (!xyz) {
          // Cannot be placed in 4D composition space — not available.
          s.eHullRecons = -1;
          continue;
        }
        const distance = quaternaryHullDistance(xyz[0], xyz[1], xyz[2], s.eForm, lowerPlanes);
        s.eHullRecons = Number.isFinite(distance) ? distance : -1;
      }
    }
  } else {
    // Unary: no hull needed
    for (const s of converged) {
      s.eHullRecons = 0;
    }
  }

  return finalize();
}
