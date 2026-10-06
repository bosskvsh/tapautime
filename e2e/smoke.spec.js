// @ts-check
const { test, expect } = require('@playwright/test');

test('smoke test - environment verification', async ({ page }) => {
  await page.setContent('<h1>Tapau Time</h1>');
  await expect(page.locator('h1')).toHaveText('Tapau Time');
});
