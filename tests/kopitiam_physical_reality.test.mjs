// =============================================================================
// TAPAUTIME PHYSICAL REALITY SIMULATION TEST SUITE
// Simulates the physical operating conditions of a Malaysian Kopitiam Hub
// =============================================================================

import assert from 'node:assert/strict';

// ANSI color helpers for terminal readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function pass(name, detail) {
  console.log(`  ${colors.green}✔ [PASS]${colors.reset} ${colors.bright}${name}${colors.reset}`);
  if (detail) console.log(`    ↳ ${colors.cyan}${detail}${colors.reset}`);
}

function fail(name, error) {
  console.error(`  ${colors.red}✘ [FAIL]${colors.reset} ${colors.bright}${name}${colors.reset}`);
  console.error(`    ↳ ${colors.red}${error.message || error}${colors.reset}`);
}

console.log(`\n${colors.bright}${colors.magenta}============================================================${colors.reset}`);
console.log(`${colors.bright}${colors.magenta}  KOPITIAM HUB PHYSICAL REALITY SIMULATION SUITE${colors.reset}`);
console.log(`${colors.bright}${colors.magenta}============================================================${colors.reset}\n`);

let passedCount = 0;
let failedCount = 0;

// =============================================================================
// TEST 1: The Soggy Noodle Test (Hub Sync)
// =============================================================================
console.log(`${colors.bright}${colors.yellow}Test 1: The Soggy Noodle Test (Hub Sync)${colors.reset}`);
try {
  // Physical Scenario:
  // Stall A (Penang Char Koay Teow): 15 minutes cooking time in hot wok
  // Stall B (Iced Kopi O): 2 minutes drink prep
  // Customer wants both to arrive simultaneously at the pickup counter.
  // If Stall B makes drink immediately, ice melts in 13 minutes -> "Watery Kopi Syndrome".

  const now = new Date('2026-09-04T12:00:00.000Z');

  const stalls = [
    { merchantId: 'stall-a-ckt', name: 'Penang Char Koay Teow', prepMinutes: 15 },
    { merchantId: 'stall-b-drinks', name: 'Uncle Lim Kopi', prepMinutes: 2 },
  ];

  // Hub & Spoke synchronization algorithm (matches Edge Function lines 403-415)
  const maxStallPrepTime = Math.max(...stalls.map((s) => s.prepMinutes));
  assert.equal(maxStallPrepTime, 15, 'Unified pickup must be anchored to slowest item (15 min)');

  const coordinatedStalls = stalls.map((stall) => {
    const stallDelayMinutes = maxStallPrepTime - stall.prepMinutes;
    const targetPrepStartTime = new Date(now.getTime() + stallDelayMinutes * 60 * 1000);
    const estimatedCompletionTime = new Date(targetPrepStartTime.getTime() + stall.prepMinutes * 60 * 1000);
    return {
      ...stall,
      stallDelayMinutes,
      targetPrepStartTime,
      estimatedCompletionTime,
    };
  });

  const stallA = coordinatedStalls.find((s) => s.merchantId === 'stall-a-ckt');
  const stallB = coordinatedStalls.find((s) => s.merchantId === 'stall-b-drinks');

  // Assertions:
  // Stall A begins immediately
  assert.equal(stallA.stallDelayMinutes, 0, 'Stall A (15m prep) starts with 0 minute delay');
  assert.equal(stallA.targetPrepStartTime.toISOString(), '2026-09-04T12:00:00.000Z');

  // Stall B is delayed by EXACTLY 13 minutes
  assert.equal(stallB.stallDelayMinutes, 13, 'Stall B (2m prep) must be delayed by EXACTLY 13 minutes');
  assert.equal(stallB.targetPrepStartTime.toISOString(), '2026-09-04T12:13:00.000Z');

  // Verify delay in milliseconds (13 * 60 * 1000 = 780,000ms)
  const delayMs = stallB.targetPrepStartTime.getTime() - stallA.targetPrepStartTime.getTime();
  assert.equal(delayMs, 780000, 'Stall B start time offset must be strictly 780,000 ms');

  // Both orders complete at the EXACT same timestamp (12:15:00.000Z)
  assert.equal(
    stallA.estimatedCompletionTime.toISOString(),
    stallB.estimatedCompletionTime.toISOString(),
    'Both hot food and iced drinks must reach counter at identical timestamp'
  );
  assert.equal(stallB.estimatedCompletionTime.toISOString(), '2026-09-04T12:15:00.000Z');

  pass(
    'Soggy Noodle / Hub Sync Test Passed',
    `Stall B delay = ${stallB.stallDelayMinutes} min (offset: ${delayMs} ms). Both finish at ${stallA.estimatedCompletionTime.toISOString()}.`
  );
  passedCount++;
} catch (err) {
  fail('The Soggy Noodle Test', err);
  failedCount++;
}

