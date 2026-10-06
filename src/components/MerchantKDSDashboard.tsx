import React, { useEffect, useState, useMemo } from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { Order, OrderStatus } from '../types/schema';
import { supabase } from '../lib/supabase';

interface MerchantKDSDashboardProps {
  merchantId: string;
  storeName?: string;
}

export const MerchantKDSDashboard: React.FC<MerchantKDSDashboardProps> = ({
  merchantId,
  storeName = 'Tapau Stall',
}) => {
  const {
    activeOrders,
    setOrders,
    updateOrderStatus,
    subscribeToMerchantOrders,
  } = useOrderStore();

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // 1. Initial Load from Supabase + Realtime Subscription via Zustand Store
  useEffect(() => {
    let isMounted = true;

    async function loadActiveOrders() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('merchant_id', merchantId)
          .in('status', ['pending', 'accepted', 'preparing', 'ready', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY'])
          .order('created_at', { ascending: true });

        if (!error && data && isMounted) {
          const mapped: Order[] = data.map((d: any) => ({
            id: d.id,
            display_id: d.display_id || `#${d.id.slice(0, 4).toUpperCase()}`,
            customer_id: d.customer_id,
            merchant_id: d.merchant_id,
            order_status: (d.order_status || d.status || 'pending').toLowerCase() as OrderStatus,
            payment_status: d.payment_status || 'pending',
            total_amount: Number(d.total_amount) || 0,
            created_at: d.created_at,
            items: (d.order_items || []).map((item: any) => ({
              id: item.id,
              order_id: item.order_id,
              item_id: item.item_id,
              item_name: item.item_name || 'Item',
              quantity: item.quantity || 1,
              selected_modifiers: item.selected_modifiers || [],
              price_at_time_of_order: Number(item.price_at_time_of_order) || 0,
              special_instructions: item.special_instructions,
            })),
          }));
          setOrders(mapped);
        }
      } catch (err) {
        console.warn('[KDS Dashboard] Order fetch notice:', err);
      }
    }

    loadActiveOrders();
    const unsubscribe = subscribeToMerchantOrders(merchantId);

    // Update timers every 1s
    const timerInterval = setInterval(() => setCurrentTime(Date.now()), 1000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(timerInterval);
    };
  }, [merchantId, setOrders, subscribeToMerchantOrders]);

  // Status advancement handler
  const handleAdvanceStatus = async (orderId: string, nextStatus: OrderStatus) => {
    // Optimistic state update in Zustand
    updateOrderStatus(orderId, nextStatus);

    try {
      await Promise.allSettled([
        supabase
          .from('orders')
          .update({
            status: nextStatus,
            order_status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId),
        supabase
          .from('orders_v2')
          .update({
            current_status: nextStatus.toUpperCase(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
      ]);
    } catch (e) {
      console.error('[KDS Dashboard] Status update error:', e);
    }
  };

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return activeOrders.filter((order) => {
      const s = order.order_status.toLowerCase();
      if (activeTab === 'all') return s !== 'completed' && s !== 'cancelled';
      if (activeTab === 'pending') return s === 'pending' || s === 'accepted';
      if (activeTab === 'preparing') return s === 'preparing';
      if (activeTab === 'ready') return s === 'ready';
      return true;
    });
  }, [activeOrders, activeTab]);

  // Metrics
  const pendingCount = activeOrders.filter((o) => ['pending', 'accepted'].includes(o.order_status.toLowerCase())).length;
  const preparingCount = activeOrders.filter((o) => o.order_status.toLowerCase() === 'preparing').length;
  const readyCount = activeOrders.filter((o) => o.order_status.toLowerCase() === 'ready').length;

  return (
    <div className="min-h-screen bg-[#121214] text-stone-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="px-6 py-4 bg-[#1a1a1e] border-b border-stone-800 flex items-center justify-between sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-lg shadow-sm">
            🍳
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white">{storeName}</h1>
            <span className="text-xs text-stone-400 font-mono">KDS • ID: {merchantId.slice(0, 8)}</span>
          </div>
        </div>

        {/* Realtime Status Indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Live Stream Connected</span>
          </div>
        </div>
      </header>

      {/* Metrics & Filter Tabs */}
      <div className="px-6 py-3 bg-[#161619] border-b border-stone-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'all'
                ? 'bg-stone-100 text-stone-900 shadow-sm'
                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'
            }`}
          >
            All Active ({pendingCount + preparingCount + readyCount})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'pending'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'
            }`}
          >
            New Orders ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab('preparing')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'preparing'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'
            }`}
          >
            Cooking ({preparingCount})
          </button>
          <button
            onClick={() => setActiveTab('ready')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'ready'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'
            }`}
          >
            Ready for Pickup ({readyCount})
          </button>
        </div>
      </div>

      {/* Main Ticket Grid */}
      <main className="flex-1 p-6 overflow-x-auto">
        {filteredOrders.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center text-stone-500">
            <span className="text-4xl mb-3">👨‍🍳</span>
            <h3 className="text-base font-bold text-stone-400">All caught up!</h3>
            <p className="text-xs text-stone-600 mt-1">No pending orders on the kitchen display board.</p>
          </div>
        ) : (
          <div className="flex items-start gap-4 pb-4">
            {filteredOrders.map((order) => {
              const elapsedSecs = Math.max(
                0,
                Math.floor((currentTime - new Date(order.created_at).getTime()) / 1000)
              );
              const mins = Math.floor(elapsedSecs / 60);
              const secs = elapsedSecs % 60;
              const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

              const s = order.order_status.toLowerCase();
              const isReady = s === 'ready';
              const isPreparing = s === 'preparing';

              let cardBg = 'bg-[#18181b] border-stone-800';
              let headerBg = 'bg-[#222226] text-white';
              let statusLabel = 'NEW ORDER';

              if (isReady) {
                cardBg = 'bg-[#0e2117] border-emerald-600/50 shadow-lg shadow-emerald-950/20';
                headerBg = 'bg-emerald-600 text-white';
                statusLabel = 'READY FOR PICKUP';
              } else if (isPreparing) {
                cardBg = 'bg-[#211706] border-amber-500/50 shadow-lg shadow-amber-950/20';
                headerBg = 'bg-amber-600 text-white';
                statusLabel = 'COOKING';
              } else if (mins >= 15) {
                cardBg = 'bg-[#260e0e] border-rose-600/60 shadow-lg shadow-rose-950/20';
                headerBg = 'bg-rose-700 text-white';
                statusLabel = 'RUSH / OVERDUE';
              }

              return (
                <div
                  key={order.id}
                  className={`w-80 shrink-0 rounded-2xl border ${cardBg} flex flex-col overflow-hidden shadow-xl transition-all`}
                >
                  {/* Ticket Header */}
                  <div className={`p-3.5 ${headerBg} flex items-center justify-between`}>
                    <div>
                      <span className="text-2xl font-black">{order.display_id}</span>
                      <span className="block text-[10px] uppercase tracking-wider font-extrabold opacity-80 mt-0.5">
                        {statusLabel}
                      </span>
                    </div>
                    <div className="text-right font-mono text-xs font-black">
                      ⏱ {timeFormatted}
                    </div>
                  </div>

                  {/* Line Items List */}
                  <div className="p-4 flex-1 space-y-3 max-h-80 overflow-y-auto divide-y divide-stone-800/60">
                    {(order.items || []).map((item, idx) => (
                      <div key={item.id || idx} className="pt-2.5 first:pt-0">
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-black text-orange-400 min-w-[20px]">
                            {item.quantity}x
                          </span>
                          <div className="flex-1">
                            <span className="text-sm font-bold text-stone-200 block leading-snug">
                              {item.item_name}
                            </span>

                            {/* Modifiers List (Sugar, Add-ons, etc.) */}
                            {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {item.selected_modifiers.map((mod, mIdx) => (
                                  <span
                                    key={mIdx}
                                    className="inline-block text-[11px] font-medium text-stone-400 bg-stone-800/80 px-2 py-0.5 rounded mr-1 mb-1"
                                  >
                                    • {mod.option_name}
                                    {mod.additional_price > 0 && ` (+RM ${mod.additional_price.toFixed(2)})`}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Special Instructions Note */}
                            {item.special_instructions && (
                              <p className="text-[11px] text-amber-300 italic mt-1 bg-amber-950/30 p-1.5 rounded border border-amber-900/40">
                                "{item.special_instructions}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ticket Footer Action Buttons */}
                  <div className="p-3 bg-[#131316] border-t border-stone-800/80 flex items-center gap-2">
                    {isReady ? (
                      <button
                        onClick={() => handleAdvanceStatus(order.id, 'completed')}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>✓</span>
                        <span>Complete / Handoff</span>
                      </button>
                    ) : isPreparing ? (
                      <button
                        onClick={() => handleAdvanceStatus(order.id, 'ready')}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>🔔</span>
                        <span>Ready for Pickup</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAdvanceStatus(order.id, 'preparing')}
                        className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>👨‍🍳</span>
                        <span>Accept & Prepare</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
