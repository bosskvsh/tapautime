import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Activity,
  Search,
  RefreshCw,
  ShoppingBag,
  UtensilsCrossed,
  CreditCard,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Check,
} from 'lucide-react';

interface PlatformOrder {
  id: string;
  display_id?: string | number;
  merchant_id: string;
  order_status: string;
  status?: string;
  payment_status: string;
  payment_method?: string;
  order_type?: string;
  table_number?: string | number;
  total_amount: number;
  platform_fee?: number;
  platform_cut?: number;
  merchant_cut?: number;
  created_at: string;
}

export const OrdersScreen: React.FC = () => {
  const [orders, setOrders] = useState<PlatformOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'takeaway' | 'dine_in'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (typeFilter === 'takeaway') {
        query = query.or('order_type.eq.takeaway,order_type.is.null');
      } else if (typeFilter === 'dine_in') {
        query = query.eq('order_type', 'dine_in');
      }

      if (statusFilter !== 'all') {
        query = query.eq('order_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('[OrdersScreen] Error loading live orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Subscribe to realtime changes on orders
    const channel = supabase
      .channel('admin_live_orders_stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [typeFilter, statusFilter]);

  const handleOverrideStatus = async (
    orderId: string,
    newStatus: 'completed' | 'cancelled'
  ) => {
    setActionLoading(orderId);
    setActionMessage(null);
    try {
      // Defensively sync payment status on manual overrides:
      // If completed on a cash or pending_cash order, mark paid. If cancelled and uncaptured, mark failed.
      const currentOrder = orders.find((o) => o.id === orderId);
      const updatePayload: Record<string, any> = {
        order_status: newStatus,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // If admin cancels a captured/paid order, invoke the refund-order Edge Function to issue gateway refund
      if (
        newStatus === 'cancelled' &&
        currentOrder &&
        (currentOrder.payment_status === 'captured' || currentOrder.payment_status === 'paid')
      ) {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) throw new Error('No admin access token found');

        const { data: refundResult, error: refundError } = await supabase.functions.invoke('refund-order', {
          body: { order_id: orderId },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (refundError || !refundResult?.success) {
          throw new Error(refundError?.message || refundResult?.error || 'Failed to process refund with gateway');
        }

        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  order_status: 'cancelled',
                  status: 'cancelled',
                  payment_status: 'refunded',
                }
              : o
          )
        );

        setActionMessage(
          `Order #${String(currentOrder.display_id || orderId.slice(0, 6)).toUpperCase()} successfully cancelled and refunded via payment gateway.`
        );
        return;
      }

      if (
        newStatus === 'completed' &&
        currentOrder &&
        (currentOrder.payment_status === 'pending_cash' || currentOrder.payment_method === 'cash') &&
        currentOrder.payment_status !== 'captured'
      ) {
        updatePayload.payment_status = 'paid';
      } else if (
        newStatus === 'cancelled' &&
        currentOrder &&
        currentOrder.payment_status !== 'captured' &&
        currentOrder.payment_status !== 'paid'
      ) {
        updatePayload.payment_status = 'failed';
      }

      // 1. Update orders table
      const { data: updatedOrder, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select('id, display_id, payment_status')
        .single();

      if (error) throw error;

      // 2. Dual-update orders_v2 for Merchant KDS realtime synchronization
      const v2TargetStatus = newStatus === 'completed' ? 'COMPLETED' : 'CANCELLED';
      if (updatedOrder?.display_id) {
        try {
          const { data: v2Order } = await supabase
            .from('orders_v2')
            .update({
              current_status: v2TargetStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('display_id', updatedOrder.display_id)
            .select('id')
            .maybeSingle();

          // 3. Emit audit event to order_events
          if (v2Order?.id) {
            await supabase.from('order_events').insert({
              order_id: v2Order.id,
              event_type: 'ADMIN_OVERRIDE',
              target_status: newStatus,
              actor_role: 'ADMIN',
              payload: {
                previous_status: 'override',
                new_status: newStatus,
                timestamp: new Date().toISOString(),
              },
            });
          }
        } catch (v2Err) {
          console.warn('[OrdersScreen] Dual-update to orders_v2 notice:', v2Err);
        }
      }

      // Optimistic update in UI
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                order_status: newStatus,
                status: newStatus,
                ...(updatePayload.payment_status ? { payment_status: updatePayload.payment_status } : {}),
              }
            : o
        )
      );

      setActionMessage(
        `Order #${orderId.slice(0, 6).toUpperCase()} status successfully updated to ${newStatus.toUpperCase()}.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update order status';
      console.error('[OrdersScreen] Status override failed:', err);
      setActionMessage(`Error: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = orders.filter((o) => {
    const q = searchQuery.toLowerCase();
    const disp = (o.display_id || o.id.slice(0, 6)).toString().toLowerCase();
    return (
      disp.includes(q) ||
      o.id.toLowerCase().includes(q) ||
      (o.table_number && o.table_number.toString().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
            Completed
          </span>
        );
      case 'ready':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-950/80 text-sky-400 border border-sky-800/80">
            Ready
          </span>
        );
      case 'preparing':
      case 'accepted':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-950/80 text-amber-400 border border-amber-800/80 animate-pulse">
            Cooking
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-950/80 text-rose-400 border border-rose-800/80">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-stone-800 text-stone-300 border border-stone-700">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  const getPaymentBadge = (paymentStatus: string, paymentMethod?: string) => {
    const normStatus = paymentStatus?.toLowerCase() || '';
    const isPaid = normStatus === 'paid' || normStatus === 'captured';
    const isRefunded = normStatus === 'refunded';
    const isFailed = normStatus === 'failed';
    const isPendingCash = normStatus === 'pending_cash';
    const isCash = paymentMethod?.toLowerCase() === 'cash' || isPendingCash;

    let statusLabel = 'Unpaid';
    let statusClass = 'text-amber-400';

    if (isPaid) {
      statusLabel = 'Paid';
      statusClass = 'text-emerald-400';
    } else if (isRefunded) {
      statusLabel = 'Refunded';
      statusClass = 'text-purple-400';
    } else if (isFailed) {
      statusLabel = 'Failed';
      statusClass = 'text-rose-400';
    } else if (isPendingCash) {
      statusLabel = 'Pay at Counter';
      statusClass = 'text-amber-400';
    }

    return (
      <div className="flex items-center gap-1.5">
        {isCash ? (
          <span className="p-1 rounded-md bg-stone-800 text-stone-300" title="Cash Payment">
            <Banknote className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span className="p-1 rounded-md bg-stone-800 text-stone-300" title="Gateway / Card Payment">
            <CreditCard className="w-3.5 h-3.5" />
          </span>
        )}
        <span
          className={`text-[11px] font-bold ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-orange-500" />
            <span>Live Order Stream</span>
          </h1>
          <p className="text-xs text-stone-400 mt-1 font-medium">
            Bi-directional monitor of customer tickets across all kopitiam hawker stations.
          </p>
        </div>

        <button
          onClick={fetchOrders}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 bg-[#181615] hover:bg-stone-800 border border-stone-800 rounded-xl text-xs font-bold text-stone-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Orders</span>
        </button>
      </div>

      {/* Action Toast Feedback */}
      {actionMessage && (
        <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800 text-xs text-stone-200 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-stone-500 hover:text-white text-xs font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket # or table number..."
            className="w-full bg-[#1c1917] border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Order Type Toggle */}
          <div className="flex items-center bg-[#1c1917] p-1 rounded-xl border border-stone-800 text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                typeFilter === 'all' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('takeaway')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                typeFilter === 'takeaway' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
              }`}
            >
              🥡 Tapau
            </button>
            <button
              onClick={() => setTypeFilter('dine_in')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                typeFilter === 'dine_in' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
              }`}
            >
              🍽️ Dine-in
            </button>
          </div>

          {/* Kitchen Status Select */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#1c1917] border border-stone-800 text-stone-300 text-xs rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Kitchen Statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="preparing">Cooking</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Stream Table */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-800 text-[10px] uppercase tracking-widest text-stone-400 bg-[#181615]">
                <th className="py-3.5 px-6 font-bold">Ticket #</th>
                <th className="py-3.5 px-6 font-bold">Order Type & Table</th>
                <th className="py-3.5 px-6 font-bold">Total Amount</th>
                <th className="py-3.5 px-6 font-bold">5% Platform Split</th>
                <th className="py-3.5 px-6 font-bold">Payment</th>
                <th className="py-3.5 px-6 font-bold">Kitchen Status</th>
                <th className="py-3.5 px-6 font-bold text-center">Time</th>
                <th className="py-3.5 px-6 font-bold text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-stone-500 font-medium">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                    Connecting to live Supabase order stream...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-stone-500 font-medium">
                    No orders match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const isDineIn = order.order_type === 'dine_in';
                  const st = (order.order_status || order.status || '').toLowerCase();
                  const isFinalized = st === 'completed' || st === 'cancelled';

                  return (
                    <tr key={order.id} className="hover:bg-stone-900/40 transition-colors">
                      {/* Ticket # */}
                      <td className="py-4 px-6 font-mono font-black text-white text-sm">
                        {order.display_id
                          ? (String(order.display_id).startsWith('#') ? String(order.display_id) : `#${order.display_id}`)
                          : `#${order.id.slice(0, 6).toUpperCase()}`}
                      </td>

                      {/* Type & Table */}
                      <td className="py-4 px-6">
                        {isDineIn ? (
                          <div className="flex items-center gap-1.5">
                            <span className="p-1 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                              <UtensilsCrossed className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <span className="font-bold text-emerald-400 text-xs">
                                Table {order.table_number || 'N/A'}
                              </span>
                              <div className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">
                                Dine-In
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="p-1 rounded-md bg-orange-950 text-orange-400 border border-orange-800/80">
                              <ShoppingBag className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <span className="font-bold text-orange-400 text-xs">Tapau</span>
                              <div className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">
                                Takeaway
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Total Amount */}
                      <td className="py-4 px-6 font-mono font-bold text-white text-sm">
                        RM {Number(order.total_amount).toFixed(2)}
                      </td>

                      {/* Platform Cut */}
                      <td className="py-4 px-6 font-mono text-emerald-400 font-semibold">
                        RM {Number(order.platform_fee ?? order.platform_cut ?? (order.total_amount * 0.05)).toFixed(2)}
                      </td>

                      {/* Payment */}
                      <td className="py-4 px-6">
                        {getPaymentBadge(order.payment_status, order.payment_method)}
                      </td>

                      {/* Kitchen Status */}
                      <td className="py-4 px-6">{getStatusBadge(order.order_status || order.status || '')}</td>

                      {/* Time */}
                      <td className="py-4 px-6 text-center font-mono text-[11px] text-stone-400">
                        {new Date(order.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Admin Actions */}
                      <td className="py-4 px-6 text-right">
                        {isFinalized ? (
                          <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                            Settled
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOverrideStatus(order.id, 'completed')}
                              disabled={actionLoading === order.id}
                              title="Force complete order"
                              className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Complete</span>
                            </button>
                            <button
                              onClick={() => handleOverrideStatus(order.id, 'cancelled')}
                              disabled={actionLoading === order.id}
                              title="Force cancel order"
                              className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