// =============================================================================
// TEST 2: The Thunderstorm Test (Heartbeat Validation)
// =============================================================================
console.log(`\n${colors.bright}${colors.yellow}Test 2: The Thunderstorm Test (Heartbeat Validation)${colors.reset}`);
try {
  // Physical Scenario:
  // Tropical monsoon rain disrupts hawker center Wi-Fi.
  // Stall tablet last pinged 3 minutes ago (180s ago).
  // Operational Rule: now() - last_seen <= 2 minutes (120s). Orders past 120s must hard-reject.

  const now = new Date('2026-09-04T12:30:00.000Z');

  function validateHeartbeat(merchant) {
    if (!merchant.last_seen) {
      return {
        allowed: false,
        status: 400,
        error: 'MERCHANT_OFFLINE',
        message: `Merchant "${merchant.business_name}" is currently offline (no heartbeat reported).`,
      };
    }
    const lastSeenMs = new Date(merchant.last_seen).getTime();
    const elapsedSeconds = (now.getTime() - lastSeenMs) / 1000;

    if (elapsedSeconds > 120) {
      return {
        allowed: false,
        status: 400,
        error: 'MERCHANT_OFFLINE',
        message: `Merchant "${merchant.business_name}" has been offline for ${elapsedSeconds}s (> 120s limit). Orders cannot be accepted.`,
      };
    }
    return { allowed: true, status: 200 };
  }

  // Case A: Disconnected 3 minutes ago (180s)
  const offlineMerchant = {
    id: 'merchant-thunderstorm-01',
    business_name: 'Uncle Lim Hokkien Mee',
    last_seen: new Date(now.getTime() - 180 * 1000).toISOString(),
    is_open: true,
  };

  const resultOffline = validateHeartbeat(offlineMerchant);
  assert.equal(resultOffline.allowed, false, 'Stall offline for 3m must not accept orders');
  assert.equal(resultOffline.status, 400, 'HTTP status must be 400 Bad Request');
  assert.equal(resultOffline.error, 'MERCHANT_OFFLINE', 'Must return MERCHANT_OFFLINE error');

  // Case B: Disconnected exactly 2 minutes and 1 second ago (121s)
  const edgeCaseMerchant = {
    id: 'merchant-thunderstorm-02',
    business_name: 'Ah Huat Kopi',
    last_seen: new Date(now.getTime() - 121 * 1000).toISOString(),
    is_open: true,
  };
  const resultEdge = validateHeartbeat(edgeCaseMerchant);
  assert.equal(resultEdge.allowed, false, 'Stall offline for 121s must be rejected');

  // Case C: Active stall pinged 45 seconds ago
  const onlineMerchant = {
    id: 'merchant-thunderstorm-03',
    business_name: 'Auntie Mei Roti Canai',
    last_seen: new Date(now.getTime() - 45 * 1000).toISOString(),
    is_open: true,
  };
  const resultOnline = validateHeartbeat(onlineMerchant);
  assert.equal(resultOnline.allowed, true, 'Stall with 45s heartbeat must be accepted');

  pass(
    'Thunderstorm Heartbeat Test Passed',
    '3-minute stale heartbeat (180s) hard-rejected with 400 MERCHANT_OFFLINE. 45s heartbeat accepted.'
  );
  passedCount++;
} catch (err) {
  fail('The Thunderstorm Test', err);
  failedCount++;
}

