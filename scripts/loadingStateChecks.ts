/**
 * Loading-feedback checks — standalone node checks.
 *
 * Run with `npm test` (bundles this file with rolldown so it can import the real
 * TypeScript sources, then executes it).  No test framework involved.
 *
 * Parsing a real archive takes seconds and blocks the main thread, so the store
 * has to publish its loading state *before* the blocking call and clear it on
 * both the success and the failure path — otherwise the overlay either never
 * renders or stays up forever.  What is pinned here:
 *
 *   1. `nextPaint()` resolves even where `requestAnimationFrame` is missing
 *   2. `isLoading` / `loadingStage` are set synchronously, before the first await
 *   3. both are cleared after a successful parse, and the data is in place
 *   4. both are cleared when parsing throws
 *   5. every loading string the UI asks for exists in both locales
 */
import './persistenceShim';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useProjectStore } from '@/store/useProjectStore';
import { nextPaint } from '@/lib/nextPaint';
import { LoadingOverlay, LoadingScreen } from '@/components/ui/LoadingOverlay';
import en from '@/i18n/en';
import zh from '@/i18n/zh';
import type { DetectedFile, USPEXFileType } from '@/types/structure';

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

console.log('\nLoading feedback invariants');

// ── 1. The yield helper works without a DOM ───────────────────────────────
let yielded = false;
await nextPaint().then(() => { yielded = true; });
check('nextPaint resolves without requestAnimationFrame', yielded);
check('the node environment really has no requestAnimationFrame',
  typeof globalThis.requestAnimationFrame !== 'function');

// ── 2./3. Parsing publishes and clears its state ──────────────────────────
const parameters = [
  'PARAMETERS EVOLUTIONARY ALGORITHM',
  'USPEX : calculationMethod (USPEX, VCNEB, META)',
  '301   : calculationType (dimension: 0-3; molecule: 0/1; varcomp: 0/1)',
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
  '  1    2   Random    [  0  4  0  0]   -32.000    40.000   1.000 100000.000  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '  1    3   Random    [  0  0  4  0]   -20.000    40.000   1.000 100000.000  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '  1    4   Random    [  0  0  0  4]    -8.000    40.000   1.000 100000.000  [ 1  1  1]   1  0.100  1.000  1.000 ',
  '',
].join('\n');

const contents = new Map<USPEXFileType, string>([
  ['parameters', parameters],
  ['individuals', individuals],
]);
const detected: DetectedFile[] = [
  { type: 'parameters', file: new File([parameters], 'Parameters.txt'), confidence: 1, displayName: 'Parameters.txt', description: '' },
  { type: 'individuals', file: new File([individuals], 'Individuals'), confidence: 1, displayName: 'Individuals', description: '' },
];

useProjectStore.setState({ projectName: '', isLoading: false, loadingStage: null, loadingDetail: null });
const pending = useProjectStore.getState().processFiles(detected, contents);

// Still synchronous here: the flags must be up before the first await, which is
// what gives the overlay a frame to paint in.
const duringParse = useProjectStore.getState();
check('the loading flag is raised before the parse starts', duringParse.isLoading);
check('a loading stage names what is happening',
  duringParse.loadingStage === 'loadStage.parsing', String(duringParse.loadingStage));
check('the overlay has a detail line', typeof duringParse.loadingDetail === 'string' && duringParse.loadingDetail.length > 0);

await pending;
const afterParse = useProjectStore.getState();
check('the loading flag is cleared when parsing finishes', !afterParse.isLoading);
check('the stage is cleared as well', afterParse.loadingStage === null && afterParse.loadingDetail === null);
check('the parsed data is in place', afterParse.isDataLoaded && afterParse.structures.length === 4,
  `${afterParse.structures.length} structures`);

// ── 4. A failed parse must not leave the overlay up forever ───────────────
const throwingContents = {
  get: () => { throw new Error('boom'); },
  has: () => false,
} as unknown as Map<USPEXFileType, string>;

useProjectStore.setState({ projectName: '', isLoading: false, loadingStage: null });
const reportError = console.error;
console.error = () => {};   // the store logs the failure on purpose
await useProjectStore.getState().processFiles(detected, throwingContents);
console.error = reportError;
const afterFailure = useProjectStore.getState();
check('a failed parse clears the loading flag', !afterFailure.isLoading);
check('a failed parse clears the stage', afterFailure.loadingStage === null);
check('a failed parse reports the error',
  afterFailure.parseWarnings.some((w) => w.startsWith('Parse error')), afterFailure.parseWarnings.join(' | '));

// ── 5. Translation coverage for everything the loading UI renders ─────────
const requiredKeys = [
  'loading',
  'loadStage.parsing',
  'loadStage.restoring',
  'loadStage.finalizing',
  'loadStage.files',
  'loadStage.structures',
  'app.restoringSession',
  'app.restoringSessionHint',
  'upload.parsing',
  'upload.projectsLoading',
  'viewer.loading',
];
const locales: Array<[string, Record<string, string>]> = [
  ['en', en as unknown as Record<string, string>],
  ['zh', zh as unknown as Record<string, string>],
];
for (const [name, locale] of locales) {
  const missing = requiredKeys.filter((key) => typeof locale[key] !== 'string' || locale[key] === '');
  check(`${name} defines every loading string`, missing.length === 0, missing.join(', '));
  const counts = ['loadStage.files', 'loadStage.structures'].filter((key) => !locale[key].includes('{{count}}'));
  check(`${name} interpolates the structure/file count`, counts.length === 0, counts.join(', '));
}

// ── 6. The rendered markup carries the state for assistive tech ───────────
const cardHtml = renderToStaticMarkup(createElement(LoadingScreen, { title: 'Parsing…', detail: '11 files' }));
check('the loading card is announced as busy',
  cardHtml.includes('role="status"') && cardHtml.includes('aria-busy="true"') && cardHtml.includes('aria-live="polite"'));
check('the loading card renders an animated indicator',
  cardHtml.includes('spinner') && cardHtml.includes('loading-bar'));
check('the loading card shows the stage and the detail',
  cardHtml.includes('Parsing…') && cardHtml.includes('11 files'));
check('the overlay stays out of the way while idle',
  renderToStaticMarkup(createElement(LoadingOverlay)) === '');

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
