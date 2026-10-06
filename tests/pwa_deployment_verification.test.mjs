import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('============================================================');
console.log('  PHASE 4: PWA MANIFESTS & DEPLOYMENT PREP VERIFICATION');
console.log('============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`Test ${totalTests}: ${name}`);
    console.log(`  ✔ [PASS] ${name}\n`);
    passedTests++;
  } catch (err) {
    console.error(`Test ${totalTests}: ${name}`);
    console.error(`  ✖ [FAIL] ${err.message}\n`);
  }
}

// -------------------------------------------------------------
// Test 1: Task 1 - Customer PWA Manifest Config & Portrait Lock
// -------------------------------------------------------------
runTest('Customer PWA Manifest (display: standalone, orientation: portrait)', () => {
  const manifestPath = path.resolve('dist/customer-pwa/manifest.webmanifest');
  assert(fs.existsSync(manifestPath), `Manifest missing at ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  assert.strictEqual(manifest.display, 'standalone', 'Customer PWA display must be standalone');
  assert.strictEqual(manifest.orientation, 'portrait', 'Customer PWA orientation must be portrait');
  assert.strictEqual(manifest.theme_color, '#EA580C', 'Customer PWA theme_color should be #EA580C');
  assert(manifest.icons && manifest.icons.length >= 2, 'Customer PWA must have icons');
  console.log(`    ↳ Customer Manifest verified: display="${manifest.display}", orientation="${manifest.orientation}", theme="${manifest.theme_color}"`);
});

// -------------------------------------------------------------
// Test 2: Task 1 - Merchant KDS Manifest Config & Portrait Lock
// -------------------------------------------------------------
runTest('Merchant KDS Manifest (display: standalone, orientation: portrait)', () => {
  const manifestPath = path.resolve('dist/merchant-web/manifest.webmanifest');
  assert(fs.existsSync(manifestPath), `Manifest missing at ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  assert.strictEqual(manifest.display, 'standalone', 'Merchant KDS display must be standalone');
  assert.strictEqual(manifest.orientation, 'portrait', 'Merchant KDS orientation must be portrait');
  assert.strictEqual(manifest.theme_color, '#0C0A09', 'Merchant KDS theme_color should be #0C0A09');
  assert(manifest.icons && manifest.icons.length >= 2, 'Merchant KDS must have icons');
  console.log(`    ↳ Merchant KDS Manifest verified: display="${manifest.display}", orientation="${manifest.orientation}", theme="${manifest.theme_color}"`);
});

// -------------------------------------------------------------
// Test 3: Task 2 - Service Worker skipWaiting Flow & UI Toast
// -------------------------------------------------------------
runTest('Service Worker skipWaiting Flow & Update Toast Component', () => {
  // Check customer SW
  const customerSwPath = path.resolve('dist/customer-pwa/sw.js');
  assert(fs.existsSync(customerSwPath), `Customer SW missing at ${customerSwPath}`);
  const customerSwContent = fs.readFileSync(customerSwPath, 'utf-8');
  assert(customerSwContent.includes('SKIP_WAITING') || customerSwContent.includes('skipWaiting'), 'Customer SW must contain SKIP_WAITING handler');

  // Check merchant SW
  const merchantSwPath = path.resolve('dist/merchant-web/sw.js');
  assert(fs.existsSync(merchantSwPath), `Merchant SW missing at ${merchantSwPath}`);
  const merchantSwContent = fs.readFileSync(merchantSwPath, 'utf-8');
  assert(merchantSwContent.includes('SKIP_WAITING') || merchantSwContent.includes('skipWaiting'), 'Merchant SW must contain SKIP_WAITING handler');

  // Check PWAUpdateToast component
  const toastComponentPath = path.resolve('packages/shared-ui/src/PWAUpdateToast.tsx');
  assert(fs.existsSync(toastComponentPath), 'PWAUpdateToast.tsx must exist');
  const toastContent = fs.readFileSync(toastComponentPath, 'utf-8');
  assert(toastContent.includes('Update Available'), 'Toast component must have "Update Available" text');
  assert(toastContent.includes('Click to Reload'), 'Toast component must have "Click to Reload" text');
  assert(toastContent.includes('updateServiceWorker(true)'), 'Toast component must call updateServiceWorker(true) on reload');
  assert(toastContent.includes('Update Available - Click to Reload'), 'Toast component must reference "Update Available - Click to Reload"');

  // Verify mounted in both apps
  const customerAppPath = path.resolve('apps/customer-pwa/src/App.tsx');
  const merchantAppPath = path.resolve('apps/merchant-web/src/App.tsx');
  assert(fs.readFileSync(customerAppPath, 'utf-8').includes('PWAUpdateToast'), 'Customer App.tsx must mount PWAUpdateToast');
  assert(fs.readFileSync(merchantAppPath, 'utf-8').includes('PWAUpdateToast'), 'Merchant App.tsx must mount PWAUpdateToast');

  console.log('    ↳ Service Worker skipWaiting listener and "Update Available - Click to Reload" UI toast verified in both apps');
});

// -------------------------------------------------------------
// Test 4: Task 3 - Clean Subdomain Bundle Separation & Routing
// -------------------------------------------------------------
runTest('Vite Build Clean Bundle Separation (Hostinger Subdomains)', () => {
  const customerDist = path.resolve('dist/customer-pwa');
  const merchantDist = path.resolve('dist/merchant-web');

  assert(fs.existsSync(customerDist), 'dist/customer-pwa directory must exist');
  assert(fs.existsSync(merchantDist), 'dist/merchant-web directory must exist');

  // Verify separate index.html, assets, sw.js, and .htaccess for SPA routing
  assert(fs.existsSync(path.join(customerDist, 'index.html')), 'Customer index.html must exist');
  assert(fs.existsSync(path.join(customerDist, '.htaccess')), 'Customer .htaccess must exist for app.tapautime.my');
  assert(fs.existsSync(path.join(merchantDist, 'index.html')), 'Merchant index.html must exist');
  assert(fs.existsSync(path.join(merchantDist, '.htaccess')), 'Merchant .htaccess must exist for kds.tapautime.my');

  const customerIndex = fs.readFileSync(path.join(customerDist, 'index.html'), 'utf-8');
  const merchantIndex = fs.readFileSync(path.join(merchantDist, 'index.html'), 'utf-8');

  assert(customerIndex.includes('Tapau Time - Order Ahead'), 'Customer index.html title mismatch');
  assert(merchantIndex.includes('Merchant KDS'), 'Merchant index.html title mismatch');

  console.log('    ↳ Bundle outputs cleanly separated:');
  console.log('      - dist/customer-pwa/ -> Ready for app.tapautime.my');
  console.log('      - dist/merchant-web/ -> Ready for kds.tapautime.my');
});

// -------------------------------------------------------------
// Test 5: Task 4 - .env.example Key & URL Mapping
// -------------------------------------------------------------
runTest('.env.example Mapping (Supabase URLs, Public Keys, Subdomains)', () => {
  const envExamplePath = path.resolve('.env.example');
  assert(fs.existsSync(envExamplePath), '.env.example must exist at root');
  const envContent = fs.readFileSync(envExamplePath, 'utf-8');

  const requiredKeys = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_CHECKOUT_EDGE_FUNCTION_URL',
    'VITE_STORAGE_RECEIPTS_BUCKET',
    'VITE_CUSTOMER_APP_URL',
    'VITE_MERCHANT_KDS_URL',
    'VITE_LANDING_URL',
    'VITE_DEFAULT_TIMEZONE',
    'VITE_HEARTBEAT_INTERVAL_MS',
  ];

  for (const key of requiredKeys) {
    assert(envContent.includes(key), `Missing required env variable: ${key}`);
  }

  // Verify customer subdomain mapping
  assert(envContent.includes('app.tapautime.my'), 'Must document app.tapautime.my');
  assert(envContent.includes('kds.tapautime.my'), 'Must document kds.tapautime.my');
  assert(envContent.includes('Asia/Kuching'), 'Must document Asia/Kuching timezone');

  console.log('    ↳ All 10 required environment variables and Hostinger subdomains verified in .env.example');
});

console.log('============================================================');
console.log('PWA DEPLOYMENT PREP VERIFICATION SUMMARY');
console.log(`Total Tests Run : ${totalTests}`);
console.log(`Passed Tests    : ${passedTests}`);
assert.strictEqual(passedTests, totalTests, 'All tests must pass');
console.log('ALL PHASE 4 PWA DEPLOYMENT PREP TESTS PASSED (100% SUCCESS)');
console.log('============================================================\n');
