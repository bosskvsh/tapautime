/**
 * Scratch verification script for Customer Order rendering pipeline
 */
const path = require('path');
const fs = require('fs');

// Mock DOM container
class MockElement {
  constructor(id) {
    this.id = id;
    this.innerHTML = '';
  }
}

const mockContainer = new MockElement('orders-list-container');

// Mock browser globals
global.document = {
  getElementById: (id) => {
    if (id === 'orders-list-container') return mockContainer;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};

global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  length: 0,
  key: () => null
};

global.window = global;
global.window.addEventListener = () => {};
global.window.scrollTo = () => {};
global.window.location = { href: 'http://localhost/order.html' };
global.window.history = { replaceState: () => {} };

global.TapauCloud = {
  url: 'https://iaqohdvdebgxtfbxijsw.supabase.co',
  anonKey: 'mock',
  getHeaders: () => ({})
};
global.APP_DATA = { merchants: [] };

// Load app.js code context replacing `const store =` and `const UI =` with global exports
let appJsContent = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
appJsContent = appJsContent.replace('const store = new Store();', 'global.store = new Store();');
appJsContent = appJsContent.replace('const UI = {', 'global.UI = {');

// Evaluate app.js in context
eval(appJsContent);

console.log('--- TEST 1: Rendering edge cases in UI.renderOrderCard ---');

const testOrders = [
  // Order 1: Full valid order
  {
    orderId: '101',
    merchantName: 'Wok Hey',
    status: 'preparing',
    createdAt: Date.now(),
    estimatedPrepMins: 10,
    total: 25.50,
    items: [
      { name: 'Egg Fried Rice', quantity: 2, price: 20.00, variant: 'Extra Egg' },
      { name: 'Iced Lemon Tea', quantity: 1, price: 5.50 }
    ]
  },
  // Order 2: Incomplete cloud order (missing items, missing total)
  {
    orderId: '102',
    merchantName: 'Chicken Rice Stall',
    status: 'received',
    createdAt: null,
    items: undefined,
    total: undefined
  },
  // Order 3: Order with string total and string createdAt
  {
    orderId: '#103',
    merchantName: 'Hawker Hub',
    status: 'ready',
    createdAt: '2026-09-02T16:00:00Z',
    items: [{ name: 'Satay 10c', quantity: '1', price: '12.00' }],
    total: '12.00'
  }
];

global.store.activeOrders = testOrders;

try {
  UI.renderOrders();
  console.log('✅ UI.renderOrders() executed WITHOUT errors!');
  console.log('HTML Output Length:', mockContainer.innerHTML.length);
  if (mockContainer.innerHTML.includes('#101') && mockContainer.innerHTML.includes('#102') && mockContainer.innerHTML.includes('#103')) {
    console.log('✅ All 3 test orders rendered successfully in HTML!');
  } else {
    console.error('❌ Missing expected order card markup in HTML output');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ UI.renderOrders() failed:', e);
  process.exit(1);
}

console.log('\n--- VERIFICATION COMPLETED SUCCESSFULLY ---');
