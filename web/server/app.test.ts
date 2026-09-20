import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from './app.js';
import { FixtureClient } from './fixture-client.js';
import { readFileSync } from 'fs';
import { makeWine } from '../test/factory.js';

// Real routes, real fixture data, over real HTTP on an ephemeral port — the
// same path the browser takes, without depending on WordPress or a CSV export.
let server: Server;
let base: string;

function startApp(secret?: string): Promise<{ server: Server; base: string }> {
  const client = new FixtureClient('fixtures/wines.json');
  client.initialize();
  const app = createApp(client, { secret });
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      const { port } = s.address() as AddressInfo;
      resolve({ server: s, base: `http://127.0.0.1:${port}` });
    });
  });
}

const close = (s: Server) => new Promise<void>((resolve) => s.close(() => resolve()));

beforeAll(async () => {
  ({ server, base } = await startApp());
});
afterAll(() => close(server));

const search = async (qs: string) => {
  const res = await fetch(`${base}/api/search?${qs}`);
  expect(res.status).toBe(200);
  return res.json() as Promise<{ wines: { id: string; brandName: string; wineName: string; price: string; vintage: string; mainVarietal: string; cases: string }[]; total: number }>;
};
const meta = async (qs = '') => {
  const res = await fetch(`${base}/api/meta${qs ? `?${qs}` : ''}`);
  expect(res.status).toBe(200);
  return res.json() as Promise<Record<string, string[]> & { casesMax: number }>;
};

describe('GET /api/search', () => {
  it('returns wines and a total', async () => {
    const { wines, total } = await search('limit=5');
    expect(wines).toHaveLength(5);
    expect(total).toBeGreaterThan(5);
  });

  it('pages with limit and offset without overlapping', async () => {
    const first = await search('limit=3&offset=0&sort_by=rating');
    const second = await search('limit=3&offset=3&sort_by=rating');
    const overlap = first.wines.filter((w) => second.wines.some((x) => x.id === w.id));
    expect(overlap).toEqual([]);
    expect(first.total).toBe(second.total);
  });

  it('matches the winery and a wine naming its vineyard alike', async () => {
    const { wines } = await search('q=Kiona');
    expect(wines.map((w) => w.brandName).sort()).toEqual(['Fidelitas', 'Kiona']);
  });

  it('matches word prefixes, not fragments inside a word', async () => {
    expect((await search('q=Kio')).total).toBeGreaterThan(0);
    expect((await search('q=iona')).total).toBe(0);
  });

  it('ignores the tasting note', async () => {
    // Woodward Canyon's note mentions Merlot; it is a Cabernet, so it must not
    // come back — every hit has to name Merlot in a searched field.
    const { wines } = await search('q=Merlot&limit=200');
    expect(wines.length).toBeGreaterThan(0);
    expect(wines.map((w) => w.brandName)).not.toContain('Woodward Canyon');
    expect(wines.every((w) => /merlot/i.test(`${w.brandName} ${w.wineName} ${w.mainVarietal}`))).toBe(true);
  });

  it('finds accented names without the accent', async () => {
    expect((await search('q=Ita')).wines[0].brandName).toBe('Itä');
    expect((await search('q=Gard')).wines[0].brandName).toBe('Gård Vintners');
    expect((await search('q=semillon')).total).toBeGreaterThan(0);
  });

  it('sorts wines with no price last in both directions', async () => {
    const noPrice = (list: { price: string }[]) => list.filter((w) => w.price === 'N/A' || w.price === '0');
    for (const order of ['desc', 'asc']) {
      const { wines } = await search(`sort_by=price&sort_order=${order}&limit=200`);
      const firstMissing = wines.findIndex((w) => w.price === 'N/A' || w.price === '0');
      expect(firstMissing).toBe(wines.length - noPrice(wines).length);
    }
  });

  it('sorts wines with no vintage last in both directions', async () => {
    for (const order of ['desc', 'asc']) {
      const { wines } = await search(`sort_by=vintage&sort_order=${order}&limit=200`);
      expect(wines.at(-1)!.vintage).toBe('');
    }
  });

  it('defaults to review date, query or not', async () => {
    const withQuery = await search('q=Kiona&limit=5');
    const withQueryDated = await search('q=Kiona&sort_by=publicationDate&limit=5');
    expect(withQuery.wines.map((w) => w.id)).toEqual(withQueryDated.wines.map((w) => w.id));
    const noQuery = await search('limit=5');
    const dated = await search('sort_by=publicationDate&limit=5');
    expect(noQuery.wines.map((w) => w.id)).toEqual(dated.wines.map((w) => w.id));
  });

  it('treats a legacy sort_by=relevance as rating', async () => {
    const legacy = await search('sort_by=relevance&limit=5');
    const rating = await search('sort_by=rating&limit=5');
    expect(legacy.wines.map((w) => w.id)).toEqual(rating.wines.map((w) => w.id));
  });

  it('narrows on a case-production range', async () => {
    const all = await search('limit=200');
    const small = await search('casesMax=500&limit=200');
    expect(small.total).toBeGreaterThan(0);
    expect(small.total).toBeLessThan(all.total);
    expect(small.wines.every((w) => Number(w.cases) <= 500 && w.cases !== '')).toBe(true);

    const large = await search('casesMin=5000&limit=200');
    expect(large.wines.every((w) => Number(w.cases) >= 5000)).toBe(true);
  });

  it('accepts a comma-separated OR list for multi-select facets', async () => {
    const red = await search('type=Red&limit=200');
    const white = await search('type=White&limit=200');
    const both = await search('type=Red,White&limit=200');
    expect(both.total).toBe(red.total + white.total);
  });

  it('combines a query with filters', async () => {
    const { wines } = await search('q=cabernet&type=Red&limit=200');
    expect(wines.length).toBeGreaterThan(0);
  });

  it('returns an empty result set rather than erroring on nonsense', async () => {
    const { wines, total } = await search('q=notawine');
    expect(wines).toEqual([]);
    expect(total).toBe(0);
  });
});

