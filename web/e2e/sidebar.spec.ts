import { test, expect } from '@playwright/test';
import {
  openFilters, facetHeader, facetGroup, facetOption,
  varietalInput, varietalToggle, varietalClear, varietalOptions,
  resultCount, withResults, gotoApp, searchBox, activeChips } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

// Each of these was a separate tester report about the Varietal control.
test.describe('the Varietal control', () => {
  test('is a collapsible group, open by default', async ({ page }) => {
    const panel = await openFilters(page);
    const input = varietalInput(panel);
    await expect(input).toBeVisible();

    await facetHeader(panel, 'Varietal').click();
    await expect(input).toBeHidden();

    await facetHeader(panel, 'Varietal').click();
    await expect(input).toBeVisible();
  });

  test('opens on the arrow and closes on a second click', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();
    await expect(varietalOptions(panel).first()).toBeVisible();

    await varietalToggle(panel).click();
    await expect(varietalOptions(panel).first()).toBeHidden();
  });

  test('reopens the list after clearing a selection', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();
    await withResults(page, () =>
      varietalOptions(panel).filter({ hasText: /^Merlot$/ }).first().click());
    await expect(varietalInput(panel)).toHaveValue('Merlot');

    await withResults(page, () => varietalClear(panel).click());
    await expect(varietalInput(panel)).toHaveValue('');
    // The whole point of the report: the next choice is one click away.
    await expect(varietalOptions(panel).first()).toBeVisible();
  });

  test('filters its options as you type, ignoring accents', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();
    await varietalInput(panel).fill('albarino');
    await expect(varietalOptions(panel)).toHaveCount(1);
    await expect(varietalOptions(panel).first()).toHaveText('Albariño');
  });

  test('says so when nothing matches', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();
    await varietalInput(panel).fill('zzzzz');
    await expect(panel.getByText('No matches')).toBeVisible();
  });

  test('narrows the results when a varietal is picked', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();
    const total = await withResults(page, () =>
      varietalOptions(panel).filter({ hasText: /^Merlot$/ }).first().click());
    expect(total).toBeGreaterThan(0);

    for (const card of await page.getByTestId('wine-card').allInnerTexts()) {
      expect(card).toContain('Merlot');
    }
  });
});

