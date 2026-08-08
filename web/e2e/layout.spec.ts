import { test, expect, type Page } from '@playwright/test';
import {
  openFilters, closeFilters, varietalToggle, varietalOptions,
  resultCount, searchBox, search, isMobile, gotoApp } from './helpers';

/** Nothing should make the page scroll sideways. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Elements poking outside the viewport horizontally, by tag and text. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      if (r.right > vw + 1 || r.left < -1) {
        out.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return out.slice(0, 8);
  });
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test.describe('page fits its viewport', () => {
  test('the results page does not scroll sideways', async ({ page }) => {
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await overflowingElements(page)).toEqual([]);
  });

  test('long winery and wine names stay inside their card', async ({ page }) => {
    // The fixture carries a deliberately over-long name for exactly this.
    await search(page, 'Rocks District Cooperative');
    const card = page.getByTestId('wine-card').first();
    await expect(card).toBeVisible();

    const fits = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll('*')).every((child) => {
        const c = child.getBoundingClientRect();
        return c.width === 0 || c.right <= r.right + 1;
      });
    });
    expect(fits).toBe(true);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('a long tasting note does not stretch the detail modal off-screen', async ({ page }) => {
    await search(page, 'Bergström');
    await page.getByTestId('wine-card').first().click();

    const panel = page.getByTestId('wine-detail');
    await expect(panel).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('the filter panel does not scroll sideways', async ({ page }) => {
    await openFilters(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('the search box', () => {
  test('its placeholder fits the field', async ({ page }) => {
    const fits = await searchBox(page).evaluate((el: HTMLInputElement) => {
      const cs = getComputedStyle(el);
      const probe = document.createElement('span');
      probe.style.cssText =
        `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};font-style:italic`;
      probe.textContent = el.placeholder;
      document.body.appendChild(probe);
      const textWidth = probe.offsetWidth;
      probe.remove();
      const boxWidth =
        el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { textWidth, boxWidth, placeholder: el.placeholder };
    });
    expect(
      fits.textWidth,
      `placeholder "${fits.placeholder}" needs ${Math.round(fits.textWidth)}px but the field gives ${Math.round(fits.boxWidth)}px`,
    ).toBeLessThanOrEqual(fits.boxWidth);
  });

  test('no longer mentions vintage', async ({ page }) => {
    await expect(searchBox(page)).toHaveAttribute('placeholder', /^Search winery, varietal/);
  });
});

test.describe('the mobile filter sheet', () => {
  test.skip(({ page }) => !isMobile(page), 'mobile-only');

  test('opens within the viewport rather than off the top', async ({ page }) => {
    const sheet = page.getByTestId('filter-sheet');
    await openFilters(page);

    const box = (await sheet.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('keeps its Show Results button reachable', async ({ page }) => {
    await openFilters(page);
    const button = page.getByRole('button', { name: /show results/i });
    await expect(button).toBeInViewport();
  });

  // This is the clipping risk flagged when Varietal was moved into a collapsible
  // group: an absolutely-positioned dropdown inside a scrolling sheet.
  test('shows the varietal dropdown without clipping it', async ({ page }) => {
    const panel = await openFilters(page);
    await varietalToggle(panel).click();

    const option = varietalOptions(panel).first();
    await expect(option).toBeVisible();

    const clipped = await option.evaluate((el) => {
      const r = el.getBoundingClientRect();
      let node = el.parentElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (/auto|hidden|scroll/.test(cs.overflowY + cs.overflowX)) {
          const p = node.getBoundingClientRect();
          if (r.bottom > p.bottom + 1 || r.top < p.top - 1) return true;
        }
        node = node.parentElement;
      }
      return false;
    });
    expect(clipped).toBe(false);
  });

  test('closes and returns to the results', async ({ page }) => {
    await openFilters(page);
    await closeFilters(page);
    await expect(page.getByTestId('wine-card').first()).toBeVisible();
  });
});

test.describe('the desktop sidebar', () => {
  test.skip(({ page }) => isMobile(page), 'desktop-only');

  test('sits beside the results, not over them', async ({ page }) => {
    const sidebar = (await page.getByTestId('sidebar-desktop').boundingBox())!;
    const results = (await page.getByTestId('results').boundingBox())!;
    expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(results.x + 1);
  });

  test('stays put while the results scroll', async ({ page }) => {
    const before = (await page.getByTestId('sidebar-desktop').boundingBox())!;
    await page.mouse.wheel(0, 600);
    await expect(async () => {
      const after = (await page.getByTestId('sidebar-desktop').boundingBox())!;
      expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    }).toPass();
  });
});
