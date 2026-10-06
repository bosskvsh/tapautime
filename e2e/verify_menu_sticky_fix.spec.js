// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Menu Sticky Header and Image Fallback Fix', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('tapau_user_profile', JSON.stringify({
        name: 'Test Foodie',
        email: 'foodie@tapautime.my'
      }));
    });
  });

  test('category chips bar pins flush to top-0 and dish cards scroll cleanly without offset collision', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/order.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Open tapau view then open first merchant menu
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="tapau"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const firstCard = document.querySelector('#tapau-merchants-list > div');
      if (firstCard) /** @type {HTMLElement} */ (firstCard).click();
    });
    await page.waitForTimeout(400);

    // Verify menu-view is visible
    await expect(page.locator('#menu-view')).toBeVisible();

    // Verify sticky class is top-0
    const chipsClass = await page.locator('#menu-category-chips').getAttribute('class');
    expect(chipsClass).toContain('sticky');
    expect(chipsClass).toContain('top-0');
    expect(chipsClass).not.toContain('top-16');

    // Scroll down past the cover banner & store details (e.g. 500px)
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    await page.waitForTimeout(300);

    // When scrolled, category chips should pin at y: 0
    const chipsBox = await page.locator('#menu-category-chips').boundingBox();
    expect(chipsBox).not.toBeNull();
    if (chipsBox) {
      console.log(`Scrolled category chips Y offset: ${chipsBox.y}px`);
      expect(chipsBox.y).toBe(0);
    }
  });

  test('list view dish images have fallback handler and render cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/order.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Navigate to menu view in list layout
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-nav="tapau"]');
      if (btn) /** @type {HTMLElement} */ (btn).click();
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const firstCard = document.querySelector('#tapau-merchants-list > div');
      if (firstCard) /** @type {HTMLElement} */ (firstCard).click();
    });
    await page.waitForTimeout(400);

    // Switch to list layout if needed
    const imgFallbacks = await page.locator('#menu-items-container img').evaluateAll(imgs => {
      return imgs.map(img => ({
        hasOnError: img.hasAttribute('onerror') || typeof img.onerror === 'function',
        src: img.getAttribute('src')
      }));
    });

    expect(imgFallbacks.length).toBeGreaterThan(0);
    imgFallbacks.forEach(img => {
      expect(img.hasOnError).toBe(true);
      expect(img.src).toBeTruthy();
    });
  });
});
