import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CSVClient } from './csv-client.js';

// The CSV path is the other way review data enters the app, with its own column
// names and its own normalisation. Exercised through a temp file so the cache
// behaviour is covered too — and so the developer's real cache is never touched.
let dir: string;
const cachePath = () => join(dir, 'cache.json');
const csvPath = () => join(dir, 'export.csv');

const HEADER = [
  'ID', 'Title', 'Date', 'Permalink',
  'Review Input => Designation', 'Review Input => Variety Style',
  'Review Input => Varietal Label', 'Review Input => Appellation',
  'Review Input => Vintage', 'Review Input => Price', 'Review Input => Rating',
  'Review Input => Review Content', 'Review Input => Home Region',
  'Review Input => Wine Type', 'Review Input => Special Designation',
  'Review Input => Alcohol Percentage', 'Review Input => Closure',
  'Review Input => State or Province', 'Review Input => Source',
  'Review Input => Reviewer',
].join(',');

function writeCsv(rows: string[]) {
  writeFileSync(csvPath(), [HEADER, ...rows].join('\n'));
}

/** One row with sensible defaults; pass overrides by column index. */
function row(overrides: Record<number, string> = {}): string {
  const cells = [
    '1', 'Kiona', '2025-06-15', 'https://example.test/kiona',
    '', '', 'cabernet sauvignon', 'Red Mountain',
    '2020', '30', '92', 'Dusty and dense.', 'tri-cities (wa)',
    'red', '', '14.1', 'Cork', 'washington', 'Sample', 'A. Taster',
  ];
  for (const [i, v] of Object.entries(overrides)) cells[Number(i)] = v;
  return cells.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}

const load = () => {
  const client = new CSVClient(csvPath(), cachePath());
  client.initialize();
  return client;
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wine-csv-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('CSVClient — parsing', () => {
  it('maps a row onto the Wine shape', () => {
    writeCsv([row()]);
    const [wine] = load().getAllWines();
    expect(wine).toMatchObject({
      id: '1',
      brandName: 'Kiona',
      ava: 'Red Mountain',
      vintage: '2020',
      price: '$30',
      rating: '92',
      type: 'Red',
      mainVarietal: 'Cabernet Sauvignon',
      region: 'Tri-Cities (WA)',
      stateProvince: 'Washington',
      hyperlink: 'https://example.test/kiona',
    });
  });

  it('prefers Designation, then Variety Style, then Varietal Label for the wine name', () => {
    writeCsv([row({ 4: 'Estate Reserve', 5: 'Bordeaux Blend' })]);
    expect(load().getAllWines()[0].wineName).toBe('Estate Reserve');

    rmSync(cachePath(), { force: true });
    writeCsv([row({ 4: '', 5: 'Bordeaux Blend' })]);
    expect(load().getAllWines()[0].wineName).toBe('Bordeaux Blend');

    rmSync(cachePath(), { force: true });
    writeCsv([row({ 4: '', 5: '' })]);
    expect(load().getAllWines()[0].wineName).toBe('cabernet sauvignon');
  });

  it('normalises every spelling of "no price" to N/A', () => {
    writeCsv([row({ 0: '1', 9: '' }), row({ 0: '2', 9: 'NA' }), row({ 0: '3', 9: '0' })]);
    expect(load().getAllWines().map((w) => w.price)).toEqual(['N/A', 'N/A', 'N/A']);
  });

  it('does not uppercase the letter after an accent', () => {
    writeCsv([row({ 6: 'mourvèdre' }), row({ 0: '2', 6: 'carménère' })]);
    expect(load().getAllWines().map((w) => w.mainVarietal)).toEqual(['Mourvèdre', 'Carménère']);
  });

  it('keeps geographic abbreviations uppercase in the region', () => {
    writeCsv([row({ 12: 'seattle & nw (wa)' })]);
    expect(load().getAllWines()[0].region).toBe('Seattle & NW (WA)');
  });

  it('applies the known appellation corrections', () => {
    writeCsv([row({ 7: 'ancient lakes' })]);
    expect(load().getAllWines()[0].ava).toBe('Ancient Lakes of Columbia Valley');
  });

  it('handles quoted fields containing commas', () => {
    writeCsv([row({ 11: 'Cherry, cocoa, and sage.' })]);
    expect(load().getAllWines()[0].review).toBe('Cherry, cocoa, and sage.');
  });

  it('parses an empty export to an empty list', () => {
    writeCsv([]);
    expect(load().getAllWines()).toEqual([]);
  });
});

describe('CSVClient — cache', () => {
  it('reuses the cache on a second load', () => {
    writeCsv([row()]);
    load();
    // Change the CSV underneath; the cache should win.
    writeCsv([row({ 1: 'Changed Winery' })]);
    expect(load().getAllWines()[0].brandName).toBe('Kiona');
  });

  it('rebuilds when the CSV path changes', () => {
    writeCsv([row()]);
    load();

    const other = join(dir, 'other.csv');
    writeFileSync(other, [HEADER, row({ 1: 'Other Winery' })].join('\n'));
    const client = new CSVClient(other, cachePath());
    client.initialize();
    expect(client.getAllWines()[0].brandName).toBe('Other Winery');
  });

  it('upserts and removes in memory and persists', () => {
    writeCsv([row()]);
    const client = load();
    client.upsertWine({ ...client.getAllWines()[0], id: '99', brandName: 'Added' });
    expect(client.getAllWines()).toHaveLength(2);

    client.removeWine('99');
    expect(client.getAllWines().map((w) => w.id)).toEqual(['1']);

    // A fresh client reading the same cache sees the removal.
    const reopened = new CSVClient(csvPath(), cachePath());
    reopened.initialize();
    expect(reopened.getAllWines().map((w) => w.id)).toEqual(['1']);
  });
});