test.describe('facet groups', () => {
  test('Wine Type, Score, Vintage and Price are open by default; Advanced is collapsed', async ({ page }) => {
    const panel = await openFilters(page);
    await expect(facetOption(panel, 'Red')).toBeVisible();
    await expect(facetGroup(panel, 'Vintage')).toHaveCount(1);
    await expect(facetGroup(panel, 'Appellation')).toHaveCount(0); // inside Advanced
  });

  test('Vintage sits between Score and Price', async ({ page }) => {
    const panel = await openFilters(page);
    const labels = await panel.getByTestId(/^facet-/).evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    expect(labels.slice(0, 5)).toEqual([
      'facet-wine-type', 'facet-varietal', 'facet-score', 'facet-vintage', 'facet-price',
    ]);
  });

  test('Advanced reveals the secondary facets, in order', async ({ page }) => {
    const panel = await openFilters(page);
    await facetHeader(panel, 'Advanced').click();
    const labels = await panel.getByTestId(/^facet-/).evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    expect(labels.slice(-6)).toEqual([
      'facet-appellation', 'facet-review-date', 'facet-cases',
      'facet-home-region', 'facet-special-designation', 'facet-tasting-notes',
    ]);
  });

  test('a group with a selection is highlighted', async ({ page }) => {
    const panel = await openFilters(page);
    const heading = facetGroup(panel, 'Wine Type').locator('span').first();
    const before = await heading.evaluate((el) => getComputedStyle(el).color);

    await withResults(page, () => facetOption(panel, 'Red').click());
    await expect(async () => {
      const after = await heading.evaluate((el) => getComputedStyle(el).color);
      expect(after).not.toBe(before);
    }).toPass();
  });

  test('Clear all in the panel header resets everything', async ({ page }) => {
    const panel = await openFilters(page);
    await withResults(page, () => facetOption(panel, 'Red').click());

    const clearAll = panel.getByRole('button', { name: /clear all/i }).first();
    await expect(clearAll).toBeVisible();
    await withResults(page, () => clearAll.click());
    await expect(facetOption(panel, 'Red')).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('range controls', () => {
  // "0 to Any" said nothing about what the track covers. The high end now names
  // the largest production in the data, which /api/meta reports.
  test('the Cases range ends at the highest production in the data', async ({ page }) => {
    const panel = await openFilters(page);
    await facetHeader(panel, 'Advanced').click();
    await facetHeader(panel, 'Cases').click();

    const cases = facetGroup(panel, 'Cases').locator('input[inputmode="numeric"]');
    const { casesMax } = await (await page.request.get('/api/meta')).json();
    await expect(cases.nth(0)).toHaveValue('0');
    await expect(cases.nth(1)).toHaveAttribute('placeholder', casesMax.toLocaleString('en-US'));
  });

  test('rejects a low endpoint above the high one', async ({ page }) => {
    const panel = await openFilters(page);
    const score = facetGroup(panel, 'Score').locator('input[inputmode="numeric"]');

    await score.nth(0).fill('99');
    await score.nth(1).fill('85');
    await score.nth(1).press('Enter');

    // Invalid entry is flagged rather than silently applied.
    await expect(score.nth(1)).toHaveClass(/border-red/);
  });

  test('accepts equal endpoints', async ({ page }) => {
    const panel = await openFilters(page);
    const score = facetGroup(panel, 'Score').locator('input[inputmode="numeric"]');

    await score.nth(0).fill('92');
    await score.nth(0).press('Enter');
    await withResults(page, async () => {
      await score.nth(1).fill('92');
      await score.nth(1).press('Enter');
    });

    await expect(score.nth(0)).not.toHaveClass(/border-red/);
    await expect(score.nth(1)).not.toHaveClass(/border-red/);
  });
});

// Prose is searched only on request: matching it by default turns a search for
// a winery into every review that happens to mention one.
test.describe('the tasting-note option', () => {
  const notesToggle = (panel: import('@playwright/test').Locator) =>
    panel.getByRole('checkbox', { name: 'Search tasting notes' });

  async function openNotesGroup(page: import('@playwright/test').Page) {
    const panel = await openFilters(page);
    await facetHeader(panel, 'Advanced').click();
    await facetHeader(panel, 'Tasting Notes').click();
    await expect(notesToggle(panel)).toBeVisible();
    return panel;
  }

  test('finds a word that only appears in a review', async ({ page }) => {
    const panel = await openNotesGroup(page);

    await withResults(page, () => searchBox(page).fill('bright'));
    await expect(page.getByTestId('wine-card')).toHaveCount(0);

    const total = await withResults(
      page,
      () => notesToggle(panel).click(),
      (params) => params.get('notes') === '1',
    );
    expect(total).toBeGreaterThan(0);
  });

  test('shows an active chip and clears with the rest', async ({ page }) => {
    const panel = await openNotesGroup(page);
    await notesToggle(panel).click();

    await expect(activeChips(page).filter({ hasText: /tasting notes/i })).toHaveCount(1);
    await expect(notesToggle(panel)).toHaveAttribute('aria-checked', 'true');

    // The panel's own Clear all: on mobile the sheet covers the results column.
    await panel.getByRole('button', { name: /clear all/i }).first().click();
    await expect(notesToggle(panel)).toHaveAttribute('aria-checked', 'false');
    await expect(activeChips(page).filter({ hasText: /tasting notes/i })).toHaveCount(0);
  });

  // The flag cannot change a result set that has no query to widen, so ticking
  // it must not re-run the search — a request there blanks the list to a
  // skeleton and repaints it identical, which reads as a glitch.
  test('does not re-run the search when the box is empty', async ({ page }) => {
    const panel = await openNotesGroup(page);
    const before = await resultCount(page).textContent();

    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/search')) requests.push(r.url()); });

    await notesToggle(panel).click();
    await expect(notesToggle(panel)).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(1_200); // longer than both debounces

    expect(requests).toEqual([]);
    await expect(resultCount(page)).toHaveText(before!);
  });

  // ...but it must still take effect the moment there is a query to widen.
  test('re-runs the search when a query is already typed', async ({ page }) => {
    const panel = await openNotesGroup(page);
    await withResults(page, () => searchBox(page).fill('bright'));

    const total = await withResults(
      page,
      () => notesToggle(panel).click(),
      (params) => params.get('notes') === '1',
    );
    expect(total).toBeGreaterThan(0);
  });
});
