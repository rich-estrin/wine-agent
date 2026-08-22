// Generates fixtures/wines.json — the standalone/test dataset.
// Run with: node fixtures/generate.mjs
//
// Every row is invented. The set is deliberately small enough to reason about
// and shaped to cover the edge cases documented in fixtures/README.md, so a
// test can assert on an exact wine rather than "some result".
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'wines.json');

const NOTE_SHORT = 'Bright and direct.';
const NOTE_LONG =
  'Opens with macerated black cherry, cassis and a dusting of cocoa, then turns ' +
  'savoury — dried sage, crushed basalt, a little cured meat. The oak is present ' +
  'but folded in, more sandalwood than vanilla. Tannins are fine-grained and ' +
  'persistent, framing a mid-palate that keeps unfolding well past the first ' +
  'impression. Acidity holds the whole thing upright and carries a long, faintly ' +
  'salty finish. Give it two or three years in bottle and it should knit ' +
  'completely; drinking well through the end of the decade, and likely longer ' +
  'for anyone with the patience to wait it out. A serious wine from a site that ' +
  'has quietly become one of the most reliable in the valley.';

let nextId = 1;
const wines = [];

function wine(o) {
  wines.push({
    id: String(nextId++),
    brandName: '', wineName: '', ava: '', vintage: '', price: '', rating: '',
    review: '', region: '', type: '', mainVarietal: '', varietyStyle: '',
    tastingDate: '', publicationDate: '2025-06-15', setting: '',
    purchasedProvided: '', temp: '', hyperlink: '', specialDesignation: '',
    alcohol: '14.1%', closure: 'Cork', cases: '', stateProvince: '', source: 'Sample',
    reviewer: 'A. Taster',
    ...o,
  });
}

// ── Accent cases ───────────────────────────────────────────────────────────
wine({ brandName: 'Itä', wineName: 'Estate Red', ava: 'Walla Walla Valley', vintage: '2021',
       price: '$45', rating: '93', type: 'Red', mainVarietal: 'Syrah', stateProvince: 'Washington',
       region: 'Walla Walla Valley (WA/OR)', review: 'Cool-toned and peppery, with olive and iron.' });
wine({ brandName: 'Gård Vintners', wineName: 'Grand Klasse Reserve', ava: 'Royal Slope', vintage: '2019',
       price: '$38', rating: '91', type: 'Red', mainVarietal: 'Merlot', stateProvince: 'Washington',
       region: 'Ancient Lakes (WA)', review: 'Plummy and plush, finishing with garden herbs and tobacco.' });
wine({ brandName: 'Barnard Griffin', wineName: 'Sémillon', ava: 'Columbia Valley', vintage: '2022',
       price: 'N/A', rating: '89', type: 'White', mainVarietal: 'Sémillon', stateProvince: 'Washington',
       region: 'Tri-Cities (WA)', review: 'Lanolin and lemon curd; a waxy, generous white.' });
wine({ brandName: 'Bergström', wineName: 'Cumberland Reserve', ava: 'Willamette Valley', vintage: '2021',
       price: '$55', rating: '93', type: 'Red', mainVarietal: 'Pinot Noir', stateProvince: 'Oregon',
       region: 'Willamette (OR)', review: NOTE_LONG });
wine({ brandName: 'Cadaretta', wineName: 'Carménère', ava: 'Columbia Valley', vintage: '2020',
       price: '$42', rating: '91', type: 'Red', mainVarietal: 'Carménère', stateProvince: 'Washington',
       region: 'Walla Walla Valley (WA/OR)', review: 'Green peppercorn and blackberry, firmly structured.' });
wine({ brandName: 'Maison Bleue', wineName: 'Rhône-Style Blend', ava: 'Yakima Valley', vintage: '2020',
       price: '$48', rating: '92', type: 'Red', mainVarietal: 'Grenache', varietyStyle: 'Rhône-Style Blend',
       // The accented "Rhône" in the note, matched by an unaccented query against
       // the wine name, is what exercises the highlighter's offset mapping.
       stateProvince: 'Washington', region: 'Yakima (WA)',
       review: 'Raspberry, garrigue and warm stone — a Rhône blend through and through.' });

// ── Apostrophe cases ───────────────────────────────────────────────────────
// Readers type these names without the punctuation, and the export spells them
// both ways: an ASCII quote on one row, a typographic one on the other. Both
// must be findable as "lecole" / "colters" and as the written spelling.
wine({ brandName: "L'Ecole No. 41", wineName: 'Frenchtown Merlot', ava: 'Walla Walla Valley',
       vintage: '2019', price: '$40', rating: '92', type: 'Red', mainVarietal: 'Merlot',
       stateProvince: 'Washington', region: 'Walla Walla Valley (WA/OR)',
       review: 'Cedar and red plum, with the estate’s familiar savoury edge.' });
