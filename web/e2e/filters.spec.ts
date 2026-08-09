import { test, expect } from '@playwright/test';
import {
  openFilters, closeFilters, openFacet, facetOption, facetHeader, facetGroup,
  rangeInputs, activeChips, varietalToggle, varietalOptions,
  resultCount, totalResults, withResults, isMobile, gotoApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

/** Check a Wine Type box and wait for the narrowed results. */
async function selectType(page: import('@playwright/test').Page, label: string) {
  const panel = await openFilters(page);
  await openFacet(panel, 'Wine Type', facetOption(panel, 'Red'));
  await withResults(page, () => facetOption(panel, label).click());
  return panel;
}

test.describe('multi-select facets', () => {
  test('Wine Type keeps both selections checked', async ({ page }) => {
    const panel = await selectType(page, 'Red');
    const red = facetOption(panel, 'Red');
    const white = facetOption(panel, 'White');

    await expect(red).toHaveAttribute('aria-checked', 'true');
    await withResults(page, () => white.click());

    await expect(red).toHaveAttribute('aria-checked', 'true');
    await expect(white).toHaveAttribute('aria-checked', 'true');
  });

  test('selecting both types returns the sum of each alone', async ({ page }) => {
    const panel = await selectType(page, 'Red');
    const redOnly = await totalResults(page);

    await withResults(page, () => facetOption(panel, 'Red').click());   // clear
    const all = await totalResults(page);
    await withResults(page, () => facetOption(panel, 'White').click());
    const whiteOnly = await totalResults(page);

    await withResults(page, () => facetOption(panel, 'Red').click());
    const both = await totalResults(page);

    expect(both).toBe(redOnly + whiteOnly);
    expect(both).toBeLessThanOrEqual(all);
  });

  test('unchecking a box removes only that selection', async ({ page }) => {
    const panel = await selectType(page, 'Red');
    await withResults(page, () => facetOption(panel, 'White').click());
    const both = await totalResults(page);

    await withResults(page, () => facetOption(panel, 'White').click());
    expect(await totalResults(page)).toBeLessThan(both);
    await expect(facetOption(panel, 'Red')).toHaveAttribute('aria-checked', 'true');
  });

  test('Review Date offers radios, not checkboxes — it is one range', async ({ page }) => {
    const panel = await openFilters(page);
    await facetHeader(panel, 'Advanced').click();
    const reviewDate = facetHeader(panel, 'Review Date');
    await expect(reviewDate).toBeVisible();
    await reviewDate.click();
    await expect(panel.getByRole('radio').first()).toBeVisible();
  });
});

test.describe('active filter chips', () => {
  test('shows one removable chip per selection', async ({ page }) => {
    const panel = await selectType(page, 'Red');
    await withResults(page, () => facetOption(panel, 'White').click());
    await closeFilters(page);

    await expect(activeChips(page).filter({ hasText: /^Red$/ })).toHaveCount(1);
    await expect(activeChips(page).filter({ hasText: /^White$/ })).toHaveCount(1);
  });

  test('a chip removes just its own selection', async ({ page }) => {
    const panel = await selectType(page, 'Red');
    await withResults(page, () => facetOption(panel, 'White').click());
    await closeFilters(page);

    await withResults(page, () => activeChips(page).filter({ hasText: /^White$/ }).click());

    await expect(activeChips(page).filter({ hasText: /^White$/ })).toHaveCount(0);
    await expect(activeChips(page).filter({ hasText: /^Red$/ })).toHaveCount(1);
  });

  test('Clear all removes every filter', async ({ page }) => {
    const panel = await selectType(page, 'Red');
    await withResults(page, () => facetOption(panel, 'White').click());
    await closeFilters(page);

    const before = await totalResults(page);
    await withResults(page, () =>
      page.getByTestId('results').getByRole('button', { name: /clear all/i }).click());
    expect(await totalResults(page)).toBeGreaterThan(before);
    await expect(activeChips(page)).toHaveCount(0);
  });
});

test.describe('faceting — filters narrow each other', () => {
  test('Wine Type narrows the Varietal list', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();
    const all = await varietalOptions(panel).allInnerTexts();
    expect(all).toContain('Albariño');
    await page.keyboard.press('Escape');

    await selectType(page, 'Red');
    // The list refetches on a debounce; poll rather than sleeping.
    await expect(async () => {
      await varietalToggle(panel).click();
      const red = await varietalOptions(panel).allInnerTexts();
      await page.keyboard.press('Escape');
      expect(red).not.toContain('Albariño');
      expect(red.length).toBeLessThan(all.length);
    }).toPass({ timeout: 10_000 });
  });

  test('a facet never narrows itself, so a choice can still be changed', async ({ page }) => {
    const panel = await openFilters(page);
    await openFacet(panel, 'Wine Type', facetOption(panel, 'Red'));
    const before = await panel.getByRole('checkbox').allInnerTexts();

    await withResults(page, () => facetOption(panel, 'Red').click());
    await expect(async () => {
      expect(await panel.getByRole('checkbox').allInnerTexts()).toEqual(before);
    }).toPass({ timeout: 10_000 });
  });

  test('State narrows the Appellation tree', async ({ page }) => {
    const panel = await openFilters(page);
    await openFacet(panel, 'State/Province/Region', facetOption(panel, 'Oregon'));
    await withResults(page, () => facetOption(panel, 'Oregon').click());

    await facetHeader(panel, 'Advanced').click();
    const appellation = facetHeader(panel, 'Appellation');
    await expect(appellation).toBeVisible();
    await appellation.click();

    const picker = panel.getByRole('button', { name: /Select an AVA/ });
    await expect(picker).toBeVisible();
    await picker.click();

    await expect(async () => {
      const text = await panel.locator('.overflow-y-auto').last().innerText();
      expect(text).toContain('Oregon');
      expect(text).not.toContain('Red Mountain'); // a Washington-only AVA
    }).toPass({ timeout: 10_000 });
  });
});

