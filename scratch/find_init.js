const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');

const regex = /init\s*\([^)]*\)\s*\{/g;
let m;
while ((m = regex.exec(appJs)) !== null) {
  console.log('init found at:', m.index);
  console.log(appJs.slice(m.index, m.index + 300));
}