wine({ brandName: 'Colter’s Creek', wineName: 'Koos Koos Kia Red', ava: 'Lewis-Clark Valley',
       vintage: '2021', price: '$28', rating: '90', type: 'Red', mainVarietal: 'Syrah',
       stateProvince: 'Idaho', region: 'Sunnyslope (ID)',
       review: 'Peppery and lean, with dried cherry and sage.' });

// ── Winery name that is also a vineyard name ───────────────────────────────
wine({ brandName: 'Kiona', wineName: 'Estate Cabernet Sauvignon', ava: 'Red Mountain', vintage: '2020',
       price: '$30', rating: '92', type: 'Red', mainVarietal: 'Cabernet Sauvignon',
       stateProvince: 'Washington', region: 'Tri-Cities (WA)', review: 'Dense and dusty, classic Red Mountain grip.' });
wine({ brandName: 'Fidelitas', wineName: 'Kiona Vineyard Cabernet Sauvignon', ava: 'Red Mountain', vintage: '2020',
       price: '$60', rating: '94', type: 'Red', mainVarietal: 'Cabernet Sauvignon',
       stateProvince: 'Washington', region: 'Tri-Cities (WA)', specialDesignation: "Critic's Choice",
       review: 'Polished and deep, a benchmark bottling from the Kiona site.' });
wine({ brandName: 'Obelisco', wineName: 'Estate Electrum', ava: 'Red Mountain', vintage: '2019',
       price: '$85', rating: '93', type: 'Red', mainVarietal: 'Cabernet Sauvignon',
       stateProvince: 'Washington', region: 'Tri-Cities (WA)', review: 'Muscular, with graphite and cassis.' });

// ── Varietal in the name vs in the note ────────────────────────────────────
wine({ brandName: 'Chinook', wineName: 'Merlot', ava: 'Yakima Valley', vintage: '2021',
       price: '$28', rating: '90', type: 'Red', mainVarietal: 'Merlot', stateProvince: 'Washington',
       region: 'Yakima (WA)', review: 'Supple red plum with a clean, herbal edge.' });
wine({ brandName: 'Woodward Canyon', wineName: 'Old Vines Cabernet Sauvignon', ava: 'Walla Walla Valley',
       vintage: '2018', price: '$95', rating: '95', type: 'Red', mainVarietal: 'Cabernet Sauvignon',
       stateProvince: 'Washington', region: 'Walla Walla Valley (WA/OR)', specialDesignation: 'Cellar Stocker',
       review: 'A blend with Merlot rounding out the mid-palate; garden herbs on the long finish.' });

// ── Missing price (both spellings) and missing vintage ─────────────────────
wine({ brandName: 'Cellar Door', wineName: 'Library Reserve', ava: 'Yakima Valley', vintage: '2020',
       price: 'N/A', rating: '93', type: 'Red', mainVarietal: 'Syrah', stateProvince: 'Washington',
       region: 'Yakima (WA)', review: 'Held back and released late; smoke and dried fig.' });
wine({ brandName: 'Quarry Butte', wineName: 'Unpriced Red', ava: 'Columbia Valley', vintage: '2019',
       price: '0', rating: '88', type: 'Red', mainVarietal: 'Merlot', stateProvince: 'Washington',
       region: 'Tri-Cities (WA)', review: NOTE_SHORT });
wine({ brandName: 'Nonvintage Cellars', wineName: 'Solera Blend', ava: 'Columbia Valley', vintage: '',
       price: '$35', rating: '90', type: 'White', mainVarietal: 'Chardonnay', stateProvince: 'Washington',
       region: 'Woodinville (WA)', review: 'A multi-year blend; nutty and oxidative in the best way.' });

// ── Star ratings alongside numeric scores ──────────────────────────────────
wine({ brandName: 'Silver Bell', wineName: 'Old Block Riesling', ava: 'Ancient Lakes of Columbia Valley',
       vintage: '2022', price: '$19', rating: '****', type: 'White', mainVarietal: 'Riesling',
       stateProvince: 'Washington', region: 'Ancient Lakes (WA)', review: 'Lime pith and wet slate, off-dry.' });
wine({ brandName: 'Harrow & Vine', wineName: 'Dry Rosé', ava: 'Columbia Gorge', vintage: '2023',
       price: '$21', rating: '***1/2', type: 'Rosé', mainVarietal: 'Cabernet Franc',
       stateProvince: 'Washington', region: 'Gorge (WA)', review: 'Strawberry skin and a saline snap.' });
wine({ brandName: 'Tumbledown', wineName: 'Unrated Curiosity', ava: 'Puget Sound', vintage: '2022',
       price: '$24', rating: '', type: 'White', mainVarietal: 'Siegerrebe',
       stateProvince: 'Washington', region: 'Seattle & NW (WA)', review: NOTE_SHORT });

