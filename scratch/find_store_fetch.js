const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');

const regex = /fetch\w*\s*\([^)]*\)\s*\{/g;
let m;
while ((m = regex.exec(appJs)) !== null) {
  console.log('fetch method found at offset:', m.index);
  console.log(appJs.slice(m.index, m.index + 200));
}
