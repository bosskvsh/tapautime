const fs = require('fs');
const live = fs.readFileSync(
  'C:/Users/cleve/.gemini/antigravity-ide/brain/0dc7d4a8-7ef2-4246-8a8a-242a1744fed6/.system_generated/steps/1165/content.md',
  'utf8'
);
const local = fs.readFileSync(
  'dist/customer-pwa/assets/index--ZhbXnbx.js',
  'utf8'
);
console.log('--- LIVE SERVER ---');
console.log('Size:', live.length);
console.log('Penang:', live.includes('Penang'));
console.log('cart is empty:', live.includes('cart is empty'));
console.log('Hot Seller:', live.includes('Hot Seller'));
console.log('');
console.log('--- LOCAL DIST ---');
console.log('Size:', local.length);
console.log('Penang:', local.includes('Penang'));
console.log('cart is empty:', local.includes('cart is empty'));
console.log('Hot Seller:', local.includes('Hot Seller'));
console.log('');
console.log('Files match:', live.length === local.length);
