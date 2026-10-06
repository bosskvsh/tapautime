const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0].replace(/^\//, '');
  if (!reqPath) reqPath = 'order.html';
  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Service-Worker-Allowed': '/'
    });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(9894, '127.0.0.1', async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    await page.goto('http://127.0.0.1:9894/order.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Capture Slide 0 (Tapau Terus)
    await page.screenshot({ path: 'scratch_hero_slide_0.png' });
    console.log('Saved scratch_hero_slide_0.png');

    // Go to Slide 1 (Dine In)
    await page.click('#hero-arrow-next');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'scratch_hero_slide_1.png' });
    console.log('Saved scratch_hero_slide_1.png');

    // Go to Slide 2 (Tapau Rewards)
    await page.click('#hero-arrow-next');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'scratch_hero_slide_2.png' });
    console.log('Saved scratch_hero_slide_2.png');

    await browser.close();
    server.close();
  } catch (err) {
    console.error('Test error:', err);
    server.close();
  }
});
