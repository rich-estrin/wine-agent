import { searchWines, filterWines, matchesFilter } from './wine-search.js';
import { sortWines } from './wine-utils.js';
import type { Wine } from '../src/types.js';

const base: Wine = {
  id: '', brandName: '', wineName: '', ava: '', vintage: '', price: '', rating: '',
  review: '', region: '', type: '', mainVarietal: '', varietyStyle: '', tastingDate: '',
  publicationDate: '', setting: '', purchasedProvided: '', temp: '', hyperlink: '',
  specialDesignation: '', alcohol: '', closure: '', stateProvince: '', source: '', reviewer: '',
};
const w = (o: Partial<Wine>): Wine => ({ ...base, ...o });

const wines: Wine[] = [
  w({ id: '1', brandName: 'Itä', wineName: 'Estate Red', vintage: '2021', price: '$45', rating: '92', type: 'Red' }),
  w({ id: '2', brandName: 'Gård Vintners', wineName: 'Grand Klasse', vintage: '2019', price: '$38', rating: '91', type: 'Red' }),
  w({ id: '3', brandName: 'Kiona', wineName: 'Estate Cabernet', vintage: '2020', price: '$30', rating: '90', type: 'Red' }),
  w({ id: '4', brandName: 'Fidelitas', wineName: 'Kiona Vineyard Cabernet', vintage: '2020', price: '$60', rating: '94', type: 'Red' }),
  w({ id: '5', brandName: 'Barnard Griffin', wineName: 'Sémillon', vintage: '2022', price: 'N/A', rating: '89', type: 'White', mainVarietal: 'Sémillon' }),
  w({ id: '6', brandName: 'Chinook', wineName: 'Merlot', vintage: '2021', price: '$28', rating: '90', mainVarietal: 'Merlot', type: 'Red' }),
  w({ id: '7', brandName: 'Woodward Canyon', wineName: 'Old Vines', vintage: '2018', price: '$95', rating: '95',
      review: 'A blend with Merlot rounding out the mid-palate; garden herbs on the finish.', type: 'Red' }),
  w({ id: '8', brandName: 'No Price Cellars', wineName: 'Reserve', vintage: '2020', price: 'N/A', rating: '93', type: 'Red' }),
  w({ id: '9', brandName: 'Zero Cellars', wineName: 'Library', vintage: '', price: '0', rating: '88', type: 'Red' }),
];

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${e}\n        actual   ${a}`);
}
const ids = (ws: Wine[]) => ws.map((x) => x.id);

console.log('\n── B1: accent-insensitive search ──');
// Mid-word substring matches are KEPT but ranked last (see open question Q1):
// "Ita" also matches Fidelitas, "Gard" also matches "garden herbs" in a review.
check('"Ita" ranks Itä first',    ids(searchWines(wines, { query: 'Ita', limit: 99 }))[0], '1');
check('"Ita" keeps loose match',  ids(searchWines(wines, { query: 'Ita', limit: 99 })), ['1', '4']);
check('"Gard" ranks Gård first',  ids(searchWines(wines, { query: 'Gard', limit: 99 }))[0], '2');
check('"Gard" keeps garden herbs', ids(searchWines(wines, { query: 'Gard', limit: 99 })), ['2', '7']);
check('"semillon" finds Sémillon', ids(searchWines(wines, { query: 'semillon', limit: 99 })), ['5']);
check('"Sémillon" finds it too',  ids(searchWines(wines, { query: 'Sémillon', limit: 99 })), ['5']);

console.log('\n── B2: winery name outranks review/vineyard text ──');
check('Kiona: winery first',      ids(searchWines(wines, { query: 'Kiona', limit: 99 })), ['3', '4']);
check('Merlot: name over review', ids(searchWines(wines, { query: 'Merlot', limit: 99 })), ['6', '7']);
check('review match still found', ids(searchWines(wines, { query: 'garden herbs', limit: 99 })), ['7']);
check('multi-term AND holds',     ids(searchWines(wines, { query: 'Kiona Cabernet', limit: 99 })), ['3', '4']);
check('no match returns nothing', ids(searchWines(wines, { query: 'zinfandel', limit: 99 })), []);

console.log('\n── B3: missing values sort last in BOTH directions ──');
const priceDesc = ids(sortWines(wines, 'price', 'desc'));
const priceAsc  = ids(sortWines(wines, 'price', 'asc'));
check('desc: no-price last', priceDesc.slice(-3).sort(), ['5', '8', '9']);
check('desc: most expensive first', priceDesc[0], '7');
check('asc:  no-price last', priceAsc.slice(-3).sort(), ['5', '8', '9']);
check('asc:  cheapest first', priceAsc[0], '6');
const vinAsc = ids(sortWines(wines, 'vintage', 'asc'));
check('no vintage sorts last', vinAsc[vinAsc.length - 1], '9');

console.log('\n── Filters still behave ──');
check('priceMin excludes no-price', ids(filterWines(wines, { filters: { priceMin: '1' }, limit: 99 })).sort(), ['1','2','3','4','6','7']);
check('type OR list (multi-select)', ids(filterWines(wines, { filters: { type: 'White,Red' }, limit: 99 })).length, 9);
check('varietal exact, not prefix',  ids(filterWines(wines, { filters: { mainVarietal: 'Merlot' }, limit: 99 })), ['6']);
check('varietal matches unaccented', matchesFilter(wines[4], 'mainVarietal', 'Semillon'), true);
check('vintage single year 2022',    ids(filterWines(wines, { filters: { vintageMin: '2022', vintageMax: '2022' }, limit: 99 })), ['5']);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
