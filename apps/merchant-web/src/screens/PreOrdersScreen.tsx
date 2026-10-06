import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore, KDSOrder, KDSOrderItem } from '../stores/useMerchantKDSStore';
import { mapDbOrderToKDSOrder } from '../lib/orderMapper';
import { ShoppingBag, CalendarDays, CheckCircle2, Search, Clock, ArrowRight } from 'lucide-react';

const isToday = (date: Date) => {
  const today = new Date();
  return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
};

const isTomorrow = (date: Date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth() && date.getFullYear() === tomorrow.getFullYear();
};

const isPast = (date: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export const PreOrdersScreen: React.FC = () => {
  const { merchantId, updateStatus } = useMerchantKDSStore();
  const [preOrders, setPreOrders] = useState<KDSOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPreOrders = async () => {
    if (!merchantId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
        .eq('merchant_id', merchantId)
        .eq('is_preorder', true)
        .neq('status', 'pending_payment')
        .order('scheduled_pickup_date', { ascending: true });

      if (error) {
        console.error('Error fetching pre-orders:', error);
      } else {
        setPreOrders((data || []).map(mapDbOrderToKDSOrder));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPreOrders();
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId) return;

    const channelName = `tapau-ahead-sync-${merchantId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          // If the order is a pre-order (or was updated to be), we refresh the list
          // For simplicity and to ensure we get all relations, we trigger a refetch
          if (payload.new && (payload.new as any).is_preorder === true) {
            console.log('[PreOrdersScreen] Pre-order change detected, refreshing list...');
            fetchPreOrders();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId]);

  // Aggregate items by date
  // A grouped view: Date -> Orders
  const groupedOrders = useMemo(() => {
    const groups: Record<string, KDSOrder[]> = {};
    preOrders.forEach(order => {
      const dateKey = order.scheduledPickupDate ? order.scheduledPickupDate.split('T')[0] : 'Unknown Date';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(order);
    });
    return groups;
  }, [preOrders]);

  // Aggregate production ledger per date
  const getProductionLedger = (orders: KDSOrder[]) => {
    const ledger: Record<string, number> = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        const key = item.name + (item.modifiers && item.modifiers.length > 0 ? ` (${item.modifiers.map(m => m.option_name).join(', ')})` : '');
        ledger[key] = (ledger[key] || 0) + item.quantity;
      });
    });
    return Object.entries(ledger).sort((a, b) => b[1] - a[1]);
  };

  const handleStatusChange = async (orderId: string, nextStatus: string) => {
    // Optimistic UI update
    setPreOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus as any } : o));
    updateStatus(orderId, nextStatus as any);
    
    await supabase
      .from('orders')
      .update({ status: nextStatus, order_status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);
  };

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-7xl mx-auto select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <ShoppingBag className="w-8 h-8 text-orange-500" />
            Tapau Ahead
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Production ledger and upcoming pre-scheduled orders
          </p>
        </div>
        <button onClick={fetchPreOrders} className="bg-stone-800 hover:bg-stone-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors border border-stone-700 cursor-pointer">
          Refresh List
        </button>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-stone-800 rounded-3xl text-stone-400">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-sm font-bold">Loading Tapau Ahead...</span>
        </div>
      ) : Object.keys(groupedOrders).length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-stone-800 rounded-3xl text-stone-500 text-sm font-bold">
          <CalendarDays className="w-10 h-10 mb-2 text-stone-600" />
          No upcoming Tapau Ahead orders.
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(groupedOrders).map(([dateStr, dateOrders]) => {
            const dateObj = new Date(dateStr);
            const dateLabel = isToday(dateObj) ? 'TODAY' : isTomorrow(dateObj) ? 'TOMORROW' : formatDate(dateObj);
            const isPastDate = isPast(dateObj) && !isToday(dateObj);
            const ledger = getProductionLedger(dateOrders);
            
            return (
              <div key={dateStr} className={`space-y-4 ${isPastDate ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className="h-0.5 flex-1 bg-stone-800" />
                  <h2 className={`text-lg sm:text-xl font-black ${isToday(dateObj) ? 'text-orange-400' : 'text-stone-300'} uppercase tracking-widest flex items-center gap-2`}>
                    <CalendarDays className="w-5 h-5" />
                    {dateLabel} <span className="text-sm font-medium text-stone-500 ml-2">({dateStr})</span>
                  </h2>
                  <div className="h-0.5 flex-1 bg-stone-800" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Production Ledger Column */}
                  <div className="lg:col-span-1 bg-stone-900/50 border border-stone-800 rounded-3xl p-5 shadow-lg flex flex-col max-h-[500px]">
                    <h3 className="text-sm font-black text-stone-200 uppercase tracking-wider mb-4 pb-3 border-b border-stone-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Production Ledger
                    </h3>
                    <div className="overflow-y-auto space-y-2 pr-2">
                      {ledger.map(([itemName, qty]) => (
                        <div key={itemName} className="flex justify-between items-center bg-stone-800/40 p-2.5 rounded-xl border border-stone-700/50">
                          <span className="text-sm text-stone-300 font-medium truncate pr-3">{itemName}</span>
                          <span className="bg-stone-700/80 text-white font-black px-2.5 py-1 rounded-lg text-sm shrink-0">x {qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Tickets Column */}
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {dateOrders.map(order => (
                      <div key={order.id} className="bg-[#201d1b] rounded-3xl p-5 border border-stone-800 hover:border-stone-700 transition-colors shadow-lg flex flex-col">
                        <div className="flex justify-between items-start pb-3 border-b border-stone-800 mb-3">
                          <div>
                            <div className="font-bold text-white text-base truncate pr-2">{order.customerName || 'Customer'}</div>
                            <div className="text-xs text-stone-400 font-mono mt-0.5">{order.orderNumber} • {order.customerPhone || 'No Phone'}</div>
                            {order.scheduledPickupTime && (
                              <div className="flex items-center gap-1.5 mt-1.5 text-orange-400 text-xs font-bold bg-orange-500/10 w-fit px-2 py-1 rounded-lg">
                                <Clock className="w-3.5 h-3.5" />
                                {order.scheduledPickupTime}
                              </div>
                            )}
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg tracking-wider ${
                            order.status === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                            order.status === 'preparing' ? 'bg-blue-500/20 text-blue-400' :
                            order.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                            order.status === 'completed' ? 'bg-stone-800 text-stone-400' :
                            'bg-stone-800 text-stone-400'
                          }`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>
                        
                        <div className="flex-1 space-y-2 mb-4">
                          {order.items.map(item => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <span className="text-stone-300 font-medium truncate pr-2">{item.name} {item.modifiers && item.modifiers.length > 0 ? `(${item.modifiers.map(m => m.option_name).join(', ')})` : ''}</span>
                              <span className="text-stone-400 font-black shrink-0">x {item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        {/* Actions */}
                        {order.status !== 'completed' && order.status !== 'cancelled' && (
                          <div className="pt-3 border-t border-stone-800 mt-auto flex flex-col gap-2">
                             {order.status === 'pending' && (
                                <button onClick={() => handleStatusChange(order.id, 'preparing')} className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer">
                                  Mark as Preparing
                                </button>
                             )}
                             {order.status === 'preparing' && (
                                <button onClick={() => handleStatusChange(order.id, 'ready')} className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs rounded-xl transition-colors cursor-pointer">
                                  Mark as Ready for Pickup
                                </button>
                             )}
                             {order.status === 'ready' && (
                                <button onClick={() => handleStatusChange(order.id, 'completed')} className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl transition-colors cursor-pointer">
                                  Complete & Clear
                                </button>
                             )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
