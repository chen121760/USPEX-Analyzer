import type { CustomNamePart, Structure } from '@/types/structure';
import { downloadBlob, ensureFileExtension } from './exportFileNames';

/**
 * Build a filename for an exported structure.
 *
 * nameParts:
 *   1 = sort index (001, 002, ...)
 *   2 = structure ID (EA134)
 *   3 = space group (SG71)
 *   4 = fitness (Ed0.0000)
 *   5 = second objective from *-Pareto_ranking (Obj92.7)
 *   6 = formula (Ti3H8)
 */
export function buildExportFilename(
  index: number,
  structure: Structure,
  nameParts: number[],
  padding: number,
  secondObjPrefix: string = 'Obj',
  customNameParts: CustomNamePart[] = [],
): string {
  const segments: string[] = [];

  for (const part of nameParts) {
    switch (part) {
      case 1:
        segments.push(String(index + 1).padStart(padding, '0'));
        break;
      case 2:
        segments.push(`EA${structure.id}`);
        break;
      case 3:
        segments.push(`SG${structure.spaceGroup}`);
        break;
      case 4:
        segments.push(`Ed${structure.fitness >= 0 ? structure.fitness.toFixed(4) : 'NA'}`);
        break;
      case 5: {
        const paretoVal = findParetoRankingValue(structure);
        segments.push(`${secondObjPrefix}${paretoVal != null ? paretoVal.toFixed(1) : 'NA'}`);
        break;
      }
      case 6:
        segments.push(structure.formula || 'Unknown');
        break;
    }
  }

  for (const customPart of customNameParts) {
    const raw = getStructureExportValue(structure, customPart.field);
    if (raw == null) continue;
    const num = Number(raw);
    if (isNaN(num)) continue;
    const formatted = Number.isInteger(num) ? String(num) : num.toFixed(3);
    const prefix = customPart.label.trim();
    segments.push(prefix ? `${prefix}${formatted}` : formatted);
  }

  return ensureFileExtension(segments.join('-'), '.vasp');
}

export function buildViewerPoscarFilename(structure: Structure): string {
  return `EA${structure.id}-SG${structure.spaceGroup}.vasp`;
}

export function downloadStructurePoscar(structure: Structure): void {
  if (!structure.poscarData) return;
  const blob = new Blob([structure.poscarData], { type: 'text/plain' });
  downloadBlob(blob, buildViewerPoscarFilename(structure));
}

export function buildSeedsFile(structures: Structure[]): string {
  return structures
    .filter((structure) => structure.poscarData)
    .map((structure) => structure.poscarData!.trimEnd())
    .join('\n');
}

export function getStructureExportValue(structure: Structure, field: string): unknown {
  const direct = (structure as unknown as Record<string, unknown>)[field];
  if (direct !== undefined) return direct;
  return structure.extraProps?.[field];
}

function findParetoRankingValue(structure: Structure): number | undefined {
  return structure.extraProps
    ? Object.entries(structure.extraProps).find(([key]) => key.endsWith('-Pareto_ranking'))?.[1]
    : undefined;
}
