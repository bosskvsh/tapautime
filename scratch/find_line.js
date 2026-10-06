const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');
const lines = appJs.slice(0, 66936).split('\n');
console.log('Line number:', lines.length);
console.log(appJs.slice(66936, 66936 + 400));
