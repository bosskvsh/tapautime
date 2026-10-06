const fs = require('fs');

const orderHtml = fs.readFileSync('order.html', 'utf8');
const sections = [...orderHtml.matchAll(/<section[^>]+id=["']([^"']+)["']/g)].map(m => m[1]);
console.log('Sections in order.html:', sections);

const appJs = fs.readFileSync('app.js', 'utf8');
const renderViewMatches = [...appJs.matchAll(/renderView\s*[:=]\s*function\s*\(([^)]*)\)|function\s+renderView\s*\(([^)]*)\)|renderView\s*\(([^)]*)\)/g)].slice(0, 5);
console.log('renderView matches:', renderViewMatches.length);

const viewsFound = [...appJs.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)].map(m => m[1]);
console.log('Case statements (potential views):', viewsFound);
