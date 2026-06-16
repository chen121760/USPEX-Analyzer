import type { Structure, SystemInfo } from '@/types/structure';
import type { WorkshopGroup, WorkshopJsonExport, WorkshopJsonStructure } from '@/modules/HullWorkshop/types';
import { buildCsvText, type CsvRow } from './csvExport';
import { downloadBlob, ensureFileExtension } from './exportFileNames';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';

type WorkshopStructure = Structure & { groupName?: string };

export interface WorkshopCsvExport {
  filename: string;
  content: string;
}

export function buildWorkshopCsvExport(
  systemInfo: SystemInfo,
  structures: WorkshopStructure[],
): WorkshopCsvExport {
  const { elements, systemType, compositionMode } = systemInfo;

  const metaHeaders = [
    `# elements: ${elements.join(',')}`,
    `# systemType: ${systemType}`,
    `# compositionMode: ${compositionMode}`,
  ];

  const { headers, rows } = buildWorkshopCsvRows(systemInfo, structures);
  const body = buildCsvText(headers, rows);
  const content = `\uFEFF${[...metaHeaders, '', body].join('\r\n')}`;

  return {
    filename: `${elements.join('-')}_workshop.csv`,
    content,
  };
}

export function downloadWorkshopCsv(systemInfo: SystemInfo, structures: WorkshopStructure[]): void {
  const exportFile = buildWorkshopCsvExport(systemInfo, structures);
  const blob = new Blob([exportFile.content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, ensureFileExtension(exportFile.filename, '.csv'));
}

export function buildWorkshopJsonExport(
  systemInfo: SystemInfo,
  visibleGroups: WorkshopGroup[],
): WorkshopJsonExport {
  const { elements, systemType, compositionMode, externalPressure } = systemInfo;

  return {
    type: 'uspex-workshop',
    version: 1,
    exportedAt: new Date().toISOString(),
    systemInfo: {
      elements,
      systemType,
      compositionMode,
      externalPressure,
    },
    groups: visibleGroups.map((group) => ({
      name: group.name,
      color: group.color,
      structures: group.structures.map((structure) => structureToWorkshopJson(structure)),
    })),
  };
}

export function downloadWorkshopJson(systemInfo: SystemInfo, visibleGroups: WorkshopGroup[]): void {
  const archive = buildWorkshopJsonExport(systemInfo, visibleGroups);
  const json = JSON.stringify(archive, null, 2);
  const blob = new Blob([`\uFEFF${json}`], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, `${systemInfo.elements.join('-')}_workshop.json`);
}

export function structureToWorkshopJson(s: Structure): WorkshopJsonStructure {
  return {
    id: s.id,
    formula: s.formula,
    composition: s.composition,
    generation: s.generation,
    origin: s.origin,
    spaceGroup: s.spaceGroup,
    enthalpy: s.enthalpy,
    enthalpyTotal: s.enthalpyTotal,
    volume: s.volume,
    volumeTotal: s.volumeTotal,
    fitness: s.fitness,
    hullX: s.hullX,
    hullY: s.hullY,
    eForm: s.eForm,
    eHullRecons: s.eHullRecons,
    density: s.density,
    extraProps: s.extraProps,
    parentIds: s.parentIds ?? [],
    parentEnthalpy: s.parentEnthalpy,
    paretoFront: s.paretoFront,
    bulkModulus: s.bulkModulus ?? 0,
    shearModulus: s.shearModulus ?? 0,
    youngModulus: s.youngModulus ?? 0,
    poissonRatio: s.poissonRatio ?? 0,
    pughRatio: s.pughRatio ?? 0,
    vickersHardness: s.vickersHardness ?? 0,
    fractureToughness: s.fractureToughness ?? 0,
    qEntropy: s.qEntropy ?? 0,
    aOrder: s.aOrder ?? 0,
    sOrder: s.sOrder ?? 0,
    kpoints: s.kpoints,
    latticeParams: s.latticeParams,
    poscarData: s.poscarData,
    tags: s.tags ?? [],
    notes: s.notes ?? '',
  };
}

export function workshopJsonToStructure(js: WorkshopJsonStructure): Structure {
  return normalizeStructure({
    id: js.id,
    formula: js.formula,
    composition: js.composition,
    generation: js.generation,
    origin: js.origin,
    spaceGroup: js.spaceGroup,
    enthalpy: js.enthalpy,
    enthalpyTotal: js.enthalpyTotal,
    volume: js.volume,
    volumeTotal: js.volumeTotal,
    fitness: js.fitness,
    hullX: js.hullX,
    hullY: js.hullY,
    eForm: js.eForm,
    eHullRecons: js.eHullRecons ?? 0,
    density: js.density,
    extraProps: js.extraProps,
    parentIds: js.parentIds ?? [],
    parentEnthalpy: js.parentEnthalpy,
    paretoFront: js.paretoFront,
    bulkModulus: js.bulkModulus,
    shearModulus: js.shearModulus,
    youngModulus: js.youngModulus,
    poissonRatio: js.poissonRatio,
    pughRatio: js.pughRatio,
    vickersHardness: js.vickersHardness,
    fractureToughness: js.fractureToughness,
    qEntropy: js.qEntropy,
    aOrder: js.aOrder,
    sOrder: js.sOrder,
    kpoints: js.kpoints,
    latticeParams: js.latticeParams,
    poscarData: js.poscarData,
    tags: js.tags ?? [],
    notes: js.notes ?? '',
    isUserAdded: false,
  });
}

function buildWorkshopCsvRows(
  systemInfo: SystemInfo,
  structures: WorkshopStructure[],
): { headers: string[]; rows: CsvRow[] } {
  const { elements, systemType, compositionMode } = systemInfo;

  if (compositionMode === 'fixed') {
    return {
      headers: ['Group', 'EA_ID', 'Formula', 'SpaceGroup', 'Generation', 'Origin', 'Enthalpy(eV/atom)', 'Fitness(eV/atom)'],
      rows: structures.map((s) => ({
        'Group': s.groupName ?? '',
        'EA_ID': s.id,
        'Formula': s.formula,
        'SpaceGroup': s.spaceGroup,
        'Generation': s.generation,
        'Origin': s.origin,
        'Enthalpy(eV/atom)': s.enthalpy,
        'Fitness(eV/atom)': s.fitness ?? 0,
      })),
    };
  }

  if (systemType === 'binary') {
    const elB = elements[1] || 'B';
    return {
      headers: ['Group', 'EA_ID', 'Formula', `x(${elB})`, 'Formation_Energy(eV/atom)', 'Enthalpy(eV/atom)', 'Fitness(eV/atom)'],
      rows: structures.map((s) => ({
        'Group': s.groupName ?? '',
        'EA_ID': s.id,
        'Formula': s.formula,
        [`x(${elB})`]: s.hullX?.[0] ?? 0,
        'Formation_Energy(eV/atom)': s.hullY,
        'Enthalpy(eV/atom)': s.enthalpy,
        'Fitness(eV/atom)': s.fitness,
      })),
    };
  }

  const [elA, elB, elC] = elements;
  return {
    headers: ['Group', 'EA_ID', 'Formula', `x_${elA}`, `x_${elB}`, `x_${elC}`, 'Enthalpy(eV/atom)', 'Fitness(eV/atom)'],
    rows: structures.map((s) => {
      const total = s.composition.reduce((a: number, b: number) => a + b, 0) || 1;
      return {
        'Group': s.groupName ?? '',
        'EA_ID': s.id,
        'Formula': s.formula,
        [`x_${elA}`]: (s.composition[0] / total).toFixed(6),
        [`x_${elB}`]: (s.composition[1] / total).toFixed(6),
        [`x_${elC}`]: (s.composition[2] / total).toFixed(6),
        'Enthalpy(eV/atom)': s.enthalpy,
        'Fitness(eV/atom)': s.fitness ?? 0,
      };
    }),
  };
}
