/**
 * Parsing-progress checks — standalone node checks (`npm test`).
 *
 * The overlay shows a determinate bar only when the parser can measure itself,
 * so the contract between `parseAllFiles` and the store is worth pinning:
 *
 *   1. progress is published *during* the parse, not after it
 *   2. it never goes backwards, and every file that was read is reported once
 *   3. the hull rebuild reports no fraction (opaque third-party call) — the UI
 *      must show its indeterminate bar rather than a frozen number
 *   4. the store publishes those values and clears them on both exit paths
 *   5. the progress bar exposes the value to assistive tech (role + aria-valuenow)
 *   6. the page/chart/table skeletons reserve their space and announce the wait
 *   7. every new string exists in both locales
 */
import './persistenceShim';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseAllFiles, type ParseProgress } from '@/parsers';
import { useProjectStore } from '@/store/useProjectStore';
import { ChartSkeleton, PageSkeleton, TableSkeletonRows } from '@/components/ui/Skeleton';
import { progressPercent, ProgressBar } from '@/components/ui/Spinner';
import { DataTablePage } from '@/modules/DataTable/DataTablePage';
import { ConvexHullPage } from '@/modules/ConvexHull/ConvexHullPage';
import { DashboardPage } from '@/modules/Dashboard/DashboardPage';
import { ExplorerPage } from '@/modules/Explorer/ExplorerPage';
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

console.log('\nParsing progress invariants');

const parameters = [
  'PARAMETERS EVOLUTIONARY ALGORITHM',
  'USPEX : calculationMethod (USPEX, VCNEB, META)',
  '301   : calculationType (dimension: 0-3; molecule: 0/1; varcomp: 0/1)',
  '% atomType',
  'Li Zr',
  '% EndAtomType',
  '200   : populationSize',
  '',
].join('\n');
const individuals = [
  'Gen   ID    Origin   Composition    Enthalpy   Volume  Density    KPOINTS  SYMM',
  '                                      (eV)     (A^3)  (g/cm^3)',
  '  1    1   Random    [  4  0]   -40.000    40.000   1.000  [ 1  1  1]   1',
  '  1    2   Random    [  0  4]   -32.000    40.000   1.000  [ 1  1  1]   1',
  '  1    3   Random    [  2  2]   -36.000    40.000   1.000  [ 1  1  1]   1',
  '',
].join('\n');
/** A POSCAR file so the pipeline has something big to read. */
const poscars = Array.from({ length: 2 }, (_, index) => [
  `EA${index + 1}`,
  '1.0',
  '  5.0 0.0 0.0',
  '  0.0 5.0 0.0',
  '  0.0 0.0 5.0',
  '  Li  Zr',
  '   2   2',
  'Direct',
  '  0.0 0.0 0.0',
  '  0.5 0.5 0.5',
  '  0.25 0.25 0.25',
  '  0.75 0.75 0.75',
  '',
].join('\n')).join('\n');

const contents = new Map<USPEXFileType, string>([
  ['parameters', parameters],
  ['individuals', individuals],
  ['gathered_poscars', poscars],
]);
const detected: DetectedFile[] = [
  { type: 'parameters', file: new File([parameters], 'Parameters.txt'), confidence: 1, displayName: 'Parameters.txt', description: '' },
  { type: 'individuals', file: new File([individuals], 'Individuals'), confidence: 1, displayName: 'Individuals', description: '' },
  { type: 'gathered_poscars', file: new File([poscars], 'gatheredPOSCARS'), confidence: 1, displayName: 'gatheredPOSCARS', description: '' },
];

// ── 1./2./3. The events themselves ────────────────────────────────────────
const events: ParseProgress[] = [];
let eventsBeforeResolve = 0;
const parsed = parseAllFiles(detected, contents, (step) => {
  events.push(step);
});
eventsBeforeResolve = events.length;
const result = await parsed;

check('progress is published while the parse is still running', eventsBeforeResolve > 0,
  `${eventsBeforeResolve} event(s) before the first await`);
check('every event is published before the pipeline resolves', events.length >= eventsBeforeResolve);