// The tasting note is searched only when the caller asks for it.
describe('GET /api/search — notes=1', () => {
  it('finds a note-only word only with the flag', async () => {
    const plain = await search('q=bright');
    const withNotes = await search('q=bright&notes=1');
    expect(plain.total).toBe(0);
    expect(withNotes.total).toBeGreaterThan(0);
  });

  it('widens the result set rather than replacing it', async () => {
    const plain = await search('q=merlot&limit=100');
    const withNotes = await search('q=merlot&notes=1&limit=100');
    expect(withNotes.total).toBeGreaterThanOrEqual(plain.total);
    const widened = new Set(withNotes.wines.map((w) => w.id));
    for (const wine of plain.wines) expect(widened).toContain(wine.id);
  });

  // A stray param that reached collectFilters would be looked up as a wine
  // field, match nothing, and empty the results.
  it('is not treated as a filter', async () => {
    const off = await search('notes=1&limit=5');
    expect(off.total).toBe((await search('limit=5')).total);
  });

  it('leaves the facet lists alone', async () => {
    const plain = await meta();
    const withNotes = await meta('notes=1');
    expect(withNotes.varietals).toEqual(plain.varietals);
  });
});

describe('GET /api/meta — faceting', () => {
  it('returns every facet list', async () => {
    const m = await meta();
    expect(Object.keys(m).sort()).toEqual(
      ['avaList', 'casesMax', 'regions', 'specialDesignations', 'stateProvinces', 'types', 'varietals'].sort(),
    );
    expect(m.types.length).toBeGreaterThan(1);
  });

  // The Cases slider needs a top end; "0 to Any" told the reader nothing.
  it('reports the highest case production, and does not narrow it by filter', async () => {
    const fixture = JSON.parse(readFileSync('fixtures/wines.json', 'utf-8')) as
      { wines?: { cases: string }[] } | { cases: string }[];
    const rows = Array.isArray(fixture) ? fixture : fixture.wines!;
    const highest = Math.max(...rows.map((w) => parseInt((w.cases || '0').replace(/\D/g, '')) || 0));

    const all = await meta();
    expect(all.casesMax).toBe(highest);
    expect((await meta('type=Red')).casesMax).toBe(highest);
  });

  it('narrows Varietal when a Wine Type is chosen', async () => {
    const all = await meta();
    const red = await meta('type=Red');
    expect(red.varietals.length).toBeLessThan(all.varietals.length);
    expect(red.varietals).not.toContain('Albariño');
  });

  it('never narrows a facet by itself, so a selection can still be changed', async () => {
    const all = await meta();
    const red = await meta('type=Red');
    expect(red.types).toEqual(all.types);
  });

  it('follows the data, not a taxonomy — a white Cabernet Franc shows under White', async () => {
    const white = await meta('type=White');
    expect(white.varietals).toContain('Cabernet Franc');
  });

  it('narrows Appellation and Home Region when a state is chosen', async () => {
    const all = await meta();
    const oregon = await meta('stateProvince=Oregon');
    expect(oregon.avaList.length).toBeLessThan(all.avaList.length);
    expect(oregon.regions.every((r) => /\(.*OR.*\)/.test(r))).toBe(true);
    expect(oregon.stateProvinces).toEqual(all.stateProvinces); // itself untouched
  });

  it('surfaces appellations outside the Pacific Northwest tree', async () => {
    const other = await meta('stateProvince=America');
    expect(other.avaList).toContain('Rioja');
  });

  it('narrows on a multi-select OR list', async () => {
    const or = await meta('stateProvince=Oregon');
    const orAndWa = await meta('stateProvince=Oregon,Washington');
    expect(orAndWa.avaList.length).toBeGreaterThan(or.avaList.length);
  });

  it('returns empty facets for a filter that matches nothing', async () => {
    const none = await meta('type=Fortified');
    expect(none.varietals).toEqual([]);
  });

  it('caches per filter set — repeated calls agree', async () => {
    expect(await meta('type=Red')).toEqual(await meta('type=Red'));
  });
});

