/**
 * Runner for the hull/reference invariant checks.
 *
 * Bundles scripts/hullReferenceChecks.ts with rolldown (so the checks import the
 * real sources through the '@' alias) and executes the result.  rolldown ships
 * with vite, so this adds no dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'node_modules', '.cache', 'hull-reference-checks');
const outFile = path.join(outDir, 'hullReferenceChecks.mjs');

fs.mkdirSync(outDir, { recursive: true });

await build({
  input: path.join(root, 'scripts', 'hullReferenceChecks.ts'),
  platform: 'node',
  resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: outFile, format: 'esm' },
});

await import(pathToFileURL(outFile).href);
