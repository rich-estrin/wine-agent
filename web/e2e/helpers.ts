import { expect, type Locator, type Page } from '@playwright/test';

/** Open the app and wait until it has stopped fetching.
 *
 *  The app issues TWO searches on load — once on mount, then again when the
 *  unfiltered facet list arrives and changes the params callback identity.
 *  Without waiting for both, the next withResults() can match that second
 *  request and return before the interaction under test has taken effect. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(resultCount(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** True on the narrow viewport, where filters live in a bottom sheet rather
 *  than a persistent sidebar. */
export function isMobile(page: Page): boolean {
  const size = page.viewportSize();
  return !!size && size.width < 1024;
}

/** Wait until an element stops moving. The bottom sheet slides in over 380ms,
 *  and a boundingBox() read mid-flight reports it still partly off-screen. */
export async function waitForStable(locator: Locator): Promise<void> {
  let previous: string | null = null;
  await expect(async () => {
    const box = await locator.boundingBox();
    const current = JSON.stringify(box);
    const settled = current === previous;
    previous = current;
    expect(settled, 'element still moving').toBe(true);
  }).toPass({ timeout: 5_000 });
}

/** The filter panel, opening the mobile sheet first if that's where it lives.
 *  Both breakpoints keep two copies in the DOM — the desktop aside and the
 *  sheet — so every filter locator must be scoped through this. */
export async function openFilters(page: Page): Promise<Locator> {
  if (!isMobile(page)) return page.getByTestId('sidebar-desktop');

  const sheet = page.getByTestId('filter-sheet');
  if ((await sheet.getAttribute('data-open')) !== 'true') {
    await page.getByRole('button', { name: /^filters/i }).click();
    await expect(sheet).toHaveAttribute('data-open', 'true');
    await waitForStable(sheet);
  }
  return sheet;
}

/** Dismiss the mobile sheet so results are visible again. No-op on desktop. */
export async function closeFilters(page: Page): Promise<void> {
  if (!isMobile(page)) return;
  await page.getByRole('button', { name: /show results/i }).click();
  await expect(page.getByTestId('filter-sheet')).toHaveAttribute('data-open', 'false');
  await waitForStable(page.getByTestId('filter-sheet'));
}

/** A collapsible facet group header, e.g. "Wine Type". */
export function facetHeader(panel: Locator, label: string): Locator {
  return panel.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
}

/** Open a facet group if it isn't already showing `reveals`. */
export async function openFacet(panel: Locator, label: string, reveals: Locator): Promise<void> {
  if (await reveals.isVisible()) return;
  await facetHeader(panel, label).click();
  await expect(reveals).toBeVisible();
}

/** A facet group's container, e.g. facetGroup(panel, 'Vintage'). Scoping to it
 *  keeps range-input lookups off the other sliders. */
export function facetGroup(panel: Locator, label: string): Locator {
  return panel.getByTestId(`facet-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
}

/** The two numeric endpoints of a range facet (Score, Price, Vintage). */
export function rangeInputs(panel: Locator, label: string): Locator {
  return facetGroup(panel, label).locator('input[inputmode="numeric"]');
}

/** Active filter chips in the results column. Not getByRole('button', …) —
 *  a wine card's accessible name contains its wine type too. */
export const activeChips = (page: Page) => page.getByTestId('active-chip');

/** A checkbox option inside the filter panel, by visible label. */
export function facetOption(panel: Locator, label: string): Locator {
  return panel.getByRole('checkbox', { name: new RegExp(`^${label}$`) }).first();
}

export const varietalInput = (panel: Locator) => panel.getByPlaceholder('Search varietals…');
export const varietalToggle = (panel: Locator) =>
  panel.getByRole('button', { name: 'Toggle varietal list' });
export const varietalClear = (panel: Locator) =>
  panel.getByRole('button', { name: 'Clear varietal' });
export const varietalOptions = (panel: Locator) => panel.getByRole('option');

/** The search box in the results column. */
export const searchBox = (page: Page) =>
  page.getByTestId('results').getByPlaceholder(/^Search winery/);

/** Perform `action`, then wait for the search it triggers to land in the DOM.
 *
 *  The app debounces by 300ms and re-renders asynchronously, so neither a fixed
 *  sleep nor "the count is visible" is enough. It also fires a second search on
 *  load once the unfiltered facet list arrives, so simply waiting for "the next
 *  /api/search" can catch a stale one — hence the `match` predicate, which ties
 *  the wait to the request this action was supposed to produce.
 */
export async function withResults(
  page: Page,
  action: () => Promise<unknown>,
  match?: (params: URLSearchParams) => boolean,
): Promise<number> {
  const responded = page.waitForResponse((r) => {
    if (!r.url().includes('/api/search') || r.status() !== 200) return false;
    const params = new URL(r.url()).searchParams;
    if (params.get('offset') !== '0') return false;
    return match ? match(params) : true;
  });
  await action();
  const { total } = (await (await responded).json()) as { total: number };
  await expect(resultCount(page)).toHaveText(`${total.toLocaleString('en-US')} wines found`);
  return total;
}

/** Run a search and wait for its results to render. */
export async function search(page: Page, query: string): Promise<number> {
  const wanted = query.trim();
  return withResults(
    page,
    async () => {
      await searchBox(page).fill(query);
      await searchBox(page).press('Enter');
    },
    (params) => (params.get('q') ?? '') === wanted,
  );
}

/** Change the sort and wait for the re-sorted results. */
export async function sortBy(page: Page, value: string): Promise<number> {
  return withResults(
    page,
    () => sortSelect(page).selectOption(value),
    (params) => params.get('sort_by') === value,
  );
}

/** Flip the sort direction and wait for the re-sorted results.
 *  No response predicate needed: by this point the page has settled, so the
 *  click produces exactly one first-page request. */
export async function toggleSortDirection(page: Page): Promise<number> {
  const button = page.getByTestId('results').getByRole('button', { name: /^(Highest|Lowest|↓|↑)$/ });
  return withResults(page, () => button.click());
}

// The desktop and mobile sort controls are both in the DOM, one hidden by a
// breakpoint class — :visible picks whichever applies to the current viewport.
export const sortSelect = (page: Page) =>
  page.getByTestId('results').locator('select:visible').first();
// Not getByText(/wines found/) — the empty state says "No wines found" too.
export const resultCount = (page: Page) => page.getByTestId('result-count');

/** Brand names of the visible result cards, in order. */
export async function resultBrands(page: Page): Promise<string[]> {
  return page.getByTestId('wine-card-brand').allInnerTexts();
}

/** Total from the "N wines found" line. */
export async function totalResults(page: Page): Promise<number> {
  const text = await resultCount(page).innerText();
  return Number(text.replace(/[^\d]/g, ''));
}