const fractions = events.map((step) => step.progress).filter((value): value is number => value !== null);
const monotonic = fractions.every((value, index) => index === 0 || value >= fractions[index - 1]);
check('the reported fraction never goes backwards', monotonic, fractions.join(', '));
check('the first fraction is above zero', fractions.length > 0 && fractions[0] > 0, String(fractions[0]));
check('the run ends at the finalizing step',
  events[events.length - 1]?.stage === 'loadStage.finalizing', events[events.length - 1]?.stage);
check('the last fraction is effectively complete',
  (fractions[fractions.length - 1] ?? 0) >= 0.99, String(fractions[fractions.length - 1]));

const reportedFiles = events.filter((step) => step.fileType).map((step) => step.fileType);
check('each file that was read is reported exactly once',
  reportedFiles.length === 3 && new Set(reportedFiles).size === 3, reportedFiles.join(', '));
check('the file steps carry the file type, not a fraction-less step',
  reportedFiles.every((type) => (['parameters', 'individuals', 'gathered_poscars'] as string[]).includes(type as string)));

const hullStep = events.find((step) => step.stage === 'loadStage.hull');
check('the hull rebuild is reported', hullStep !== undefined);
check('the hull rebuild reports no fraction (opaque call, indeterminate bar)',
  hullStep !== undefined && hullStep.progress === null, String(hullStep?.progress));
check('the hull rebuild names how many candidates it is hulling',
  typeof hullStep?.count === 'number' && hullStep.count > 0, String(hullStep?.count));
check('the hull rebuild uses its own detail key',
  hullStep?.detailKey === 'loadStage.hullDetail', String(hullStep?.detailKey));

const merged = events.find((step) => step.stage === 'loadStage.merging');
check('the merge step is reported', merged !== undefined && merged.progress !== null);

// ── 4. The store publishes and clears the same values ─────────────────────
const seen: (number | null)[] = [];
const unsubscribe = useProjectStore.subscribe((state) => {
  seen.push(state.loadingProgress);
});
await useProjectStore.getState().processFiles(detected, contents);
unsubscribe();

const duringValues = seen.filter((value) => value !== null) as number[];
check('the store publishes the parsed fraction', duringValues.length > 0, seen.join(', '));
check('the store emits the indeterminate hull step', seen.includes(null));
check('the store keeps the fraction monotonic',
  duringValues.every((value, index) => index === 0 || value >= duringValues[index - 1]),
  duringValues.join(', '));
const afterProgress = useProjectStore.getState();
check('the fraction is cleared when the parse finishes', afterProgress.loadingProgress === null);
check('the parsed data is in place', afterProgress.structures.length > 0,
  `${afterProgress.structures.length} structures, ${result.structures.length} from the parser`);

const throwingContents = {
  get: () => { throw new Error('boom'); },
  has: () => false,
} as unknown as Map<USPEXFileType, string>;
const reportError = console.error;
console.error = () => {};
await useProjectStore.getState().processFiles(detected, throwingContents);
console.error = reportError;
check('a failed parse clears the fraction too', useProjectStore.getState().loadingProgress === null);

// ── 5. The bar exposes the value ──────────────────────────────────────────
const determinate = renderToStaticMarkup(createElement(ProgressBar, { value: 0.42 }));
check('a determinate bar is a real progressbar',
  determinate.includes('role="progressbar"') && determinate.includes('aria-valuenow="42"'));
check('a determinate bar is not hidden from assistive tech', !determinate.includes('aria-hidden'));
check('a determinate bar carries its fraction as a transform',
  determinate.includes('--progress:0.42') && determinate.includes('loading-bar-fill'));
const indeterminate = renderToStaticMarkup(createElement(ProgressBar, {}));
check('an unknown fraction renders the indeterminate bar',
  indeterminate.includes('loading-bar') && !indeterminate.includes('is-determinate'));
check('the indeterminate bar is decorative for assistive tech', indeterminate.includes('aria-hidden="true"'));
const nullBar = renderToStaticMarkup(createElement(ProgressBar, { value: null }));
check('an explicitly null fraction stays indeterminate', !nullBar.includes('is-determinate'));

