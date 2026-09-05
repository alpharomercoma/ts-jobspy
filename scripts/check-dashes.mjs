/**
 * Fail if any tracked source, script, or documentation file contains a literal
 * em dash or en dash.
 *
 * The project uses the ASCII hyphen-minus only (no U+2014 or U+2013) in prose,
 * comments, and user-facing strings. A regex that must match dash characters
 * (e.g. the salary-range parser, or this guard itself) writes them as
 * u2013 / u2014 escapes, so any line containing those escapes is exempt.
 *
 * Usage: node scripts/check-dashes.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = /[\u2014\u2013]/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const SCAN_EXT = /\.(ts|mjs|md)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(entry.name)) out.push(p);
  }
  return out;
}

// Root-level Markdown plus everything under src/, scripts/, and test/.
const files = [
  ...readdirSync(root)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(root, f)),
  ...['src', 'scripts', 'test'].flatMap((d) => walk(join(root, d))),
];

let failed = false;
let scanned = 0;
for (const file of files) {
  scanned += 1;
  const rel = relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // A line that writes dashes as \u escapes (regex char classes) is exempt.
    if (line.includes('u2013') || line.includes('u2014')) return;
    if (forbidden.test(line)) {
      failed = true;
      console.error(`${rel}:${i + 1}: contains an em/en dash - use an ASCII '-' instead`);
      console.error(`  ${line.trim()}`);
    }
  });
}

if (failed) {
  console.error('\nEm/en dashes are not allowed. Replace them with an ASCII hyphen.');
  process.exit(1);
}
console.log(`No em/en dashes in ${scanned} tracked file(s).`);
