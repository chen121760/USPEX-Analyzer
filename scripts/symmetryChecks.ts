/**
 * moyo (spglib) symmetry pipeline checks — standalone node checks.
 *
 * Run with `npm test` (bundles this file with rolldown so it can import the
 * real TypeScript sources, then executes it). No test framework involved.
 *
 * What is covered, and why it needs a machine check:
 *
 *   1. POSCAR → moyo cell conversion for every VASP variant that shows up in
 *      real USPEX output (Direct/Cartesian, Selective dynamics, VASP 4 without
 *      an element line, per-axis scale, negative scale = target volume) —
 *      getting any of these silently wrong would produce plausible-looking but
 *      meaningless space groups
 *   2. the conversion is actually correct: fractional coordinates survive a
 *      round trip and known structures give their textbook space group
 *   3. the tolerance sweep behaves monotonically (a larger tolerance can only
 *      add symmetry) on real USPEX POSCARs
 *   4. the helper functions used by the UI (symprec formatting, crystal-system
 *      ranges, cache-freshness test) agree with their contracts
 */
import fs from 'node:fs';
import path from 'node:path';
import init, { analyze_cell } from '@spglib/moyo-wasm';
import {
  poscarToMoyoCell,
  symbolToAtomicNumber,
} from '@/domain/symmetry/poscarToCell';
import {
  SYMMETRY_ANALYSIS_VERSION,
  SYMMETRY_SYMPRECS,
  crystalSystemKey,
  formatSymprec,
  isSymmetryAnalysisCurrent,
  summariseSymmetryNumbers,
} from '@/domain/symmetry/symmetryConstants';
import type { SymmetryAnalysis } from '@/types/structure';

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

function checkEqual<T>(name: string, actual: T, expected: T): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, same, same ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ------------------------------------------------------------------ */
/*  moyo initialisation                                                */
/* ------------------------------------------------------------------ */

// Paths resolve against the package root (npm always runs scripts from there),
// which is also what hullReferenceChecks.ts relies on.
const wasmPath = path.resolve('node_modules/@spglib/moyo-wasm/moyo_wasm_bg.wasm');
await init({ module_or_path: fs.readFileSync(wasmPath) });

function spaceGroupAt(poscar: string, symprec: number): { number: number; operations: number } {
  const { cell } = poscarToMoyoCell(poscar);
  const dataset = analyze_cell(JSON.stringify(cell), symprec, 'Standard');
  return { number: dataset.number, operations: dataset.operations.length };
}

function sweep(poscar: string): number[] {
  return SYMMETRY_SYMPRECS.map((symprec) => spaceGroupAt(poscar, symprec).number);
}

/* ------------------------------------------------------------------ */
/*  1. element symbols                                                 */
/* ------------------------------------------------------------------ */

console.log('\nElement symbol table');
checkEqual('Mg → 12', symbolToAtomicNumber('Mg'), 12);
checkEqual('lowercase o → 8', symbolToAtomicNumber('o'), 8);
checkEqual('uppercase O → 8', symbolToAtomicNumber('O'), 8);
checkEqual('Og → 118', symbolToAtomicNumber('Og'), 118);
checkEqual('unknown XX → 0', symbolToAtomicNumber('XX'), 0);

/* ------------------------------------------------------------------ */
/*  2. POSCAR variants                                                 */
/* ------------------------------------------------------------------ */

console.log('\nPOSCAR variants');

const DIRECT_POSCAR = [
  'EA1 5.64 5.64 5.64 90 90 90 Sym.group: 225',
  '1.0',
  '   5.64 0.00 0.00',
  '   0.00 5.64 0.00',
  '   0.00 0.00 5.64',
  'Na Cl',
  '4 4',
  'Direct',
  '0.0 0.0 0.0',
  '0.0 0.5 0.5',
  '0.5 0.0 0.5',
  '0.5 0.5 0.0',
  '0.5 0.5 0.5',
  '0.5 0.0 0.0',
  '0.0 0.5 0.0',
  '0.0 0.0 0.5',
].join('\n');

const direct = poscarToMoyoCell(DIRECT_POSCAR);
checkEqual('direct: atom count', direct.atomCount, 8);
checkEqual('direct: numbers', direct.cell.numbers, [11, 11, 11, 11, 17, 17, 17, 17]);
checkEqual('direct: first position', direct.cell.positions[0], [0, 0, 0]);
checkEqual('direct: rock-salt space group at 1e-4', spaceGroupAt(DIRECT_POSCAR, 1e-4).number, 225);