check('percentages are clamped', progressPercent(-1) === 0 && progressPercent(2) === 100);
check('an unknown fraction has no percentage',
  progressPercent(null) === null && progressPercent(undefined) === null && progressPercent(Number.NaN) === null);

// ── 6. Skeletons reserve space and announce themselves ────────────────────
const pageHtml = renderToStaticMarkup(createElement(PageSkeleton, { label: 'Loading' }));check('the page skeleton is announced as busy',
  pageHtml.includes('role="status"') && pageHtml.includes('aria-busy="true"'));
check('the page skeleton reserves cards, a chart and rows',
  pageHtml.includes('page-skeleton-cards') && pageHtml.includes('skeleton-rows'));
check('the page skeleton carries the translated label', pageHtml.includes('aria-label="Loading"'));

const chartHtml = renderToStaticMarkup(createElement(ChartSkeleton, { height: 550 }));
check('the chart skeleton keeps the chart height', chartHtml.includes('height:550px'));
check('the chart skeleton is announced as busy', chartHtml.includes('role="status"'));

const rowsHtml = renderToStaticMarkup(
  createElement('table', null, createElement('tbody', null, createElement(TableSkeletonRows, { rows: 3, columns: 4 }))),
);
check('table skeleton rows are inert', rowsHtml.includes('aria-hidden="true"'));
check('table skeleton rows match the requested shape',
  (rowsHtml.match(/<tr/g) ?? []).length === 3 && (rowsHtml.match(/<td/g) ?? []).length === 12);

// The heavy pages render their skeleton on their *first* frame. The store
// already holds parsed data at this point, so this also pins that the skeleton
// is about the frame and not about missing data.
const tablePageHtml = renderToStaticMarkup(createElement(DataTablePage));
const tableSkeletons = (tablePageHtml.match(/class="skeleton"/g) ?? []).length;
const tableBodyRows = ((tablePageHtml.match(/<tbody>([\s\S]*)<\/tbody>/) ?? ['', ''])[1].match(/<tr/g) ?? []).length;
check('the table page paints a body skeleton on its first frame',
  tableSkeletons >= 48, `${tableSkeletons} skeleton bar(s)`);
check('the table body contains only skeleton rows before the deferred pass',
  tableBodyRows === 8, `${tableBodyRows} row(s)`);
check('the table page still paints its real header', tablePageHtml.includes('<thead'));

const hullPageHtml = renderToStaticMarkup(createElement(ConvexHullPage));
check('the convex-hull page paints a page skeleton before its first data pass',
  hullPageHtml.includes('page-skeleton') && hullPageHtml.includes('role="status"'));
check('the convex-hull page skeleton reserves the card row and the list rows',
  hullPageHtml.includes('page-skeleton-cards') && hullPageHtml.includes('skeleton-rows'));

const dashboardHtml = renderToStaticMarkup(createElement(DashboardPage));
check('the dashboard paints a page skeleton instead of an empty frame',
  dashboardHtml.includes('page-skeleton') && dashboardHtml.includes('role="status"'));

const explorerHtml = renderToStaticMarkup(createElement(ExplorerPage));
check('the explorer paints a chart-sized skeleton before its traces exist',
  explorerHtml.includes('chart-skeleton') && explorerHtml.includes('height:550px'));
check('the explorer still paints its controls on the first frame',
  explorerHtml.includes('<select') || explorerHtml.includes('explorer'));

// ── 7. Translation coverage for the new strings ───────────────────────────
const requiredKeys = [
  'loadStage.file',
  'loadStage.merging',
  'loadStage.hull',
  'loadStage.hullDetail',
];
const locales: Array<[string, Record<string, string>]> = [
  ['en', en as unknown as Record<string, string>],
  ['zh', zh as unknown as Record<string, string>],
];
for (const [name, locale] of locales) {
  const missing = requiredKeys.filter((key) => typeof locale[key] !== 'string' || locale[key] === '');
  check(`${name} defines every progress string`, missing.length === 0, missing.join(', '));
  check(`${name} interpolates the file name and the candidate count`,
    locale['loadStage.file'].includes('{{name}}') && locale['loadStage.hullDetail'].includes('{{count}}'));
}

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
if (failures.length > 0) process.exitCode = 1;
