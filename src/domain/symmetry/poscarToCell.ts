/**
 * VASP POSCAR → moyo cell conversion.
 *
 * The USPEX `gatheredPOSCARS` blocks are plain POSCAR files with an extra
 * `EA{id} … Sym.group: N` comment line, so the regular VASP rules apply.
 * This module is shared by the symmetry Web Worker and the node check script,
 * and therefore only imports *types* from `@spglib/moyo-wasm`.
 */

import type { MoyoCell } from '@spglib/moyo-wasm';

/** Element symbols indexed by Z − 1 (up to Z = 118). */
const ELEMENT_SYMBOLS = [
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
  'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
  'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
  'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
];

const SYMBOL_TO_Z = new Map(ELEMENT_SYMBOLS.map((symbol, index) => [symbol, index + 1]));

/** Case-insensitive `"mg"` / `"MG"` → `12`. Returns 0 for unknown symbols. */
export function symbolToAtomicNumber(symbol: string): number {
  const trimmed = symbol.trim();
  if (!trimmed) return 0;
  const normalised = trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
  return SYMBOL_TO_Z.get(normalised) ?? 0;
}

export interface PoscarCell {
  cell: MoyoCell;
  atomCount: number;
  /** Element symbols in POSCAR order. */
  elements: string[];
  /** Atom counts in POSCAR order. */
  counts: number[];
}

function toNumbers(tokens: string[]): number[] {
  return tokens.map((token) => Number(token));
}

function allFinite(values: number[]): boolean {
  return values.length > 0 && values.every((value) => Number.isFinite(value));
}

/** Determinant of a row-major 3×3 matrix. */
function determinant3(m: number[]): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** Inverse of a row-major 3×3 matrix; throws on a singular matrix. */
function invert3(m: number[]): number[] {
  const det = determinant3(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    throw new Error('POSCAR lattice vectors are singular');
  }
  return [
    (m[4] * m[8] - m[5] * m[7]) / det,
    (m[2] * m[7] - m[1] * m[8]) / det,
    (m[1] * m[5] - m[2] * m[4]) / det,
    (m[5] * m[6] - m[3] * m[8]) / det,
    (m[0] * m[8] - m[2] * m[6]) / det,
    (m[2] * m[3] - m[0] * m[5]) / det,
    (m[3] * m[7] - m[4] * m[6]) / det,
    (m[1] * m[6] - m[0] * m[7]) / det,
    (m[0] * m[4] - m[1] * m[3]) / det,
  ];
}

/** Cartesian → fractional for row-vector convention: `f = r · B⁻¹`. */
function cartesianToFractional(cartesian: number[], inverseBasis: number[]): [number, number, number] {
  const [x, y, z] = cartesian;
  return [
    inverseBasis[0] * x + inverseBasis[3] * y + inverseBasis[6] * z,
    inverseBasis[1] * x + inverseBasis[4] * y + inverseBasis[7] * z,
    inverseBasis[2] * x + inverseBasis[5] * y + inverseBasis[8] * z,
  ];
}

/** Wrap a fractional coordinate into `[0, 1)`, tolerating tiny negative values. */
function wrapFractional(value: number): number {
  const wrapped = value - Math.floor(value);
  return wrapped === 1 ? 0 : wrapped;
}

/**
 * Convert a single POSCAR block into the JSON cell moyo expects.
 *
 * Supports: optional VASP 4 (no element line) and VASP 5/6 (element line),
 * `Selective dynamics`, `Direct`/`Cartesian` coordinates, per-axis scale
 * factors, and negative scale (target volume). Throws a descriptive error when
 * the block cannot be understood.
 */
