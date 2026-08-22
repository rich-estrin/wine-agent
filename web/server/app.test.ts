import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from './app.js';
import { FixtureClient } from './fixture-client.js';

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
  return res.json() as Promise<Record<string, string[]>>;
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

describe('GET /api/meta — faceting', () => {
  it('returns every facet list', async () => {
    const m = await meta();
    expect(Object.keys(m).sort()).toEqual(
      ['avaList', 'regions', 'specialDesignations', 'stateProvinces', 'types', 'varietals'].sort(),
    );
    expect(m.types.length).toBeGreaterThan(1);
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

describe('POST /api/webhook/review', () => {
  it('upserts a wine and refreshes the facet lists', async () => {
    const { server: s, base: b } = await startApp();
    try {
      const before = await (await fetch(`${b}/api/meta`)).json();
      expect(before.varietals).not.toContain('Zinfandel');

      const res = await fetch(`${b}/api/webhook/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          review: { id: 9001, brand_name: 'New Winery', wine_name: 'Zin', variety: 'Zinfandel',
                    wine_type: 'Red', price: '33', rating: '90', vintage: '2022',
                    appellation: 'Columbia Valley', region: 'Tri-Cities (WA)',
                    state_or_province: 'Washington', tasting_note: 'Brambly.' },
        }),
      });
      expect(res.status).toBe(200);

      const after = await (await fetch(`${b}/api/meta`)).json();
      expect(after.varietals).toContain('Zinfandel');
    } finally {
      await close(s);
    }
  });

  it('deletes a wine', async () => {
    const { server: s, base: b } = await startApp();
    try {
      const before = await (await fetch(`${b}/api/search?limit=1`)).json();
      const res = await fetch(`${b}/api/webhook/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', review: { id: 1 } }),
      });
      expect(res.status).toBe(200);
      const after = await (await fetch(`${b}/api/search?limit=1`)).json();
      expect(after.total).toBe(before.total - 1);
    } finally {
      await close(s);
    }
  });

  it('rejects a request with no action or id', async () => {
    const res = await fetch(`${base}/api/webhook/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('authentication', () => {
  it('rejects unkeyed requests when a secret is configured', async () => {
    const { server: s, base: b } = await startApp('s3cret');
    try {
      expect((await fetch(`${b}/api/search`)).status).toBe(401);
      expect((await fetch(`${b}/api/meta`)).status).toBe(401);

      const ok = await fetch(`${b}/api/search`, { headers: { 'x-wine-agent-key': 's3cret' } });
      expect(ok.status).toBe(200);

      const hookNoKey = await fetch(`${b}/api/webhook/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', review: { id: 1 } }),
      });
      expect(hookNoKey.status).toBe(401);
    } finally {
      await close(s);
    }
  });

  it('allows everything when no secret is configured', async () => {
    expect((await fetch(`${base}/api/search`)).status).toBe(200);
  });
});

describe('GET /api/chat', () => {
  it('is disabled', async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(503);
  });
});
