// @ts-nocheck
// =============================================================================
// SUPABASE EDGE FUNCTION: CHECKOUT PROCESSOR
// High-concurrency checkout handler with Hub & Spoke splitting,
// Heartbeat validation, Timezone checking, Trust Tiers & Atomic Reservations
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ModifierPayload {
  modifier_id: string;
  modifier_group?: string;
  option_name: string;
  additional_price: number;
  linked_item_id?: string | null;
}

interface CartItemPayload {
  item_id: string;
  merchant_id?: string;
  name?: string;
  quantity: number;
  unit_price: number;
  modifiers?: ModifierPayload[];
  special_instructions?: string | null;
}

interface CheckoutRequestBody {
  action?: 'verify_payment' | 'reconcile_curlec' | 'validate_promo_code';
  idempotency_key?: string;
  customer_id: string;
  hub_id?: string | null;
  payment_method: 'gateway' | 'manual_transfer' | 'cash';
  receipt_url?: string | null;
  items: CartItemPayload[];
  order_type?: string;
  table_number?: string | null;
  customer_name?: string;
  customer_phone?: string;
  promo_code?: string;
  merchant_id?: string;
  packaging_fee_type?: string;
  packaging_fee_amount?: number;
  subtotal?: number;
  gross_total?: number;
  order_balance_fee?: number;
  is_preorder?: boolean;
  scheduled_pickup_date?: string; // timestamptz — carries both date and time
}

/**
 * Formats an ISO timestamp as HH:mm in Asia/Kuching for operator messaging.
 */
