// @ts-nocheck
// =============================================================================
// SUPABASE EDGE FUNCTION: PAYMENT WEBHOOK HANDLER
// Handles webhooks from payment gateways (DuitNow, Touch 'n Go, Stripe)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-razorpay-signature',
};

/**
 * Computes and verifies HMAC-SHA256 signature using Web Crypto API
 */
async function verifyCurlecSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(rawBody)
    );
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return expectedHex.toLowerCase() === signature.trim().toLowerCase();
  } catch (err) {
    console.error('[Payment Webhook] HMAC-SHA256 verification error:', err);
    return false;
  }
}

interface WebhookPayload {
  order_id: string; // Order UUID or display_id
  gateway: 'duitnow' | 'tng' | 'stripe' | 'fpx' | 'curlec';
  event_type: 'payment.success' | 'payment.failed' | 'payment.refunded';
  transaction_id: string;
  amount: number;
  signature?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawBody = await req.text();
    const curlecSignature = req.headers.get('x-razorpay-signature');
    const curlecSecret = Deno.env.get('CURLEC_KEY_SECRET');
    if (!curlecSecret) {
      throw new Error('[payment-webhook] CURLEC_KEY_SECRET env var is not set. Cannot verify webhook signature.');
    }

    // -------------------------------------------------------------------------
    // 1. Curlec (by Razorpay) Official Webhook Pipeline
    // -------------------------------------------------------------------------
    if (curlecSignature) {
      const isValid = await verifyCurlecSignature(rawBody, curlecSignature, curlecSecret);
      if (!isValid) {
        console.error('[Payment Webhook] Curlec signature mismatch rejected');
        return new Response(
          JSON.stringify({ error: 'INVALID_SIGNATURE', message: 'HMAC-SHA256 signature mismatch' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const eventData = JSON.parse(rawBody);
      const eventName = eventData.event;
      console.log(`[Payment Webhook] Curlec Verified Event: ${eventName}`);

      if (eventName === 'payment.captured' || eventName === 'order.paid' || eventName === 'payment.authorized') {
        const paymentEntity = eventData.payload?.payment?.entity;
        const notes = paymentEntity?.notes || {};
        const masterTxId = notes.master_transaction_id || paymentEntity?.receipt;
        const orderDisplayId = notes.display_id;
        const transactionId = paymentEntity?.id || eventData.payload?.order?.entity?.id;
        const amountPaid = (paymentEntity?.amount || 0) / 100;

        console.log(`[Payment Webhook] Captured RM ${amountPaid} for MasterTx: ${masterTxId}`);

        // Authoritative execution via SECURITY DEFINER RPC
        if (masterTxId) {
          try {
            await supabaseClient.rpc('confirm_dine_in_payment', {
              p_transaction_id: masterTxId,
              p_curlec_payment_id: transactionId,
              p_curlec_order_id: eventData.payload?.order?.entity?.id || null,
              p_pickup_pin: notes.pickup_pin || null,
            });
          } catch (rpcErr) {
            console.warn('[Payment Webhook] confirm_dine_in_payment RPC warning:', rpcErr);
          }
        }

        // Update master_transactions if masterTxId exists
        if (masterTxId) {
          await supabaseClient
            .from('master_transactions')
            .update({
              payment_status: 'captured',
              updated_at: new Date().toISOString(),
            })
            .eq('id', masterTxId);
        }

        // Update corresponding orders
        let orderQuery = supabaseClient
          .from('orders')
          .update({
            payment_status: 'captured',
            status: 'accepted',
            order_status: 'accepted',
            curlec_payment_id: transactionId,
            updated_at: new Date().toISOString(),
          });

        if (masterTxId) {
          orderQuery = orderQuery.eq('transaction_id', masterTxId);
        } else if (orderDisplayId) {
          orderQuery = orderQuery.or(`display_id.eq.${orderDisplayId},display_id.eq.#${orderDisplayId.replace('#', '')}`);
        } else {
          orderQuery = orderQuery.eq('payment_status', 'pending');
        }

        const { data: updatedOrders, error: orderUpdateErr } = await orderQuery.select('id, display_id, merchant_id, total_amount');

        if (orderUpdateErr) {
          console.error('[Payment Webhook] Error capturing orders from Curlec:', orderUpdateErr);
        } else if (updatedOrders && updatedOrders.length > 0) {
          const displayIds = updatedOrders.map((o: any) => o.display_id).filter(Boolean);
          if (displayIds.length > 0) {
            try {
              await supabaseClient
                .from('orders_v2')
                .update({
                  current_status: 'ACCEPTED',
                  updated_at: new Date().toISOString(),
                })
                .in('display_id', displayIds);
            } catch (v2Err) {
              console.warn('[Payment Webhook] orders_v2 update warning:', v2Err);
            }
          }

          for (const ord of updatedOrders) {
            await supabaseClient.from('order_events').insert({
              order_id: ord.id,
              event_type: 'PAYMENT_CAPTURED',
              target_status: 'accepted',
              actor_role: 'CURLEC_WEBHOOK',
              payload: {
                gateway: 'curlec',
                curlec_payment_id: transactionId,
                amount: amountPaid,
                verified_at: new Date().toISOString(),
              },
            });
          }
        }

        return new Response(
          JSON.stringify({ success: true, event: eventName, transaction_id: transactionId }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (eventName === 'payment.failed') {
        const paymentEntity = eventData.payload?.payment?.entity;
        const notes = paymentEntity?.notes || {};
        const masterTxId = notes.master_transaction_id || paymentEntity?.receipt;
        const failureReason = paymentEntity?.error_description || paymentEntity?.error_reason || 'Curlec payment failed';

        console.log(`[Payment Webhook] Curlec Payment Failed for MasterTx: ${masterTxId}, reason: ${failureReason}`);

        if (masterTxId) {
          const { error: failErr } = await supabaseClient.rpc('mark_payment_failed', {
            p_transaction_id: masterTxId,
            p_reason: failureReason,
          });
          if (failErr) {
            console.error('[Payment Webhook] Failed to mark order failed via RPC:', failErr);
          }
        }

        return new Response(
          JSON.stringify({ success: true, event: eventName, transaction_id: masterTxId, status: 'failed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Acknowledge other Curlec events
      return new Response(
        JSON.stringify({ success: true, acknowledged_event: eventName }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // 2. Generic / Internal Webhook Pipeline (DuitNow, Manual, Stripe)
    // -------------------------------------------------------------------------
    const payload: WebhookPayload = JSON.parse(rawBody);
    const { order_id, gateway, event_type, transaction_id, amount } = payload;

    if (!order_id || !event_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required webhook fields: order_id, event_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Payment Webhook] Received ${event_type} for order ${order_id} via ${gateway}`);

    // Map webhook event to internal statuses
    let paymentStatus: 'pending' | 'captured' | 'refunded' | 'failed' = 'pending';
    let orderStatus: string | null = null;

    if (event_type === 'payment.success') {
      paymentStatus = 'captured';
      orderStatus = 'accepted'; // Transition to accepted so merchant KDS receives it immediately
    } else if (event_type === 'payment.refunded') {
      paymentStatus = 'refunded';
      orderStatus = 'cancelled';
    } else if (event_type === 'payment.failed') {
      paymentStatus = 'failed';
      orderStatus = 'cancelled';
    }

    // 1. Update orders table
    const updatePayload: Record<string, any> = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };
    if (orderStatus) {
      updatePayload.status = orderStatus;
      updatePayload.order_status = orderStatus;
    }

    const { data: updatedOrder, error: updateError } = await supabaseClient
      .from('orders')
      .update(updatePayload)
      .or(`id.eq.${order_id},display_id.eq.${order_id},display_id.eq.#${order_id.replace('#', '')}`)
      .select('id, display_id, merchant_id, customer_id, total_amount')
      .single();

    if (updateError) {
      console.error('[Payment Webhook] Failed to update order:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update order status', details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Emit audit event to order_events table
    await supabaseClient.from('order_events').insert({
      order_id: updatedOrder.id,
      event_type: event_type.toUpperCase().replace('.', '_'),
      target_status: orderStatus || paymentStatus,
      actor_role: 'SYSTEM',
      payload: {
        gateway,
        transaction_id,
        amount,
        processed_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: updatedOrder.id,
        payment_status: paymentStatus,
        order_status: orderStatus,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[Payment Webhook Error]:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error processing webhook', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
