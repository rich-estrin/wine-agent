import { test, expect } from '@playwright/test';
import {
  openFilters, facetHeader, facetGroup, facetOption,
  varietalInput, varietalToggle, varietalClear, varietalOptions,
  resultCount, withResults, gotoApp } from './helpers';

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

  test('Advanced reveals the secondary facets', async ({ page }) => {
    const panel = await openFilters(page);
    await facetHeader(panel, 'Advanced').click();
    for (const label of ['Appellation', 'Review Date', 'Home Region']) {
      await expect(facetHeader(panel, label)).toBeVisible();
    }
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
