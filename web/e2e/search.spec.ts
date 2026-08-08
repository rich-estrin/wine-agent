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

test.describe('relevance ranking', () => {
  test('a winery outranks a wine that merely names its vineyard', async ({ page }) => {
    await search(page, 'Kiona');
    const brands = await resultBrands(page);
    expect(brands[0]).toBe('Kiona');
    expect(brands).toContain('Fidelitas');
    expect(brands.indexOf('Kiona')).toBeLessThan(brands.indexOf('Fidelitas'));
  });

  test('a varietal in the name outranks one mentioned in a note', async ({ page }) => {
    await search(page, 'Merlot');
    const brands = await resultBrands(page);
    // Woodward Canyon only mentions Merlot in its tasting note.
    expect(brands[0]).not.toBe('Woodward Canyon');
    expect(brands).toContain('Woodward Canyon');
  });

  test('a loose mid-word match is kept but ranked below a real hit', async ({ page }) => {
    await search(page, 'Gard');
    const brands = await resultBrands(page);
    expect(brands[0]).toBe('Gård Vintners');
    // "garden herbs" in a review still matches — just not first.
    expect(brands.length).toBeGreaterThan(1);
  });
});

test.describe('sort control', () => {
  test('offers Relevance only while a query is present', async ({ page }) => {
    await expect(sortSelect(page).locator('option[value="relevance"]')).toHaveCount(0);
    await search(page, 'Kiona');
    await expect(sortSelect(page).locator('option[value="relevance"]')).toHaveCount(1);
  });

  test('switches to Relevance on a query and back to Rating when cleared', async ({ page }) => {
    await expect(sortSelect(page)).toHaveValue('rating');
    await search(page, 'Kiona');
    await expect(sortSelect(page)).toHaveValue('relevance');

    await search(page, '');
    await expect(sortSelect(page)).toHaveValue('rating');
  });

  test('stops auto-switching once a sort is chosen by hand', async ({ page }) => {
    await sortBy(page, 'price');
    await search(page, 'Kiona');
    await expect(sortSelect(page)).toHaveValue('price');
  });

  test('labels the publication date "Review Date"', async ({ page }) => {
    await expect(sortSelect(page).locator('option[value="publicationDate"]')).toHaveText('Review Date');
  });

  test('hides the direction toggle under Relevance, which has one order', async ({ page }) => {
    const direction = page.getByTestId('results').getByRole('button', { name: /^(Highest|Lowest|↓|↑)$/ });
    await expect(direction).toHaveCount(1);
    await search(page, 'Kiona');
    await expect(direction).toHaveCount(0);
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
