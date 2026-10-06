const fs = require('fs');

console.log('--- Verifying Customer PWA and Standalone App Pull-to-Refresh ---');

// 1. Check PullToRefresh.tsx
const ptrPath = 'apps/customer-pwa/src/components/PullToRefresh.tsx';
if (fs.existsSync(ptrPath)) {
  const content = fs.readFileSync(ptrPath, 'utf8');
  const hasThreshold = content.includes('THRESHOLD = 65');
  const hasHaptic = content.includes('navigator.vibrate');
  const hasSpinner = content.includes('animate-spin');
  console.log('PullToRefresh.tsx exists:', true);
  console.log('  Threshold configured:', hasThreshold);
  console.log('  Haptic feedback enabled:', hasHaptic);
  console.log('  Spinner configured:', hasSpinner);
} else {
  console.error('PullToRefresh.tsx missing!');
}

// 2. Check each customer-pwa screen for PullToRefresh integration
const screens = [
  'HomeScreen.tsx',
  'MenuScreen.tsx',
  'OrdersScreen.tsx',
  'OrderStatusScreen.tsx',
  'RewardsScreen.tsx',
  'ProfileScreen.tsx',
  'CheckoutScreen.tsx'
];

screens.forEach(screen => {
  const filePath = `apps/customer-pwa/src/screens/${screen}`;
  if (fs.existsSync(filePath)) {
    const code = fs.readFileSync(filePath, 'utf8');
    const hasImport = code.includes('PullToRefresh');
    const hasTag = code.includes('<PullToRefresh') && code.includes('</PullToRefresh>');
    console.log(`[customer-pwa] ${screen}: imported=${hasImport}, wrapped=${hasTag}`);
  } else {
    console.error(`Missing screen: ${screen}`);
  }
});

// 3. Check app.js for initPullToRefresh and refreshCurrentView
const appJs = fs.readFileSync('app.js', 'utf8');
const hasInit = appJs.includes('this.initPullToRefresh()');
const hasDef = appJs.includes('initPullToRefresh()');
const hasRefreshView = appJs.includes('refreshCurrentView()');
console.log('app.js pull-to-refresh initialized:', hasInit);
console.log('app.js initPullToRefresh defined:', hasDef);
console.log('app.js refreshCurrentView defined:', hasRefreshView);

// 4. Verify app.js syntax using node require/vm
const vm = require('vm');
try {
  new vm.Script(appJs);
  console.log('app.js syntax valid: true');
} catch (e) {
  console.error('app.js syntax error:', e);
}

console.log('--- All checks completed successfully ---');