// ─── Request bounds ───────────────────────────────────────────────────────────
// /search and /meta are public and unauthenticated on the production site, so
// every number and every key in the query string is attacker-controlled.

describe('GET /api/search request bounds', () => {
  // 150 wines, so the 100-row cap is observable — the committed fixture is
  // smaller than the cap and could never show it.
  const many = {
    wines: Array.from({ length: 150 }, (_, i) =>
      makeWine({ id: `bulk-${i}`, brandName: `Winery ${i}`, rating: '90' }),
    ),
    getAllWines() { return this.wines; },
  };

  let bulkServer: Server;
  let bulkBase: string;

  beforeAll(async () => {
    const app = createApp(many);
    await new Promise<void>((resolve) => {
      bulkServer = app.listen(0, () => {
        const { port } = bulkServer.address() as AddressInfo;
        bulkBase = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });
  afterAll(() => close(bulkServer));

  const bulkSearch = async (qs: string) => {
    const res = await fetch(`${bulkBase}/api/search?${qs}`);
    expect(res.status).toBe(200);
    return res.json() as Promise<{ wines: { id: string }[]; total: number }>;
  };

  it('caps the page size at 100 rows', async () => {
    const { wines, total } = await bulkSearch('limit=100000');
    expect(wines).toHaveLength(100);
    // The match count is the real one — only the page is capped.
    expect(total).toBe(150);
  });

  it('treats a zero or negative limit as a single row', async () => {
    expect((await bulkSearch('limit=0')).wines).toHaveLength(1);
    expect((await bulkSearch('limit=-5')).wines).toHaveLength(1);
  });

  it('treats a negative offset as zero', async () => {
    const negative = await bulkSearch('limit=5&offset=-10');
    const zero = await bulkSearch('limit=5&offset=0');
    expect(negative.wines.map((w) => w.id)).toEqual(zero.wines.map((w) => w.id));
  });
});

describe('unrecognised filter keys', () => {
  it('are ignored by /api/search rather than emptying the results', async () => {
    const plain = await search('limit=5');
    const withJunk = await search('limit=5&brandName=ecole&utm_source=newsletter');
    expect(withJunk.total).toBe(plain.total);
    expect(withJunk.wines.map((w) => w.id)).toEqual(plain.wines.map((w) => w.id));
  });

  it('are ignored by /api/meta rather than emptying the facets', async () => {
    expect(await meta('reviewer=RE')).toEqual(await meta());
  });

  it('do not disturb the filters that are recognised', async () => {
    const red = await search('type=Red&limit=200');
    const redWithJunk = await search('type=Red&limit=200&brandName=nonesuch');
    expect(redWithJunk.total).toBe(red.total);
    expect(red.total).toBeGreaterThan(0);
  });
});
