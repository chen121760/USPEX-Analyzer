import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import { ML_FIELD_KEYS } from '@/lib/constants';
import type { CompOperator, NumericOperator, Structure, UnifiedCondition } from '@/types/structure';

export const NUMERIC_OPS: NumericOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
export const COMP_OPS: CompOperator[] = ['>', '>=', '<', '<=', '='];

export function toSortableNumber(value: unknown): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function applyCondition(s: Structure, cond: UnifiedCondition, elements: string[]): boolean {
  if (cond.kind === 'numeric') {
    const val = getStructureFieldValue(s, cond.field);
    if (val == null) return false;
    const num = Number(val);
    if (num === -1 && new Set(['paretoFront', 'eForm', 'eHullRecons', ...ML_FIELD_KEYS, 'aOrder', 'sOrder']).has(cond.field)) return false;
    if (isNaN(num)) return false;
    const target = cond.value;
    switch (cond.operator) {
      case 'eq': return num === target;
      case 'neq': return num !== target;
      case 'gt': return num > target;
      case 'gte': return num >= target;
      case 'lt': return num < target;
      case 'lte': return num <= target;
    }
  }
  if (cond.kind === 'nComponents') {
    return s.composition.filter((c) => c > 0).length === cond.value;
  }
  if (cond.kind === 'elementFraction') {
    const elIdx = elements.indexOf(cond.element);
    if (elIdx === -1) return true;
    const total = s.composition.reduce((a, b) => a + b, 0);
    if (total === 0) return false;
    const frac = s.composition[elIdx] / total;
    switch (cond.operator) {
      case '>': return frac > cond.value;
      case '<': return frac < cond.value;
      case '>=': return frac >= cond.value;
      case '<=': return frac <= cond.value;
      case '=': return Math.abs(frac - cond.value) < 0.001;
    }
  }
  return true;
}

export function conditionLabel(cond: UnifiedCondition, t: (k: string) => string): string {
  if (cond.kind === 'numeric') {
    const opLabel: Record<NumericOperator, string> = {
      gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠',
    };
    return `${t(`col.${cond.field}`) || cond.field} ${opLabel[cond.operator]} ${cond.value}`;
  }
  if (cond.kind === 'nComponents') {
    return ({ 1: t('table.filterUnary'), 2: t('table.filterBinary'), 3: t('table.filterTernary') })[cond.value];
  }
  return `x(${cond.element}) ${cond.operator} ${cond.value}`;
}
