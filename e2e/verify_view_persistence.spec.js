// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('View State Persistence & Reload Verification', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('tapau_user_profile', JSON.stringify({
        name: 'Test Foodie',
        email: 'foodie@tapautime.my'
      }));
    });
  });

  test('switching between tabs updates URL and refresh stays on the active view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/order.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // 1. Open first merchant menu
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="tapau"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const firstCard = document.querySelector('#tapau-merchants-list > div');
      if (firstCard) /** @type {HTMLElement} */ (firstCard).click();
    });
    await page.waitForTimeout(300);

    await expect(page.locator('#menu-view')).toBeVisible();
    expect(page.url()).toContain('view=menu');
    expect(page.url()).toContain('merchant=');

    // 2. Navigate to Rewards
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="rewards"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(200);

    await expect(page.locator('#rewards-view')).toBeVisible();
    expect(page.url()).toContain('view=rewards');
    expect(page.url()).not.toContain('merchant=');

    // 3. Reload on Rewards page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    await expect(page.locator('#rewards-view')).toBeVisible();
    await expect(page.locator('#menu-view')).toBeHidden();

    // 4. Navigate to Orders page
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="orders"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(200);

    await expect(page.locator('#orders-view')).toBeVisible();
    expect(page.url()).toContain('view=orders');

    // 5. Reload on Orders page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    await expect(page.locator('#orders-view')).toBeVisible();
    await expect(page.locator('#menu-view')).toBeHidden();

    // 6. Navigate to Profile page
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="profile"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(200);

    await expect(page.locator('#profile-view')).toBeVisible();
    expect(page.url()).toContain('view=profile');

    // 7. Reload on Profile page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    await expect(page.locator('#profile-view')).toBeVisible();
    await expect(page.locator('#menu-view')).toBeHidden();
  });

  test('direct QR code / merchant link without view param still opens menu correctly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/order.html?merchant=merchant-e6979248', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    await expect(page.locator('#menu-view')).toBeVisible();
  });
});
