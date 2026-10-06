import React, { useEffect, useState, useCallback } from 'react';
import { supabase, SUPABASE_ANON_KEY, CHECKOUT_EDGE_FUNCTION_URL } from '../lib/supabase';
import {
  useCustomerOrderStore,
  CustomerOrder,
  OrderStatus,
  CustomerReceipt,
  isTerminalStatus,
  resolveOrderStatusFromRow,
} from '../stores/useCustomerOrderStore';
import { OrderStatusScreen } from './OrderStatusScreen';
import { PullToRefresh } from '../components/PullToRefresh';

export interface OrdersScreenProps {
  onNavigateHome: () => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({ onNavigateHome }) => {
  const {
    activeOrder,
    setActiveOrder,
    orderHistory,
    setOrderHistory,
    fetchOrderReceipt,
  } = useCustomerOrderStore();

  const [isLoading, setIsLoading] = useState(true);
  const [showHistoryOnly, setShowHistoryOnly] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<CustomerReceipt | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isFetchingReceipt, setIsFetchingReceipt] = useState(false);

  // Fetch active/pending orders and history from Supabase.
  // SECURITY: Bail early if no authenticated session — never fall back to a
  // hardcoded UUID, which would return another user's orders to anonymous visitors.
  const fetchOrders = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        // No authenticated session — clear any stale persisted order from localStorage
        // so a foreign order from a previous session cannot ghost-persist.
        if (activeOrder) {
          setActiveOrder(null);
        }
        setOrderHistory([]);
        return;
      }

      const customerId = session.user.id;

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Active reconciliation for recent pending gateway orders (e.g. FPX mobile return)
        const recentPending = data.find((o: any) => {
          const isPending = o.payment_status === 'pending' || o.order_status === 'pending_payment';
          const isGateway = o.payment_method === 'gateway' || o.payment_method === 'online';
          const isRecent = (Date.now() - new Date(o.created_at).getTime()) < 15 * 60 * 1000;
          return isPending && isGateway && isRecent;
        });

        if (recentPending) {
          (async () => {
            try {
              const res = await fetch(CHECKOUT_EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: SUPABASE_ANON_KEY,
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  action: 'verify_payment',
                  master_transaction_id: recentPending.transaction_id || recentPending.id,
                  pickup_pin: recentPending.pickup_pin,
                }),
              });
              if (res.ok) {
                const ver = await res.json();
                if (ver.success && ver.payment_status === 'captured') {
                  console.log('[OrdersScreen] Active reconciliation captured order:', ver);
                  fetchOrders();
                }
              }
            } catch (verErr) {
              console.warn('[OrdersScreen] Verification error:', verErr);
            }
          })();
        }

        // Exclude unpaid/abandoned gateway checkout attempts from active kitchen orders
        const activeItem = data.find((o: any) => {
          const resolvedStatus = resolveOrderStatusFromRow(o);
          if (isTerminalStatus(resolvedStatus)) return false;
          if (
            resolvedStatus === 'pending_payment' ||
            (o.payment_method === 'gateway' && o.payment_status === 'pending')
          ) {
            return false;
          }
          return true;
        });

        if (activeItem) {
          const resolvedStatus = resolveOrderStatusFromRow(activeItem);
          setActiveOrder({
            id: activeItem.id,
            display_id: activeItem.display_id || activeItem.id.slice(0, 8).toUpperCase(),
            merchant_id: activeItem.merchant_id,
            order_status: resolvedStatus,
            payment_status: activeItem.payment_status || 'captured',
            pickup_pin: activeItem.pickup_pin || '',
            total_amount: Number(activeItem.total_amount) || 0,
            promo_code: activeItem.promo_code || null,
            promo_code_id: activeItem.promo_code_id || null,
            discount_amount: Number(activeItem.discount_amount || 0),
            estimated_prep_minutes: activeItem.estimated_prep_minutes || 15,
            created_at: activeItem.created_at,
          });
        } else {
          // No active orders in database — clear any stale local activeOrder
          if (activeOrder) {
            setActiveOrder(null);
          }
        }

        const historyItems: CustomerOrder[] = data
          .filter((o: any) => {
            const resolved = resolveOrderStatusFromRow(o);
            // Never show unpaid/abandoned checkout attempts in customer history
            if (
              resolved === 'pending_payment' ||
              (o.payment_method === 'gateway' && o.payment_status === 'pending')
            ) {
              return false;
            }
            return isTerminalStatus(resolved);
          })
          .map((o: any) => ({
            id: o.id,
            display_id: o.display_id || o.id.slice(0, 8).toUpperCase(),
            merchant_id: o.merchant_id,
            order_status: resolveOrderStatusFromRow(o),
            payment_status: o.payment_status || 'captured',
            pickup_pin: o.pickup_pin,
            total_amount: Number(o.total_amount) || 0,
            promo_code: o.promo_code || null,
            promo_code_id: o.promo_code_id || null,
            discount_amount: Number(o.discount_amount || 0),
            created_at: o.created_at,
          }));

        setOrderHistory(historyItems);
      }
    } catch (err) {
      console.error('[OrdersScreen] Error fetching customer orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrder, setActiveOrder, setOrderHistory]);

  useEffect(() => {
    if (isReceiptModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isReceiptModalOpen]);

  useEffect(() => {
    fetchOrders();

    // Realtime postgres changes channel for customer orders
    const channel = supabase
      .channel('customer-orders-screen-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  const handleOpenReceipt = async (order: CustomerOrder) => {
    setIsReceiptModalOpen(true);
    // Instant cache check for zero network round-trip
    if (order.receipt) {
      setSelectedReceipt(order.receipt);
      return;
    }

    setIsFetchingReceipt(true);
    try {
      const receipt = await fetchOrderReceipt(order.id);
      setSelectedReceipt(receipt);
    } finally {
      setIsFetchingReceipt(false);
    }
  };

  const hasActiveOrder =
    Boolean(activeOrder) &&
    !isTerminalStatus(activeOrder?.order_status);

  // If there's an active/pending order and user hasn't explicitly clicked "View History", render live tracker
  if (hasActiveOrder && !showHistoryOnly) {
    return (
      <div className="min-h-screen bg-brand-offwhite">
        {orderHistory.length > 0 && (
          <div className="max-w-lg mx-auto px-4 pt-4 flex justify-between items-center">
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Active Order In Progress
            </span>
            <button
              onClick={() => setShowHistoryOnly(true)}
              className="text-xs font-bold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-all"
            >
              Past Orders ({orderHistory.length})
            </button>
          </div>
        )}
        <OrderStatusScreen
          orderId={activeOrder?.display_id || activeOrder?.id}
          pickupPin={activeOrder?.pickup_pin}
          status={activeOrder?.order_status}
          onBackHome={onNavigateHome}
        />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-offwhite p-4 max-w-lg mx-auto pb-32 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-stone-500">Checking your orders...</p>
      </div>
    );
  }

  // Order history view or empty state
  return (
    <PullToRefresh
      onRefresh={fetchOrders}
      disabled={isReceiptModalOpen}
      pullingText="Pull to refresh orders..."
      refreshingText="Syncing orders..."
      completeText="Orders updated!"
    >
      <div className="min-h-screen bg-brand-offwhite p-4 max-w-lg mx-auto pb-32 space-y-5">
        <header className="pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
            My Orders
          </h1>
          <p className="text-xs font-medium text-stone-500 mt-0.5">
            {hasActiveOrder ? 'View active & previous takeaways' : 'Your takeaway history'}
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="p-2 text-stone-500 hover:text-stone-800 rounded-xl bg-white border border-stone-200 shadow-sm active:scale-95"
          title="Refresh orders"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </header>

      {/* Return to active order banner if toggled to history */}
      {hasActiveOrder && (
        <div className="p-4 bg-orange-50 border-2 border-brand-orange/40 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">🍜</span>
            <div>
              <div className="text-xs font-black uppercase text-brand-orange">Active Order</div>
              <div className="text-sm font-bold text-stone-900">
                {activeOrder?.display_id || activeOrder?.id}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowHistoryOnly(false)}
            className="px-3 py-1.5 bg-brand-orange text-white text-xs font-black rounded-xl shadow-sm hover:brightness-105 active:scale-95 transition-all"
          >
            Live Tracker →
          </button>
        </div>
      )}

      {/* History List or Empty State */}
      {orderHistory.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-stone-400">
            Past Orders ({orderHistory.length})
          </h2>
          {orderHistory.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🥡</span>
                  <span className="font-bold text-stone-900 text-sm">
                    {order.display_id || order.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-black px-2.5 py-0.5 rounded-full capitalize ${
                    order.order_status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : order.order_status === 'cancelled'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-stone-100 text-stone-700'
                  }`}
                >
                  {order.order_status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-stone-500 pt-1 border-t border-stone-100">
                <span>
                  {order.created_at
                    ? new Date(order.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Recent'}
                </span>
                <span className="font-black text-stone-900 text-sm">
                  RM {order.total_amount.toFixed(2)}
                </span>
              </div>

              {/* Receipt Drawer Trigger (Completed Orders Only) */}
              {order.order_status === 'completed' && (
                <button
                  type="button"
                  onClick={() => handleOpenReceipt(order)}
                  className="w-full mt-2 py-2.5 px-3.5 bg-emerald-50 hover:bg-emerald-100/70 active:scale-98 border border-emerald-200 text-emerald-900 text-xs font-black rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-xs"
                >
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                    <span>View Receipt</span>
                    <span>→</span>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        !hasActiveOrder && (
          <div className="p-8 bg-white border border-stone-200 rounded-3xl text-center space-y-4 my-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-orange-50 text-3xl flex items-center justify-center mx-auto border border-orange-200">
              🥡
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-stone-900">No Orders Yet</h2>
              <p className="text-xs text-stone-500 font-medium max-w-xs mx-auto">
                You haven't placed any takeaway orders yet. Hungry? Tapau fresh food from nearby merchant stalls!
              </p>
            </div>
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-brand-orange text-white font-black text-xs hover:brightness-105 active:scale-95 shadow-md shadow-brand-orange/30 transition-all cursor-pointer"
            >
              Browse Merchant Stalls
            </button>
          </div>
        )
      )}

      {/* Official Fiat Receipt & Ledger Proof Modal */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {isFetchingReceipt && !selectedReceipt ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-stone-600">Retrieving official fiat settlement proof...</p>
              </div>
            ) : selectedReceipt ? (
              <>
                <div className="text-center space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                    Official Fiat Settlement Proof
                  </span>
                  <h2 className="text-xl font-black text-stone-900 pt-1">
                    Receipt #{selectedReceipt.display_id}
                  </h2>
                  <p className="text-xs text-stone-500 font-medium">
                    {selectedReceipt.merchant_name || 'TapauTime Kopitiam Network'}
                  </p>
                </div>

                <div className="border-t border-b border-dashed border-stone-300 py-3 space-y-2 text-xs">
                  <div className="flex justify-between text-stone-600">
                    <span>Order Reference:</span>
                    <span className="font-mono font-bold text-stone-900">
                      {selectedReceipt.order_id.substring(0, 13)}...
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Pickup Verification PIN:</span>
                    <span className="font-mono font-black text-orange-600 tracking-wider">
                      {selectedReceipt.pickup_pin}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Payment Channel:</span>
                    <span className="font-bold text-stone-900 capitalize">
                      {selectedReceipt.payment_method === 'gateway' ? 'DuitNow QR' : selectedReceipt.payment_method}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Payment Status:</span>
                    <span className="font-black text-emerald-700 capitalize">
                      {selectedReceipt.payment_status}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Settled Timestamp:</span>
                    <span className="font-medium text-stone-800">
                      {new Date(selectedReceipt.completed_at || selectedReceipt.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Itemized Order Breakdown */}
                  {selectedReceipt.items && selectedReceipt.items.length > 0 && (
                    <div className="pt-2 border-t border-dashed border-stone-200 space-y-1.5">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">
                        Ordered Items
                      </span>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {selectedReceipt.items.map((item, idx) => (
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
                      RM {Number(selectedReceipt.total_amount).toFixed(2)}
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
              </>
            ) : (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs font-bold text-stone-600">Receipt could not be loaded at this time.</p>
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsReceiptModalOpen(false);
                  setSelectedReceipt(null);
                }}
                className="w-full h-12 bg-stone-900 hover:bg-stone-800 active:scale-98 text-white font-black text-xs rounded-2xl transition-all cursor-pointer shadow-sm"
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
