import { test, expect } from '@playwright/test';
import { search, searchBox, sortSelect, sortBy, toggleSortDirection, resultBrands, resultCount, totalResults, withResults, gotoApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test.describe('accent-insensitive search', () => {
  // Each of these returned nothing at all before the fold was added.
  const cases: [string, string][] = [
    ['Ita', 'Itä'],
    ['Gard', 'Gård Vintners'],
    ['Bergstrom', 'Bergström'],
    ['semillon', 'Barnard Griffin'],
    ['carmenere', 'Cadaretta'],
  ];

  for (const [query, expectedBrand] of cases) {
    test(`"${query}" finds ${expectedBrand}`, async ({ page }) => {
      await search(page, query);
      await expect(page.getByTestId('wine-card-brand').first()).toHaveText(expectedBrand);
    });
  }

  test('an accented query still finds the accented row', async ({ page }) => {
    await search(page, 'Sémillon');
    expect(await totalResults(page)).toBeGreaterThan(0);
  });
});

test.describe('what the query matches', () => {
  test('matches the producer and a wine naming the same vineyard', async ({ page }) => {
    await search(page, 'Kiona');
    const brands = await resultBrands(page);
    expect(brands.sort()).toEqual(['Fidelitas', 'Kiona']);
  });

  test('does not match inside the tasting note', async ({ page }) => {
    // Woodward Canyon only mentions Merlot in its note, so it must not appear.
    await search(page, 'Merlot');
    expect(await resultBrands(page)).not.toContain('Woodward Canyon');
  });

  test('matches word prefixes, not fragments inside a word', async ({ page }) => {
    await search(page, 'Gard');
    expect(await resultBrands(page)).toEqual(['Gård Vintners']);

    // "iona" sits mid-word in Kiona — a substring search would have found it.
    await search(page, 'iona');
    await expect(resultCount(page)).toHaveText(/^0 wines found$/);
  });

  test('narrows on a producer plus a vintage', async ({ page }) => {
    await search(page, 'Kiona 2020');
    expect((await resultBrands(page)).length).toBeGreaterThan(0);
    await search(page, 'Kiona 1999');
    await expect(resultCount(page)).toHaveText(/^0 wines found$/);
  });
});

test.describe('sort control', () => {
  test('stays on Rating when a query is typed', async ({ page }) => {
    await expect(sortSelect(page)).toHaveValue('rating');
    await search(page, 'Kiona');
    await expect(sortSelect(page)).toHaveValue('rating');
  });

  test('keeps a sort chosen by hand across a search', async ({ page }) => {
    await sortBy(page, 'price');
    await search(page, 'Kiona');
    await expect(sortSelect(page)).toHaveValue('price');
  });

  test('labels the publication date "Review Date"', async ({ page }) => {
    await expect(sortSelect(page).locator('option[value="publicationDate"]')).toHaveText('Review Date');
  });

  test('keeps the direction toggle available while searching', async ({ page }) => {
    const direction = page.getByTestId('results').getByRole('button', { name: /^(Highest|Lowest|↓|↑)$/ });
    await expect(direction).toHaveCount(1);
    await search(page, 'Kiona');
    await expect(direction).toHaveCount(1);
  });
});

test.describe('sorting', () => {
  test('puts wines with no price last, whichever direction', async ({ page }) => {
    await sortBy(page, 'price');

    for (const pass of ['Highest', 'Lowest']) {
      const prices = await page.getByTestId('wine-card').evaluateAll((cards) =>
        cards.map((c) => c.textContent?.match(/\$\d[\d,]*/)?.[0] ?? null),
      );
      const firstMissing = prices.indexOf(null);
      if (firstMissing !== -1) {
        // Nothing priced may appear after the first unpriced wine.
        expect(prices.slice(firstMissing).every((p) => p === null),
          `unpriced wine appeared before a priced one sorting ${pass}`).toBe(true);
      }
      await toggleSortDirection(page);
    }
  });
});

test.describe('empty and edge states', () => {
  test('reports zero results without breaking the page', async ({ page }) => {
    await search(page, 'notawineanywhere');
    await expect(resultCount(page)).toHaveText(/^0 wines found$/);
    await expect(page.getByTestId('wine-card')).toHaveCount(0);
  });

  test('clearing the query restores the full list', async ({ page }) => {
    const before = await totalResults(page);
    await search(page, 'notawineanywhere');
    await search(page, '');
    await expect(resultCount(page)).toHaveText(new RegExp(`^${before} wines found$`));
  });

  test('Escape clears the search box', async ({ page }) => {
    await searchBox(page).fill('Kiona');
    await searchBox(page).press('Escape');
    await expect(searchBox(page)).toHaveValue('');
  });
});
