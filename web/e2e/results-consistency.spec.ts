import { test, expect, type Page } from '@playwright/test';
import {
  gotoApp, search, searchBox, resultCount, resultBrands,
  expectCountMatchesRows, totalResults, PAGE_SIZE,
  openFilters, openFacet, facetOption, withResults } from './helpers';

// A tester hit a state where the count read "2 wines found" while the list
// rendered five cards, three of which could not match the query at all. The
// count assertion alone never sees that — these check the rendered rows.

const scrollToBottom = (page: Page) =>
  page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

/** Only these two fixture wines contain "ita" in any searched field. */
const ITA_MATCHES = ['Itä', 'Fidelitas'];

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test.describe('the result list agrees with the result count', () => {
  test('a fresh search renders exactly its matches', async ({ page }) => {
    const total = await search(page, 'ita');
    expect(total).toBe(2);
    expect((await resultBrands(page)).sort()).toEqual([...ITA_MATCHES].sort());
  });

  test('a second search replaces the first list rather than adding to it', async ({ page }) => {
    await search(page, 'Chardonnay');
    const before = await resultBrands(page);
    expect(before.length).toBeGreaterThan(0);

    await search(page, 'ita');
    const after = await resultBrands(page);
    expect(after.sort()).toEqual([...ITA_MATCHES].sort());
    // Nothing from the previous query may survive.
    expect(after.some((b) => b === 'Transatlantic' || b === 'Fraser Bend')).toBe(false);
  });

  test('clearing the query restores the full list exactly once', async ({ page }) => {
    await search(page, 'ita');
    const total = await search(page, '');
    await expectCountMatchesRows(page, total);
    expect(await page.getByTestId('wine-card').count()).toBe(Math.min(total, PAGE_SIZE));
  });
});

test.describe('out-of-order responses', () => {
  // Hold back the paging request so it is guaranteed to still be in flight when
  // the query changes — the interleaving that can append a stale page.
  test('a page-2 request in flight cannot append to a newer query', async ({ page }) => {
    await page.route('**/api/search*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('offset') !== '0') {
        await new Promise((r) => setTimeout(r, 1200));
      }
      await route.continue();
    });

    await scrollToBottom(page);
    await searchBox(page).fill('ita');
    await searchBox(page).press('Enter');

    await expect(resultCount(page)).toHaveText('2 wines found');
    // Give the delayed page-2 response time to land and try to append.
    await page.waitForTimeout(2000);

    await expect(page.getByTestId('wine-card')).toHaveCount(2);
    expect((await resultBrands(page)).sort()).toEqual([...ITA_MATCHES].sort());
  });

  test('a slow first page cannot overwrite a newer one', async ({ page }) => {
    let first = true;
    await page.route('**/api/search*', async (route) => {
      const url = new URL(route.request().url());
      // Delay only the earlier of the two queries.
      if (url.searchParams.get('q') === 'Chardonnay' && first) {
        first = false;
        await new Promise((r) => setTimeout(r, 1500));
      }
      await route.continue();
    });

    await searchBox(page).fill('Chardonnay');
    await page.waitForTimeout(350);
    await searchBox(page).fill('ita');
    await searchBox(page).press('Enter');

    await expect(resultCount(page)).toHaveText('2 wines found');
    await page.waitForTimeout(2500);

    await expect(resultCount(page)).toHaveText('2 wines found');
    await expect(page.getByTestId('wine-card')).toHaveCount(2);
  });

  test('typing several queries in quick succession settles on the last', async ({ page }) => {
    for (const q of ['red', 'merlot', 'kiona', 'ita']) {
      await searchBox(page).fill(q);
      await page.waitForTimeout(120);
    }
    await searchBox(page).press('Enter');

    await expect(resultCount(page)).toHaveText('2 wines found');
    await page.waitForTimeout(1500);
    await expectCountMatchesRows(page, await totalResults(page));
    expect((await resultBrands(page)).sort()).toEqual([...ITA_MATCHES].sort());
  });
});

