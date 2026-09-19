import { test, expect, type Page } from '@playwright/test';
import { gotoApp } from './helpers';

// The printed card is a fixed 3.5×5in, so a long review has to shrink to fit
// rather than run off the bottom.
const LONG_REVIEW = Array(9).fill(
  'The aromas enchant, with notes of fresh green herb, violet, pomegranate, sauvage, licorice, wet stone, black pepper, and orange rind. The palate is chock full of plum.',
).join(' ');

async function openFirstWithReview(page: Page, review: string | null) {
  if (review !== null) {
    await page.route('**/api/search*', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      for (const w of body.results ?? body.wines ?? []) w.review = review;
      await route.fulfill({ response: res, json: body });
    });
  }
  await gotoApp(page);
  await page.getByTestId('wine-card').first().click();
  // Measured on screen: the card is laid out at print size offscreen, which
  // is what the fit pass measures. (Emulating print media re-lays out the app
  // and closes the modal.)
  return page.locator('#shelf-talker .st-review');
}

const fits = (review: import('@playwright/test').Locator) =>
  review.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
const fontPt = (review: import('@playwright/test').Locator) =>
  review.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) * 0.75);

test('a long review shrinks to fit the card', async ({ page }) => {
  const review = await openFirstWithReview(page, LONG_REVIEW);
  await expect(review).toBeAttached();
  expect(await fits(review)).toBe(true);
  expect(await fontPt(review)).toBeLessThan(9);
});

test('a short review keeps the full size', async ({ page }) => {
  const review = await openFirstWithReview(page, 'Bright and fresh.');
  await expect(review).toBeAttached();
  expect(await fits(review)).toBe(true);
  expect(await fontPt(review)).toBeCloseTo(9, 1);
});
