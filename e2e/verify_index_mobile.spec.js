// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const indexHtmlPath = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Tapau Time Landing Page (index.html) Mobile & Desktop Verification', () => {

  test('Mobile Viewport (390x844) Ergonomics & Fluid Interactions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(indexHtmlPath);

    // 1. Check Brand & Header
    await expect(page.locator('nav span:has-text("Tapau Time")').first()).toBeVisible();
    await expect(page.locator('text=Try Demo').first()).toBeVisible();

    // 2. Check Mobile Bottom Conversion Dock
    const mobileDock = page.locator('div.md\\:hidden.fixed.bottom-0');
    await expect(mobileDock).toBeVisible();
    await expect(mobileDock.locator('text=Customer Demo')).toBeVisible();
    await expect(mobileDock.locator('text=Claim Free Setup')).toBeVisible();

    // 3. Check Hero Switcher Tabs
    const kdsTab = page.locator('.hero-switcher-tab', { hasText: 'Kitchen KDS' });
    const qrTab = page.locator('.hero-switcher-tab', { hasText: 'Table QR' });
    await expect(kdsTab).toBeVisible();
    await expect(qrTab).toBeVisible();

    // Click Table QR tab and verify active label updates
    await qrTab.click();
    const activeLabel = page.locator('#stack-active-label');
    await expect(activeLabel).toHaveText('2. Table QR Flow');

    // 4. Test Savings Calculator Slider & Animated Numbers
    const ordersSlider = page.locator('#calc-orders');
    await expect(ordersSlider).toBeVisible();
    await ordersSlider.fill('80');
    await ordersSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    const ordersLabel = page.locator('#calc-orders-label');
    await expect(ordersLabel).toHaveText('80 orders/day');

    const monthlySavings = page.locator('#calc-monthly-savings');
    await expect(monthlySavings).toContainText('RM');

    // 5. Test Mobile Pricing Segmented Controller
    const tabStarter = page.locator('#tab-pricing-starter');
    const tabPremium = page.locator('#tab-pricing-premium');
    const tabMulti = page.locator('#tab-pricing-multi');

    await expect(tabStarter).toBeVisible();
    await expect(tabPremium).toBeVisible();
    await expect(tabMulti).toBeVisible();

    const starterCard = page.locator('#pricing-card-starter');
    const premiumCard = page.locator('#pricing-card-premium');
    const multiCard = page.locator('#pricing-card-multi');

    // By default, premium is active on mobile
    await expect(premiumCard).toBeVisible();

    // Switch to Starter
    await tabStarter.click();
    await expect(starterCard).toBeVisible();
    await expect(premiumCard).toBeHidden();

    // Switch to Multi-Stall
    await tabMulti.click();
    await expect(multiCard).toBeVisible();
    await expect(starterCard).toBeHidden();

    // 6. Test Booking Modal Bottom Sheet
    await page.locator('button:has-text("Claim Free Setup")').first().click();
    const bookingModal = page.locator('#booking-modal');
    await expect(bookingModal).toBeVisible();
    await expect(page.locator('#book-name')).toBeVisible();

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(bookingModal).toBeHidden();

    // 7. Test F&B Profit Test Quiz Flow
    await page.locator('button:has-text("CLAIM FREE AUDIT")').first().click();
    const quizModal = page.locator('#profit-test-modal');
    await expect(quizModal).toBeVisible();
    await expect(page.locator('#modal-q-badge')).toHaveText('Question 1 of 10');

    // Answer Yes to question 1
    await page.locator('#modal-quiz-stage button:has-text("YES")').click();
    await expect(page.locator('#modal-q-badge')).toHaveText('Question 2 of 10');

    await page.keyboard.press('Escape');
    await expect(quizModal).toBeHidden();
  });

  test('Desktop Viewport (1280x800) Layout & Comparison Grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(indexHtmlPath);

    // Desktop nav should be visible
    await expect(page.locator('nav a:has-text("How it Works")')).toBeVisible();
    await expect(page.locator('nav a:has-text("Savings Calculator")')).toBeVisible();
    await expect(page.locator('nav a:has-text("Merchant Login")')).toBeVisible();

    // Mobile bottom dock should be hidden on desktop
    const mobileDock = page.locator('div.md\\:hidden.fixed.bottom-0');
    await expect(mobileDock).toBeHidden();

    // Desktop pricing should show all 3 columns simultaneously
    await expect(page.locator('#pricing-card-starter')).toBeVisible();
    await expect(page.locator('#pricing-card-premium')).toBeVisible();
    await expect(page.locator('#pricing-card-multi')).toBeVisible();
  });

});
