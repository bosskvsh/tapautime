import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, SUPABASE_ANON_KEY, CHECKOUT_EDGE_FUNCTION_URL } from '../lib/supabase';
import { useDineInCartStore } from '../stores/useDineInCartStore';
import {
  PaymentMethodType,
  getRazorpayConfig,
  loadRazorpayScript,
  generateGuestIdempotencyKey,
} from '../lib/payments';
import { saveActiveDineInOrder, getActiveDineInOrder } from '../lib/activeOrder';

export function CheckoutScreen() {
  const { merchantSlug, tableNumber } = useParams<{ merchantSlug: string; tableNumber: string }>();
  const navigate = useNavigate();

  const {
    merchantId,
    items,
    getSubtotal,
    getConvenienceFee,
    getServiceFee,
    getOrderBalanceFee,
    clearCart,
  } = useDineInCartStore();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('ewallet');
  const activeOrder = getActiveDineInOrder(merchantSlug, tableNumber);
  const [isOrderReviewOpen, setIsOrderReviewOpen] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Promo Code State
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState('');

  const subtotal = getSubtotal();
  const convenienceFee = getConvenienceFee();
  const serviceFee = getServiceFee();
  const orderBalanceFee = getOrderBalanceFee();
  const grossTotal = Number((subtotal + convenienceFee + serviceFee + orderBalanceFee).toFixed(2));
  const discount =
    appliedPromo === 'tapau1ringgit' && grossTotal > 1.0
      ? Number((grossTotal - 1.0).toFixed(2))
      : 0;
  const finalTotal = Number(Math.max(0, grossTotal - discount).toFixed(2));

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F9FAF9] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-3">
          <span className="material-symbols-outlined text-3xl text-stone-400">shopping_bag</span>
        </div>
        <h2 className="text-lg font-black text-stone-900 mb-1">Your bag is empty</h2>
        <p className="text-xs text-stone-500 mb-4">Add some delicious dishes from the menu to continue.</p>
        <button
          type="button"
          onClick={() => navigate(`/${merchantSlug}/${tableNumber}`)}
          className="px-5 py-2.5 bg-brand-orange text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/20 cursor-pointer"
        >
          Return to Menu
        </button>
      </div>
    );
  }

  const handleApplyPromo = () => {
    const cleanCode = promoInput.trim().toLowerCase();
    if (!cleanCode) return;

    if (cleanCode === 'tapau1ringgit') {
      setAppliedPromo('tapau1ringgit');
      setPromoError('');
    } else {
      setPromoError('Invalid promo code. Please check and try again.');
    }
  };

  const handlePlaceOrder = async () => {
    if (isSubmittingRef.current || isSubmitting) return;

    if (!merchantId || !tableNumber) {
      setErrorMessage('Missing stall or table information.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Ensure Curlec / Razorpay script is loaded
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        throw new Error('Could not load payment gateway. Please check your internet connection and try again.');
      }

      // 2. Prepare payload for checkout Edge Function
      const idempotencyKey = generateGuestIdempotencyKey(tableNumber);
      const guestUserId = '00000000-0000-0000-0000-000000000001';

      const cartItemsPayload = items.map((i) => {
        const fullUnitPrice =
          typeof i.unitPriceWithModifiers === 'number' && i.unitPriceWithModifiers > 0
            ? i.unitPriceWithModifiers
            : Number((i.price + (i.selectedModifiers || []).reduce((sum, m) => sum + (Number(m.additional_price) || 0), 0)).toFixed(2));

        return {
          item_id: i.id,
          name: i.name,
          quantity: i.quantity,
          unit_price: fullUnitPrice,
          price: fullUnitPrice,
          modifiers: (i.selectedModifiers || []).map((m) => ({
            modifier_id: m.id,
            id: m.id,
            name: m.option_name,
            option_name: m.option_name,
            price: m.additional_price,
            additional_price: m.additional_price,
          })),
          special_instructions: i.specialInstructions || '',
        };
      });

      const response = await fetch(CHECKOUT_EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey,
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          customer_id: guestUserId,
          user_id: guestUserId,
          customer_email: `table${tableNumber}@tapautime.my`,
          customer_name: `Table ${tableNumber} Guest`,
          customer_phone: '',
          hub_id: null,
          payment_method: 'gateway',
          order_type: 'dine_in',
          table_number: String(tableNumber),
          payment_status: 'pending',
          items: cartItemsPayload,
          promo_code: appliedPromo ?? '',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || 'Failed to initialize order.');
      }

      const masterTxId: string = result.master_transaction_id;
      const curlecOrderId: string | null = result.curlec_order_id;
      const pickupPin: string = result.pickup_pin || '----';

      // 3. Mount Curlec / Razorpay Modal
      const curlecKeyId = import.meta.env.VITE_CURLEC_KEY_ID || 'rzp_live_TadLkYgtAFQIm3';
      const gatewayConfig = getRazorpayConfig(paymentMethod);
      const paymentAmountInSen =
        result.curlec_order?.amount ||
        result.total_amount_cents ||
        Math.round(finalTotal * 100);

      const razorpayOptions: any = {
        key: curlecKeyId,
        amount: paymentAmountInSen,
        currency: 'MYR',
        name: 'TapauTime Kopitiam',
        description: `Dine-In Order - Table ${tableNumber}`,
        order_id: curlecOrderId || undefined,
        prefill: {
          name: `Table ${tableNumber}`,
          email: `table${tableNumber}@tapautime.my`,
        },
        notes: {
          order_id: masterTxId,
          master_transaction_id: masterTxId,
          table_number: String(tableNumber),
          order_type: 'dine_in',
          subtotal: `RM ${subtotal.toFixed(2)}`,
          convenience_fee: `RM ${convenienceFee.toFixed(2)}`,
          service_fee: `RM ${serviceFee.toFixed(2)}`,
          order_balance_fee: orderBalanceFee > 0 ? `RM ${orderBalanceFee.toFixed(2)}` : 'RM 0.00',
          tapautime_fee: `RM ${(convenienceFee + serviceFee + orderBalanceFee).toFixed(2)}`,
          discount: discount > 0 ? `RM ${discount.toFixed(2)}` : 'RM 0.00',
          promo_code: appliedPromo || 'none',
          pickup_pin: pickupPin,
          selected_instrument: paymentMethod,
        },
        theme: {
          color: '#f97316',
        },
        callback_url: `${window.location.origin}/${merchantSlug || ''}/${tableNumber || ''}/success?tx=${masterTxId}&pin=${pickupPin}&order_number=${result.orders?.[0]?.display_id || masterTxId.slice(0, 4)}`,
        callback_method: 'get',
        redirect: true,
        ...(gatewayConfig ? { config: gatewayConfig } : {}),
        handler: async function (captureResponse: any) {
          console.log('[Curlec Dine-In] Payment authorized & captured:', captureResponse);

          const paymentId = captureResponse?.razorpay_payment_id || null;
          const orderId = captureResponse?.razorpay_order_id || curlecOrderId || null;

          // Authoritative payment capture via SECURITY DEFINER RPC
          try {
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('confirm_dine_in_payment', {
              p_transaction_id: masterTxId,
              p_curlec_payment_id: paymentId,
              p_curlec_order_id: orderId,
              p_pickup_pin: pickupPin,
            });

            if (rpcErr) {
              console.error('[Curlec Dine-In] confirm_dine_in_payment RPC error:', rpcErr);
            } else {
              console.log('[Curlec Dine-In] Payment captured successfully via RPC:', rpcRes);
            }
          } catch (updateErr) {
            console.warn('[Curlec] Payment confirmation exception:', updateErr);
          }

          completeOrderSuccess();
        },
        modal: {
          ondismiss: async function () {
            // Verify if payment completed before marking order cancelled
            let isCaptured = await verifyGatewayStatus();
            if (!isCaptured && !hasCompleted) {
              await new Promise((r) => setTimeout(r, 1200));
              isCaptured = await verifyGatewayStatus();
            }
            if (isCaptured || hasCompleted) {
              return;
            }

            cleanupListeners();
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            setErrorMessage('Payment cancelled. Your items are still in your cart.');
            if (masterTxId) {
              try {
                await supabase.rpc('mark_payment_failed', {
                  p_transaction_id: masterTxId,
                  p_reason: 'Curlec checkout dismissed by diner',
                });
              } catch (cancelErr) {
                console.warn('[Checkout] Failed to mark abandoned dine-in order as cancelled:', cancelErr);
              }
            }
          },
        },
      };

      // Resolve sub-order display ID from checkout result
      const primaryOrder = result.orders?.[0];
      const orderDisplayId: string =
        primaryOrder?.display_id ||
        `#${masterTxId.slice(0, 4).toUpperCase()}-1`;

      let hasCompleted = false;
      const completeOrderSuccess = () => {
        if (hasCompleted) return;
        hasCompleted = true;
        cleanupListeners();

        // Persist to localStorage for "Check Order" retrieval across sessions
        saveActiveDineInOrder({
          orderNumber: orderDisplayId,
          pickupPin,
          txId: masterTxId,
          merchantSlug: merchantSlug || '',
          tableNumber: String(tableNumber || ''),
          status: 'accepted',
        });

        clearCart();
        setIsSubmitting(false);
        navigate(
          `/${merchantSlug}/${tableNumber}/success?pin=${pickupPin}&tx=${masterTxId}&order_number=${encodeURIComponent(
            orderDisplayId
          )}`
        );
      };

      // Active verification polling while waiting for gateway (especially FPX bank popups/redirects)
      let pollInterval: any = null;
      const verifyGatewayStatus = async (): Promise<boolean> => {
        if (hasCompleted) return true;
        try {
          const verifyRes = await fetch(CHECKOUT_EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              action: 'verify_payment',
              master_transaction_id: masterTxId,
              curlec_order_id: curlecOrderId,
              pickup_pin: pickupPin,
            }),
          });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.success && verifyData.payment_status === 'captured') {
              console.log('[Dine-In Polling] Gateway payment captured via verification API:', verifyData);
              completeOrderSuccess();
              try {
                if (typeof razorpayInstance !== 'undefined' && razorpayInstance.close) {
                  razorpayInstance.close();
                }
              } catch (_) {}
              return true;
            }
          }
        } catch (e) {
          console.warn('[Dine-In Polling] Verification error:', e);
        }
        return false;
      };

      pollInterval = setInterval(verifyGatewayStatus, 3000);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && !hasCompleted) {
          verifyGatewayStatus();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleVisibilityChange);

      const cleanupListeners = () => {
        if (pollInterval) clearInterval(pollInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleVisibilityChange);
      };

      const razorpayInstance = new (window as any).Razorpay(razorpayOptions);
      razorpayInstance.on('payment.failed', async function (failResponse: any) {
        console.error('[Curlec Dine-In] Payment failed:', failResponse.error);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        const reason = failResponse.error?.description || 'Payment failed';
        setErrorMessage(`${reason}. Please try another method.`);
        if (masterTxId) {
          try {
            await supabase.rpc('mark_payment_failed', {
              p_transaction_id: masterTxId,
              p_reason: reason,
            });
          } catch (failErr) {
            console.warn('[Checkout] Failed to mark failed dine-in order as cancelled:', failErr);
          }
        }
      });

      razorpayInstance.open();
    } catch (err: any) {
      console.error('[Checkout Error]:', err);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAF9] pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-stone-200/80 px-4 py-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(`/${merchantSlug}/${tableNumber}`)}
          className="flex items-center gap-1.5 text-xs font-black text-stone-700 hover:text-stone-900 cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          <span>Back to Menu</span>
        </button>
        <div className="text-xs font-black text-stone-900 uppercase tracking-wider">
          Dine-In Checkout
        </div>
        {activeOrder ? (
          <button
            type="button"
            onClick={() =>
              navigate(
                `/${merchantSlug}/${tableNumber}/success?pin=${activeOrder.pickupPin}&tx=${activeOrder.txId}&order_number=${encodeURIComponent(
                  activeOrder.orderNumber
                )}`
              )
            }
            className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/30 rounded-lg text-brand-orange text-[11px] font-black hover:bg-orange-500/20 transition-all cursor-pointer shadow-xs"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
            <span>Check Order</span>
          </button>
        ) : (
          <div className="w-12" />
        )}
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Table Context Beacon Card */}
        <div className="p-4 bg-emerald-50 border-2 border-emerald-500/30 rounded-2xl flex items-center justify-between text-emerald-900 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍽️</span>
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-emerald-800">
                Contactless Dine-In
              </div>
              <div className="text-[11px] text-emerald-600 font-bold">
                Direct table service • Contactless ordering
              </div>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-black rounded-xl uppercase tracking-wider font-mono shadow-xs">
            Table {tableNumber}
          </span>
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-rose-600 text-lg shrink-0">error</span>
            <div className="flex-1">
              <span className="font-black">Notice: </span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* 1. Itemized Order Review Accordion */}
        <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setIsOrderReviewOpen(!isOrderReviewOpen)}
            className="w-full p-4 flex items-center justify-between bg-stone-50/70 hover:bg-stone-100/70 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-stone-800">
                Order Review
              </span>
              <span className="text-[11px] font-bold text-stone-400">
                ({items.reduce((s, i) => s + i.quantity, 0)} items)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-stone-900 tabular-nums">
                RM {subtotal.toFixed(2)}
              </span>
              <span
                className={`material-symbols-outlined text-stone-400 text-lg transition-transform duration-200 ${
                  isOrderReviewOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </div>
          </button>

          {isOrderReviewOpen && (
            <div className="p-4 divide-y divide-stone-100 space-y-3">
              {items.map((item) => (
                <div key={item.cartItemId} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-orange-100 text-brand-orange text-[11px] font-black flex items-center justify-center shrink-0">
                        {item.quantity}×
                      </span>
                      <h4 className="text-xs sm:text-sm font-black text-stone-900 truncate">
                        {item.name}
                      </h4>
                    </div>

                    {/* Modifiers */}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-7">
                        {item.selectedModifiers.map((mod) => (
                          <span
                            key={mod.id}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200/50"
                          >
                            {mod.option_name}
                            {mod.additional_price > 0 && ` (+RM${mod.additional_price.toFixed(2)})`}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Special Instructions */}
                    {item.specialInstructions && (
                      <div className="mt-1 ml-7 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 italic">
                        "{item.specialInstructions}"
                      </div>
                    )}
                  </div>

                  <div className="text-xs font-black text-stone-900 tabular-nums shrink-0 pt-0.5">
                    RM {(item.unitPriceWithModifiers * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Payment Method Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-600">
              Select Payment Method
            </h3>
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              <span>Direct Bank & E-Wallet</span>
            </span>
          </div>

          {/* Option 1: E-Wallets */}
          <div
            onClick={() => setPaymentMethod('ewallet')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 ${
              paymentMethod === 'ewallet'
                ? 'bg-blue-50/80 border-[#005BAC] shadow-md shadow-blue-500/10 ring-2 ring-[#005BAC]/20'
                : 'bg-white border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#005BAC] flex items-center justify-center text-white shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                </div>
                <div>
                  <div className="font-black text-sm text-stone-900 flex items-center gap-2">
                    <span>E-Wallets</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#005BAC] text-white">
                      RECOMMENDED
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 font-medium mt-0.5">
                    Touch 'n Go, GrabPay, Boost
                  </div>
                </div>
              </div>

              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  paymentMethod === 'ewallet'
                    ? 'border-[#005BAC] bg-[#005BAC]'
                    : 'border-stone-300 bg-white'
                }`}
              >
                {paymentMethod === 'ewallet' && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </div>
          </div>

          {/* Option 2: Online Banking (FPX) */}
          <div
            onClick={() => setPaymentMethod('fpx')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 ${
              paymentMethod === 'fpx'
                ? 'bg-sky-50/70 border-sky-600 shadow-sm ring-2 ring-sky-500/20'
                : 'bg-white border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-2xl">account_balance</span>
                </div>
                <div>
                  <div className="font-black text-sm text-stone-900 flex items-center gap-2">
                    <span>Online Banking (FPX)</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                      Direct Bank
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 font-medium mt-0.5">
                    Maybank2u, CIMB, Public Bank, RHB, Hong Leong
                  </div>
                </div>
              </div>

              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  paymentMethod === 'fpx'
                    ? 'border-sky-600 bg-sky-600'
                    : 'border-stone-300 bg-white'
                }`}
              >
                {paymentMethod === 'fpx' && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Promo Code Card */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="material-symbols-outlined text-brand-orange text-lg">local_offer</span>
            <span className="text-xs font-black uppercase tracking-wider text-stone-700">
              Have a Promo Code?
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value);
                  if (promoError) setPromoError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyPromo();
                  }
                }}
                placeholder="Enter promo code"
                disabled={!!appliedPromo}
                className="w-full h-11 px-3.5 pr-9 text-xs font-bold uppercase tracking-wider text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange placeholder:normal-case placeholder:tracking-normal placeholder:font-medium placeholder:text-stone-400 disabled:opacity-60 disabled:bg-stone-100"
              />
              {appliedPromo && (
                <span className="material-symbols-outlined text-emerald-600 absolute right-2.5 top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                  check_circle
                </span>
              )}
            </div>

            {appliedPromo ? (
              <button
                type="button"
                onClick={() => {
                  setAppliedPromo(null);
                  setPromoInput('');
                  setPromoError('');
                }}
                className="h-11 px-4 text-xs font-black text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer shrink-0"
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyPromo}
                disabled={!promoInput.trim()}
                className="h-11 px-4 text-xs font-black text-white bg-brand-orange hover:bg-orange-600 disabled:opacity-40 rounded-xl transition-all cursor-pointer shrink-0 shadow-sm shadow-orange-500/20"
              >
                Apply
              </button>
            )}
          </div>

          {promoError && (
            <p className="mt-2 text-[11px] text-rose-600 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">error</span>
              <span>{promoError}</span>
            </p>
          )}

          {appliedPromo && (
            <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200/70 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="material-symbols-outlined text-base text-emerald-600">verified</span>
                <span>Promo code applied.</span>
              </div>
              <span className="text-[11px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                -RM {discount.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* 4. Fee Transparency Ledger */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 space-y-2.5 text-xs shadow-xs">
          <div className="flex justify-between text-stone-600 font-medium">
            <span>Dishes Subtotal</span>
            <span className="font-black text-stone-900 tabular-nums">
              RM {subtotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between text-stone-600 font-medium">
            <span>Processing Fee</span>
            <span className="font-extrabold text-stone-900 tabular-nums">
              RM {convenienceFee.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between text-stone-600 font-medium">
            <span>Service Fee (3.8%)</span>
            <span className="font-extrabold text-stone-900 tabular-nums">
              RM {serviceFee.toFixed(2)}
            </span>
          </div>

          {orderBalanceFee > 0 && (
            <div className="flex justify-between text-stone-600 font-medium">
              <span>Order Balance Fee</span>
              <span className="font-extrabold text-stone-900 tabular-nums">
                RM {orderBalanceFee.toFixed(2)}
              </span>
            </div>
          )}

          {discount > 0 && (
            <div className="flex justify-between text-emerald-600 font-extrabold">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">local_activity</span>
                <span>Promo Discount ({appliedPromo})</span>
              </span>
              <span className="tabular-nums">-RM {discount.toFixed(2)}</span>
            </div>
          )}

          <div className="pt-2.5 border-t border-stone-100 flex justify-between items-baseline">
            <span className="font-black text-sm text-stone-900">Total Payable</span>
            <span className="text-xl font-black text-brand-orange tabular-nums tracking-tight">
              RM {finalTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* 4. Action Button */}
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={isSubmitting}
          className="w-full h-14 rounded-2xl bg-brand-orange hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50 text-white font-black text-base shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Connecting to Gateway...</span>
            </>
          ) : (
            <>
              <span>Pay & Send to Kitchen • RM {finalTotal.toFixed(2)}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
