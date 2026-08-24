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

// Which filter param narrows which facet list.
const FACET_CONTROLS = {
  varietals: 'mainVarietal',
  regions: 'region',
  types: 'type',
  avaList: 'ava',
  stateProvinces: 'stateProvince',
  specialDesignations: 'specialDesignation',
};

const STEERING_PARAMS = new Set(['q', 'limit', 'offset', 'sort_by', 'sort_order', 'notes', 'wa_mode']);

/** The filter params in a battery query — the ones that narrow facets. */
function activeFilters(query) {
  const filters = [];
  for (const [key, value] of new URLSearchParams(query)) {
    if (!STEERING_PARAMS.has(key) && value.trim()) filters.push(key);
  }
  return filters;
}

/**
 * Compare a filtered /meta response.
 *
 * Proxy mode never forwarded query params, so its facet lists are always the
 * full unnarrowed universe; native forwards them and narrows. The two are
 * therefore *supposed* to differ here — that is the behaviour change. What
 * must still hold is the relationship between them:
 *
 *   - a narrowed list is a subset of the unnarrowed one (native cannot invent
 *     an option that isn't in the data)
 *   - the facet a filter controls is NOT narrowed by its own filter, so it
 *     still matches proxy exactly
 *   - casesMax is computed over every wine, so filters never move it
 *
 * A violation of any of those is a real bug; a plain difference is not.
 */
function checkNarrowing(proxyBody, nativeBody, filters) {
  const problems = [];

  if (proxyBody.casesMax !== nativeBody.casesMax) {
    problems.push(`casesMax moved under a filter: ${proxyBody.casesMax} → ${nativeBody.casesMax}`);
  }

  for (const [facet, controls] of Object.entries(FACET_CONTROLS)) {
    const wide = proxyBody[facet];
    const narrow = nativeBody[facet];
    if (!Array.isArray(wide) || !Array.isArray(narrow)) {
      problems.push(`${facet}: missing from one of the responses`);
      continue;
    }

    const universe = new Set(wide);
    const invented = narrow.filter((v) => !universe.has(v));
    if (invented.length) {
      problems.push(`${facet}: native returned values absent from the full list: ${invented.join(', ')}`);
    }

    if (filters.includes(controls)) {
      // Self-facet: its own filter must not narrow it.
      if (JSON.stringify(wide) !== JSON.stringify(narrow)) {
        problems.push(
          `${facet}: narrowed by its own filter (${controls}) — a selection could not be changed`
        );
      }
    }
  }

  return problems;
}

const failures = [];
const narrowed = [];
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

  const filters = activeFilters(entry.query);
  const expectNarrowing = entry.endpoint === 'meta' && filters.length > 0;

  if (expectNarrowing) {
    // Equality is the wrong test here — see checkNarrowing.
    const problems = checkNarrowing(proxy.body, native.body, filters);
    if (problems.length) {
      failures.push({ name: entry.name, problems });
    } else {
      narrowed.push(entry.name);
      if (verbose) {
        console.log(
          `  narrowed ${entry.name.padEnd(28)} proxy ${proxy.elapsed}ms / native ${native.elapsed}ms`
        );
      }
    }
    continue;
  }

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
  const identical = cases.length - narrowed.length;
  console.log(`\nparity: ${identical} cases byte-identical on live data`);
  if (narrowed.length) {
    console.log(
      `        ${narrowed.length} filtered /meta cases narrow correctly (proxy never forwarded`
    );
    console.log(`        the filters, so these are expected to differ): ${narrowed.join(', ')}`);
  }
  process.exit(0);
}

console.error(`\nparity: ${failures.length} of ${cases.length} cases FAILED\n`);
for (const failure of failures) {
  console.error(`── ${failure.name}`);
  if (failure.error) {
    console.error(`   error: ${failure.error}`);
  } else if (failure.problems) {
    for (const problem of failure.problems) {
      console.error(`   ${problem}`);
    }
  } else {
    console.error(`   proxy : ${JSON.stringify(failure.proxy)}`);
    console.error(`   native: ${JSON.stringify(failure.native)}`);
  }
  console.error('');
}
process.exit(1);
