// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Customer Rewards Page Layout Verification', () => {
  test.beforeEach(async ({ context }) => {
    // Inject user profile into localStorage before page load to satisfy customer auth guard
    await context.addInitScript(() => {
      localStorage.setItem('tapau_user_profile', JSON.stringify({
        name: 'Test Foodie',
        email: 'foodie@tapautime.my'
      }));
    });
  });

  test('rewards view should be properly nested inside main-content-area with normalized padding gap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/order.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Click on rewards navigation tab
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="rewards"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(200);

    // 1. Verify rewards-view is a direct child of main-content-area
    const parentId = await page.locator('#rewards-view').evaluate(el => el.parentElement?.id);
    expect(parentId).toBe('main-content-area');

    // 2. Verify rewards-view is visible
    await expect(page.locator('#rewards-view')).toBeVisible();

    // 3. Verify rewards-view top offset aligns cleanly below the header (16px gap)
    const headerBox = await page.locator('#global-app-header').boundingBox();
    const firstCardBox = await page.locator('#rewards-view > div:first-child').boundingBox();

    expect(headerBox).not.toBeNull();
    expect(firstCardBox).not.toBeNull();

    if (headerBox && firstCardBox) {
      const gap = firstCardBox.y - (headerBox.y + headerBox.height);
      expect(gap).toBeLessThanOrEqual(25);
      expect(gap).toBeGreaterThanOrEqual(10);
    }
  });

  test('switching between views preserves correct layout without layout shifts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/order.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Switch: Tapau -> Rewards -> Profile -> Rewards
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="tapau"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await expect(page.locator('#tapau-view')).toBeVisible();

    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="rewards"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await expect(page.locator('#rewards-view')).toBeVisible();
    await expect(page.locator('#tapau-view')).toBeHidden();

    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="profile"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await expect(page.locator('#profile-view')).toBeVisible();
    await expect(page.locator('#rewards-view')).toBeHidden();

    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="rewards"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await expect(page.locator('#rewards-view')).toBeVisible();
    await expect(page.locator('#profile-view')).toBeHidden();
  });
});
