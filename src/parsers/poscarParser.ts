/**
 * Parser for USPEX gatheredPOSCARS / gatheredPOSCARS_unrelaxed.
 *
 * The file contains multiple VASP POSCAR blocks, each starting with "EA{id} ..."
 *
 * EA1     6.154  6.121  3.900 89.98 89.56 90.25 Sym.group:    1
 * 1.0
 *     6.153649     0.000000     0.000000
 *    -0.026338     6.120825     0.000000
 *     0.029929     0.001695     3.900027
 *   Ti   H
 *    9  29
 * Direct
 *     0.705588     0.399935     0.249206
 *     ...
 */

import type { ParsedPoscar, LatticeParams } from '@/types/structure';

const EA_PATTERN = /^EA(\d+)\s+/;
const NUMBER_PATTERN = /^number=(\d+)\b/;
const SYM_PATTERN = /Sym\.group:\s*(\d+)/;

/**
 * Check if a string looks like a chemical element symbol (1–2 chars, first uppercase).
 */
function isElementSymbol(token: string): boolean {
  if (token.length === 0 || token.length > 2) return false;
  if (!/^[A-Z]/.test(token)) return false;
  if (token.length === 2 && !/^[A-Z][a-z]$/.test(token)) return false;
  return true;
}

/**
 * Build a chemical formula string from elements and counts.
 */
function buildFormula(elements: string[], counts: number[]): string {
  return elements
    .map((el, i) => (counts[i] === 1 ? el : `${el}${counts[i]}`))
    .join('');
}

/**
 * Extract lattice parameters from the header line.
 * Header format: EA{id}  a  b  c  alpha  beta  gamma  Sym.group: N
 */
function parseLatticeFromHeader(header: string): LatticeParams | undefined {
  const nums = header
    .replace(EA_PATTERN, '')
    .replace(/Sym\.group:.*$/, '')
    .trim()
    .split(/\s+/)
    .map(Number);

  if (nums.length >= 6 && nums.every((n) => !isNaN(n))) {
    return {
      a: nums[0],
      b: nums[1],
      c: nums[2],
      alpha: nums[3],
      beta: nums[4],
      gamma: nums[5],
    };
  }
  return undefined;
}

function vectorLength(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function vectorAngle(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
  const lengths = vectorLength(a) * vectorLength(b);
  if (lengths === 0) return 0;
  const cosine = Math.max(-1, Math.min(1, dot / lengths));
  return Math.acos(cosine) * (180 / Math.PI);
}

/**
 * Extract lattice parameters from POSCAR scale and lattice vectors.
 */
function parseLatticeFromVectors(lines: string[]): LatticeParams | undefined {
  if (lines.length < 5) return undefined;

  const scale = Number(lines[1].trim());
  if (!Number.isFinite(scale)) return undefined;

  const vectors = lines.slice(2, 5).map((line) =>
    line
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((value) => Number.isFinite(value))
      .map((value) => value * scale),
  );

  if (vectors.length !== 3 || vectors.some((vector) => vector.length !== 3)) {
    return undefined;
  }

  return {
    a: vectorLength(vectors[0]),
    b: vectorLength(vectors[1]),
    c: vectorLength(vectors[2]),
    alpha: vectorAngle(vectors[1], vectors[2]),
    beta: vectorAngle(vectors[0], vectors[2]),
    gamma: vectorAngle(vectors[0], vectors[1]),
  };
}

/**
 * Parse a single POSCAR block into structured data.
 */
function parseSinglePoscar(
  id: number,
  lines: string[],
  header: string,
  symm: number,
): ParsedPoscar {
  let elements: string[] = [];
  let atomCounts: number[] = [];

  // Scan lines 4–9 to find the element symbols line
  for (let i = 4; i < Math.min(lines.length, 10); i++) {
    const tokens = lines[i].trim().split(/\s+/);
    if (tokens.length > 0 && tokens.every(isElementSymbol)) {
      elements = tokens;

      // Next line should be atom counts
      if (i + 1 < lines.length) {
        const countTokens = lines[i + 1].trim().split(/\s+/);
        const counts = countTokens.map(Number);
        if (counts.length === elements.length && counts.every((n) => !isNaN(n) && n > 0)) {
          atomCounts = counts;
        }
      }
      break;
    }
  }

  const formula = elements.length > 0 && atomCounts.length > 0
    ? buildFormula(elements, atomCounts)
    : 'Unknown';

  return {
    id,
    header,
    poscarText: lines.join('\n'),
    symm,
    formula,
    latticeParams: parseLatticeFromHeader(header) ?? parseLatticeFromVectors(lines),
    elements,
    atomCounts,
  };
}

/**
 * Parse the entire gatheredPOSCARS file.
 * Returns a Map keyed by structure ID.
 */
export function parseGatheredPoscars(content: string): Map<number, ParsedPoscar> {
  const allLines = content.split('\n');
  const structures = new Map<number, ParsedPoscar>();

  let currentId: number | null = null;
  let currentLines: string[] = [];
  let currentHeader = '';
  let currentSymm = 0;

  for (const rawLine of allLines) {
    const line = rawLine; // keep original line breaks
    const match = line.match(EA_PATTERN) ?? line.match(NUMBER_PATTERN);

    if (match) {
      // Save previous block
      if (currentId !== null && currentLines.length > 0) {
        structures.set(
          currentId,
          parseSinglePoscar(currentId, currentLines, currentHeader, currentSymm),
        );
      }

      currentId = parseInt(match[1], 10);
      currentHeader = line.trimEnd();
      currentLines = [line];

      const symMatch = line.match(SYM_PATTERN);
      currentSymm = symMatch ? parseInt(symMatch[1], 10) : 0;
    } else {
      if (currentId !== null) {
        currentLines.push(line);
      }
    }
  }

  // Save last block
  if (currentId !== null && currentLines.length > 0) {
    structures.set(
      currentId,
      parseSinglePoscar(currentId, currentLines, currentHeader, currentSymm),
    );
  }

  return structures;
}
