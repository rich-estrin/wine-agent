import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WPClient, CACHE_VERSION, mapWPReview, type WPReview } from './wp-client.js';

const review = (overrides: Partial<WPReview> = {}): WPReview => ({
  id: 1, brand_name: 'Kiona', wine_name: 'Estate Red', designation: '', variety_style: '',
  tasting_note: 'Dusty and dense.', rating: '92', price: '30', vintage: '2020',
  wine_type: 'red', variety: 'cabernet sauvignon', region: 'tri-cities (wa)',
  appellation: 'Red Mountain', publication_date: '2025-06-15', special_designation: '',
  alcohol: '14.1', closure: 'Cork', state_or_province: 'washington', source: 'Sample',
  reviewer: 'A. Taster', ...overrides,
});

describe('mapWPReview — price', () => {
  it('adds a leading $ when missing', () => {
    expect(mapWPReview(review({ price: '30' })).price).toBe('$30');
  });

  it('leaves an existing $ alone', () => {
    expect(mapWPReview(review({ price: '$30' })).price).toBe('$30');
  });

  it('normalises every spelling of "no price" to N/A', () => {
    for (const price of ['', 'NA', '0']) {
      expect(mapWPReview(review({ price })).price).toBe('N/A');
    }
  });
});

// These have been the source of real bugs: \b treats an accented letter as a
// word boundary, which uppercased the letter after it.
describe('mapWPReview — title casing', () => {
  it('title-cases plain values', () => {
    expect(mapWPReview(review({ variety: 'cabernet sauvignon' })).mainVarietal)
      .toBe('Cabernet Sauvignon');
    expect(mapWPReview(review({ wine_type: 'red' })).type).toBe('Red');
  });

  it('does not uppercase the letter after an accent', () => {
    expect(mapWPReview(review({ variety: 'mourvèdre' })).mainVarietal).toBe('Mourvèdre');
    expect(mapWPReview(review({ variety: 'carménère' })).mainVarietal).toBe('Carménère');
    expect(mapWPReview(review({ variety: 'albariño' })).mainVarietal).toBe('Albariño');
    expect(mapWPReview(review({ variety: 'sémillon' })).mainVarietal).toBe('Sémillon');
  });

  it('capitalises after a hyphen', () => {
    expect(mapWPReview(review({ variety_style: 'rhône-style blend' })).varietyStyle)
      .toBe('Rhône-Style Blend');
  });

  it('title-cases the state', () => {
    expect(mapWPReview(review({ state_or_province: 'british columbia' })).stateProvince)
      .toBe('British Columbia');
  });
});

describe('mapWPReview — region casing', () => {
  it('keeps state codes uppercase', () => {
    expect(mapWPReview(review({ region: 'tri-cities (wa)' })).region).toBe('Tri-Cities (WA)');
    expect(mapWPReview(review({ region: 'okanagan (bc)' })).region).toBe('Okanagan (BC)');
  });

  it('keeps compass abbreviations uppercase', () => {
    expect(mapWPReview(review({ region: 'seattle & nw (wa)' })).region).toBe('Seattle & NW (WA)');
  });

  it('keeps a two-state code uppercase', () => {
    expect(mapWPReview(review({ region: 'walla walla valley (wa/or)' })).region)
      .toBe('Walla Walla Valley (WA/OR)');
  });
});

describe('mapWPReview — appellation corrections', () => {
  it('fixes known lowercase spellings', () => {
    expect(mapWPReview(review({ appellation: 'columbia valley' })).ava).toBe('Columbia Valley');
    expect(mapWPReview(review({ appellation: 'walla walla valley' })).ava).toBe('Walla Walla Valley');
  });

  it('expands the shortened Ancient Lakes name', () => {
    expect(mapWPReview(review({ appellation: 'ancient lakes' })).ava)
      .toBe('Ancient Lakes of Columbia Valley');
  });

  it('leaves an unknown appellation as written', () => {
    expect(mapWPReview(review({ appellation: 'Rioja' })).ava).toBe('Rioja');
  });
});

describe('mapWPReview — dates and defaults', () => {
  it('passes an ISO date straight through', () => {
    expect(mapWPReview(review({ publication_date: '2025-06-15' })).publicationDate)
      .toBe('2025-06-15');
  });

  it('normalises a raw Ymd date', () => {
    expect(mapWPReview(review({ publication_date: '20141230' })).publicationDate)
      .toBe('2014-12-30');
  });

  it('stringifies the id', () => {
    expect(mapWPReview(review({ id: 42 })).id).toBe('42');
  });

  it('survives missing fields without throwing', () => {
    const sparse = mapWPReview({ id: 7 } as WPReview);
    expect(sparse.id).toBe('7');
    expect(sparse.brandName).toBe('');
    expect(sparse.price).toBe('N/A');
  });
});

describe('case production', () => {
  it('reads whichever meta key the install uses', () => {
    expect(mapWPReview(review({ cases: '1,200' })).cases).toBe('1200');
    expect(mapWPReview(review({ cases_produced: '850' })).cases).toBe('850');
    expect(mapWPReview(review({ case_production: '48' })).cases).toBe('48');
  });

  it('is blank when the review reports none', () => {
    expect(mapWPReview(review({})).cases).toBe('');
    expect(mapWPReview(review({ cases: '0' })).cases).toBe('');
  });
});


// A cache written before a mapping change has to be discarded, or the new field
// is silently absent everywhere: EC2 keeps its cache across deploys, and only
// the WP URL used to be compared.
describe('WPClient — cache versioning', () => {
  let dir: string;
  const cachePath = () => join(dir, 'cache.json');
  const url = 'https://example.test/staging';

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wine-wp-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const writeCache = (cache: Record<string, unknown>) =>
    writeFileSync(cachePath(), JSON.stringify(cache));

  it('refetches when the cache predates the current version', async () => {
    writeCache({ fetchedAt: '2025-01-01', wpUrl: url, wines: [mapWPReview(review())] });
    let fetched = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched = true;
      return { ok: true, json: async () => ({ reviews: [], total: 0 }) } as Response;
    }) as typeof fetch;
    try {
      await new WPClient(url, 'key', cachePath()).initialize();
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(fetched).toBe(true);
  });

  it('reuses a cache written at the current version', async () => {
    const fresh = new WPClient(url, 'key', cachePath());
    writeCache({
      fetchedAt: '2025-01-01',
      wpUrl: url,
      wines: [mapWPReview(review())],
      version: CACHE_VERSION,
    });
    await fresh.initialize();
    expect(fresh.getAllWines()).toHaveLength(1);
  });
});
