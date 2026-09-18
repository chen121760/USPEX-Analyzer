/**
 * Reference-potential / hull invariants — standalone node checks.
 *
 * Run with `npm test` (bundles this file with rolldown so it can import the
 * real TypeScript sources, then executes it).  No test framework involved.
 *
 * The invariants encoded here are the ones that were violated by the previous
 * implementation and that a "does it look right?" review cannot catch:
 *
 *   1. reference extraction is invariant under any permutation of the input
 *   2. only exact endmembers may define a reference potential (no near-pure
 *      compound, no "purest available" fallback)
 *   3. a missing endmember yields "not available", never a pseudo-reference,
 *      and it only invalidates the structures that actually need it
 *   4. E_hull is invariant under a change of reference gauge (an affine shift
 *      of the potentials) while E_form shifts by exactly that affine function
 *   5. a legitimate E_form of exactly -1 is not mistaken for the "invalid"
 *      sentinel and stays in the hull
 *   6. real USPEX data (when the sample directory is present) reproduces the
 *      known component-basis potentials and stays order-invariant
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveReferences,
  reconstructConvexHull,
  computeFormationEnthalpyWith,
} from '@/lib/convexHullReconstruction';
import type {
  CompositionMode,
  Structure,
  SystemType,
} from '@/types/structure';

/* ------------------------------------------------------------------ */
/*  Minimal assertion harness                                          */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function close(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

interface MkOptions {
  fitness?: number;
  hullX?: number[];
  isUserAdded?: boolean;
}

function mk(
  id: number,
  composition: number[],
  enthalpyPerAtom: number,
  options: MkOptions = {},
): Structure {
  const atoms = composition.reduce((sum, value) => sum + value, 0);
  return {
    id,
    composition,
    enthalpy: enthalpyPerAtom,
    enthalpyTotal: enthalpyPerAtom * atoms,
    fitness: options.fitness ?? 0,
    hullX: options.hullX ?? [],
    isUserAdded: options.isUserAdded ?? false,
    formula: '',
  } as unknown as Structure;
}

const VARCOMP = 'varcomp' as CompositionMode;
const BINARY = 'binary' as SystemType;

/** All permutations of an array (input must be small). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) result.push([items[i], ...tail]);
  }
  return result;
}

function potentialKey(references: { potentials: number[] }): string {
  return references.potentials
    .map((value) => (Number.isFinite(value) ? value.toFixed(9) : 'missing'))
    .join('|');
}

/* ------------------------------------------------------------------ */
/*  1 + 2: elemental references                                        */
/* ------------------------------------------------------------------ */

section('1. elemental reference extraction is permutation-invariant');
{
  const build = (): Structure[] => [
    mk(1, [1, 0], -5, { hullX: [0] }), // pure A, higher polymorph
    mk(2, [1, 0], -6, { hullX: [0] }), // pure A, ground state
    mk(3, [0, 1], -3, { hullX: [1] }), // pure B
    mk(4, [1, 1], -4, { hullX: [0.5] }), // compound
  ];
  const orders = permutations([0, 1, 2, 3]);
  const keys = new Set<string>();
  const eFormById = new Map<number, Set<string>>();
  for (const order of orders) {
    const all = build();
    const structures = order.map((index) => all[index]);
    const references = resolveReferences(structures, ['A', 'B'], VARCOMP);
    keys.add(potentialKey(references));
    for (const s of structures) {
      const eForm = computeFormationEnthalpyWith(s, references);
      if (!eFormById.has(s.id)) eFormById.set(s.id, new Set());
      eFormById.get(s.id)!.add(eForm!.toFixed(9));
    }
  }
  check(
    `24 row orders give one reference set (got ${keys.size})`,
    keys.size === 1,
    [...keys].join(' vs '),
  );
  check(
    'every structure keeps one E_form across all orders',
    [...eFormById.values()].every((values) => values.size === 1),
  );
  const references = resolveReferences(build(), ['A', 'B'], VARCOMP);
  check(
    'ground-state polymorph supplies mu_A (-6, not the first row -5)',
    references.potentials[0] === -6,
    `got ${references.potentials[0]}`,
  );
  check('mu_B = -3', references.potentials[1] === -3, `got ${references.potentials[1]}`);
  check('resolution is complete', references.complete && references.reason === 'ok');
}

section('2. near-endmember phases must not become a reference');
{
  const withEndmember = [
    mk(1, [1, 0], -5),
    mk(2, [0, 1], -3),
    mk(3, [19, 1], -6.5), // A19B1: 95% pure, lowest enthalpy
  ];
  const references = resolveReferences(withEndmember, ['A', 'B'], VARCOMP);
  check(
    'mu_A comes from the pure A phase (-5), not from A19B1 (-6.5)',
    references.potentials[0] === -5,
    `got ${references.potentials[0]}`,
  );

  const withoutEndmember = [mk(2, [0, 1], -3), mk(3, [19, 1], -6.5)];
  const partial = resolveReferences(withoutEndmember, ['A', 'B'], VARCOMP);
  check(
    'A19B1 alone leaves mu_A missing instead of fabricating one',
    !Number.isFinite(partial.potentials[0]),
    `got ${partial.potentials[0]}`,
  );
  check(
    'the missing reference is reported as such',
    partial.reason === 'missing-endmember' && partial.missing.join(',') === '0',
    `reason=${partial.reason} missing=[${partial.missing.join(',')}]`,
  );
}

/* ------------------------------------------------------------------ */
/*  3: missing endmember semantics                                     */
/* ------------------------------------------------------------------ */

section('3. a missing endmember invalidates only what needs it');
{
  const structures = [
    mk(1, [1, 0, 0], -2, { hullX: [0] }),
    mk(2, [0, 1, 0], -3, { hullX: [0.5] }),
    mk(3, [1, 1, 0], -4, { hullX: [0.25] }), // A-B: needs only known refs
    mk(4, [1, 0, 1], -5, { hullX: [0.5] }), // A-C: C has no endmember
  ];
  const references = reconstructConvexHull(structures, BINARY, VARCOMP, ['A', 'B', 'C']);
  const byId = (id: number) => structures.find((s) => s.id === id)!;
  check('C is reported missing', references.missing.join(',') === '2');
  check('A-B keeps a real E_form', Number.isFinite(byId(3).eForm), `got ${byId(3).eForm}`);
  check(
    'A-C gets no E_form',
    byId(4).eForm === -1 && byId(4).eHullRecons === -1,
    `eForm=${byId(4).eForm} eHull=${byId(4).eHullRecons}`,
  );
  check(
    'the invalid structure is excluded from the hull, the valid ones are not',
    Number.isFinite(byId(1).eHullRecons) && Number.isFinite(byId(3).eHullRecons),
  );
}

/* ------------------------------------------------------------------ */
/*  4: gauge invariance of E_hull                                      */
/* ------------------------------------------------------------------ */

section('4. E_hull is gauge-invariant, E_form shifts with the gauge');
{
  // A gauge change is a shift of the reference potentials alone.  It cannot be
  // produced by editing the enthalpy of an endmember that defines the hull:
  // that changes the structure's own physical energy, so E_form of that
  // structure stays pinned at 0 and the hull line does not follow the shift.
  // What does produce a pure gauge change is a change in which structures the
  // potentials are extracted from — e.g. the dataset gaining a lower-enthalpy
  // polymorph of an endmember.  That must move every reported E_form by the
  // same affine function of composition and leave every E_hull untouched.
  const run = (withExtraPolymorph: boolean) => {
    const structures = [
      mk(1, [1, 0], -5, { hullX: [0], fitness: 0 }), // pure A on the hull
      mk(2, [0, 1], -3, { hullX: [1], fitness: 0 }), // pure B on the hull
      mk(3, [1, 1], -3.6, { hullX: [0.5], fitness: 1 }), // off-hull
    ];
    if (withExtraPolymorph) {
      structures.push(mk(4, [1, 0], -6, { hullX: [0], fitness: 1 }));
    }
    const references = reconstructConvexHull(structures, BINARY, VARCOMP, ['A', 'B']);
    const mix = structures.find((s) => s.id === 3)!;
    return { muA: references.potentials[0], eForm: mix.eForm, eHull: mix.eHullRecons };
  };
  const base = run(false);
  const shifted = run(true);
  check('the extra polymorph moves mu_A from -5 to -6', base.muA === -5 && shifted.muA === -6, `${base.muA} -> ${shifted.muA}`);
  check(
    'gauge change leaves E_hull unchanged',
    close(base.eHull, shifted.eHull),
    `${base.eHull} vs ${shifted.eHull}`,
  );
  check(
    'gauge change moves E_form by exactly x_A * 1 eV/atom',
    close(shifted.eForm - base.eForm, 0.5),
    `delta=${shifted.eForm - base.eForm}`,
  );
  check('the hull distance is non-zero (the test is discriminating)', Math.abs(base.eHull) > 1e-6, `eHull=${base.eHull}`);
}

/* ------------------------------------------------------------------ */
/*  5: the -1 sentinel must not decide membership                      */
/* ------------------------------------------------------------------ */

section('5. a legitimate E_form of exactly -1 stays in the hull');
{
  const structures = [
    mk(1, [1, 0], -5, { hullX: [0] }),
    mk(2, [0, 1], -3, { hullX: [1] }),
    // E_form = -5 - (0.5 * -5 + 0.5 * -3) = -1 exactly
    mk(3, [1, 1], -5, { hullX: [0.5], fitness: 1 }),
  ];
  reconstructConvexHull(structures, BINARY, VARCOMP, ['A', 'B']);
  const mix = structures.find((s) => s.id === 3)!;
  check('E_form is exactly the sentinel value', mix.eForm === -1, `got ${mix.eForm}`);
  check(
    'the structure still receives a hull distance',
    Number.isFinite(mix.eHullRecons),
    `eHullRecons=${mix.eHullRecons}`,
  );
}

/* ------------------------------------------------------------------ */
/*  6: composition-block (numSpecies) basis                            */
/* ------------------------------------------------------------------ */

section('6. composition-block references');
{
  const basis = [
    [1, 0, 1], // MgO
    [0, 1, 2], // HfO2
  ];
  const elements = ['Mg', 'Hf', 'O'];
  const build = (): Structure[] => [
    mk(1, [1, 0, 1], -5),
    mk(2, [1, 0, 1], -6), // MgO ground state
    mk(3, [1, 1, 3], -4.5), // MgO + HfO2
    mk(4, [0, 1, 2], -7), // HfO2
  ];
  const orders = permutations([0, 1, 2, 3]);
  const keys = new Set<string>();
  for (const order of orders) {
    const all = build();
    const references = resolveReferences(
      order.map((index) => all[index]),
      elements,
      VARCOMP,
      basis,
    );
    keys.add(potentialKey(references));
  }
  check(`24 row orders give one component reference set (got ${keys.size})`, keys.size === 1);
  const references = resolveReferences(build(), elements, VARCOMP, basis);
  check(
    'component labels are formulas of the basis rows',
    references.labels.join(',') === 'MgO,HfO2',
    references.labels.join(','),
  );
  check(
    'per-block potentials use the MgO ground state (-12) and HfO2 (-21)',
    references.potentials[0] === -12 && references.potentials[1] === -21,
    `[${references.potentials.join(', ')}]`,
  );
  check('unit is eV/block', references.unit === 'eV/block');

  const withoutHfO2 = build().filter((s) => s.id !== 4);
  const partial = resolveReferences(withoutHfO2, elements, VARCOMP, basis);
  check(
    'missing HfO2 endmember is reported, MgO stays available',
    Number.isFinite(partial.potentials[0]) &&
      partial.missing.join(',') === '1' &&
      partial.reason === 'missing-endmember',
    `potentials=[${partial.potentials.join(', ')}] missing=[${partial.missing.join(',')}]`,
  );
}

/* ------------------------------------------------------------------ */
/*  7: real sample data (skipped when absent)                          */
/* ------------------------------------------------------------------ */

section('7. real sample data (MgO-HfO2 pseudo-binary)');
{
  const sample = path.resolve('test/uspex_20260918_103502/Individuals');
  if (!fs.existsSync(sample)) {
    console.log(`  skip (no ${sample})`);
  } else {
    const basis = [
      [1, 0, 1],
      [0, 1, 2],
    ];
    const elements = ['Mg', 'Hf', 'O'];
    const structures: Structure[] = [];
    let id = 0;
    for (const line of fs.readFileSync(sample, 'utf8').split(/\r?\n/)) {
      const match = line.match(/\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]\s*(-?\d+\.\d+)/);
      if (!match) continue;
      const composition = [+match[1], +match[2], +match[3]];
      const atoms = composition.reduce((sum, value) => sum + value, 0);
      const enthalpyTotal = +match[4];
      const amounts = [
        composition[0], // MgO blocks
        composition[1], // HfO2 blocks
      ];
      const blocks = amounts[0] + amounts[1] || 1;
      structures.push({
        id: ++id,
        composition,
        enthalpy: enthalpyTotal / atoms,
        enthalpyTotal,
        fitness: 0,
        hullX: [amounts[1] / blocks],
        isUserAdded: false,
      } as unknown as Structure);
    }
    check(`parsed ${structures.length} structures`, structures.length > 1000);

    const references = resolveReferences(structures, elements, VARCOMP, basis);
    check(
      'both block references are found (no pseudo-reference)',
      references.complete,
      `missing=[${references.missing.join(',')}]`,
    );
    check(
      'MgO potential ≈ -11.855 eV/block',
      close(references.potentials[0], -11.855, 1e-3),
      `got ${references.potentials[0]}`,
    );
    check(
      'HfO2 potential ≈ -30.512 eV/block',
      close(references.potentials[1], -30.512, 1e-3),
      `got ${references.potentials[1]}`,
    );

    const reversed = resolveReferences(
      [...structures].reverse(),
      elements,
      VARCOMP,
      basis,
    );
    check(
      'reversed row order gives identical potentials',
      potentialKey(references) === potentialKey(reversed),
    );

    const copy = structures.map((s) => ({ ...s }));
    reconstructConvexHull(copy, BINARY, VARCOMP, elements, basis);
    const bad = copy.filter(
      (s) => !s.isUserAdded && s.enthalpyTotal <= 900 && !Number.isFinite(s.eForm),
    );
    check('every converged structure gets a finite E_form', bad.length === 0, `${bad.length} invalid`);
  }
}

/* ------------------------------------------------------------------ */

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
for (const failure of failures) console.log(`  - ${failure}`);
if (failures.length > 0) process.exitCode = 1;
