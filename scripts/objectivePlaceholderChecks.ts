/**
 * USPEX objective-placeholder checks — standalone node checks.
 *
 * Run with `npm test` (bundles this file with rolldown so it can import the real
 * TypeScript sources, then executes it).  No test framework involved.
 *
 * `Individuals` carries the multi-objective columns and initialises every one of
 * them to `100000`; only the structures it actually evaluated get a real number.
 * The measured prediction lives in the separate `MLProperties` file, which is why
 * a table can show `ML_Bulk_Modul-Individuals = 100000.0000` next to
 * `Bulk Modulus = -4.7` for the same structure.  `100000` is not a value:
 *
 *   1. it is normalised to "missing" (NaN) on parse and on project load, while
 *      genuine values — including 0 and negative ones — survive untouched
 *   2. the two sources stay separate: the MLProperties prediction is unaffected
 *   3. nothing downstream draws or writes it: chart accessors skip it and CSV
 *      export leaves the cell blank instead of writing `NaN`
 */
import { parseAllFiles } from '@/parsers';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { numericStructureFieldValue, dynamicFieldValue } from '@/domain/structure/dynamicFields';
import { buildStructureCsvRows, structuresToCSV } from '@/export/csvExport';
import { USPEX_OBJECTIVE_PLACEHOLDER } from '@/lib/constants';
import type { DetectedFile, Structure, USPEXFileType } from '@/types/structure';

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

/* ------------------------------------------------------------------ */
/*  A run whose Individuals carries an unevaluated second objective     */
/* ------------------------------------------------------------------ */

const parameters = [
  'PARAMETERS EVOLUTIONARY ALGORITHM',
  'USPEX : calculationMethod (USPEX, VCNEB, META)',
  '301   : calculationType (dimension: 0-3; molecule: 0/1; varcomp: 0/1)',
  '% optType',
  '1 1201 [20]',
  '% EndOptType',
  '% atomType',
  'Li Zr Y Cl',
  '% EndAtomType',
  '200   : populationSize',
  '',
].join('\n');

const individuals = [
  'Gen   ID    Origin   Composition    Enthalpy   Volume  Density  ML_Bulk_Modul    KPOINTS  SYMM  Q_entr A_order S_order',
  '                                      (eV)     (A^3)  (g/cm^3)',
  '  1    1   Random    [  4  0  0  0]   -40.000    40.000   1.000 100000.000  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '  1    2   Random    [  0  4  0  0]   -32.000    40.000   1.000      5.989  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '  1    3   Random    [  0  0  4  0]   -20.000    40.000   1.000 100000.000  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '  1    4   Random    [  0  0  0  4]    -8.000    40.000   1.000 100000.000  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '',
].join('\n');

const mlProperties = [
  'Machine learning - elastic properties',
  'ID   Modulus:Bulk, Shear, Youngs  Ratio:Poissons,Pughs Vicker-Hard Toughness',
  '            (GPa)  (GPa)   (GPa)                           (GPa)  (MPa*m^1/2)',
  '    1        -6.1  300.0    19.8         0.343   0.040      0.00      0.00 ',
  '    2        -4.7  300.0    22.3         0.635   0.021      0.00      0.00 ',
  '    3        -6.0  300.0    22.4         0.549   0.023      0.00      0.00 ',
  '    4       -10.0    0.0     0.0         0.000   0.000      0.00      0.00 ',
  '',
].join('\n');

const contents = new Map<USPEXFileType, string>([
  ['parameters', parameters],
  ['individuals', individuals],
  ['ml_properties', mlProperties],
]);
const detected: DetectedFile[] = [
  { type: 'parameters', file: new File([parameters], 'Parameters.txt'), confidence: 1, displayName: 'Parameters.txt', description: '' },
  { type: 'individuals', file: new File([individuals], 'Individuals'), confidence: 1, displayName: 'Individuals', description: '' },
  { type: 'ml_properties', file: new File([mlProperties], 'MLProperties'), confidence: 1, displayName: 'MLProperties', description: '' },
];

const { structures, systemInfo } = await parseAllFiles(detected, contents);
const byId = (id: number) => structures.find((s) => s.id === id)!;
const objectiveKey = `ML_Bulk_Modul-Individuals`;

console.log('\nSecond objective in Individuals vs the MLProperties prediction');
check('the second objective is recognised from the Individuals header',
  systemInfo.secondObjectiveName === 'ML_Bulk_Modul', systemInfo.secondObjectiveName);
