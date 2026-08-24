/**
 * Node side of the parity harness: runs the battery against the real Express
 * routes over the combined fixture, and prints one canonical JSON document.
 *
 * This is the reference implementation — whatever it answers is by definition
 * correct, and the PHP side has to match it.
 *
 * Usage: node scripts/parity/run-node.mjs <combined-fixture.json>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const fixturePath = process.argv[2];

if (!fixturePath) {
  console.error('usage: run-node.mjs <combined-fixture.json>');
  process.exit(2);
}

const { createApp } = await import(resolve(repoRoot, 'web/server/app.ts'));
const { FixtureClient } = await import(resolve(repoRoot, 'web/server/fixture-client.ts'));

const battery = JSON.parse(
  readFileSync(resolve(here, 'battery.json'), 'utf8')
);

const client = new FixtureClient(fixturePath);
if (typeof client.initialize === 'function') await client.initialize();

const app = createApp(client);
const server = await new Promise((res) => {
  const s = app.listen(0, () => res(s));
});
const { port } = server.address();

const results = {};
for (const entry of battery) {
  const url = `http://127.0.0.1:${port}/api/${entry.endpoint}${entry.query ? `?${entry.query}` : ''}`;
  const response = await fetch(url);
  results[entry.name] = {
    status: response.status,
    body: await response.json(),
  };
}

server.close();
process.stdout.write(JSON.stringify(results, null, 2));