export function poscarToMoyoCell(poscarText: string): PoscarCell {
  if (!poscarText || !poscarText.trim()) {
    throw new Error('empty POSCAR');
  }

  const lines = poscarText.replace(/\r\n?/g, '\n').split('\n');
  const tokensAt = (index: number): string[] =>
    (lines[index] ?? '').trim().split(/\s+/).filter(Boolean);

  // Line 1: uniform / per-axis scale factor.
  const scaleTokens = toNumbers(tokensAt(1));
  if (!allFinite(scaleTokens) || scaleTokens.length === 0 || scaleTokens.length > 3) {
    throw new Error('invalid POSCAR scale line');
  }

  // Lines 2–4: lattice vectors (row-major).
  const rawBasis: number[] = [];
  for (let index = 2; index <= 4; index += 1) {
    const row = toNumbers(tokensAt(index));
    if (row.length < 3 || !allFinite(row.slice(0, 3))) {
      throw new Error(`invalid POSCAR lattice vector on line ${index + 1}`);
    }
    rawBasis.push(row[0], row[1], row[2]);
  }

  // Apply the scale factor(s). A single negative value means "scale to volume".
  let basis: number[];
  if (scaleTokens.length === 1) {
    const scale = scaleTokens[0];
    if (scale < 0) {
      const rawDet = determinant3(rawBasis);
      if (Math.abs(rawDet) < 1e-12) throw new Error('POSCAR lattice vectors are singular');
      const factor = (Math.abs(scale) / Math.abs(rawDet)) ** (1 / 3);
      basis = rawBasis.map((value) => value * factor);
    } else {
      basis = rawBasis.map((value) => value * scale);
    }
  } else {
    const factors = [0, 1, 2].map((axis) => scaleTokens[axis] ?? scaleTokens[0]);
    basis = rawBasis.map((value, index) => value * factors[Math.floor(index / 3)]);
  }

  if (Math.abs(determinant3(basis)) < 1e-12) {
    throw new Error('POSCAR lattice vectors are singular');
  }

  // Element symbols + counts. VASP 5+ has an element line; VASP 4 does not.
  let cursor = 5;
  let elements: string[] = [];
  let counts: number[] = [];
  const candidate = tokensAt(cursor);
  const candidateIsNumeric = candidate.length > 0 && candidate.every((token) => Number.isFinite(Number(token)));

  if (candidateIsNumeric) {
    // VASP 4: no species line, so the comment supplies the element symbols.
    counts = toNumbers(candidate);
    elements = tokensAt(0).filter(
      (token) => /^[A-Z][a-z]?$/.test(token) && symbolToAtomicNumber(token) > 0,
    );
  } else if (candidate.length > 0) {
    elements = candidate;
    cursor += 1;
    counts = toNumbers(tokensAt(cursor));
  } else {
    throw new Error('missing POSCAR species line');
  }

  if (!allFinite(counts) || counts.length === 0 || counts.some((value) => value <= 0 || !Number.isInteger(value))) {
    throw new Error('invalid POSCAR atom counts');
  }
  if (elements.length !== counts.length) {
    throw new Error('POSCAR species and atom counts do not match');
  }

  const numbers: number[] = [];
  elements.forEach((symbol, index) => {
    const atomicNumber = symbolToAtomicNumber(symbol);
    if (atomicNumber <= 0) {
      throw new Error(`unknown element symbol "${symbol}" in POSCAR`);
    }
    for (let repeat = 0; repeat < counts[index]; repeat += 1) numbers.push(atomicNumber);
  });

  const atomCount = numbers.length;
  cursor += 1;

  // Optional "Selective dynamics" line.
  if (/^s(elective)?/i.test((lines[cursor] ?? '').trim())) {
    cursor += 1;
  }

  const modeLine = (lines[cursor] ?? '').trim();
  if (!modeLine) throw new Error('missing POSCAR coordinate mode line');
  const isCartesian = /^[ck]/i.test(modeLine);
  cursor += 1;

  const positions: [number, number, number][] = [];
  const inverseBasis = isCartesian ? invert3(basis) : null;

  for (let atom = 0; atom < atomCount; atom += 1) {
    const row = toNumbers(tokensAt(cursor + atom).slice(0, 3));
    if (row.length < 3 || !allFinite(row)) {
      throw new Error(`missing POSCAR coordinate for atom ${atom + 1} of ${atomCount}`);
    }
    if (inverseBasis) {
      const fractional = cartesianToFractional(row, inverseBasis);
      positions.push([
        wrapFractional(fractional[0]),
        wrapFractional(fractional[1]),
        wrapFractional(fractional[2]),
      ]);
    } else {
      positions.push([wrapFractional(row[0]), wrapFractional(row[1]), wrapFractional(row[2])]);
    }
  }

  return {
    cell: { lattice: { basis: basis as MoyoCell['lattice']['basis'] }, positions, numbers },
    atomCount,
    elements,
    counts,
  };
}
