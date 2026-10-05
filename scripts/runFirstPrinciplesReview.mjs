import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'node_modules', '.cache', 'first-principles-review.mjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
await build({
  input: path.join(root, 'scripts', 'firstPrinciplesReviewChecks.ts'), platform: 'node',
  external: ['@spglib/moyo-wasm'], resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: output, format: 'esm' },
});
await import(pathToFileURL(output).href);
