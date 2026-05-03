/**
 * Anonymizes Example.json for public demo use.
 * Ca → A, Ac → B, H → C; pressure 300 → 50 GPa.
 * Output: public/examples/example.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

const MAP = { Ca: 'A', Ac: 'B', H: 'C' };

// Replace element symbols in a chemical formula string, e.g. "Ca3H6" → "A3C6"
function anonymizeFormula(formula) {
  // Match element symbols (uppercase + optional lowercase) followed by optional digits
  return formula.replace(/([A-Z][a-z]*)(\d*)/g, (_, sym, num) => {
    return (MAP[sym] ?? sym) + num;
  });
}

// Replace element symbols in a POSCAR data string
function anonymizePoscar(poscar) {
  if (!poscar) return poscar;

  const lines = poscar.split('\n');
  return lines.map((line, i) => {
    // Line 0 is the title (e.g. "EA83  2.252 ...  Ca")
    // The element-symbol line in POSCAR is the one that contains only element symbols separated by spaces
    // It appears after the 5 lattice lines (title + scale + 3 vectors = lines 0-4), so line 5 is elements
    if (i === 5) {
      // Replace each token that is a known element symbol
      return line.replace(/\b(Ca|Ac|H)\b/g, (sym) => MAP[sym] ?? sym);
    }
    // Title line: replace element symbols that appear as standalone words
    if (i === 0) {
      return line.replace(/\b(Ca|Ac|H)\b/g, (sym) => MAP[sym] ?? sym);
    }
    return line;
  }).join('\n');
}

const raw = readFileSync(resolve(root, 'Example.json'), 'utf-8');
const data = JSON.parse(raw);

// --- Top-level metadata ---
data.projectId = 'project_example_demo';
data.projectName = 'A-B-C-301-50GPa-Example';

// --- systemInfo ---
data.systemInfo.elements = data.systemInfo.elements.map(e => MAP[e] ?? e);
data.systemInfo.externalPressure = 50;

// --- structures ---
for (const s of data.structures) {
  s.formula = anonymizeFormula(s.formula);
  s.poscarData = anonymizePoscar(s.poscarData);
}

// --- tags (if any reference element names) ---
// tags are user labels, unlikely to contain element names, skip

const out = JSON.stringify(data, null, 2);

const outDir = resolve(root, 'public', 'examples');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'example.json'), out, 'utf-8');

console.log('Done → public/examples/example.json');
console.log(`Structures: ${data.structures.length}`);
console.log(`Elements: ${data.systemInfo.elements.join(', ')}`);
console.log(`Pressure: ${data.systemInfo.externalPressure} GPa`);
