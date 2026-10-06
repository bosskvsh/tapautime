const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');

// Search for refresh, loadData, fetch, or view rendering
const keywords = ['fetchMerchants', 'loadMenu', 'renderView', 'loadOrders', 'syncOrders', 'refresh'];
for (const kw of keywords) {
  const matches = [...appJs.matchAll(new RegExp(`(?:function\\s+${kw}|${kw}\\s*[:=])`, 'g'))];
  console.log(`${kw}: found ${matches.length} occurrences`);
}
