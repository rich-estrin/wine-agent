import { test, expect } from '@playwright/test';
import { search, resultCount, gotoApp } from './helpers';

// The Headless UI dialog root is a zero-size wrapper — its children are fixed —
// so assert against the panel itself.
const dialog = (page: import('@playwright/test').Page) => page.getByTestId('wine-detail');

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test.describe('the detail modal', () => {
  test('opens on a card and closes again', async ({ page }) => {
    await page.getByTestId('wine-card').first().click();
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
  });

  test('shows the wine it was opened from', async ({ page }) => {
    const brand = await page.getByTestId('wine-card-brand').first().innerText();
    await page.getByTestId('wine-card').first().click();
    await expect(dialog(page)).toContainText(brand);
  });

  test('shows the tasting note and details', async ({ page }) => {
    await search(page, 'Bergström');
    await page.getByTestId('wine-card').first().click();

    await expect(dialog(page).getByText('Tasting Notes')).toBeVisible();
    await expect(dialog(page).getByText('Additional details')).toBeVisible();
    await expect(dialog(page).getByText('Wine Type')).toBeVisible();
  });

  test('labels the state row "State/Province"', async ({ page }) => {
    await page.getByTestId('wine-card').first().click();
    await expect(dialog(page).getByText(/^State\/Province$/)).toBeVisible();
  });
});

test.describe('search-term highlighting', () => {
  // Highlighting is independent of what the query matched on: the search finds
  // Fidelitas by the vineyard in its wine name, and the note is marked wherever
  // the same term turns up there.
  test('marks the query inside the tasting note', async ({ page }) => {
    await search(page, 'Kiona');
    await page.getByTestId('wine-card').first().click();

    const marks = dialog(page).locator('mark');
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText(/kiona/i);
  });

  // The offset mapping in action: the query has no accent, the note does.
  test('marks accented text from an unaccented query', async ({ page }) => {
    await search(page, 'Rhone');
    await page.getByTestId('wine-card').first().click();
    await expect(dialog(page).locator('mark').first()).toHaveText(/rhône/i);
  });

  test('marks nothing when there is no query', async ({ page }) => {
    await page.getByTestId('wine-card').first().click();
    await expect(dialog(page).locator('mark')).toHaveCount(0);
  });

  test('marks nothing when the term is not in the note', async ({ page }) => {
    // Chinook is matched as a producer; the word appears nowhere in its note.
    await search(page, 'Chinook');
    await page.getByTestId('wine-card').first().click();
    await expect(dialog(page).locator('mark')).toHaveCount(0);
  });
});

test('the shelf talker print button is present', async ({ page }) => {
  await page.getByTestId('wine-card').first().click();
  await expect(dialog(page).getByRole('button', { name: /print shelf talker/i })).toBeVisible();
});
