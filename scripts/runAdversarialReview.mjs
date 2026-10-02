import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const outFile = path.join(root, 'node_modules', '.cache', 'adversarial-review', 'checks.mjs');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await build({
  input: path.join(root, 'scripts', 'adversarialReviewChecks.ts'), platform: 'node',
  external: ['@spglib/moyo-wasm', 'typescript'], resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: outFile, format: 'esm' },
});
await import(pathToFileURL(outFile).href);
