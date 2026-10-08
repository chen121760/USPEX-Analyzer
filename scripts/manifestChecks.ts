/**
 * Manifest & encoding checks — standalone node checks (`npm test`).
 *
 * `vite build` finds its PostCSS config by reading `package.json` with a raw
 * `JSON.parse`. A UTF-8 BOM — which Windows PowerShell's `Set-Content -Encoding
 * UTF8` prepends to every file it writes — makes that throw
 * (`Unexpected token '\uFEFF'`), and the damage only shows up in the CI build
 * step, long after the file was edited. Version drift between the two manifests
 * and the CHANGELOG is the same kind of release-time trap, so all three are
 * pinned here.
 */
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\nManifest & encoding invariants');

const BOM = '\uFEFF';
const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);

interface ParsedJson {
  ok: boolean;
  value: Record<string, unknown>;
  error?: string;
  hasBom: boolean;
}

/** Read and parse exactly the way vite's config loader does. */
function parseRaw(file: string): ParsedJson {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return { ok: true, value: JSON.parse(text) as Record<string, unknown>, hasBom: text.startsWith(BOM) };
  } catch (error) {
    return {
      ok: false,
      value: {},
      error: error instanceof Error ? error.message : String(error),
      hasBom: text.startsWith(BOM),
    };
  }
}

for (const file of ['package.json', 'package-lock.json']) {
  const parsed = parseRaw(path.resolve(file));
  check(`${file} survives a raw JSON.parse`, parsed.ok && !parsed.hasBom,
    parsed.error ?? (parsed.hasBom ? 'starts with a UTF-8 BOM' : ''));
  check(`${file} does not start with a UTF-8 BOM`,
    !fs.readFileSync(path.resolve(file)).subarray(0, 3).equals(BOM_BYTES));
}

const pkg = parseRaw(path.resolve('package.json')).value;
const lock = parseRaw(path.resolve('package-lock.json')).value as {
  version?: string;
  packages?: Record<string, { version?: string }>;
};
const version = typeof pkg.version === 'string' ? pkg.version : '';
check('both manifests declare the same version', lock.version === version, `${version} vs ${lock.version}`);
check('the lock root entry matches as well', lock.packages?.['']?.version === version,
  String(lock.packages?.['']?.version));

const changelog = fs.readFileSync(path.resolve('CHANGELOG'), 'utf8');
const newest = changelog.match(/^###\s*V([0-9]+\.[0-9]+\.[0-9]+)(?:\s+—[^\r\n]*)?\s*$/m);
check('the newest CHANGELOG entry matches the package version', newest?.[1] === version,
  `${newest?.[1]} vs ${version}`);

// A BOM in a source file is equally undesirable: it shows up as a change on the
// first line of every diff and breaks tooling that reads the file as text.
const withBom: string[] = [];
const walk = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|css|json|mjs)$/.test(entry.name)) continue;
    if (fs.readFileSync(full).subarray(0, 3).equals(BOM_BYTES)) {
      withBom.push(path.relative(path.resolve('.'), full));
    }
  }
};
for (const dir of ['src', 'scripts']) walk(path.resolve(dir));
check('no source file starts with a UTF-8 BOM', withBom.length === 0, withBom.join(', '));

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
if (failures.length > 0) process.exitCode = 1;