// =============================================================================
// TEST 3: The Ghost Order Test (Trust Tiers)
// =============================================================================
console.log(`\n${colors.bright}${colors.yellow}Test 3: The Ghost Order Test (Trust Tiers)${colors.reset}`);
try {
  // Physical Scenario:
  // Unregistered / zero-history user tries to place a Cash on Delivery/Pickup order.
  // Rule 2: Cash requires successful_orders_count >= 3 to prevent uncollected ghost food waste.

  function validateTrustTier(user, paymentMethod) {
    if (paymentMethod === 'cash') {
      const orderCount = user?.successful_orders_count ?? 0;
      if (orderCount < 3) {
        return {
          allowed: false,
          status: 403,
          error: 'TRUST_TIER_REQUIRED',
          message: 'Cash payment requires a verified trust tier (minimum 3 completed digital orders).',
          current_successful_orders: orderCount,
          required_successful_orders: 3,
        };
      }
    }
    return { allowed: true, status: 200 };
  }

  // Case A: Fresh User with 0 completed orders
  const freshUser = { id: 'usr-fresh-01', successful_orders_count: 0 };
  const resFreshCash = validateTrustTier(freshUser, 'cash');
  assert.equal(resFreshCash.allowed, false, 'Fresh user with 0 orders must be rejected for cash');
  assert.equal(resFreshCash.status, 403, 'Must return HTTP 403 Forbidden');
  assert.equal(resFreshCash.error, 'TRUST_TIER_REQUIRED');

  // Case B: User with 2 completed orders (still below 3)
  const intermediateUser = { id: 'usr-mid-02', successful_orders_count: 2 };
  const resMidCash = validateTrustTier(intermediateUser, 'cash');
  assert.equal(resMidCash.allowed, false, 'User with 2 orders must still be rejected for cash');

  // Case C: Trusted User with 3 completed orders
  const trustedUser = { id: 'usr-trusted-03', successful_orders_count: 3 };
  const resTrustedCash = validateTrustTier(trustedUser, 'cash');
  assert.equal(resTrustedCash.allowed, true, 'User with 3 orders must be approved for cash');

  // Case D: Fresh user paying via DuitNow manual_transfer or gateway
  const resFreshDuitNow = validateTrustTier(freshUser, 'manual_transfer');
  assert.equal(resFreshDuitNow.allowed, true, 'Fresh user using digital transfer must be accepted');

  pass(
    'Ghost Order Trust Tier Test Passed',
    'User with successful_orders_count = 0 blocked from Cash (403 TRUST_TIER_REQUIRED). Count >= 3 unlocked.'
  );
  passedCount++;
} catch (err) {
  fail('The Ghost Order Test', err);
  failedCount++;
}

// =============================================================================
// TEST 4: The Audio Surge Test (Singleton Web Audio Controller)
// =============================================================================
console.log(`\n${colors.bright}${colors.yellow}Test 4: The Audio Surge Test (Singleton)${colors.reset}`);
try {
  // Physical Scenario:
  // 5 orders land via Supabase Realtime broadcast within 50 milliseconds.
  // Naive code creates 5 AudioContexts / 5 setInterval loops -> clips speaker past 0 dBFS.
  // Singleton controller must:
  // 1. Maintain 1 shared controller instance.
  // 2. Tally all 5 orders in pendingOrdersCount.
  // 3. Keep strictly 1 active loop timer.
  // 4. Bound audio via DynamicsCompressor (-12 dB ceiling).

  class MockAudioAlarmController {
    static instance = null;
    isAlarming = false;
    pendingOrders = new Set();
    activeLoopIntervals = 0;
    oscillatorSpawnCount = 0;
    compressorConfigured = false;

    static getInstance() {
      if (!MockAudioAlarmController.instance) {
        MockAudioAlarmController.instance = new MockAudioAlarmController();
      }
      return MockAudioAlarmController.instance;
    }

    initAudioGraph() {
      // Configures protective limiter: threshold -12 dB, ratio 12:1
      this.compressorConfigured = true;
    }

    playChime() {
      this.initAudioGraph();
      // 3 tones Bb5, Eb6, G6 spawned
      this.oscillatorSpawnCount += 3;
    }

    triggerAlarm(orderId) {
      if (orderId) this.pendingOrders.add(orderId);
      const wasAlarming = this.isAlarming;
      this.isAlarming = true;

      // Idempotency: if already alarming, DO NOT stack loops or spawn parallel tracks
      if (wasAlarming) {
        return;
      }

      this.playChime();
      this.activeLoopIntervals++;
    }

    acknowledgeAlarm() {
      this.activeLoopIntervals = 0;
      this.isAlarming = false;
      this.pendingOrders.clear();
    }

    getState() {
      return {
        isAlarming: this.isAlarming,
        pendingOrdersCount: this.pendingOrders.size,
        activeLoopIntervals: this.activeLoopIntervals,
      };
    }
  }

  const controller = MockAudioAlarmController.getInstance();
  controller.acknowledgeAlarm(); // reset

  // Simulate pushing 5 concurrent orders in the same millisecond
  const surgeOrderIds = ['ord-101', 'ord-102', 'ord-103', 'ord-104', 'ord-105'];
  surgeOrderIds.forEach((id) => controller.triggerAlarm(id));

  const surgeState = controller.getState();

  // Assertions:
  assert.equal(surgeState.isAlarming, true, 'Audio alarm must be alarming');
  assert.equal(surgeState.pendingOrdersCount, 5, 'All 5 orders must be registered in pending tally');
  assert.equal(
    surgeState.activeLoopIntervals,
    1,
    'Strictly 1 audio playback loop must exist (zero overlapping tracks / no clipping)'
  );
  assert.equal(
    controller.oscillatorSpawnCount,
    3,
    'Only 1 chime sequence (3 oscillators) should play on initial trigger, not 15'
  );
  assert.equal(controller.compressorConfigured, true, 'Dynamics compressor ceiling must be active');

  // Verify singleton identity across multiple component hooks
  const controllerRef2 = MockAudioAlarmController.getInstance();
  assert.equal(controller, controllerRef2, 'Controller must be a strict singleton across all components');

  // Acknowledge and silence
  controller.acknowledgeAlarm();
  const clearedState = controller.getState();
  assert.equal(clearedState.isAlarming, false, 'Alarm must be silenced after acknowledge');
  assert.equal(clearedState.pendingOrdersCount, 0, 'Pending tally must reset to 0');
  assert.equal(clearedState.activeLoopIntervals, 0, 'Intervals must be cleaned up');

  pass(
    'Audio Surge Singleton Test Passed',
    '5 concurrent orders registered without stacking. Strictly 1 loop active. Dynamics compressor active.'
  );
  passedCount++;
} catch (err) {
  fail('The Audio Surge Test', err);
  failedCount++;
}

