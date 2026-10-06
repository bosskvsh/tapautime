const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');
console.log(appJs.slice(84673 + 1800, 84673 + 3500));
