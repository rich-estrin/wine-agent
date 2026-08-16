import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { openFilters, varietalToggle, search, resultCount, withResults, facetOption, openFacet, gotoApp } from './helpers';

// Opt-in: `npm run screenshots`. These write images to e2e/screenshots/ for a
// human to look at — they are deliberately NOT pixel-compared, because
// baselines generated on one OS drift on another and turn into noise.
const OUT = 'e2e/screenshots';
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'phone', width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test(`results — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoApp(page);
    await page.screenshot({ path: `${OUT}/results-${viewport.name}.png`, fullPage: false });
  });
}

test('filters open — desktop', async ({ page }) => {
  await gotoApp(page);
  const panel = await openFilters(page);
  await openFacet(panel, 'Wine Type', facetOption(panel, 'Red'));
  await withResults(page, () => facetOption(panel, 'Red').click());
  await withResults(page, () => facetOption(panel, 'White').click());
  await page.screenshot({ path: `${OUT}/filters-active-desktop.png` });
});

test('filter sheet — phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  const panel = await openFilters(page);
  await varietalToggle(panel).click();
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/filter-sheet-phone.png` });
});

test('detail modal with a long note — desktop', async ({ page }) => {
  await gotoApp(page);
  await search(page, 'Bergström');
  await page.getByTestId('wine-card').first().click();
  await expect(page.getByTestId('wine-detail')).toBeVisible();
  await page.screenshot({ path: `${OUT}/detail-long-note-desktop.png` });
});

test('detail modal with highlighting — desktop', async ({ page }) => {
  await gotoApp(page);
  await search(page, 'Kiona');
  await page.getByTestId('wine-card').first().click();
  await expect(page.getByTestId('wine-detail').locator('mark').first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/detail-highlight-desktop.png` });
});

test('detail modal — phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await page.getByTestId('wine-card').first().click();
  await expect(page.getByTestId('wine-detail')).toBeVisible();
  await page.screenshot({ path: `${OUT}/detail-phone.png` });
});

test('empty state — desktop', async ({ page }) => {
  await gotoApp(page);
  await search(page, 'notawineanywhere');
  await page.screenshot({ path: `${OUT}/empty-state-desktop.png` });
});

test('long names in cards — desktop', async ({ page }) => {
  await gotoApp(page);
  await search(page, 'Rocks District Cooperative');
  await page.screenshot({ path: `${OUT}/long-names-desktop.png` });
});
