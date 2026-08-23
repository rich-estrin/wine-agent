/**
 * Staging A/B check: asks a live WordPress site every battery query twice —
 * once served natively from its own database, once proxied to the Node API —
 * and diffs the answers.
 *
 * The local harness (compare.mjs) proves the semantics over a 70-row fixture.
 * This proves them over the real dataset on the real database, which is the
 * evidence that actually matters before flipping a site to native mode.
 *
 * Requires "Allow ?wa_mode=… to override the mode per request" to be switched
 * on under Settings → Wine Agent API on the target site.
 *
 * Usage:
 *   node scripts/parity/run-remote.mjs https://example.com/staging
 *   node scripts/parity/run-remote.mjs <base-url> --verbose
 *
 * The base URL is the site root; the script appends /wp-json/wine-agent/v1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const [baseArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');

if (!baseArg) {
  console.error('usage: run-remote.mjs <site-base-url> [--verbose]');
  process.exit(2);
}

const apiBase = `${baseArg.replace(/\/$/, '')}/wp-json/wine-agent/v1`;
const battery = JSON.parse(readFileSync(resolve(here, 'battery.json'), 'utf8'));

// The WP-param cases exist to document a Node-only quirk; against a real WP
// site both modes see the same request, so there is nothing to compare.
const cases = battery.filter((entry) => !entry.expectDivergence);

async function ask(entry, mode) {
  const separator = entry.query ? '&' : '';
  const url = `${apiBase}/${entry.endpoint}?${entry.query}${separator}wa_mode=${mode}`;
  const started = Date.now();
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const elapsed = Date.now() - started;
  if (!response.ok) {
    throw new Error(`${mode} returned ${response.status} for ${entry.name}`);
  }
  return { body: await response.json(), elapsed };
}

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
  return value;
}

const failures = [];
const timings = { native: [], proxy: [] };

for (const entry of cases) {
  let native;
  let proxy;
  try {
    // Sequential rather than parallel: a shared host under two concurrent
    // requests per case gives timings that say more about contention than
    // about either backend.
    proxy = await ask(entry, 'proxy');
    native = await ask(entry, 'native');
  } catch (error) {
    failures.push({ name: entry.name, error: error.message });
    continue;
  }

  timings.native.push(native.elapsed);
  timings.proxy.push(proxy.elapsed);

  const left = JSON.stringify(canonical(proxy.body));
  const right = JSON.stringify(canonical(native.body));
  if (left === right) {
    if (verbose) {
      console.log(`  ok   ${entry.name.padEnd(32)} proxy ${proxy.elapsed}ms / native ${native.elapsed}ms`);
    }
    continue;
  }
  failures.push({
    name: entry.name,
    proxy: summarize(proxy.body),
    native: summarize(native.body),
  });
}

function summarize(body) {
  if (body && Array.isArray(body.wines)) {
    return { total: body.total, ids: body.wines.map((w) => w.id) };
  }
  return body;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

console.log('');
console.log(`site:   ${apiBase}`);
console.log(`cases:  ${cases.length}`);
console.log(
  `median: proxy ${median(timings.proxy)}ms · native ${median(timings.native)}ms`
);

if (failures.length === 0) {
  console.log(`\nparity: all ${cases.length} cases match on live data`);
  process.exit(0);
}

console.error(`\nparity: ${failures.length} of ${cases.length} cases DIFFER\n`);
for (const failure of failures) {
  console.error(`── ${failure.name}`);
  if (failure.error) {
    console.error(`   error: ${failure.error}`);
  } else {
    console.error(`   proxy : ${JSON.stringify(failure.proxy)}`);
    console.error(`   native: ${JSON.stringify(failure.native)}`);
  }
  console.error('');
}
process.exit(1);