// ── Wine type follows the data, not the grape ──────────────────────────────
wine({ brandName: 'Owen Roe', wineName: 'Sinister Hand', ava: 'Yakima Valley', vintage: '2021',
       price: '$32', rating: '91', type: 'Red', mainVarietal: 'Cabernet Franc',
       stateProvince: 'Washington', region: 'Yakima (WA)', review: 'Bramble and violet, medium-bodied.' });
wine({ brandName: 'Pale Harvest', wineName: 'White Cabernet Franc', ava: 'Yakima Valley', vintage: '2023',
       price: '$26', rating: '89', type: 'White', mainVarietal: 'Cabernet Franc',
       stateProvince: 'Washington', region: 'Yakima (WA)', review: 'Direct-pressed and pale; green almond and citrus.' });
wine({ brandName: 'Northlight', wineName: 'Blanc de Pinot Noir', ava: 'Willamette Valley', vintage: '2022',
       price: '$44', rating: '92', type: 'Sparkling', mainVarietal: 'Pinot Noir',
       stateProvince: 'Oregon', region: 'Willamette (OR)', review: 'Fine bead, brioche and white cherry.' });

// ── Non-PNW state and appellation outside the fixed tree ───────────────────
wine({ brandName: 'Import Cellars', wineName: 'Rioja Crianza', ava: 'Rioja', vintage: '2019',
       price: '$25', rating: '90', type: 'Red', mainVarietal: 'Tempranillo',
       stateProvince: 'America', region: 'Imported (Other)', review: 'Dill and dried cherry, traditional in style.' });
wine({ brandName: 'Transatlantic', wineName: 'Chianti Classico', ava: 'Chianti Classico', vintage: '2020',
       price: '$29', rating: '89', type: 'Red', mainVarietal: 'Sangiovese',
       stateProvince: 'America', region: 'Imported (Other)', review: 'Sour cherry and leather, brisk finish.' });

// ── Idaho and British Columbia ─────────────────────────────────────────────
wine({ brandName: 'Sawtooth', wineName: 'Classic Fly Series Riesling', ava: 'Snake River Valley', vintage: '2021',
       price: '$18', rating: '88', type: 'White', mainVarietal: 'Riesling', stateProvince: 'Idaho',
       region: 'Sunnyslope (ID)', review: 'Apple blossom and lime, gently sweet.' });
wine({ brandName: 'Eagle Foothills Estate', wineName: 'Reserve Syrah', ava: 'Eagle Foothills', vintage: '2020',
       price: '$36', rating: '91', type: 'Red', mainVarietal: 'Syrah', stateProvince: 'Idaho',
       region: 'Sunnyslope (ID)', review: 'Smoked plum and desert scrub.' });
wine({ brandName: 'Mission Hill', wineName: 'Reserve Merlot', ava: 'Okanagan Valley', vintage: '2020',
       price: '$40', rating: '91', type: 'Red', mainVarietal: 'Merlot', stateProvince: 'British Columbia',
       region: 'Okanagan (BC)', review: 'Rounded and cool-climate, with cedar.' });
wine({ brandName: 'Golden Mile Bench Winery', wineName: 'Estate Pinot Gris', ava: 'Golden Mile Bench',
       vintage: '2022', price: '$27', rating: '89', type: 'White', mainVarietal: 'Pinot Gris',
       stateProvince: 'British Columbia', region: 'Okanagan (BC)', review: 'Pear skin and a chalky finish.' });

// ── Oregon spread ──────────────────────────────────────────────────────────
wine({ brandName: 'Abacela', wineName: 'Fiesta Albariño', ava: 'Umpqua Valley', vintage: '2022',
       price: '$22', rating: '90', type: 'White', mainVarietal: 'Albariño', stateProvince: 'Oregon',
       region: 'Umpqua (OR)', review: 'Grapefruit and sea spray, crisp throughout.' });
wine({ brandName: 'Ribbon Ridge Cellars', wineName: 'Estate Pinot Noir', ava: 'Ribbon Ridge', vintage: '2021',
       price: '$68', rating: '94', type: 'Red', mainVarietal: 'Pinot Noir', stateProvince: 'Oregon',
       region: 'Willamette (OR)', specialDesignation: 'Editor’s Choice'.replace('’', "'"),
       review: 'Red currant, forest floor and fine tannin.' });
wine({ brandName: 'Applegate Ridge', wineName: 'Tempranillo', ava: 'Applegate Valley', vintage: '2020',
       price: '$34', rating: '90', type: 'Red', mainVarietal: 'Tempranillo', stateProvince: 'Oregon',
       region: 'Rogue (OR)', review: 'Warm-climate depth with a cocoa edge.' });
