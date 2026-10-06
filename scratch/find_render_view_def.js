const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');

const regex = /renderView\s*\([^)]*\)\s*\{/g;
let m;
while ((m = regex.exec(appJs)) !== null) {
  console.log('Found at offset:', m.index);
  console.log(appJs.slice(m.index, m.index + 500));
}
