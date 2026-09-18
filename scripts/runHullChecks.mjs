/**
 * Runner for the standalone node checks.
 *
 * Bundles each `scripts/*Checks.ts` file with rolldown (so the checks import the
 * real sources through the '@' alias) and executes the results.  rolldown ships
 * with vite, so this adds no dependency.
 *
 * `@spglib/moyo-wasm` stays external: its wasm-bindgen glue resolves the
 * `.wasm` binary relative to its own location, so bundling it would break.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'node_modules', '.cache', 'node-checks');
const checkFiles = ['hullReferenceChecks.ts', 'symmetryChecks.ts'];

fs.mkdirSync(outDir, { recursive: true });

let failed = false;

for (const checkFile of checkFiles) {
  const outFile = path.join(outDir, checkFile.replace(/\.ts$/, '.mjs'));

  await build({
    input: path.join(root, 'scripts', checkFile),
    platform: 'node',
    external: ['@spglib/moyo-wasm'],
    resolve: { alias: { '@': path.join(root, 'src') } },
    output: { file: outFile, format: 'esm' },
  });

  try {
    await import(pathToFileURL(outFile).href);
  } catch (error) {
    failed = true;
    console.error(`\n${checkFile} threw:`, error);
  }
}

if (failed) process.exitCode = 1;
