/**
 * Fail if any documentation file contains an em dash or en dash.
 *
 * The project's docs use the ASCII hyphen-minus only (no U+2014 or U+2013), so
 * this guard keeps prose from silently regressing. Source code that must match
 * dash characters (e.g. the salary-range regex in src/util.ts) is not scanned.
 *
 * Usage: node scripts/check-dashes.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = /[—–]/g;

// All Markdown files at the repo root (README, MIGRATION, CLAUDE, ...).
const files = readdirSync(root).filter((f) => f.endsWith('.md'));

let failed = false;
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (forbidden.test(line)) {
      failed = true;
      console.error(`${file}:${i + 1}: contains an em/en dash - use an ASCII '-' instead`);
      console.error(`  ${line.trim()}`);
    }
    forbidden.lastIndex = 0;
  });
}

if (failed) {
  console.error('\nEm/en dashes are not allowed in documentation.');
  process.exit(1);
}
console.log(`No em/en dashes in ${files.length} doc file(s).`);