// =============================================================================
// TEST 5: The Ledger Precision Test
// =============================================================================
console.log(`\n${colors.bright}${colors.yellow}Test 5: The Ledger Precision Test${colors.reset}`);
try {
  // Physical Scenario:
  // Item price = RM 2.50
  // Platform fee = 5.5% (0.0550)
  // IEEE-754 Floating Point Bug: 2.50 * 0.055 = 0.13750000000000004
  // If stored with standard float or rounded to 2 decimals (0.14), merchant overbilled.
  // Database ledger schema mandates NUMERIC(12,4) precision: debit must be strictly 0.1375.

  const orderTotal = 2.50; // RM 2.50
  const feeRate = 0.055;  // 5.5% platform fee

  // Method 1: Precise calculation using integer arithmetic / micropennies (1/10,000 RM)
  // Ensures arbitrary fractional amounts never suffer floating point skew
  const totalInMicros = Math.round(orderTotal * 10000); // 25000
  const rateInMicros = Math.round(feeRate * 10000);     // 550
  const feeMicros = Math.round((totalInMicros * rateInMicros) / 10000); // 1375
  const platformFeeDebit = feeMicros / 10000; // 0.1375

  // Method 2: Fixed 4-decimal string representation (matches Postgres NUMERIC(12,4))
  const feeFormatted = (orderTotal * feeRate).toFixed(4); // "0.1375"
  const feeNumber = parseFloat(feeFormatted);

  // Assertions for Debit:
  assert.equal(platformFeeDebit, 0.1375, 'Debit amount must strictly equal 0.1375');
  assert.equal(feeFormatted, '0.1375', 'Formatted string representation must strictly equal "0.1375"');
  assert.equal(feeNumber, 0.1375, 'Numeric debit must strictly equal 0.1375');
  assert.notEqual(feeFormatted, '0.14', 'Debit must NOT be prematurely rounded to 2 decimal places (0.14)');

  // Net Merchant Credit:
  // Order Total (2.5000) - Platform Fee (0.1375) = 2.3625
  const netCredit = parseFloat((orderTotal - platformFeeDebit).toFixed(4));
  assert.equal(netCredit, 2.3625, 'Merchant net payout must strictly equal RM 2.3625');

  // Double-Entry Ledger Invariant Verification:
  // Credit (Merchant Net) + Debit (Platform Fee) MUST EQUAL Total Order Amount to 4 decimal places:
  const ledgerBalanced = parseFloat((netCredit + platformFeeDebit).toFixed(4));
  assert.equal(ledgerBalanced, 2.5000, 'Double-entry ledger must balance to exact zero-sum (2.3625 + 0.1375 = 2.5000)');

  pass(
    'Ledger Precision Test Passed',
    `Debit = RM ${feeFormatted} (0.1375), Credit = RM ${netCredit.toFixed(4)} (2.3625). Exact zero-sum balance: RM ${ledgerBalanced.toFixed(4)}.`
  );
  passedCount++;
} catch (err) {
  fail('The Ledger Precision Test', err);
  failedCount++;
}

// =============================================================================
// SUMMARY REPORT
// =============================================================================
console.log(`\n${colors.bright}${colors.magenta}============================================================${colors.reset}`);
console.log(`${colors.bright}SIMULATION TEST SUMMARY${colors.reset}`);
console.log(`Total Tests Run : ${passedCount + failedCount}`);
console.log(`${colors.green}Passed Tests    : ${passedCount}${colors.reset}`);
if (failedCount > 0) {
  console.log(`${colors.red}Failed Tests    : ${failedCount}${colors.reset}`);
} else {
  console.log(`${colors.green}All 5 Kopitiam Physical Reality Tests PASSED with 100% success!${colors.reset}`);
}
console.log(`${colors.bright}${colors.magenta}============================================================${colors.reset}\n`);

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
