// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return new Response(JSON.stringify({ error: 'Missing order_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the order to verify ownership and get payment details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, merchant_id, total_amount, payment_status, status, curlec_payment_id, display_id')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch merchant details
    const { data: merchant } = await supabaseAdmin
      .from('merchants')
      .select('owner_id')
      .eq('id', order.merchant_id)
      .maybeSingle();

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceRole = Boolean(serviceRoleKey && token === serviceRoleKey);

    let isAdmin = isServiceRole;
    let isOwner = false;

    if (!isServiceRole) {
      // Verify user calling the function
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      isAdmin = userProfile?.role === 'admin';
      isOwner = Boolean(merchant && merchant.owner_id === user.id);
    }

    if (!isAdmin && !isOwner) {
      return new Response(JSON.stringify({ error: 'Forbidden. Not your order.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency: If payment is already refunded, do not attempt to re-refund
    if (order.payment_status === 'refunded') {
      return new Response(JSON.stringify({ success: true, message: 'Order payment is already refunded.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let nextPaymentStatus = order.payment_status;

    // Check if we need to issue a refund via Curlec/Razorpay
    if (order.curlec_payment_id && (order.payment_status === 'captured' || order.payment_status === 'paid')) {
      const curlecKeyId = Deno.env.get('CURLEC_KEY_ID');
      const curlecKeySecret = Deno.env.get('CURLEC_KEY_SECRET');

      if (!curlecKeyId || !curlecKeySecret) {
        console.error('[Refund Order] Curlec credentials missing');
        return new Response(JSON.stringify({ error: 'Gateway configuration error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const basicAuth = btoa(`${curlecKeyId}:${curlecKeySecret}`);
      const refundAmountSen = Math.round(Number(order.total_amount) * 100);

      try {
        const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${order.curlec_payment_id}/refund`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: refundAmountSen }),
        });

        if (!refundRes.ok) {
          const errorData = await refundRes.json();
          console.error('[Refund Order] Curlec refund API error:', errorData);

          const errorDescription = errorData?.error?.description || '';
          if (
            errorDescription.toLowerCase().includes('already') ||
            errorDescription.toLowerCase().includes('fully refunded')
          ) {
            console.log('[Refund Order] Payment was already refunded at gateway level.');
            nextPaymentStatus = 'refunded';
          } else {
            return new Response(JSON.stringify({ error: 'Failed to process refund with payment gateway', details: errorData }), {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // Successfully refunded via API
          nextPaymentStatus = 'refunded';
        }
      } catch (err) {
        console.error('[Refund Order] Exception calling Curlec API:', err);
        return new Response(JSON.stringify({ error: 'Payment gateway communication failed' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (nextPaymentStatus === 'pending_cash' || nextPaymentStatus === 'pending') {
      nextPaymentStatus = 'failed';
    }

    // Update order status to cancelled (and payment_status to refunded/failed if applicable)
    const updatePayload: any = {
      status: 'cancelled',
      order_status: 'cancelled',
      payment_status: nextPaymentStatus,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updatePayload)
      .eq('id', order_id);

    if (updateError) {
      console.error('[Refund Order] Failed to update order status:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update order status', details: updateError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dual-update orders_v2 table by display_id to keep current_status synchronized
    if (order.display_id) {
      const { error: v2Error } = await supabaseAdmin
        .from('orders_v2')
        .update({
          current_status: 'CANCELLED',
          updated_at: new Date().toISOString(),
        })
        .eq('display_id', order.display_id);

      if (v2Error) {
        console.warn(`[Refund Order] Failed to sync orders_v2 status for ${order.display_id}:`, v2Error);
      }
    }

    // Log the audit event
    await supabaseAdmin.from('order_events').insert({
      order_id: order_id,
      event_type: nextPaymentStatus === 'refunded' ? 'PAYMENT_REFUNDED' : 'ORDER_CANCELLED',
      target_status: 'cancelled',
      actor_role: isAdmin ? 'ADMIN' : 'MERCHANT',
      payload: {
        reason: isAdmin ? 'Cancelled by admin via Admin Portal' : 'Cancelled by merchant via KDS',
        refunded_amount: nextPaymentStatus === 'refunded' ? order.total_amount : 0,
        curlec_payment_id: order.curlec_payment_id,
        processed_at: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ success: true, payment_status: nextPaymentStatus, order_status: 'cancelled' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Refund Order] Internal error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