wine({ brandName: 'Elkton Hill', wineName: 'Late Harvest Gewürztraminer', ava: 'Elkton Oregon', vintage: '2021',
       price: '$32', rating: '91', type: 'Dessert', mainVarietal: 'Gewürztraminer', stateProvince: 'Oregon',
       region: 'Umpqua (OR)', review: 'Lychee and honey, cut by good acid.' });

// ── Very long names, for card and chip overflow ────────────────────────────
wine({ brandName: 'The Rocks District Cooperative Winery & Vineyard Company',
       wineName: 'Single Block Estate Reserve Syrah from the Home Vineyard',
       ava: 'The Rocks District of Milton-Freewater', vintage: '2020', price: '$120', rating: '96',
       type: 'Red', mainVarietal: 'Syrah', stateProvince: 'Oregon', region: 'Walla Walla Valley (WA/OR)',
       specialDesignation: "Critic's Choice", review: NOTE_LONG });

// ── Price spread, for slider and sort coverage ─────────────────────────────
const spread = [
  ['Everyday Red',      '$12', '86', 'Red',   'Merlot'],
  ['Weeknight White',   '$15', '87', 'White', 'Pinot Gris'],
  ['Midweek Rosé',      '$17', '88', 'Rosé',  'Sangiovese'],
  ['Sunday Syrah',      '$52', '92', 'Red',   'Syrah'],
  ['Anniversary Cab',   '$150','95', 'Red',   'Cabernet Sauvignon'],
  ['Collector Reserve', '$275','97', 'Red',   'Cabernet Sauvignon'],
];
spread.forEach(([name, price, rating, type, varietal], i) => {
  wine({ brandName: 'Columbia Bench', wineName: name, ava: 'Horse Heaven Hills',
         vintage: String(2018 + (i % 5)), price, rating, type, mainVarietal: varietal,
         stateProvince: 'Washington', region: 'Tri-Cities (WA)',
         publicationDate: `202${3 + (i % 3)}-0${1 + (i % 9)}-12`,
         review: i % 2 ? NOTE_SHORT : 'Balanced and varietally true, with clean fruit and a tidy finish.' });
});

// ── Enough volume to exercise paging and "show more" ───────────────────────
const fillers = [
  ['Basalt Ridge', 'Columbia Valley', 'Washington', 'Tri-Cities (WA)'],
  ['Coyote Draw', 'Wahluke Slope', 'Washington', 'Yakima (WA)'],
  ['Stonecrop', 'Naches Heights', 'Washington', 'Yakima (WA)'],
  ['Lake Chelan Cellars', 'Lake Chelan', 'Washington', 'Chelan (WA)'],
  ['Dundee Bench', 'Dundee Hills', 'Oregon', 'Willamette (OR)'],
  ['Eola Springs', 'Eola-Amity Hills', 'Oregon', 'Willamette (OR)'],
  ['Yamhill Crest', 'Yamhill-Carlton', 'Oregon', 'Willamette (OR)'],
  ['Fraser Bend', 'Fraser Valley', 'British Columbia', 'Fraser (BC)'],
];
const grapes = ['Cabernet Sauvignon', 'Merlot', 'Syrah', 'Chardonnay', 'Riesling', 'Pinot Noir'];
fillers.forEach(([brand, ava, state, region], i) => {
  for (let n = 0; n < 3; n++) {
    const grape = grapes[(i + n) % grapes.length];
    const white = grape === 'Chardonnay' || grape === 'Riesling';
    wine({
      brandName: brand,
      wineName: `${grape}${n === 2 ? ' Reserve' : ''}`,
      ava, stateProvince: state, region,
      vintage: String(2019 + ((i + n) % 5)),
      price: `$${20 + ((i * 7 + n * 11) % 60)}`,
      rating: String(87 + ((i + n) % 8)),
      type: white ? 'White' : 'Red',
      mainVarietal: grape,
      publicationDate: `202${2 + ((i + n) % 4)}-0${1 + ((i + n) % 9)}-0${1 + (n % 9)}`,
      review: n === 1 ? NOTE_SHORT : 'Clean, correct and easy to recommend at the price.',
    });
  }
});

// Case production: a spread from tiny lots to industrial volume, with every
// seventh row reporting none — the filter has to exclude those rather than
// treat them as zero.
const caseLots = ['48', '150', '420', '900', '2500', '12000'];
wines.forEach((w, i) => {
  w.cases = i % 7 === 6 ? '' : caseLots[i % caseLots.length];
});

writeFileSync(OUT, JSON.stringify({ wines }, null, 2) + '\n');
console.log(`Wrote ${wines.length} fixture wines to ${OUT}`);
