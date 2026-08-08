import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FixtureClient } from './fixture-client.js';
import { makeWine } from '../test/factory.js';

let dir: string;
const path = (name = 'wines.json') => join(dir, name);

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wine-fixture-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('FixtureClient', () => {
  it('loads the committed fixture', () => {
    const client = new FixtureClient('fixtures/wines.json');
    client.initialize();
    expect(client.getAllWines().length).toBeGreaterThan(20);
  });

  it('accepts the { wines: [...] } envelope', () => {
    writeFileSync(path(), JSON.stringify({ wines: [makeWine({ id: 'a' })] }));
    const client = new FixtureClient(path());
    client.initialize();
    expect(client.getAllWines().map((w) => w.id)).toEqual(['a']);
  });

  it('accepts a bare array', () => {
    writeFileSync(path(), JSON.stringify([makeWine({ id: 'b' })]));
    const client = new FixtureClient(path());
    client.initialize();
    expect(client.getAllWines().map((w) => w.id)).toEqual(['b']);
  });

  it('throws a useful error on the wrong shape', () => {
    writeFileSync(path(), JSON.stringify({ nope: true }));
    expect(() => new FixtureClient(path()).initialize())
      .toThrow(/expected an array of wines/);
  });

  // The point of this client: it must never touch the on-disk cache that a
  // developer built from real WordPress data.
  it('writes nothing to disk, even after mutations', () => {
    const cacheDir = join(dir, 'cache');
    writeFileSync(path(), JSON.stringify({ wines: [makeWine({ id: 'a' })] }));
    const client = new FixtureClient(path());
    client.initialize();

    client.upsertWine(makeWine({ id: 'new' }));
    client.removeWine('a');

    expect(existsSync(cacheDir)).toBe(false);
    expect(readdirSync(dir)).toEqual(['wines.json']);
  });

  it('upserts by id, replacing rather than duplicating', () => {
    writeFileSync(path(), JSON.stringify({ wines: [makeWine({ id: 'a', brandName: 'Old' })] }));
    const client = new FixtureClient(path());
    client.initialize();

    client.upsertWine(makeWine({ id: 'a', brandName: 'New' }));
    expect(client.getAllWines()).toHaveLength(1);
    expect(client.getAllWines()[0].brandName).toBe('New');
  });

  it('removes by id', () => {
    writeFileSync(path(), JSON.stringify({ wines: [makeWine({ id: 'a' }), makeWine({ id: 'b' })] }));
    const client = new FixtureClient(path());
    client.initialize();

    client.removeWine('a');
    expect(client.getAllWines().map((w) => w.id)).toEqual(['b']);
  });
});

describe('the committed fixture covers the cases tests rely on', () => {
  const wines = (() => {
    const c = new FixtureClient('fixtures/wines.json');
    c.initialize();
    return c.getAllWines();
  })();

  const has = (predicate: (w: (typeof wines)[number]) => boolean) => wines.some(predicate);

  it('has accented winery and varietal names', () => {
    expect(has((w) => w.brandName.includes('Itä'))).toBe(true);
    expect(has((w) => w.brandName.includes('Gård'))).toBe(true);
    expect(has((w) => w.mainVarietal.includes('Sémillon'))).toBe(true);
  });

  it('has a winery that is also a vineyard name on another wine', () => {
    expect(has((w) => w.brandName === 'Kiona')).toBe(true);
    expect(has((w) => w.brandName !== 'Kiona' && w.wineName.includes('Kiona'))).toBe(true);
  });

  it('has a note mentioning a varietal that is another wine\'s name', () => {
    expect(has((w) => /merlot/i.test(w.review) && !/merlot/i.test(w.mainVarietal))).toBe(true);
  });

  it('has wines with no price, both spellings', () => {
    expect(has((w) => w.price === 'N/A')).toBe(true);
    expect(has((w) => w.price === '0')).toBe(true);
  });

  it('has a wine with no vintage and one with no rating', () => {
    expect(has((w) => w.vintage === '')).toBe(true);
    expect(has((w) => w.rating === '')).toBe(true);
  });

  it('has both star and numeric ratings', () => {
    expect(has((w) => w.rating.includes('*'))).toBe(true);
    expect(has((w) => /^\d+$/.test(w.rating))).toBe(true);
  });

  it('has the same grape under two different wine types', () => {
    const byGrape = new Map<string, Set<string>>();
    for (const w of wines) {
      if (!byGrape.has(w.mainVarietal)) byGrape.set(w.mainVarietal, new Set());
      byGrape.get(w.mainVarietal)!.add(w.type);
    }
    expect([...byGrape.values()].some((types) => types.size > 1)).toBe(true);
  });

  it('has an appellation outside the Pacific Northwest tree', () => {
    expect(has((w) => w.stateProvince === 'America')).toBe(true);
  });

  it('has a region spanning two states', () => {
    expect(has((w) => /\(\w+\/\w+\)/.test(w.region))).toBe(true);
  });

  it('has tasting notes at both length extremes', () => {
    expect(has((w) => w.review.length > 0 && w.review.length < 40)).toBe(true);
    expect(has((w) => w.review.length > 400)).toBe(true);
  });

  it('has unique ids', () => {
    expect(new Set(wines.map((w) => w.id)).size).toBe(wines.length);
  });
});