test.describe('range filters', () => {
  test('accepts a single vintage — 2022 to 2022', async ({ page }) => {
    const panel = await openFilters(page);
    await facetHeader(panel, 'Advanced').click();
    const vintage = facetHeader(panel, 'Vintage');
    await expect(vintage).toBeVisible();
    await vintage.click();

    const boxes = rangeInputs(panel, 'Vintage');
    await expect(boxes).toHaveCount(2);

    await boxes.nth(0).fill('2022');
    await boxes.nth(0).press('Enter');
    await withResults(page, async () => {
      await boxes.nth(1).fill('2022');
      await boxes.nth(1).press('Enter');
    });

    // The pre-fix behaviour was a red validation border and no results change.
    await expect(boxes.nth(0)).toHaveValue('2022');
    await expect(boxes.nth(1)).toHaveValue('2022');
    expect(await totalResults(page)).toBeGreaterThan(0);

    for (const vintage of await page.getByTestId('wine-card').allInnerTexts()) {
      expect(vintage).toContain('2022');
    }
  });

  test('a price range excludes wines with no price', async ({ page }) => {
    const panel = await openFilters(page);
    const boxes = rangeInputs(panel, 'Price');
    await withResults(page, async () => {
      await boxes.nth(0).fill('20');
      await boxes.nth(0).press('Enter');
    });
    await closeFilters(page);

    const cards = await page.getByTestId('wine-card').allInnerTexts();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card).toMatch(/\$\d/);
  });
});

test('the mobile filter button shows a count of active filters', async ({ page }) => {
  test.skip(!isMobile(page), 'mobile-only affordance');
  const panel = await openFilters(page);
  await openFacet(panel, 'Wine Type', facetOption(panel, 'Red'));
  await withResults(page, () => facetOption(panel, 'Red').click());
  await withResults(page, () => facetOption(panel, 'White').click());
  await closeFilters(page);

  await expect(page.getByRole('button', { name: /^filters/i })).toContainText('2');
});