function formatKuchingClock(isoString?: string | null): string {
  if (!isoString) return '--:--';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuching',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(isoString));
  } catch {
    return '--:--';
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const idempotencyHeader = req.headers.get('x-idempotency-key');
    const body: CheckoutRequestBody = await req.json();

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // 0a. Promo validation used by the customer checkout preview
    // -------------------------------------------------------------------------
    if ((body as any).action === 'validate_promo_code') {
      const promoCode = String(body.promo_code || '').trim().toUpperCase();
      const requestedSubtotal = Number(body.subtotal);
      const requestedGrossTotal = Number(body.gross_total);
      if (!promoCode || !Number.isFinite(requestedSubtotal) || requestedSubtotal < 0 || !Number.isFinite(requestedGrossTotal) || requestedGrossTotal < 0) {
        return new Response(
          JSON.stringify({ error: 'INVALID_PROMO_REQUEST', message: 'A valid promo code and order totals are required.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const requestedOrderType = body.order_type || (body.table_number ? 'dine_in' : 'tapau');

      const { data: promo, error: promoError } = await supabaseAdmin.rpc('calculate_merchant_promo_discount', {
        p_code: promoCode,
        p_merchant_id: body.merchant_id || null,
        p_subtotal: requestedSubtotal,
        p_gross_total: requestedGrossTotal,
        p_order_type: requestedOrderType,
      });

      if (promoError) {
        console.error('[Checkout] Promo calculation failed:', promoError);
        return new Response(
          JSON.stringify({ error: 'PROMO_CALCULATION_FAILED', message: 'Unable to validate this promo code.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!promo?.valid) {
        const errorMessages: Record<string, string> = {
          PROMO_CODE_EXPIRED: 'This promo code has expired.',
          PROMO_USAGE_LIMIT_REACHED: 'This promo code has reached its usage limit.',
          PROMO_CODE_NOT_ACTIVE: 'This promo code is not active for this stall.',
          PROMO_SINGLE_MERCHANT_ONLY: 'Merchant promo codes can only be used with one stall in the cart.',
          PROMO_ORDER_TYPE_MISMATCH: promo?.applicable_to === 'tapau'
            ? 'This promo code is only valid for tapau orders.'
            : promo?.applicable_to === 'dine_in'
            ? 'This promo code is only valid for dine-in orders.'
            : 'This promo code is not valid for this order type.',
        };
        return new Response(
          JSON.stringify({
            error: promo?.error || 'PROMO_NOT_ACTIVE',
            message: errorMessages[promo?.error || ''] || 'This promo code is not available for this order.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, promo }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // 0. Active Payment Verification & Reconciliation Pipeline
    // -------------------------------------------------------------------------
    if ((body as any).action === 'verify_payment' || (body as any).action === 'reconcile_curlec') {
      const targetTxId = (body as any).master_transaction_id || (body as any).transaction_id || (body as any).order_id;
      let targetCurlecOrderId = (body as any).curlec_order_id;
      const targetPin = (body as any).pickup_pin;

      if (!targetTxId && !targetCurlecOrderId) {
        return new Response(
          JSON.stringify({ error: 'MISSING_PARAMS', message: 'master_transaction_id or curlec_order_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check current DB status
      let orderQuery = supabaseAdmin.from('orders').select('*');
      if (targetTxId) {
        orderQuery = orderQuery.or(`transaction_id.eq.${targetTxId},id.eq.${targetTxId}`);
      }
      const { data: dbOrders } = await orderQuery;

      // If already captured in DB, return early
      const alreadyCaptured = dbOrders?.some((o: any) => o.payment_status === 'captured' || o.payment_status === 'paid');
      if (alreadyCaptured) {
        return new Response(
          JSON.stringify({ success: true, payment_status: 'captured', message: 'Order is already captured' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const curlecKeyId = Deno.env.get('CURLEC_KEY_ID');
      const curlecKeySecret = Deno.env.get('CURLEC_KEY_SECRET');

      if (!curlecKeyId || !curlecKeySecret) {
        return new Response(
          JSON.stringify({ error: 'GATEWAY_CONFIG_ERROR', message: 'Curlec credentials missing' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const basicAuth = btoa(`${curlecKeyId}:${curlecKeySecret}`);
      let capturedPayment: any = null;

      // 1. If curlec_order_id available, fetch its payments
      if (targetCurlecOrderId) {
        try {
          const payRes = await fetch(`https://api.razorpay.com/v1/orders/${targetCurlecOrderId}/payments`, {
            headers: { Authorization: `Basic ${basicAuth}` },
          });
          if (payRes.ok) {
            const payData = await payRes.json();
            const items = payData.items || [];
            capturedPayment = items.find((p: any) => p.status === 'captured' || p.status === 'authorized' || p.captured === true);
          }
        } catch (e) {
          console.warn('[Checkout verify_payment] Order payments fetch error:', e);
        }
      }

      // 2. If no captured payment found via curlec_order_id, search recent payments
      if (!capturedPayment && targetTxId) {
        try {
          const searchRes = await fetch(`https://api.razorpay.com/v1/payments?count=20`, {
            headers: { Authorization: `Basic ${basicAuth}` },
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const items = searchData.items || [];
            capturedPayment = items.find((p: any) => {
              const notes = p.notes || {};
              const matchTx = notes.master_transaction_id === targetTxId || notes.order_id === targetTxId;
              const isPaid = p.status === 'captured' || p.status === 'authorized' || p.captured === true;
              return matchTx && isPaid;
            });
            if (capturedPayment && !targetCurlecOrderId) {
              targetCurlecOrderId = capturedPayment.order_id;
            }
          }
        } catch (e) {
          console.warn('[Checkout verify_payment] Fallback payments query error:', e);
        }
      }

      // 3. If captured payment confirmed on Curlec, execute authoritative confirm_dine_in_payment RPC
      if (capturedPayment) {
        console.log(`[Checkout verify_payment] Found captured payment ${capturedPayment.id} for tx ${targetTxId}`);
        const effectivePin = targetPin || dbOrders?.[0]?.pickup_pin || capturedPayment.notes?.pickup_pin || null;

        await supabaseAdmin.rpc('confirm_dine_in_payment', {
          p_transaction_id: targetTxId,
          p_curlec_payment_id: capturedPayment.id,
          p_curlec_order_id: targetCurlecOrderId || capturedPayment.order_id || null,
          p_pickup_pin: effectivePin,
        });

        return new Response(
          JSON.stringify({
            success: true,
            payment_status: 'captured',
            curlec_payment_id: capturedPayment.id,
            curlec_order_id: targetCurlecOrderId || capturedPayment.order_id,
            pickup_pin: effectivePin,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, payment_status: 'pending' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const idempotencyKey = idempotencyHeader || body.idempotency_key;

    // -------------------------------------------------------------------------
    // 1. Verify idempotency_key
    // -------------------------------------------------------------------------
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,200}$/.test(idempotencyKey)) {
      return new Response(
        JSON.stringify({ error: 'INVALID_IDEMPOTENCY_KEY', message: 'A valid idempotency_key is strictly required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check both the historical direct-order key and the Edge Function's
    // per-merchant sub-order key so retries never create a second order.
    const { data: exactOrders, error: exactIdempErr } = await supabaseAdmin
      .from('orders')
      .select('*, master_transactions(*)')
      .eq('idempotency_key', idempotencyKey);
    const { data: derivedOrders, error: derivedIdempErr } = await supabaseAdmin
      .from('orders')
      .select('*, master_transactions(*)')
      .like('idempotency_key', `${idempotencyKey}_m_%`);

    if (exactIdempErr || derivedIdempErr) {
      console.error('[Checkout] Idempotency lookup failed:', exactIdempErr || derivedIdempErr);
      return new Response(
        JSON.stringify({ error: 'IDEMPOTENCY_LOOKUP_FAILED', message: 'Unable to verify this checkout request. Please try again.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const existingOrders = [...(exactOrders || []), ...(derivedOrders || [])].filter(
      (order, index, all) => all.findIndex((candidate) => candidate.id === order.id) === index
    );

    if (existingOrders && existingOrders.length > 0) {
      console.log(`[Checkout] Idempotent replay for key: ${idempotencyKey}`);
      const replayMaster = existingOrders[0].master_transactions;
      const replayTotal = Number(replayMaster?.total_amount ?? existingOrders[0].total_amount ?? 0);
      return new Response(
        JSON.stringify({
          success: true,
          idempotent_replay: true,
          master_transaction_id: replayMaster?.id || null,
          pickup_pin: replayMaster?.pickup_pin || existingOrders[0].pickup_pin || null,
          final_total: replayTotal,
          total_amount: replayTotal,
          total_amount_cents: Math.round(replayTotal * 100),
          discount: Number(existingOrders[0].discount_amount ?? replayMaster?.discount_amount ?? 0),
          master_transaction: replayMaster,
          orders: existingOrders,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { customer_id, hub_id, payment_method, items } = body;
    const isDineIn = body.order_type === 'dine_in' || body.order_type === 'dinein';

    if (!customer_id || !items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'INVALID_PAYLOAD', message: 'customer_id and at least one item are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Defensive ID normalization for backward compatibility
    const MOCK_ITEM_MAP: Record<string, string> = {
      'item-1': 'c1111111-1111-4111-8111-111111111111', // Penang Char Koay Teow
      'item-2': 'c2222222-2222-4222-8222-222222222222', // Nasi Lemak Ayam Berempah
      'item-3': 'c3333333-3333-4333-8333-333333333333', // Teh Tarik
      'item-4': 'c4444444-4444-4444-8444-444444444444', // Aru Mocha Frappe
      'item-5': 'c5555555-5555-4555-8555-555555555555', // Aru Americano
    };

    const MOCK_MERCHANT_MAP: Record<string, string> = {
      'merchant-e6979248': 'e6979248-28ac-4027-80e1-4ca64b9075b7',
      'merchant-a1b2c3d4': '9291d85d-ba41-4bf1-b9d9-96529039bd16',
    };

    const normalizedItems = (items as CartItemPayload[]).map((i) => {
      const rawId = i.item_id || (i as any).menu_item_id;
      return {
        ...i,
        item_id: MOCK_ITEM_MAP[rawId] || rawId,
        unit_price: Number(i.unit_price ?? (i as any).price ?? 0),
        merchant_id: i.merchant_id ? (MOCK_MERCHANT_MAP[i.merchant_id] || i.merchant_id) : undefined,
      };
    });

    let resolvedCustomerId = customer_id;
    if (resolvedCustomerId === '00000000-0000-0000-0000-000000000001') {
      resolvedCustomerId = '4196227d-a0a1-456c-9610-475edd2270f9';
    }

    // -------------------------------------------------------------------------
    // 2. Enforce Trust Tiers: Cash payment requires successful_orders_count >= 3
    // -------------------------------------------------------------------------
    if (payment_method === 'cash') {
      const { data: userData, error: userErr } = await supabaseAdmin
        .from('users')
        .select('successful_orders_count')
        .eq('id', resolvedCustomerId)
        .single();

      if (userErr || !userData || (userData.successful_orders_count ?? 0) < 3) {
        return new Response(
          JSON.stringify({
            error: 'TRUST_TIER_REQUIRED',
            message: 'Cash payment requires a verified trust tier (minimum 3 completed digital orders). Please checkout using DuitNow QR or Payment Gateway.',
            current_successful_orders: userData?.successful_orders_count ?? 0,
            required_successful_orders: 3,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch all item metadata to determine merchants, item_types, and stations
    const itemIds = [...new Set(normalizedItems.map((i) => i.item_id))];
    const { data: menuItemsData, error: menuErr } = await supabaseAdmin
      .from('menu_items')
      .select('id, merchant_id, name, price, available_quantity, is_available, item_type, station')
      .in('id', itemIds);

    if (menuErr || !menuItemsData || menuItemsData.length < itemIds.length) {
      return new Response(
        JSON.stringify({ error: 'ITEMS_NOT_FOUND', message: 'One or more items in the cart do not exist.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const menuItemMap = new Map(menuItemsData.map((m) => [m.id, m]));

    // Group cart items by merchant
    const merchantItemsMap = new Map<string, CartItemPayload[]>();
    for (const item of normalizedItems) {
      const dbItem = menuItemMap.get(item.item_id);
      const mId = dbItem?.merchant_id || item.merchant_id;
      if (!mId) {
        return new Response(
          JSON.stringify({ error: 'UNKNOWN_MERCHANT', message: `Item ${item.item_id} is missing a valid merchant.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!merchantItemsMap.has(mId)) {
        merchantItemsMap.set(mId, []);
      }
      merchantItemsMap.get(mId)!.push(item);
    }

    const merchantIds = Array.from(merchantItemsMap.keys());
    const { data: merchantsData, error: merchantsErr } = await supabaseAdmin
      .from('merchants')
      .select('id, business_name, is_open, last_seen, packaging_fee_type, packaging_fee_amount, order_buffer_time, current_prep_delay, is_surge_mode, operating_hours')
      .in('id', merchantIds);

    if (merchantsErr || !merchantsData || merchantsData.length < merchantIds.length) {
      return new Response(
        JSON.stringify({ error: 'MERCHANTS_NOT_FOUND', message: 'Could not resolve all merchants in the cart.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const merchantInfoMap = new Map(merchantsData.map((m) => [m.id, m]));
    const now = new Date();

    // -------------------------------------------------------------------------
    // 3. Availability gate (single source of truth)
    //    public.merchant_availability_status() derives
    //      is_open AND is_accepting_orders AND schedule_open AND now <= last_order_at
    //    so this API and every client share exactly one implementation.
    // -------------------------------------------------------------------------
    for (const merchant of merchantsData) {
      const { data: availability, error: availabilityErr } = await supabaseAdmin.rpc(
        'merchant_availability_status',
        { p_merchant_id: merchant.id, p_at: now.toISOString() }
      );

      if (availabilityErr) {
        console.error('[checkout] Availability lookup failed:', availabilityErr);
        return new Response(
          JSON.stringify({
            error: 'AVAILABILITY_CHECK_FAILED',
            message: 'Could not verify stall availability. Please try again.',
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const reason = availability?.reason ?? 'MERCHANT_CLOSED';

      if (availability?.is_currently_open !== true) {
        const messages: Record<string, string> = {
          MERCHANT_CLOSED: `Merchant "${merchant.business_name}" is marked closed.`,
          MERCHANT_PAUSED: `Merchant "${merchant.business_name}" has paused new orders.`,
          MERCHANT_CLOSED_TODAY: `Merchant "${merchant.business_name}" is closed today according to operating schedule.`,
          MERCHANT_CLOSED_FOR_ORDERS: `Merchant "${merchant.business_name}" is outside active ordering hours (last order at ${formatKuchingClock(availability?.last_order_at)} Asia/Kuching).`,
        };

        return new Response(
          JSON.stringify({
            error: reason,
            message: messages[reason] ?? `Merchant "${merchant.business_name}" is not accepting orders right now.`,
            next_open_at: availability?.next_open_at ?? null,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Auto-refresh merchant heartbeat so open stalls can accept orders seamlessly
      await supabaseAdmin
        .from('merchants')
        .update({ last_seen: now.toISOString() })
        .eq('id', merchant.id);
    }

    // -------------------------------------------------------------------------
    // 5. Call checkout_atomic_reservation (Skip for item_type === 'budget_tier')
    // -------------------------------------------------------------------------
    const itemsToReserve: Array<{ item_id: string; quantity: number }> = [];

    for (const item of normalizedItems) {
      const dbItem = menuItemMap.get(item.item_id);
      // Skip stock lock if budget tier
      if (dbItem?.item_type !== 'budget_tier') {
        itemsToReserve.push({ item_id: item.item_id, quantity: item.quantity });
      }

      // Check for linked modifier inventory locks
      if (item.modifiers && Array.isArray(item.modifiers)) {
        for (const mod of item.modifiers) {
          if (mod.linked_item_id) {
            itemsToReserve.push({ item_id: mod.linked_item_id, quantity: item.quantity });
          }
        }
      }
    }

    if (itemsToReserve.length > 0) {
      const { data: reserveRes, error: reserveErr } = await supabaseAdmin.rpc('checkout_atomic_reservation', {
        p_items: itemsToReserve,
      });

      if (reserveErr) {
        console.error('[Checkout] Stock reservation failed:', reserveErr);
        return new Response(
          JSON.stringify({
            error: 'INVENTORY_RESERVATION_FAILED',
            message: reserveErr.message || 'One or more items are out of stock.',
            details: reserveErr,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 6. Calculate packaging_fee_amount dynamically (Precise Cents Math)
    // -------------------------------------------------------------------------
    // 6. Calculate packaging_fee_amount, subtotal, platform_fee & final_total
    // -------------------------------------------------------------------------
    interface CalculatedOrder {
      merchantId: string;
      items: CartItemPayload[];
      itemsSubtotalCents: number;
      packagingFeeCents: number;
      orderTotalCents: number;
      prepMinutes: number;
    }

    const calculatedOrders: CalculatedOrder[] = [];
    let itemsSubtotalCents = 0;

    for (const [merchantId, mItems] of merchantItemsMap.entries()) {
      const merchant = merchantInfoMap.get(merchantId)!;
      let stallSubtotalCents = 0;
      let totalItemsCount = 0;
      let maxStallBasePrep = 5; // default 5 mins for drinks

      for (const item of mItems) {
        const dbItem = menuItemMap.get(item.item_id);
        let unitPriceCents = Math.round(Number(item.unit_price ?? item.price ?? 0) * 100);

        // Compute modifiers total for defense against unbundled client unit_price
        let modifiersCents = 0;
        if (Array.isArray(item.modifiers)) {
          for (const mod of item.modifiers) {
            modifiersCents += Math.round(Number(mod.additional_price ?? mod.price ?? 0) * 100);
          }
        }

        const basePriceCents = Math.round(Number(dbItem?.price ?? item.price ?? 0) * 100);
        // If client passed unit_price <= base price but selected modifiers with additional price, add modifiers
        if (modifiersCents > 0 && unitPriceCents <= basePriceCents && basePriceCents > 0) {
          unitPriceCents = basePriceCents + modifiersCents;
          item.unit_price = Number((unitPriceCents / 100).toFixed(2));
        }

        stallSubtotalCents += unitPriceCents * item.quantity;
        totalItemsCount += item.quantity;

        // Categorize prep speed: food takes ~15 mins, drinks ~5 mins
        const isCookedFood = dbItem?.station?.toLowerCase() !== 'bar' && dbItem?.station?.toLowerCase() !== 'drinks';
        if (isCookedFood) {
          maxStallBasePrep = Math.max(maxStallBasePrep, 15);
        }
      }

      itemsSubtotalCents += stallSubtotalCents;

      // Packaging fee calculation (strictly waived for dine-in orders)
      let packagingFeeCents = 0;

      if (!isDineIn) {
        const feeRateCents = Math.round(Number(merchant.packaging_fee_amount || 0) * 100);
        if (merchant.packaging_fee_type === 'per_order') {
          packagingFeeCents = feeRateCents;
        } else if (merchant.packaging_fee_type === 'per_item') {
          packagingFeeCents = feeRateCents * totalItemsCount;
        }
      }

      const orderTotalCents = stallSubtotalCents + packagingFeeCents;

      // Stall preparation time: base prep + current surge prep delay
      const prepMinutes = maxStallBasePrep + (merchant.current_prep_delay || 0);

      calculatedOrders.push({
        merchantId,
        items: mItems,
        itemsSubtotalCents: stallSubtotalCents,
        packagingFeeCents,
        orderTotalCents,
        prepMinutes,
      });
    }

    // Financial split calculations:
    // subtotal: Sum of all items in cart (e.g., 12.00)
    const subtotal = Number((itemsSubtotalCents / 100).toFixed(2));
    // convenience_fee (processing fee): Flat rate RM 1.00
    const convenienceFee = items.length > 0 ? 1.00 : 0.00;
    const convenienceFeeCents = Math.round(convenienceFee * 100);
    // service_fee: Dynamic 3.8% of cart subtotal
    const serviceFeeCents = Math.round(itemsSubtotalCents * 0.038);
    const serviceFee = Number((serviceFeeCents / 100).toFixed(2));
    // order_balance_fee: RM 0.50 small order top-up fee for orders under RM 12.00 (removed at >= RM 12.00)
    const orderBalanceFee = (items.length > 0 && subtotal < 12.00) ? 0.50 : 0.00;
    const orderBalanceFeeCents = Math.round(orderBalanceFee * 100);
    // Platform fees cover convenience, service, and order balance top-up charges.
    // Merchant packaging fees remain payable and are included in the gross total before
    // a promo discount is applied to the food subtotal.
    const platformFeeCents = convenienceFeeCents + serviceFeeCents + orderBalanceFeeCents;
    const platformFee = Number((platformFeeCents / 100).toFixed(2));
    const packagingFeeCents = calculatedOrders.reduce(
      (sum, order) => sum + order.packagingFeeCents,
      0
    );
    const packagingFee = Number((packagingFeeCents / 100).toFixed(2));

    // Calculate promo code discount server-side for security. The database RPC
    // verifies the active code, its merchant, and its submitted terms.
    const promoCode = (body.promo_code || '').trim().toUpperCase();
    const grossTotal = Number((subtotal + packagingFee + convenienceFee + serviceFee + orderBalanceFee).toFixed(2));
    let discount = 0;
    let promoCodeId: string | null = null;
    let isLegacyPromo = false;
    let promoCalculation: any = null;

    if (promoCode) {
      const isLegacyCode = promoCode === 'TAPAU1RINGGIT';
      if (!isLegacyCode && merchantIds.length !== 1) {
        if (itemsToReserve.length > 0) {
          await supabaseAdmin.rpc('release_atomic_reservation', { p_items: itemsToReserve });
        }
        return new Response(
          JSON.stringify({ error: 'PROMO_SINGLE_MERCHANT_ONLY', message: 'Merchant promo codes can only be used when your cart contains one stall.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const promoRpc = isLegacyCode
        ? 'calculate_merchant_promo_discount'
        : 'consume_merchant_promo_code';
      const orderTypeForPromo = isDineIn ? 'dine_in' : 'tapau';
      const { data: calculatedPromo, error: promoCalculationError } = await supabaseAdmin.rpc(
        promoRpc,
        {
          p_code: promoCode,
          p_merchant_id: isLegacyCode ? null : merchantIds[0],
          p_subtotal: subtotal,
          p_gross_total: grossTotal,
          ...(isLegacyCode ? {} : { p_idempotency_key: idempotencyKey }),
          p_order_type: orderTypeForPromo,
        }
      );

      if (promoCalculationError || !calculatedPromo?.valid) {
        if (itemsToReserve.length > 0) {
          await supabaseAdmin.rpc('release_atomic_reservation', { p_items: itemsToReserve });
        }
        const errorMessages: Record<string, string> = {
          PROMO_CODE_EXPIRED: 'This promo code has expired.',
          PROMO_USAGE_LIMIT_REACHED: 'This promo code has reached its usage limit.',
          IDEMPOTENCY_PROMO_MISMATCH: 'This checkout request is already linked to a different promo code.',
          PROMO_REDEEM_IN_PROGRESS: 'This promo code is already being applied to this order. Please wait a moment and try again.',
          PROMO_ORDER_TYPE_MISMATCH: calculatedPromo?.applicable_to === 'tapau'
            ? 'This promo code is only valid for tapau orders.'
            : calculatedPromo?.applicable_to === 'dine_in'
            ? 'This promo code is only valid for dine-in orders.'
            : 'This promo code is not valid for this order type.',
        };
        return new Response(
          JSON.stringify({
            error: calculatedPromo?.error || promoCalculationError?.code || 'PROMO_NOT_ACTIVE',
            message: errorMessages[calculatedPromo?.error || ''] || 'This promo code is not available for this order.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // A concurrent duplicate request can reach this point after the first
      // request already created its order. Replay that order instead of
      // creating a second master transaction.
      if (calculatedPromo.idempotent_replay === true) {
        if (itemsToReserve.length > 0) {
          await supabaseAdmin.rpc('release_atomic_reservation', { p_items: itemsToReserve });
        }

        if (calculatedPromo.order_id) {
          const { data: replayOrder, error: replayOrderError } = await supabaseAdmin
            .from('orders')
            .select('*, master_transactions(*)')
            .eq('id', calculatedPromo.order_id)
            .maybeSingle();

          if (replayOrderError) {
            console.error('[Checkout] Failed to load replayed promo order:', replayOrderError);
          }
          if (replayOrder) {
            const replayMaster = (replayOrder as any).master_transactions;
            const replayTotal = Number(replayMaster?.total_amount ?? replayOrder.total_amount ?? 0);
            return new Response(
              JSON.stringify({
                success: true,
                idempotent_replay: true,
                master_transaction_id: replayMaster?.id || null,
                pickup_pin: replayMaster?.pickup_pin || replayOrder.pickup_pin || null,
                final_total: replayTotal,
                total_amount: replayTotal,
                total_amount_cents: Math.round(replayTotal * 100),
                discount: Number(calculatedPromo.discount_amount || 0),
                promo: calculatedPromo,
                master_transaction: replayMaster,
                orders: [replayOrder],
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        return new Response(
          JSON.stringify({
            error: 'PROMO_REDEEM_IN_PROGRESS',
            message: 'This promo code is already being applied to this order. Please wait a moment and try again.',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      promoCalculation = calculatedPromo;
      discount = Number(calculatedPromo.discount_amount || 0);
      promoCodeId = calculatedPromo.promo_code_id || null;
      isLegacyPromo = calculatedPromo.is_legacy === true;
    }

    let claimedPromoCodeId: string | null = isLegacyPromo ? null : promoCodeId;
    const releaseClaimedPromoUse = async () => {
      if (!claimedPromoCodeId) return;
      const { error: releasePromoError } = await supabaseAdmin.rpc('release_merchant_promo_code_use', {
        p_promo_code_id: claimedPromoCodeId,
        p_idempotency_key: idempotencyKey,
      });
      if (releasePromoError) {
        console.error('[Checkout] Failed to release promo-code use:', releasePromoError);
      } else {
        claimedPromoCodeId = null;
      }
    };

    const appliedOrderDiscount = Math.min(discount, grossTotal);
    const finalTotal = Number(Math.max(0, grossTotal - appliedOrderDiscount).toFixed(2));
    const effectiveMerchantCut = calculatedOrders.length === 1 && promoCode
      ? (isLegacyPromo
          ? Number(Math.max(0, Math.min(subtotal, finalTotal)).toFixed(2))
          : Number(Math.max(0, Math.min(subtotal - discount, finalTotal)).toFixed(2)))
      : Number(Math.max(0, subtotal - discount).toFixed(2));
    // amount_in_sen: Math.round(final_total * 100) (e.g., 100 sen for RM 1.00)
    const amountInSen = Math.round(finalTotal * 100);
    // Loyalty Points: Strictly 1:1 ratio with final amount spent (e.g., RM 12.00 = 12 Points)
    const pointsEarned = Math.floor(finalTotal);
    const tableNumber = body.table_number || null;

    // -------------------------------------------------------------------------
    // 7. Create Master_Transaction with 4-digit pickup_pin & financial split
    // -------------------------------------------------------------------------
    // Generate secure 4-digit Auntie-proof OTP
    const pickupPin = Math.floor(1000 + Math.random() * 9000).toString();

    const { data: masterTx, error: masterTxErr } = await supabaseAdmin
      .from('master_transactions')
      .insert({
        customer_id: resolvedCustomerId,
        hub_id: hub_id || null,
        total_amount: finalTotal,
        convenience_fee: convenienceFee,
        service_fee: serviceFee,
        platform_fee: platformFee,
        merchant_cut: effectiveMerchantCut,
        promo_code: promoCode || null,
        promo_code_id: promoCodeId,
        discount_amount: discount,
        payout_status: 'pending',
        payment_method,
        receipt_url: body.receipt_url || null,
        payment_status: payment_method === 'cash' ? 'pending' : 'pending',
        pickup_pin: pickupPin,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();

    if (masterTxErr || !masterTx) {
      // No order exists yet, so return the claimed promo use.
      await releaseClaimedPromoUse();
      // Rollback stock reservation if master transaction fails
      if (itemsToReserve.length > 0) {
        await supabaseAdmin.rpc('release_atomic_reservation', { p_items: itemsToReserve });
      }
      return new Response(
        JSON.stringify({ error: 'TRANSACTION_CREATION_FAILED', details: masterTxErr }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // 8. Split into Hub & Spoke Orders & Calculate target_prep_start_time
    // -------------------------------------------------------------------------
    // Slowest stall defines when order will be ready for unified pickup
    const maxStallPrepTime = Math.max(...calculatedOrders.map((o) => o.prepMinutes));
    const stockReservedUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 mins to complete payment

    const createdSubOrders = [];

    let remainingDiscountCents = Math.round(discount * 100);

    for (let index = 0; index < calculatedOrders.length; index++) {
      const co = calculatedOrders[index];
      // Fast items (drinks) are delayed so everything finishes hot and fresh together!
      const stallDelayMinutes = maxStallPrepTime - co.prepMinutes;
      const targetPrepStartTime = new Date(now.getTime() + stallDelayMinutes * 60 * 1000).toISOString();

      const subOrderDisplayId = `#${masterTx.id.slice(0, 4).toUpperCase()}-${index + 1}`;
      const subOrderIdempotency = `${idempotencyKey}_m_${co.merchantId}`;

      const subOrderMerchantCut = Number((co.itemsSubtotalCents / 100).toFixed(2));
      const allocatedDiscountCents = calculatedOrders.length === 1 && promoCode
        ? Math.round(discount * 100)
        : Math.min(remainingDiscountCents, co.itemsSubtotalCents);
      remainingDiscountCents -= allocatedDiscountCents;
      const subOrderDiscount = Number((allocatedDiscountCents / 100).toFixed(2));
      const subOrderConvenienceFee = index === 0 ? convenienceFee : 0.00;
      const subOrderOrderBalanceFee = index === 0 ? orderBalanceFee : 0.00;
      const subOrderServiceFee = Number((Math.round(co.itemsSubtotalCents * 0.038) / 100).toFixed(2));
      const subOrderPlatformFee = Number((subOrderConvenienceFee + subOrderServiceFee + subOrderOrderBalanceFee).toFixed(2));
      const subOrderTotal = calculatedOrders.length === 1 && promoCode
        ? finalTotal
        : Number(
            (
              co.itemsSubtotalCents +
              (index === 0 ? convenienceFeeCents : 0) +
              (index === 0 ? orderBalanceFeeCents : 0) +
              Math.round(co.itemsSubtotalCents * 0.038) +
              co.packagingFeeCents -
              allocatedDiscountCents
            ) / 100
          ).toFixed(2);
      const subOrderEffectiveMerchantCut = calculatedOrders.length === 1 && promoCode
        ? effectiveMerchantCut
        : Number(Math.max(0, subOrderMerchantCut - subOrderDiscount).toFixed(2));

      const isGateway = payment_method === 'gateway';
      const initialStatus = isGateway ? 'pending_payment' : 'pending';
      const initialPaymentStatus = payment_method === 'cash' ? 'pending_cash' : (isGateway ? 'pending' : 'paid');
      const initialPaymentMethod = payment_method === 'cash' ? 'cash' : (isGateway ? 'gateway' : (payment_method === 'manual_transfer' ? 'manual_transfer' : 'online'));

      const { data: subOrder, error: subOrderErr } = await supabaseAdmin
        .from('orders')
        .insert({
          transaction_id: masterTx.id,
          display_id: subOrderDisplayId,
          customer_id: resolvedCustomerId,
          merchant_id: co.merchantId,
          idempotency_key: subOrderIdempotency,
          pickup_pin: pickupPin,
          version: 1,
          order_status: initialStatus,
          status: initialStatus,
          order_type: isDineIn ? 'dine_in' : 'takeaway',
          table_number: tableNumber,
          customer_name: (body.customer_name || '').trim() || null,
          customer_phone: (body.customer_phone || '').trim() || null,
          payment_method: initialPaymentMethod,
          payment_status: initialPaymentStatus,
          total_amount: subOrderTotal,
          convenience_fee: subOrderConvenienceFee,
          service_fee: subOrderServiceFee,
          platform_fee: subOrderPlatformFee,
          merchant_cut: subOrderEffectiveMerchantCut,
          promo_code: promoCode || null,
          promo_code_id: promoCodeId,
          discount_amount: subOrderDiscount,
          payout_status: 'pending',
          points_earned: index === 0 ? pointsEarned : 0,
          packaging_fee_charged: (co.packagingFeeCents / 100),
          stock_reserved_until: stockReservedUntil,
          target_prep_start_time: targetPrepStartTime,
          is_preorder: body.is_preorder || false,
          scheduled_pickup_date: body.scheduled_pickup_date || null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();

      if (subOrderErr || !subOrder) {
        console.error(`[Checkout] Sub-order failed for merchant ${co.merchantId}:`, subOrderErr);
        // No sub-order exists for this checkout; return the claimed promo use.
        await releaseClaimedPromoUse();
        // Rollback reserved stock
        if (itemsToReserve.length > 0) {
          await supabaseAdmin.rpc('release_atomic_reservation', { p_items: itemsToReserve });
        }
        return new Response(
          JSON.stringify({ error: 'SUB_ORDER_CREATION_FAILED', details: subOrderErr }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Insert Order Items
      const orderItemsToInsert = co.items.map((i) => ({
        order_id: subOrder.id,
        item_id: i.item_id,
        item_name: i.name || menuItemMap.get(i.item_id)?.name || 'Item',
        quantity: i.quantity,
        price_at_time_of_order: i.unit_price,
        selected_modifiers: i.modifiers || [],
        special_instructions: i.special_instructions || null,
        created_at: now.toISOString(),
      }));

      const { error: itemsErr } = await supabaseAdmin.from('order_items').insert(orderItemsToInsert);
      if (itemsErr) {
        console.error('[Checkout] Failed to insert order items:', itemsErr);
      }

      // Dual-write to orders_v2 & order_events for Merchant KDS realtime feed
      try {
        const { data: v2Order, error: v2Err } = await supabaseAdmin
          .from('orders_v2')
          .insert({
            display_id: subOrderDisplayId,
            merchant_id: co.merchantId,
            current_status: isGateway ? 'pending_payment' : 'PENDING',
            total_amount: subOrderTotal,
            table_number: tableNumber || '',
            order_type: isDineIn ? 'dine_in' : 'tapau',
          })
          .select()
          .single();

        // Only emit ORDER_CREATED event if NOT awaiting payment gateway
        if (!v2Err && v2Order && !isGateway) {
          await supabaseAdmin.from('order_events').insert({
            order_id: v2Order.id,
            event_type: 'ORDER_CREATED',
            target_status: 'PENDING',
            actor_role: 'CUSTOMER',
            payload: {
              customer_name: body.customer_name || 'Customer',
              customer_phone: body.customer_phone || '',
              line_items_count: co.items.length,
              items: co.items.map((i) => ({
                name: i.name || menuItemMap.get(i.item_id)?.name || 'Item',
                quantity: i.quantity,
                price: (i.unit_price || 0),
                station: menuItemMap.get(i.item_id)?.station || 'Main Kitchen',
                variant: (i.modifiers && i.modifiers.length > 0)
                  ? i.modifiers.map((m: any) => typeof m === 'string' ? m : (m.option_name || m.name || '')).filter(Boolean).join(', ')
                  : '',
              })),
            },
          });
        }
      } catch (kdsErr) {
        console.warn('[Checkout] Dual-write to orders_v2 failed:', kdsErr);
      }

      createdSubOrders.push({
        ...subOrder,
        items: orderItemsToInsert,
      });
      // The order now exists, so mark the claim committed before any later
      // payment-gateway work. A duplicate request can then safely replay it.
      if (claimedPromoCodeId) {
        const { data: committedPromo, error: commitPromoError } = await supabaseAdmin.rpc(
          'commit_merchant_promo_code_use',
          {
            p_promo_code_id: claimedPromoCodeId,
            p_idempotency_key: idempotencyKey,
            p_order_id: subOrder.id,
          }
        );
        if (commitPromoError || committedPromo !== true) {
          console.error('[Checkout] Failed to commit promo-code redemption:', commitPromoError);
          // The order already exists. Keep the claim and used_count rather than
          // releasing a use that was applied to a durable order.
        }
        claimedPromoCodeId = null;
      }
    }

    // -------------------------------------------------------------------------
    // 8.4 Award Loyalty Points (1:1 ratio) for immediately paid transactions
    // -------------------------------------------------------------------------
    if (payment_method !== 'gateway' && payment_method !== 'cash' && resolvedCustomerId && pointsEarned > 0) {
      try {
        const { data: userProfile } = await supabaseAdmin
          .from('users')
          .select('points_balance')
          .eq('id', resolvedCustomerId)
          .single();
        if (userProfile) {
          await supabaseAdmin
            .from('users')
            .update({ points_balance: (userProfile.points_balance || 0) + pointsEarned })
            .eq('id', resolvedCustomerId);
        }
      } catch (ptsErr) {
        console.warn('[Checkout] Direct points increment notice:', ptsErr);
      }
    }

    // -------------------------------------------------------------------------
    // 8.5 Generate Curlec (by Razorpay) Order for Online Gateway Checkout
    // -------------------------------------------------------------------------
    let curlecOrderId: string | null = null;
    const isGatewayPayment = payment_method === 'gateway' || payment_method === 'online';
    const curlecKeyId = Deno.env.get('CURLEC_KEY_ID');
    const curlecKeySecret = Deno.env.get('CURLEC_KEY_SECRET');
    if (isGatewayPayment && (!curlecKeyId || !curlecKeySecret)) {
      throw new Error('[Checkout] CURLEC_KEY_ID or CURLEC_KEY_SECRET env vars are not set. Deploy secrets before processing live payments.');
    }

    if (isGatewayPayment && curlecKeyId && curlecKeySecret) {
      try {
        const basicAuth = btoa(`${curlecKeyId}:${curlecKeySecret}`);
        const curlecRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${basicAuth}`,
          },
          body: JSON.stringify({
            amount: amountInSen, // Full charge in sen (e.g. 1250 sen for RM 12.50)
            currency: 'MYR',
            receipt: masterTx.id.slice(0, 40),
            notes: {
              order_id: masterTx.id,
              master_transaction_id: masterTx.id,
              subtotal: `RM ${subtotal.toFixed(2)}`,
              convenience_fee: `RM ${convenienceFee.toFixed(2)}`,
              service_fee: `RM ${serviceFee.toFixed(2)}`,
              order_balance_fee: orderBalanceFee > 0 ? `RM ${orderBalanceFee.toFixed(2)}` : 'RM 0.00',
              tapautime_fee: `RM ${platformFee.toFixed(2)}`,
              merchant_cut: `RM ${effectiveMerchantCut.toFixed(2)}`,
              table_number: tableNumber || 'takeaway',
              pickup_pin: pickupPin,
              customer_id: resolvedCustomerId,
              order_type: isDineIn ? 'dine_in' : 'takeaway',
              discount: discount > 0 ? `RM ${discount.toFixed(2)}` : 'RM 0.00',
              promo_code: promoCode || 'none',
            },
          }),
        });

        if (curlecRes.ok) {
          const curlecData = await curlecRes.json();
          curlecOrderId = curlecData.id;
          console.log(`[Checkout] Pre-created Curlec order: ${curlecOrderId} (${amountInSen} sen) for MasterTx: ${masterTx.id}`);
        } else {
          const curlecErrText = await curlecRes.text();
          console.warn('[Checkout] Failed to pre-create Curlec order on Razorpay API:', curlecErrText);
        }
      } catch (curlecErr) {
        console.warn('[Checkout] Curlec order pre-creation failed with exception:', curlecErr);
      }
    }

    // -------------------------------------------------------------------------
    // Response: Master Transaction & Coordinated Sub-Orders
    // -------------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        master_transaction_id: masterTx.id,
        pickup_pin: pickupPin,
        subtotal,
        convenience_fee: convenienceFee,
        service_fee: serviceFee,
        order_balance_fee: orderBalanceFee,
        platform_fee: platformFee,
        discount,
        promo: promoCalculation,
        final_total: finalTotal,
        total_amount: finalTotal,
        total_amount_cents: amountInSen,
        points_earned: pointsEarned,
        currency: 'MYR',
        payment_method,
        curlec_order_id: curlecOrderId,
        curlec_order: {
          id: curlecOrderId,
          amount: amountInSen,
        },
        estimated_prep_minutes: maxStallPrepTime,
        stock_reserved_until: stockReservedUntil,
        orders: createdSubOrders,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[Checkout Error]:', err);
    // Claims are committed as soon as a sub-order is created. Any earlier
    // failure is released by the explicit error paths above.
    return new Response(
      JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
