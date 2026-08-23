/**
 * Parity harness driver: builds the combined fixture, runs both
 * implementations over the same battery, and diffs their answers.
 *
 * Exits non-zero on any mismatch, so it can gate a commit or CI run.
 *
 * Usage: node scripts/parity/compare.mjs [--verbose]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const verbose = process.argv.includes('--verbose');

// The committed fixture plus the edge cases the fixture doesn't cover
// (star ratings, absent prices and dates, apostrophes, accented names).
const base = JSON.parse(
  readFileSync(resolve(repoRoot, 'web/fixtures/wines.json'), 'utf8')
);
const extra = JSON.parse(readFileSync(resolve(here, 'fixture-extra.json'), 'utf8'));
const combined = [...(Array.isArray(base) ? base : base.wines), ...extra];

const workDir = mkdtempSync(join(tmpdir(), 'wine-parity-'));
const fixturePath = join(workDir, 'wines.json');
writeFileSync(fixturePath, JSON.stringify(combined));

function run(label, command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error(`\n${label} runner failed:\n${error.stderr || error.message}`);
    process.exit(1);
  }
}

// Run the Node side from web/, where its dependencies resolve.
const webDir = resolve(repoRoot, 'web');
const nodeOut = run(
  'node',
  resolve(webDir, 'node_modules/.bin/tsx'),
  [resolve(here, 'run-node.mjs'), fixturePath],
  webDir
);
const phpOut = run('php', 'php', [resolve(here, 'run-php.php'), fixturePath], repoRoot);

const nodeResults = JSON.parse(nodeOut);
const phpResults = JSON.parse(phpOut);

/** Sort object keys recursively so key order never counts as a difference. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  // JSON numbers: PHP emits 93 where JS may emit 93.0 and vice versa.
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  return value;
}

/** A compact identity for a wine, so diffs name the row that moved. */
function summarize(body) {
  if (body && Array.isArray(body.wines)) {
    return {
      total: body.total,
      ids: body.wines.map((w) => w.id),
    };
  }
  return body;
}

const battery = JSON.parse(readFileSync(resolve(here, 'battery.json'), 'utf8'));
const expected = new Map(
  battery.filter((e) => e.expectDivergence).map((e) => [e.name, e.expectDivergence])
);

const names = [...new Set([...Object.keys(nodeResults), ...Object.keys(phpResults)])];
const failures = [];
const divergences = [];

for (const name of names) {
  const a = nodeResults[name];
  const b = phpResults[name];
  const left = JSON.stringify(canonical(a?.body), null, 1);
  const right = JSON.stringify(canonical(b?.body), null, 1);
  const same = left === right;

  if (expected.has(name)) {
    // These cases are supposed to differ. A case that stops differing means
    // the deviation was undone, which is just as much a regression.
    if (same) {
      failures.push({
        name: `${name} (expected to diverge, but matched)`,
        node: summarize(a?.body),
        php: summarize(b?.body),
        left,
        right,
      });
    } else {
      divergences.push(name);
    }
    continue;
  }

  if (same) {
    if (verbose) console.log(`  ok   ${name}`);
    continue;
  }
  failures.push({ name, node: summarize(a?.body), php: summarize(b?.body), left, right });
}

if (failures.length === 0) {
  const matched = names.length - divergences.length;
  console.log(`parity: ${matched}/${matched} cases match`);
  if (divergences.length) {
    console.log(
      `         ${divergences.length} intentional divergence(s): ${divergences.join(', ')}`
    );
    for (const name of divergences) {
      console.log(`           - ${name}: ${expected.get(name)}`);
    }
  }
  process.exit(0);
}

console.error(`\nparity: ${failures.length} of ${names.length} cases DIFFER\n`);
for (const failure of failures) {
  console.error(`── ${failure.name}`);
  console.error(`   node: ${JSON.stringify(failure.node)}`);
  console.error(`   php : ${JSON.stringify(failure.php)}`);
  if (verbose) {
    const leftLines = failure.left.split('\n');
    const rightLines = failure.right.split('\n');
    for (let i = 0; i < Math.max(leftLines.length, rightLines.length); i++) {
      if (leftLines[i] !== rightLines[i]) {
        console.error(`   line ${i}: node=${leftLines[i]} php=${rightLines[i]}`);
      }
    }
  }
  console.error('');
}
process.exit(1);
