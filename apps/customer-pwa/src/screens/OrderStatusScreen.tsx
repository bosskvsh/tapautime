import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  useCustomerOrderStore,
  OrderStatus,
  normalizeOrderStatus,
  resolveOrderStatusFromRow,
  isTerminalStatus,
} from '../stores/useCustomerOrderStore';
import { PullToRefresh } from '../components/PullToRefresh';

export interface OrderStatusScreenProps {
  orderId?: string;
  pickupPin?: string;
  status?: OrderStatus;
  onBackHome?: () => void;
}

export const OrderStatusScreen: React.FC<OrderStatusScreenProps> = ({
  orderId = '',
  pickupPin,
  status: statusProp,
  onBackHome,
}) => {
  const { activeOrder, updateOrderStatus, fetchOrderReceipt, clearActiveOrder } = useCustomerOrderStore();
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);

  // Storefront Counter Arrival States
  const [hasNotifiedArrival, setHasNotifiedArrival] = useState(false);
  const [isNotifyingArrival, setIsNotifyingArrival] = useState(false);
  const [arrivalCooldown, setArrivalCooldown] = useState(0);
  const [arrivalBannerMessage, setArrivalBannerMessage] = useState<string | null>(null);

  const currentStatus = normalizeOrderStatus(statusProp || activeOrder?.order_status || 'accepted');
  const displayPin = pickupPin || activeOrder?.pickup_pin || '';
  const displayOrderNumber = activeOrder?.display_id || orderId || 'Active Order';

  // Cooldown countdown timer for storefront arrival alerts
  useEffect(() => {
    if (arrivalCooldown <= 0) return;
    const timer = setInterval(() => {
      setArrivalCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [arrivalCooldown]);

  // Auto-dismiss confirmation banner
  useEffect(() => {
    if (!arrivalBannerMessage) return;
    const t = setTimeout(() => setArrivalBannerMessage(null), 6000);
    return () => clearTimeout(t);
  }, [arrivalBannerMessage]);

  // Synthetic Web Audio C5->E5->G5->C6 success chime
  const playArrivalSuccessChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.3);
      });
    } catch (_) {}
  }, []);

  // Dispatch customer storefront arrival across BroadcastChannel and Supabase
  const handleNotifyArrival = useCallback(async () => {
    if (isNotifyingArrival || arrivalCooldown > 0) return;

    setIsNotifyingArrival(true);
    playArrivalSuccessChime();

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (_) {}
    }

    const targetId = activeOrder?.id || orderId;
    const cleanOrderId = String(displayOrderNumber || '').replace('#', '').trim();

    // 1. Same-device / cross-tab broadcast via BroadcastChannel ('tapau_time_sync')
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const syncChannel = new BroadcastChannel('tapau_time_sync');
        syncChannel.postMessage({
          type: 'CUSTOMER_ARRIVED',
          orderId: cleanOrderId || targetId,
          displayId: activeOrder?.display_id || displayOrderNumber,
          pickupPin: displayPin,
          timestamp: new Date().toISOString(),
        });
        setTimeout(() => syncChannel.close(), 1000);
      }
    } catch (bcErr) {
      console.warn('[OrderStatusScreen] BroadcastChannel customer arrival failed:', bcErr);
    }

    // 2. Persist audit trail to Supabase order_events table
    try {
      if (targetId) {
        await supabase.from('order_events').insert({
          order_id: targetId,
          event_type: 'CUSTOMER_ARRIVED',
          actor_role: 'CUSTOMER',
          payload: {
            display_id: displayOrderNumber,
            pickup_pin: displayPin,
            arrived_at: new Date().toISOString(),
          },
        });
      }
    } catch (err) {
      console.warn('[OrderStatusScreen] Failed to record order arrival event:', err);
    } finally {
      setIsNotifyingArrival(false);
      setHasNotifiedArrival(true);
      setArrivalCooldown(30);
      setArrivalBannerMessage('👋 Stall staff alerted that you have arrived at the counter!');
    }
  }, [
    isNotifyingArrival,
    arrivalCooldown,
    playArrivalSuccessChime,
    activeOrder?.id,
    activeOrder?.display_id,
    orderId,
    displayOrderNumber,
    displayPin,
  ]);

  // Realtime postgres changes channel & resilient fallback polling
  useEffect(() => {
    const targetId = activeOrder?.id || orderId;
    if (!targetId) return;

    // Realtime postgres changes channel
    const channel = supabase
      .channel(`customer-order-${targetId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const updated = payload.new as any;
          if (
            updated &&
            (updated.id === targetId ||
              updated.display_id === targetId ||
              (displayPin && updated.pickup_pin === displayPin) ||
              (activeOrder && (updated.id === activeOrder.id || updated.display_id === activeOrder.display_id || (activeOrder.pickup_pin && updated.pickup_pin === activeOrder.pickup_pin))))
          ) {
            const nextStatus = resolveOrderStatusFromRow(updated);
            if (nextStatus) {
              updateOrderStatus(activeOrder?.id || updated.id, nextStatus);

              // Proactively fetch immutable receipt when transitioned to completed
              if (nextStatus === 'completed') {
                setIsReceiptLoading(true);
                fetchOrderReceipt(activeOrder?.id || updated.id).finally(() => {
                  setIsReceiptLoading(false);
                });
              }
            }
          }
        }
      )
      .subscribe();

    // Fallback polling every 8 seconds for resilient connection across network drops
    const interval = setInterval(async () => {
      try {
        const queryFilter = [
          targetId ? `id.eq.${targetId}` : null,
          targetId ? `display_id.eq.${targetId}` : null,
          displayPin ? `pickup_pin.eq.${displayPin}` : null,
        ]
          .filter(Boolean)
          .join(',');

        if (!queryFilter) return;

        const { data } = await supabase
          .from('orders')
          .select('id, order_status, status, pickup_pin')
          .or(queryFilter)
          .maybeSingle();

        if (data) {
          const nextStatus = resolveOrderStatusFromRow(data);
          updateOrderStatus(activeOrder?.id || data.id, nextStatus);

          if (nextStatus === 'completed' && !activeOrder?.receipt) {
            fetchOrderReceipt(activeOrder?.id || data.id);
          }
        }
      } catch (err) {
        // Silent catch for intermittent mobile drops
      }
    }, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [activeOrder?.id, activeOrder?.receipt, activeOrder?.pickup_pin, orderId, displayPin, updateOrderStatus, fetchOrderReceipt]);

  // Proactively fetch receipt if order is already completed on mount
  useEffect(() => {
    const targetId = activeOrder?.id || orderId;
    if (currentStatus === 'completed' && targetId && !activeOrder?.receipt) {
      setIsReceiptLoading(true);
      fetchOrderReceipt(targetId).finally(() => {
        setIsReceiptLoading(false);
      });
    }
  }, [currentStatus, activeOrder?.id, activeOrder?.receipt, orderId, fetchOrderReceipt]);

  const steps: Array<{ key: OrderStatus; label: string; icon: string }> = [
    { key: 'accepted', label: 'Order Received & Locked', icon: '📝' },
    { key: 'preparing', label: 'In the Wok / Cooking', icon: '🔥' },
    { key: 'ready', label: 'Ready for Pickup', icon: '🍜' },
    { key: 'completed', label: 'Collected & Enjoyed', icon: '✅' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === currentStatus);
  const receipt = activeOrder?.receipt;

  const refreshOrderStatus = useCallback(async () => {
    const targetId = activeOrder?.id || orderId;
    if (!targetId) return;

    try {
      const queryFilter = [
        targetId ? `id.eq.${targetId}` : null,
        targetId ? `display_id.eq.${targetId}` : null,
        displayPin ? `pickup_pin.eq.${displayPin}` : null,
      ]
        .filter(Boolean)
        .join(',');

      if (!queryFilter) return;

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or(queryFilter)
        .maybeSingle();

      if (!error && data) {
        const nextStatus = resolveOrderStatusFromRow(data);
        if (nextStatus) {
          updateOrderStatus(activeOrder?.id || data.id, nextStatus);
        }
        if (nextStatus === 'completed') {
          await fetchOrderReceipt(activeOrder?.id || data.id);
        }
      }
    } catch (err) {
      console.warn('[OrderStatusScreen] Error refreshing order status:', err);
    }
  }, [activeOrder?.id, orderId, displayPin, updateOrderStatus, fetchOrderReceipt]);

  // If no active order exists, display friendly empty state
  if (!activeOrder && !orderId) {
    return (
      <div className="min-h-screen bg-brand-offwhite p-6 flex flex-col items-center justify-center text-center space-y-4 select-none">
        <div className="w-16 h-16 rounded-3xl bg-orange-100 flex items-center justify-center text-3xl shadow-sm">
          🍜
        </div>
        <h2 className="text-xl font-black text-stone-900 tracking-tight">No Active Order</h2>
        <p className="text-xs text-stone-500 max-w-xs font-medium">
          You don't have any active takeaway orders in progress right now.
        </p>
        <button
          type="button"
          onClick={onBackHome}
          className="px-5 py-2.5 bg-brand-orange hover:bg-orange-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
        >
          Explore Stalls
        </button>
      </div>
    );
  }

  return (
    <PullToRefresh
      onRefresh={refreshOrderStatus}
      disabled={isReceiptModalOpen}
      pullingText="Pull to check status..."
      refreshingText="Checking kitchen progress..."
      completeText="Status updated!"
    >
      <div className="p-4 space-y-6 max-w-lg mx-auto pb-24 select-none">
        {/* Header */}
        <header className="text-center pt-2">
        <span className={`text-xs font-black uppercase tracking-wider ${currentStatus === 'completed' ? 'text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300' : currentStatus === 'cancelled' ? 'text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-300' : 'text-stone-400'}`}>
          {currentStatus === 'completed' ? '✓ Order Fulfilled & Collected' : currentStatus === 'cancelled' ? '❌ Order Cancelled' : 'Live Takeaway Tracker'}
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
          {displayOrderNumber}
        </h1>
        <div className="text-xs text-stone-500 font-medium mt-0.5">
          {currentStatus === 'completed' ? 'Collected & Verified • Enjoy your meal!' : currentStatus === 'cancelled' ? 'This order will not be fulfilled.' : `Estimated prep time: ${activeOrder?.estimated_prep_minutes || 15} minutes`}
        </div>
      </header>

      {/* Auntie-Proof Pickup PIN Display / Collected State */}
      {currentStatus === 'cancelled' ? (
        <div className="p-5 bg-gradient-to-b from-stone-50 to-rose-50/60 rounded-3xl border border-rose-200/80 shadow-sm text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-[11px] font-black uppercase tracking-wider">
            <span>❌</span>
            <span>Order Cancelled</span>
          </div>
          <div>
            <span className="text-3xl font-black font-mono tracking-widest text-stone-500 line-through opacity-75">
              {displayPin}
            </span>
          </div>
          <p className="text-xs font-bold text-rose-800">
            This order has been cancelled by the merchant.
          </p>
        </div>
      ) : currentStatus === 'completed' ? (
        <div className="p-5 bg-gradient-to-b from-stone-50 to-emerald-50/60 rounded-3xl border border-emerald-200/80 shadow-sm text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[11px] font-black uppercase tracking-wider">
            <span>✓</span>
            <span>Takeaway Picked Up</span>
          </div>
          <div>
            <span className="text-3xl font-black font-mono tracking-widest text-stone-500 line-through opacity-75">
              {displayPin}
            </span>
          </div>
          <p className="text-xs font-bold text-emerald-800">
            PIN verified &amp; order collected at the stall counter.
          </p>
        </div>
      ) : (
        <div className="p-6 bg-gradient-to-b from-orange-50 to-amber-50 rounded-3xl border-2 border-orange-400/80 shadow-lg text-center space-y-3">
          <div>
            <div className="text-5xl sm:text-6xl font-black font-mono tracking-widest text-orange-600 drop-shadow-sm">
              {displayPin}
            </div>
          </div>

          <p className="text-xs font-bold text-orange-950/80 max-w-xs mx-auto">
            Here Is Your 4-Digit Pin. Please Show Your 4-Digit Pin To The Merchant
          </p>
        </div>
      )}

      {/* Storefront Counter Arrival Alert (Active Takeaway Orders) */}
      {!isTerminalStatus(currentStatus) && (
        <div className="space-y-2">
          {arrivalBannerMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-2 shadow-sm animate-in fade-in duration-200">
              <span className="text-base">👋</span>
              <span>{arrivalBannerMessage}</span>
            </div>
          )}

          <div className="p-4 sm:p-5 bg-white rounded-3xl border border-stone-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-base shrink-0">
                  📍
                </div>
                <div className="text-left">
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    At the Counter?
                  </h3>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Alert the stall uncle/auntie you've arrived
                  </p>
                </div>
              </div>
              {hasNotifiedArrival && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                  <span>✓</span> Alerted
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleNotifyArrival}
              disabled={isNotifyingArrival || arrivalCooldown > 0}
              className={`w-full py-3.5 px-4 min-h-[48px] rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed ${
                arrivalCooldown > 0
                  ? 'bg-emerald-600 text-white shadow-emerald-700/20'
                  : hasNotifiedArrival
                  ? 'bg-stone-800 hover:bg-stone-700 active:scale-95 text-white shadow-stone-800/20'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white shadow-emerald-600/30'
              }`}
            >
              {isNotifyingArrival ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Alerting Counter Staff...</span>
                </>
              ) : arrivalCooldown > 0 ? (
                <>
                  <span>✓</span>
                  <span>Staff Alerted — Waiting at Counter ({arrivalCooldown}s)</span>
                </>
              ) : hasNotifiedArrival ? (
                <>
                  <span>👋</span>
                  <span>Alert Again (I'm Still at Counter)</span>
                </>
              ) : (
                <>
                  <span>👋</span>
                  <span>I'm Here! (Waiting at Counter)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Status Card */}
      <div className="p-5 bg-white rounded-3xl border border-stone-200 shadow-sm text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-stone-100 text-2xl">
          {currentStatus === 'cancelled'
            ? '❌'
            : currentStatus === 'ready'
            ? '🍜'
            : currentStatus === 'preparing'
            ? '🔥'
            : currentStatus === 'completed'
            ? '🎉'
            : '⏱️'}
        </div>
        <h2 className="text-lg font-black text-stone-900 capitalize">
          {currentStatus === 'cancelled'
            ? 'Order Cancelled'
            : currentStatus === 'ready'
            ? 'Food is Ready at the Counter!'
            : currentStatus === 'preparing'
            ? 'Food is Sizzling in the Kitchen!'
            : currentStatus === 'completed'
            ? 'Order Collected!'
            : 'Order Confirmed by Stall'}
        </h2>
        <p className="text-xs text-stone-500 font-medium">
          {currentStatus === 'cancelled'
            ? 'Your order has been cancelled by the stall. Please contact them for more details.'
            : currentStatus === 'ready'
            ? 'Head to the counter and state your 4-digit PIN.'
            : currentStatus === 'completed'
            ? 'Thank you for dining with TapauTime. Your fiat receipt is verified.'
            : 'The merchant is preparing your meal fresh.'}
        </p>
      </div>

      {/* Verified Fiat Settlement Card (Only on Completion) */}
      {currentStatus === 'completed' && (
        <div className="transition-all duration-300">
          {isReceiptLoading && !receipt ? (
            <div className="p-5 bg-emerald-50/70 border border-emerald-300 rounded-3xl animate-pulse text-center space-y-2">
              <div className="inline-flex items-center gap-2 text-emerald-800 text-xs font-black uppercase tracking-wider">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Verifying Fiat Ledger Settlement...</span>
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Confirming immutable double-entry ledger in PostgreSQL...
              </p>
            </div>
          ) : receipt ? (
            <div className="p-5 bg-gradient-to-b from-emerald-50 to-teal-50 border-2 border-emerald-400/80 rounded-3xl shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-200/80 text-emerald-900 rounded-full text-[11px] font-black uppercase tracking-wider">
                  <span>🛡️</span>
                  <span>Fiat Settlement Verified</span>
                </div>
                {receipt.ledger_verified ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300">
                    <span>✓</span> Immutable Ledger
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    Processing Settlement
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-between border-b border-emerald-200/70 pb-3">
                <div>
                  <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                    Gross Total Paid
                  </span>
                  <span className="text-2xl font-black text-emerald-950">
                    RM {Number(receipt.total_amount || activeOrder?.total_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                    Payment Method
                  </span>
                  <span className="text-xs font-black text-stone-800 capitalize">
                    {receipt.payment_method === 'gateway' ? 'DuitNow QR' : receipt.payment_method}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
                <span>Settlement Time</span>
                <span className="font-bold text-stone-800">
                  {new Date(receipt.completed_at || receipt.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="w-full h-12 bg-white hover:bg-emerald-100/50 active:scale-98 border border-emerald-300 text-emerald-900 text-xs font-black rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>📄</span>
                <span>View Official Fiat Receipt</span>
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Visual Progress Steps */}
      <div className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-400">
          Kitchen Pipeline
        </h3>
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isPassed = currentStepIndex >= idx;
            const isCurrent = step.key === currentStatus;

            return (
              <div key={step.key} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                    isCurrent
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 animate-pulse'
                      : isPassed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  {isPassed && !isCurrent ? '✓' : idx + 1}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span
                    className={`text-xs sm:text-sm font-bold ${
                      isCurrent
                        ? 'text-stone-900 font-black'
                        : isPassed
                        ? 'text-stone-800'
                        : 'text-stone-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-sm">{step.icon}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="pt-2 space-y-2">
        {currentStatus === 'completed' && (
          <button
            onClick={() => {
              clearActiveOrder();
              window.location.hash = '#/orders';
            }}
            className="w-full h-14 min-h-[3.5rem] bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20"
          >
            <span>📜</span>
            <span>View All Past Orders</span>
          </button>
        )}
        <button
          onClick={() => {
            if (currentStatus === 'completed') {
              clearActiveOrder();
            }
            onBackHome?.();
          }}
          className="w-full h-14 min-h-[3.5rem] bg-stone-900 hover:bg-stone-800 active:scale-98 text-white font-black text-sm rounded-2xl transition-all flex items-center justify-center cursor-pointer shadow-md"
        >
          Return to Hub Menu
        </button>
      </div>

      {/* Official Fiat Receipt Modal */}
      {isReceiptModalOpen && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                Official Fiat Settlement Proof
              </span>
              <h2 className="text-xl font-black text-stone-900 pt-1">
                Receipt #{receipt.display_id}
              </h2>
              <p className="text-xs text-stone-500 font-medium">
                {receipt.merchant_name || 'TapauTime Kopitiam Network'}
              </p>
            </div>

            <div className="border-t border-b border-dashed border-stone-300 py-3 space-y-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Order Reference:</span>
                <span className="font-mono font-bold text-stone-900">{receipt.order_id.substring(0, 13)}...</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Pickup Verification PIN:</span>
                <span className="font-mono font-black text-orange-600 tracking-wider">{receipt.pickup_pin}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Payment Channel:</span>
                <span className="font-bold text-stone-900 capitalize">
                  {receipt.payment_method === 'gateway' ? 'DuitNow QR' : receipt.payment_method}
                </span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Payment Status:</span>
                <span className="font-black text-emerald-700 capitalize">{receipt.payment_status}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Settled Timestamp:</span>
                <span className="font-medium text-stone-800">
                  {new Date(receipt.completed_at || receipt.created_at).toLocaleString()}
                </span>
              </div>

              {/* Itemized Order Breakdown */}
              {receipt.items && receipt.items.length > 0 && (
                <div className="pt-2 border-t border-dashed border-stone-200 space-y-1.5">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">
                    Ordered Items
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {receipt.items.map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-xs text-stone-700">
                        <span className="font-medium">
                          {item.quantity}x {item.item_name}
                        </span>
                        <span className="font-bold text-stone-900">
                          RM {(item.quantity * item.unit_price).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-stone-200 text-sm">
                <span className="font-black text-stone-900">Total Amount Paid:</span>
                <span className="font-black text-emerald-700 text-base">
                  RM {Number(receipt.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="bg-emerald-50 rounded-2xl p-3 text-[11px] text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-black">
                <span>✓</span>
                <span>Ledger Security Guarantee</span>
              </div>
              <p className="text-emerald-800/90 font-medium leading-relaxed">
                Settled atomically into PostgreSQL immutable double-entry ledger. All transactions are cryptographically verified and permanently locked.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 h-12 bg-stone-100 hover:bg-stone-200 active:scale-98 text-stone-800 font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-stone-200"
              >
                <span>🖨️</span>
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="flex-1 h-12 bg-stone-900 hover:bg-stone-800 active:scale-98 text-white font-black text-xs rounded-2xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </PullToRefresh>
);
};