test.describe('clearing a filter', () => {
  // A tester selected State/Province → British Columbia (5 wines), then
  // unchecked it. With only 5 cards on screen the infinite-scroll sentinel is
  // already in view, so unchecking — which optimistically sets hasMore=true —
  // triggered a page-2 request for the now-unfiltered query that was appended
  // to the 5 stale BC rows, mixing wines that no longer matched.
  test('unchecking a short filter restores the full list without mixing stale rows', async ({ page }) => {
    const panel = await openFilters(page);
    const bc = facetOption(panel, 'British Columbia');
    await openFacet(panel, 'State/Province/Region', bc);

    // The clean-slate first page, to compare against after we clear the filter.
    const cleanFirstPage = await resultBrands(page);

    // Down to the 5 British Columbia wines.
    const filtered = await withResults(
      page,
      () => bc.click(),
      (p) => p.get('stateProvince') === 'British Columbia',
    );
    expect(filtered).toBe(5);

    // Back to a clean slate.
    const total = await withResults(
      page,
      () => bc.click(),
      (p) => !p.get('stateProvince'),
    );

    // Let any stray page-2 append land before asserting.
    await page.waitForTimeout(800);
    await expectCountMatchesRows(page, total);

    // The list must be exactly the clean first page again — not those rows with
    // a page of freshly-fetched wines appended below the stale BC rows.
    expect(await resultBrands(page)).toEqual(cleanFirstPage);
  });

  test('every wine stays reachable after clearing a short filter', async ({ page }) => {
    const panel = await openFilters(page);
    const bc = facetOption(panel, 'British Columbia');
    await openFacet(panel, 'State/Province/Region', bc);

    await withResults(page, () => bc.click(), (p) => p.get('stateProvince') === 'British Columbia');
    const total = await withResults(page, () => bc.click(), (p) => !p.get('stateProvince'));
    await page.waitForTimeout(800);

    // offset must not have been corrupted by a stray append — paging should
    // still walk the whole list.
    await expect(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.getByTestId('wine-card')).toHaveCount(total, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });
});

test.describe('loading between settled results', () => {
  // Switching between two filters that both return nothing (the fixture has no
  // wines in the last 3 or 6 months) used to flash a grid of skeleton cards:
  // the empty list was replaced by skeletons while the second request was in
  // flight, then went empty again. Skeletons belong to the first load only —
  // once there's a settled answer, a transition must not throw it away.
  test('switching between two empty filters never flashes skeleton cards', async ({ page }) => {
    const panel = await openFilters(page);
    await panel.getByRole('button', { name: /^Advanced$/ }).click();

    const m3 = panel.getByRole('radio', { name: 'Last 3 months', exact: true });
    await openFacet(panel, 'Review Date', m3);

    // Settle on the empty last-3-months set.
    await withResults(page, () => m3.click(), (p) => !!p.get('publicationDate'));
    await expect(page.getByText(/No wines found/)).toBeVisible();

    // Hold the next search in flight so the loading window is observable.
    await page.route('**/api/search*', async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });

    await panel.getByRole('radio', { name: 'Last 6 months', exact: true }).click();

    // Through the debounce and into the in-flight request, the empty state must
    // hold — no skeleton grid. Snapshot the count (no auto-retry, which would
    // just wait out the flash) at a moment the request is provably in flight.
    await page.waitForTimeout(450);
    expect(await page.getByTestId('skeleton-card').count()).toBe(0);
    await expect(page.getByText(/No wines found/)).toBeVisible();

    await expect(resultCount(page)).toHaveText('0 wines found');
  });
});

test.describe('infinite scroll', () => {
  // The regression this file was written for. The app used to fire a second
  // first-page search when the unfiltered facet list arrived. If the reader had
  // already paged past 40, that second response reset the list to one page
  // while `offset` stayed at 40 — so the next page request asked for 80, came
  // back empty, set hasMore=false, and rows 41+ became unreachable.
  test('the initial load issues exactly one first-page request', async ({ page }) => {
    const firstPages: string[] = [];
    page.on('request', (r) => {
      if (!r.url().includes('/api/search')) return;
      const params = new URL(r.url()).searchParams;
      if (params.get('offset') === '0') firstPages.push(r.url());
    });

    await page.reload();
    await expect(resultCount(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_000);

    expect(firstPages, firstPages.join('\n')).toHaveLength(1);
  });

  test('every result stays reachable after paging', async ({ page }) => {
    const total = await totalResults(page);
    await expect(async () => {
      await scrollToBottom(page);
      await expect(page.getByTestId('wine-card')).toHaveCount(total, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByText('All 61 results shown')).toBeVisible();
  });

  test('paging in the rest of the list never duplicates a row', async ({ page }) => {
    const total = await totalResults(page);
    expect(total).toBeGreaterThan(PAGE_SIZE);

    // The sentinel only fires as it enters the viewport, and the list grows as
    // pages land — keep scrolling until every row is in.
    await expect(async () => {
      await scrollToBottom(page);
      await expect(page.getByTestId('wine-card')).toHaveCount(total, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    const ids = await page.getByTestId('wine-card').evaluateAll((els) =>
      els.map((el) => el.textContent?.trim() ?? ''));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
