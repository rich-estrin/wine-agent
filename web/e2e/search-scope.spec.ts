import { test, expect, type Page } from '@playwright/test';
import {
  gotoApp, searchBox, withResults, activeChips, resultCount, resultBrands, openFilters,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

const pill = (page: Page) => page.getByTestId('search-scope-pill');
const menu = (page: Page) => page.getByTestId('search-scope');
const defaultRadio = (page: Page) => menu(page).getByRole('radio', { name: /^Default/ });
const wineryRadio = (page: Page) => menu(page).getByRole('radio', { name: /winery name only/i });
const notesBox = (page: Page) => menu(page).getByRole('checkbox', { name: /include tasting notes/i });

async function openMenu(page: Page) {
  await pill(page).click();
  await expect(defaultRadio(page)).toBeVisible();
}

// Prose is searched only on request: matching it by default turns a search for
// a winery into every review that happens to mention one.
test.describe('the search scope menu', () => {
  test('starts on Default, with tasting notes unchecked', async ({ page }) => {
    await expect(pill(page)).toContainText(/default/i);
    await openMenu(page);
    await expect(defaultRadio(page)).toBeChecked();
    await expect(wineryRadio(page)).not.toBeChecked();
    await expect(notesBox(page)).not.toBeChecked();
    await expect(notesBox(page)).toBeEnabled();
  });

  test('finds a word that only appears in a review', async ({ page }) => {
    await withResults(page, () => searchBox(page).fill('bright'));
    await expect(page.getByTestId('wine-card')).toHaveCount(0);

    await openMenu(page);
    const total = await withResults(
      page,
      () => notesBox(page).check(),
      (params) => params.get('notes') === '1',
    );
    expect(total).toBeGreaterThan(0);
    await expect(pill(page)).toContainText(/default\s*\+|default\+/i);
  });

  test('winery name only drops wines that match elsewhere', async ({ page }) => {
    // "syrah" is a varietal, never a producer in the fixture.
    const all = await withResults(page, () => searchBox(page).fill('syrah'));
    expect(all).toBeGreaterThan(0);

    await openMenu(page);
    const total = await withResults(
      page,
      () => wineryRadio(page).check(),
      (params) => params.get('scope') === 'winery',
    );
    expect(total).toBeLessThan(all);
    await expect(pill(page)).toContainText(/winer/i);
    await expect(notesBox(page)).toBeDisabled();
  });

  test('the two options are exclusive, and Default resets the notes box', async ({ page }) => {
    await openMenu(page);
    await notesBox(page).check();
    await wineryRadio(page).check();
    await expect(defaultRadio(page)).not.toBeChecked();
    await expect(notesBox(page)).not.toBeChecked();

    await defaultRadio(page).check();
    await expect(wineryRadio(page)).not.toBeChecked();
    await expect(notesBox(page)).toBeEnabled();
    await expect(notesBox(page)).not.toBeChecked();
  });

  // The pill sits inside the field's border, and the popover hangs from the
  // pill — not from the field, which is the full width of the toolbar.
  test('the pill is inset in the field and the popover anchors to it', async ({ page }) => {
    const field = pill(page).locator('xpath=ancestor::div[contains(@class,"border-warm-border")][1]');
    await openMenu(page);
    const f = (await field.boundingBox())!;
    const p = (await pill(page).boundingBox())!;
    const m = (await menu(page).getByRole('group').boundingBox())!;

    expect(p.x).toBeGreaterThan(f.x);
    expect(p.x + p.width).toBeLessThan(f.x + f.width);
    expect(p.y).toBeGreaterThanOrEqual(f.y);
    expect(p.y + p.height).toBeLessThanOrEqual(f.y + f.height);

    // Right edges line up with the pill's container, and it opens below the field.
    expect(Math.abs(m.x + m.width - (p.x + p.width))).toBeLessThan(2);
    expect(m.y).toBeGreaterThanOrEqual(f.y + f.height);
    // The input has no border of its own.
    const border = await searchBox(page).evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(border).toBe('0px');
  });

  test('closes on Escape and on an outside press', async ({ page }) => {
    await openMenu(page);
    await page.keyboard.press('Escape');
    await expect(defaultRadio(page)).toBeHidden();

    await openMenu(page);
    await page.getByTestId('results').click({ position: { x: 4, y: 4 } });
    await expect(defaultRadio(page)).toBeHidden();
  });

  test('a non-default scope shows an active chip and clears with the rest', async ({ page }) => {
    await openMenu(page);
    await wineryRadio(page).check();
    await page.keyboard.press('Escape');
    await expect(activeChips(page).filter({ hasText: /winery names only/i })).toHaveCount(1);

    // The panel's own Clear all: on mobile the sheet covers the results column.
    const panel = await openFilters(page);
    await panel.getByRole('button', { name: /clear all/i }).first().click();
    await expect(activeChips(page).filter({ hasText: /winery names only/i })).toHaveCount(0);
    await expect(pill(page)).toContainText(/default/i);
  });

  // The setting cannot change a result set that has no query to act on, so
  // flipping it must not re-run the search — a request there blanks the list
  // to a skeleton and repaints it identical, which reads as a glitch.
  test('does not re-run the search when the box is empty', async ({ page }) => {
    const before = await resultCount(page).textContent();
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/search')) requests.push(r.url()); });

    await openMenu(page);
    await wineryRadio(page).check();
    await page.waitForTimeout(1_200); // longer than both debounces

    expect(requests).toEqual([]);
    await expect(resultCount(page)).toHaveText(before!);
  });

  test('keeps every result a winery match', async ({ page }) => {
    await openMenu(page);
    await wineryRadio(page).check();
    await page.keyboard.press('Escape');
    await withResults(page, () => searchBox(page).fill('gard'), (p) => p.get('scope') === 'winery');
    const brands = await resultBrands(page);
    expect(brands.length).toBeGreaterThan(0);
    for (const b of brands) expect(b.toLowerCase()).toMatch(/g[aå]rd/);
  });
});
