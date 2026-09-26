import { applyCondition, matchesActiveFilter } from '@/modules/Filter/filterLogic';
import type { Structure, UnifiedConditionGroup } from '@/types/structure';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}`);
  }
}

function structure(values: Partial<Structure>): Structure {
  return {
    id: 1,
    formula: 'BeH2',
    origin: 'EA1',
    spaceGroup: 10,
    composition: [1, 2],
    tags: [],
    // MLProperties' "no row" sentinel is NaN; -1 is a legitimate prediction.
    bulkModulus: Number.NaN,
    ...values,
  } as Structure;
}

console.log('\nUnified filter invariants');

const first = structure({ id: 1, tags: ['fav'] });
const second = structure({ id: 2, formula: 'TiH4', origin: 'EA2', spaceGroup: 5, composition: [0, 1, 4] });

check('numeric fields use the shared field accessor', applyCondition(first, { kind: 'numeric', field: 'spaceGroup', operator: 'gt', value: 8 }, ['Be', 'H']));
check('missing ML sentinels (NaN) never match numeric queries', !applyCondition(first, { kind: 'numeric', field: 'bulkModulus', operator: 'lt', value: 0 }, ['Be', 'H']));
check('negative ML predictions stay filterable', applyCondition(
  structure({ id: 3, bulkModulus: -5.1 }),
  { kind: 'numeric', field: 'bulkModulus', operator: 'lt', value: 0 },
  ['Be', 'H'],
));
check('text contains is case insensitive', applyCondition(first, { kind: 'text', field: 'formula', operator: 'contains', values: ['beh'] }, ['Be', 'H']));
check('text exclusion rejects any listed match', !applyCondition(first, { kind: 'text', field: 'origin', operator: 'notEquals', values: ['EA1', 'EA9'] }, ['Be', 'H']));
check('component count ignores zero fractions', applyCondition(second, { kind: 'nComponents', value: 2 }, ['Be', 'Ti', 'H']));
check('element fractions use the project element order', applyCondition(first, { kind: 'elementFraction', element: 'H', operator: '>=', value: 2 / 3 }, ['Be', 'H']));
check('unknown elements cannot silently match', !applyCondition(first, { kind: 'elementFraction', element: 'Ti', operator: '>', value: 0 }, ['Be', 'H']));

const groups: UnifiedConditionGroup[] = [
  {
    id: 'and',
    conditions: [
      { kind: 'numeric', field: 'spaceGroup', operator: 'gt', value: 8 },
      { kind: 'text', field: 'formula', operator: 'equals', values: ['BeH2'] },
    ],
  },
  { id: 'or', conditions: [{ kind: 'numeric', field: 'spaceGroup', operator: 'lt', value: 6 }] },
];

check('conditions inside a group are ANDed', matchesActiveFilter(first, ['Be', 'H'], groups, {}));
check('condition groups are ORed', matchesActiveFilter(second, ['Be', 'Ti', 'H'], groups, {}));
check('included tags are required', !matchesActiveFilter(second, ['Be', 'Ti', 'H'], groups, { fav: 'include' }));
check('excluded tags are rejected', !matchesActiveFilter(first, ['Be', 'H'], groups, { fav: 'exclude' }));
check('empty groups do not reject rows', matchesActiveFilter(first, ['Be', 'H'], [{ id: 'empty', conditions: [] }], {}));

console.log(`\n${passed} filter checks passed.`);
if (failures.length > 0) throw new Error(`Filter checks failed: ${failures.join(', ')}`);
