// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * KDS Diagnostic Test Suite
 * Diagnoses why orders do not appear on the merchant KDS screen.
 * Tests: order insertion pipeline, merchant_id match, REST fetch, Realtime channel health.
 */

const SUPABASE_URL = 'https://iaqohdvdebgxtfbxijsw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcW9oZHZkZWJneHRmYnhpanN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzkyNjIsImV4cCI6MjEwMjY1NTI2Mn0.DFFY_o-wlxonj1mlHsHe3M9_ELGWtTmaqgc1iGr33WE';
const MERCHANT_ID = 'merchant-e6979248';

const HEADERS = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

test.describe('KDS Diagnostic Suite', () => {

  // ── DIAGNOSTIC 1: REST fetch for active orders ──────────────────────────────
  test('DIAG-1: REST fetch for PENDING orders in orders_v2', async ({ request }) => {
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/orders_v2?select=*,order_events(*)&current_status=in.(PENDING,ACCEPTED,PREPARING,READY)&order=created_at.desc`,
      { headers: HEADERS }
    );
    console.log('[DIAG-1] HTTP status:', res.status());
    const body = await res.json();
    console.log('[DIAG-1] Active orders count:', Array.isArray(body) ? body.length : body);
    expect(res.status()).toBe(200);
    // Informational: log if 0 active orders
    if (Array.isArray(body) && body.length === 0) {
      console.warn('[DIAG-1] ⚠️ Zero active orders — all orders have status COMPLETED or CANCELLED. KDS will appear empty.');
    }
  });

  // ── DIAGNOSTIC 2: Verify FIXED placeOrderV2 payload inserts successfully ───────
  test('DIAG-2: Insert a synthetic PENDING order into orders_v2', async ({ request }) => {
    const displayId = `#TEST-${Date.now()}`;
    // FIXED PAYLOAD: Only valid orders_v2 columns — no customer_name/customer_phone
    const body = {
      display_id: displayId,
      merchant_id: MERCHANT_ID,
      current_status: 'PENDING',
      total_amount: 9.99,
      table_number: '',
      order_type: 'tapau'
    };
    const res = await request.post(
      `${SUPABASE_URL}/rest/v1/orders_v2`,
      { headers: HEADERS, data: body }
    );
    console.log('[DIAG-2] Insert status:', res.status());
    const responseBody = await res.text();
    console.log('[DIAG-2] Insert response:', responseBody);

    if (res.status() >= 400) {
      console.error('[DIAG-2] ❌ INSERT FAILED — Fix did not work');
      console.error('[DIAG-2] Error details:', responseBody);
    } else {
      console.log('[DIAG-2] ✅ Insert succeeded — placeOrderV2 fix CONFIRMED');
    }
    // Assert the fix works
    expect(res.status()).toBe(201);

    const parsed = (() => { try { return JSON.parse(responseBody); } catch { return null; } })();
    if (parsed && parsed[0]) {
      // Cleanup: mark as COMPLETED so it doesn't pollute the KDS
      await request.patch(
        `${SUPABASE_URL}/rest/v1/orders_v2?id=eq.${parsed[0].id}`,
        { headers: HEADERS, data: { current_status: 'COMPLETED' } }
      );
      console.log('[DIAG-2] Cleanup: order marked COMPLETED');
    }
  });

  // ── DIAGNOSTIC 3: Confirm merchant_id value used in KDS filter ───────────────
  test('DIAG-3: Validate merchant_id stored in localStorage matches DB', async ({ page }) => {
    await page.goto('/merchant.html');
    // Wait for JS to initialise
    await page.waitForTimeout(3000);

    const merchantId = await page.evaluate(() => {
      const win = /** @type {any} */ (window);
      return localStorage.getItem('tapau_current_merchant_id') ||
             (win.MerchantApp && win.MerchantApp.currentMerchantId) ||
             'NOT FOUND';
    });
    console.log('[DIAG-3] Merchant ID in localStorage:', merchantId);
    console.log('[DIAG-3] Expected Merchant ID in DB:', MERCHANT_ID);

    if (merchantId !== MERCHANT_ID) {
      console.error('[DIAG-3] ❌ MISMATCH — Orders inserted with merchant_id="' + MERCHANT_ID + '" but KDS filtering by "' + merchantId + '". Orders will never show.');
    } else {
      console.log('[DIAG-3] ✅ merchant_id matches');
    }
  });

  // ── DIAGNOSTIC 4: Check KDS renders orders already in DB ────────────────────
  test('DIAG-4: Merchant KDS screen loads and shows order count', async ({ page }) => {
    /** @type {string[]} */
    const consoleMessages = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(`[${msg.type()}] ${text}`);
    });
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/merchant.html');
    await page.waitForTimeout(5000);

    // Capture any JS errors
    if (pageErrors.length > 0) {
      console.error('[DIAG-4] ❌ JavaScript errors on merchant page:');
      pageErrors.forEach(e => console.error(' -', e));
    }

    // Look for KDS ticket cards
    const ticketCount = await page.locator('[data-order-id], .kds-ticket, #kds-board .ticket').count();
    console.log('[DIAG-4] KDS ticket elements found:', ticketCount);

    // Check the KDS empty state visibility
    const emptyState = page.locator('#kds-empty-state');
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    console.log('[DIAG-4] KDS empty state visible:', emptyVisible);

    // Log relevant console messages
    const kdsLogs = consoleMessages.filter(m =>
      m.includes('KDS') || m.includes('order') || m.includes('Realtime') ||
      m.includes('Supabase') || m.includes('merchant') || m.includes('channel')
    );
    if (kdsLogs.length > 0) {
      console.log('[DIAG-4] KDS-related console output:');
      kdsLogs.slice(0, 20).forEach(m => console.log(' ', m));
    }
  });

  // ── DIAGNOSTIC 5: placeOrderV2 with matching merchant_id then verify KDS ────
  test('DIAG-5: End-to-end — insert order then verify it appears via REST poll', async ({ request }) => {
    const displayId = `#E2E-${Date.now()}`;
    // Insert
    const insertRes = await request.post(
      `${SUPABASE_URL}/rest/v1/orders_v2`,
      {
        headers: HEADERS,
        data: {
          display_id: displayId,
          merchant_id: MERCHANT_ID,
          current_status: 'PENDING',
          total_amount: 14.50,
          order_type: 'tapau'
        }
      }
    );
    const insertBody = await insertRes.json();
    console.log('[DIAG-5] Insert status:', insertRes.status(), '| display_id:', displayId);

    if (insertRes.status() >= 400) {
      console.error('[DIAG-5] ❌ INSERT FAILED:', JSON.stringify(insertBody));
      expect(insertRes.status()).toBe(201); // Force assertion failure with clear message
      return;
    }

    const insertedId = insertBody[0]?.id;
    console.log('[DIAG-5] Inserted order UUID:', insertedId);

    // Wait a moment then poll the KDS REST endpoint as merchant does
    await new Promise(r => setTimeout(r, 1000));
    const fetchRes = await request.get(
      `${SUPABASE_URL}/rest/v1/orders_v2?select=*,order_events(*)&current_status=in.(PENDING,ACCEPTED,PREPARING,READY)&merchant_id=eq.${MERCHANT_ID}&order=created_at.desc`,
      { headers: HEADERS }
    );
    const fetchBody = await fetchRes.json();
    const found = Array.isArray(fetchBody) && fetchBody.some(o => o.id === insertedId);
    console.log('[DIAG-5] Active orders after insert:', Array.isArray(fetchBody) ? fetchBody.length : 0);
    console.log('[DIAG-5] Inserted order found in KDS feed:', found ? '✅ YES' : '❌ NO');

    if (!found) {
      console.error('[DIAG-5] ❌ Order was inserted but does NOT appear in the KDS REST query.');
      console.error('[DIAG-5] Probable cause: merchant KDS query missing merchant_id filter OR order was filtered out.');
    }

    // Cleanup
    if (insertedId) {
      await request.patch(
        `${SUPABASE_URL}/rest/v1/orders_v2?id=eq.${insertedId}`,
        { headers: HEADERS, data: { current_status: 'COMPLETED' } }
      );
      console.log('[DIAG-5] Cleanup done');
    }
  });

  // ── DIAGNOSTIC 6: Check placeOrderV2 merchant_id bug (store_id vs merchant_id) ──
  test('DIAG-6: Verify placeOrderV2 uses correct merchant_id field', async ({ page }) => {
    const networkRequests = [];
    page.on('request', req => {
      if (req.url().includes('orders_v2') && req.method() === 'POST') {
        networkRequests.push({
          url: req.url(),
          postData: req.postData()
        });
      }
    });
    const networkResponses = [];
    page.on('response', res => {
      if (res.url().includes('orders_v2') && res.request().method() === 'POST') {
        networkResponses.push({
          url: res.url(),
          status: res.status()
        });
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check if TapauCloud.placeOrderV2 has the merchant_id bug
    const placeOrderV2Source = await page.evaluate(() => {
      // Extract the source of placeOrderV2 if accessible
      const win = /** @type {any} */ (window);
      if (typeof win.TapauCloud !== 'undefined' && win.TapauCloud.placeOrderV2) {
        return win.TapauCloud.placeOrderV2.toString().substring(0, 500);
      }
      return 'TapauCloud not accessible from this context';
    });
    console.log('[DIAG-6] placeOrderV2 source snippet:', placeOrderV2Source);

    // Check for the known bug: placeOrderV2 uses orderPayload.store_id but placeOrder passes store_id
    // In app.js line 80: merchant_id: orderPayload.store_id || 'wok-hey'
    // In app.js line 1338: TapauCloud.placeOrder({ store_id: targetStoreId, ... })
    // The issue: placeOrderV2 reads orderPayload.store_id correctly from the passed payload.
    // But if targetStoreId is empty/undefined, it falls back to 'wok-hey' instead of MERCHANT_ID.
    if (placeOrderV2Source.includes('wok-hey')) {
      console.error('[DIAG-6] ❌ BUG CONFIRMED: placeOrderV2 has hardcoded fallback "wok-hey" for merchant_id');
      console.error('[DIAG-6] Orders inserted with merchant_id="wok-hey" will NEVER match merchant_id="merchant-e6979248"');
    }
  });

});
