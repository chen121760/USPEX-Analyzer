import type { Structure } from '@/types/structure';

export interface PlotField { accessor: (s: Structure) => number | string | undefined }

export function validPlotStructure(s: Structure, fields: PlotField[]): boolean {
  return Number.isFinite(s.enthalpyTotal) && s.enthalpyTotal <= 900
    && fields.every(field => {
      const value = field.accessor(s);
      return typeof value === 'number' && Number.isFinite(value);
    });
}

export function selectedFrontData(structures: Structure[], fronts: Map<number, number>, limit: number, byFront: boolean): Structure[] {
  return byFront ? structures.filter(s => (fronts.get(s.id) ?? Infinity) <= limit) : structures;
}
