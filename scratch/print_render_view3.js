const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');
console.log(appJs.slice(84673 + 3400, 84673 + 5200));