check('four structures parsed', structures.length === 4, `got ${structures.length}`);
check('the objective column exists for every structure',
  structures.every((s) => objectiveKey in (s.extraProps ?? {})), JSON.stringify(structures[0].extraProps));
check('a real objective value survives',
  byId(2).extraProps?.[objectiveKey] === 5.989, `got ${byId(2).extraProps?.[objectiveKey]}`);
check('the 100000 placeholder becomes "missing"',
  Number.isNaN(byId(1).extraProps?.[objectiveKey] ?? 0), `got ${byId(1).extraProps?.[objectiveKey]}`);
check('every unevaluated row is marked missing',
  [1, 3, 4].every((id) => Number.isNaN(byId(id).extraProps?.[objectiveKey] ?? 0)));
check('the MLProperties prediction is unaffected',
  byId(1).bulkModulus === -6.1 && byId(2).bulkModulus === -4.7,
  `got ${byId(1).bulkModulus} / ${byId(2).bulkModulus}`);

console.log('\nDownstream consumers');
check('a chart accessor skips the missing objective',
  numericStructureFieldValue(byId(1), objectiveKey) === undefined
  && numericStructureFieldValue(byId(2), objectiveKey) === 5.989);

const rows = buildStructureCsvRows(structures, { hasPareto: true });
const rowOf = (id: number) => rows.find((row) => row['ID'] === id)!;
check('CSV leaves the unmeasured objective cell blank',
  rowOf(1)[objectiveKey] === '', `got ${JSON.stringify(rowOf(1)[objectiveKey])}`);
check('CSV keeps the measured objective cell',
  rowOf(2)[objectiveKey] === 5.989, `got ${JSON.stringify(rowOf(2)[objectiveKey])}`);
check('CSV writes no literal NaN anywhere',
  !structuresToCSV(structures, { hasPareto: true }).includes('NaN'));

console.log('\nNormalisation (parsed runs and saved projects alike)');
const normalized = normalizeStructure({
  id: 7,
  extraProps: { 'ML_Bulk_Modul-Individuals': USPEX_OBJECTIVE_PLACEHOLDER, 'Thick': 0, 'Surf_area': -2.5 },
});
check('the placeholder is dropped on load as well',
  Number.isNaN(normalized.extraProps?.['ML_Bulk_Modul-Individuals'] ?? 0));
check('a legitimate zero survives', normalized.extraProps?.['Thick'] === 0);
check('a legitimate negative value survives', normalized.extraProps?.['Surf_area'] === -2.5);

// A structure loaded from an older project file goes through the same path.
const legacy = normalizeStructure({
  id: 8,
  extraProps: { 'Property_X-Pareto_ranking': 3.5 },
} as Partial<Structure> & { id: number });
check('a real Pareto objective survives normalisation',
  legacy.extraProps?.['Property_X-Pareto_ranking'] === 3.5);

console.log('\nSecond-objective column resolution (Explorer / DataTable)');
// A project saved before the plain column was pinned can still hold a positive
// `Property_X` that a hull file contributed; the plain name must read the
// Individuals copy anyway, while the raw Pareto column stays positive.
const stale = normalizeStructure({
  id: 9,
  extraProps: { 'Property_X': 221, 'Property_X-Individuals': -221, 'Property_X-Pareto_ranking': 221 },
});
check('the plain second-objective column reads the Individuals copy',
  dynamicFieldValue(stale, 'Property_X', 'Property_X') === -221,
  String(dynamicFieldValue(stale, 'Property_X', 'Property_X')));
check('the raw Pareto column stays positive',
  dynamicFieldValue(stale, 'Property_X-Pareto_ranking', 'Property_X') === 221);
check('the explicit -Individuals column is unchanged',
  dynamicFieldValue(stale, 'Property_X-Individuals', 'Property_X') === -221);
check('other dynamic fields are read as they are',
  dynamicFieldValue(normalizeStructure({ id: 10, extraProps: { Surf_area: -2.5 } }), 'Surf_area', 'Property_X') === -2.5);
check('a structure with no Individuals row falls back to the plain column',
  dynamicFieldValue(normalizeStructure({ id: 11, extraProps: { 'Property_X': 42 } }), 'Property_X', 'Property_X') === 42);
check('a run without a second objective keeps the plain column',
  dynamicFieldValue(normalizeStructure({ id: 12, extraProps: { 'Property_X': 7 } }), 'Property_X', '') === 7);

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
