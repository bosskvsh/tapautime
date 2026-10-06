const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');

// Find UI.xxx = or window.UI = {
const uiMatches = [...appJs.matchAll(/(?:const|var|let)?\s*UI\s*=\s*\{|window\.UI\s*=\s*\{/g)];
console.log('UI object definitions:', uiMatches.map(m => m[0]));

// Find properties of UI
const uiMethods = [...appJs.matchAll(/UI\.([a-zA-Z0-9_]+)\s*=/g)].map(m => m[1]);
console.log('UI methods:', uiMethods.slice(0, 30));

const appInit = [...appJs.matchAll(/function\s+init\w*|\binit\w*\s*[:=]\s*function/g)].map(m => m[0]);
console.log('Init functions:', appInit);