// Same cell written in Cartesian coordinates must give the same answer.
const cartesian = poscarToMoyoCell(
  DIRECT_POSCAR.replace('Direct', 'Cartesian')
    .split('\n')
    .map((line, index) => {
      if (index < 8 || index > 15) return line;
      return line
        .split(/\s+/)
        .map((value) => (Number(value) * 5.64).toFixed(6))
        .join(' ');
    })
    .join('\n'),
);
const cartesianMaxError = Math.max(
  ...cartesian.cell.positions.map((position, atom) =>
    Math.max(...position.map((value, axis) => Math.abs(value - direct.cell.positions[atom][axis]))),
  ),
);
check('cartesian parsing matches direct', cartesianMaxError < 1e-9, `max Δ = ${cartesianMaxError}`);

// Selective dynamics + trailing T/F flags.
const selective = poscarToMoyoCell(
  DIRECT_POSCAR.replace('Direct', 'Selective dynamics\nDirect').replace(
    /^(0\.\d 0\.\d 0\.\d)$/gm,
    '$1 T T T',
  ),
);
checkEqual('selective dynamics: atom count', selective.atomCount, 8);
check('selective dynamics: same space group', spaceGroupAt(
  DIRECT_POSCAR.replace('Direct', 'Selective dynamics\nDirect').replace(/^(0\.\d 0\.\d 0\.\d)$/gm, '$1 T T T'),
  1e-4,
).number === 225);

// Per-axis scale factors (0.5 each) must be equivalent to a plain 0.5 scale.
const perAxis = poscarToMoyoCell(
  DIRECT_POSCAR.replace('1.0', '0.5 0.5 0.5').replace(/5\.64/g, '11.28'),
);
check('per-axis scale equals uniform scale', perAxis.cell.lattice.basis.every(
  (value, index) => Math.abs(value - direct.cell.lattice.basis[index]) < 1e-9,
));

// Negative scale = target volume.
const byVolume = poscarToMoyoCell(DIRECT_POSCAR.replace('1.0', `-${(5.64 ** 3).toFixed(6)}`));
check('negative scale reproduces the target volume', byVolume.cell.lattice.basis.every(
  (value, index) => Math.abs(value - direct.cell.lattice.basis[index]) < 1e-6,
));

// VASP 4: no element line, symbols come from the comment line.
const vasp4 = poscarToMoyoCell(
  ['Na Cl', '1.0', '5.64 0 0', '0 5.64 0', '0 0 5.64', '4 4', 'Direct',
    '0 0 0', '0 0.5 0.5', '0.5 0 0.5', '0.5 0.5 0', '0.5 0.5 0.5', '0.5 0 0', '0 0.5 0', '0 0 0.5',
  ].join('\n'),
);
checkEqual('VASP 4 comment line supplies elements', vasp4.cell.numbers.slice(0, 2), [11, 11]);

// Malformed input must throw rather than silently analysing garbage.
const reject = (label: string, text: string) => {
  try {
    poscarToMoyoCell(text);
    check(`rejects ${label}`, false, 'no error thrown');
  } catch {
    check(`rejects ${label}`, true);
  }
};
reject('an empty string', '');
reject('a missing species line', 'comment\n1.0\n5 0 0\n0 5 0\n0 0 5\n\n4 4\nDirect\n0 0 0');
reject('mismatched counts', DIRECT_POSCAR.replace('4 4', '4 5'));
reject('an unknown element', DIRECT_POSCAR.replace('Na Cl', 'Na Xx'));
reject('missing coordinates', DIRECT_POSCAR.split('\n').slice(0, 12).join('\n'));

/* ------------------------------------------------------------------ */
/*  3. real USPEX data                                                 */
/* ------------------------------------------------------------------ */

console.log('\nReal USPEX POSCARs');

const gatheredPath = path.resolve('test/uspex_20260918_103502/gatheredPOSCARS');

if (!fs.existsSync(gatheredPath)) {
  console.log('  skipped — sample directory not present');
} else {
  const gathered = fs.readFileSync(gatheredPath, 'utf8');
  const blocks = gathered.split(/\n(?=EA\d+\s)/).filter((block) => /^EA\d+/.test(block));
  check('sample file parses into blocks', blocks.length > 100, `${blocks.length} blocks`);

  // EA8 is the canonical example: USPEX reports 139 (I4/mmm) while the relaxed
  // coordinates are triclinic until the tolerance reaches 0.1 Å.
  const ea8 = blocks.find((block) => /^EA8\s/.test(block));
  check('EA8 present', Boolean(ea8));
  if (ea8) {
    checkEqual('EA8 tolerance sweep', sweep(ea8), [1, 1, 1, 1, 139]);
  }

  // Every tolerance must be monotone: increasing symprec never removes symmetry.
  const sample = blocks.filter((_, index) => index % 37 === 0).slice(0, 60);
  let monotoneViolations = 0;
  let operationViolations = 0;
  let failures = 0;
  for (const block of sample) {
    try {
      const numbers = sweep(block);
      if (numbers.some((value, index) => index > 0 && value < numbers[index - 1])) {
        monotoneViolations++;
      }
      const operations = SYMMETRY_SYMPRECS.map((symprec) => spaceGroupAt(block, symprec).operations);
      if (operations.some((value, index) => index > 0 && value < operations[index - 1])) {
        operationViolations++;
      }
      if (numbers.some((value) => value < 1 || value > 230)) failures++;
    } catch {
      failures++;
    }
  }
  check('space group number grows with tolerance', monotoneViolations === 0, `${monotoneViolations} violations`);
  check('operation count grows with tolerance', operationViolations === 0, `${operationViolations} violations`);
  check('every sample structure analyses cleanly', failures === 0, `${failures} failures`);

  // All sampled structures must be parseable by the POSCAR reader.
  let parseFailures = 0;
  for (const block of blocks) {
    try {
      const parsed = poscarToMoyoCell(block);
      if (parsed.atomCount === 0) parseFailures++;
    } catch {
      parseFailures++;
    }
  }
  check('all sample POSCARs parse', parseFailures === 0, `${parseFailures} of ${blocks.length} failed`);
}

/* ------------------------------------------------------------------ */
/*  4. UI helpers                                                      */
/* ------------------------------------------------------------------ */

console.log('\nUI helpers');

checkEqual('formatSymprec(1e-5)', formatSymprec(1e-5), '1e-5');
checkEqual('formatSymprec(1e-4)', formatSymprec(1e-4), '1e-4');
checkEqual('formatSymprec(1e-3)', formatSymprec(1e-3), '1e-3');
checkEqual('formatSymprec(1e-2)', formatSymprec(1e-2), '1e-2');
checkEqual('formatSymprec(0.1)', formatSymprec(0.1), '0.1');
checkEqual('formatSymprec(2.5e-3)', formatSymprec(2.5e-3), '2.5e-3');
checkEqual('formatSymprec(5e-2)', formatSymprec(5e-2), '5e-2');
checkEqual('formatSymprec(0)', formatSymprec(0), '—');
check(
  'every default tolerance formats distinctly',
  new Set(SYMMETRY_SYMPRECS.map(formatSymprec)).size === SYMMETRY_SYMPRECS.length,
  SYMMETRY_SYMPRECS.map(formatSymprec).join(' / '),
);

checkEqual('crystal system 1', crystalSystemKey(1), 'triclinic');
checkEqual('crystal system 14', crystalSystemKey(14), 'monoclinic');
checkEqual('crystal system 62', crystalSystemKey(62), 'orthorhombic');
checkEqual('crystal system 139', crystalSystemKey(139), 'tetragonal');
checkEqual('crystal system 167', crystalSystemKey(167), 'trigonal');
checkEqual('crystal system 194', crystalSystemKey(194), 'hexagonal');
checkEqual('crystal system 225', crystalSystemKey(225), 'cubic');
checkEqual('crystal system 0', crystalSystemKey(0), 'unknown');

const fresh: SymmetryAnalysis = {
  version: SYMMETRY_ANALYSIS_VERSION,
  symprecs: [...SYMMETRY_SYMPRECS],
  points: SYMMETRY_SYMPRECS.map((symprec) => ({
    symprec, number: 1, symbol: 'P 1', pearson: 'aP1', operations: 1, hallNumber: 1,
  })),
};
check('current analysis is accepted', isSymmetryAnalysisCurrent(fresh));
check('undefined analysis is rejected', !isSymmetryAnalysisCurrent(undefined));
check(
  'stale version is rejected',
  !isSymmetryAnalysisCurrent({ ...fresh, version: SYMMETRY_ANALYSIS_VERSION + 1 }),
);
check(
  'different tolerance set is rejected',
  !isSymmetryAnalysisCurrent({ ...fresh, symprecs: [1e-3], points: fresh.points.slice(2, 3) }),
);
check(
  'truncated point list is rejected',
  !isSymmetryAnalysisCurrent({ ...fresh, points: fresh.points.slice(0, 2) }),
);
checkEqual(
  'summariseSymmetryNumbers',
  summariseSymmetryNumbers([1, 1, 1, 1, 139].map((number, index) => ({
    symprec: SYMMETRY_SYMPRECS[index], number, symbol: '', pearson: '', operations: 1, hallNumber: 1,
  }))),
  '1 → 1 → 1 → 1 → 139',
);
checkEqual('summariseSymmetryNumbers(undefined)', summariseSymmetryNumbers(undefined), null);

/* ------------------------------------------------------------------ */

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
for (const failure of failures) console.log(`  - ${failure}`);
if (failures.length > 0) process.exitCode = 1;
