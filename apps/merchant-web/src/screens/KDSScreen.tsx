import React, { useState, useEffect } from 'react';
import { SwipeToConfirm } from '@tapautime/shared-ui';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore, KDSOrder, KDSOrderItem, KDSModifierItem, KDSStatus, KDSPaymentStatus } from '../stores/useMerchantKDSStore';
import { mapDbOrderToKDSOrder } from '../lib/orderMapper';
import {
  Utensils,
  ShoppingBag,
  Search,
  Banknote,
  Flame,
  CheckCircle2,
  CheckCheck,
  UtensilsCrossed,
  X,
  AlertTriangle,
  Clock,
  ArrowRight,
  TicketPercent,
  User,
  Phone,
} from 'lucide-react';

export const KDSScreen: React.FC = () => {
  const {
    orders,
    activeFilter,
    setActiveFilter,
    updateStatus,
    updatePaymentStatus,
    updateEstimatedPrepMinutes,
    addOrder,
    setOrders,
    merchantId,
    setMerchantId,
    merchantName,
    setMerchantName,
  } = useMerchantKDSStore();

  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(() => orders.length === 0);
  const [collectingCashIds, setCollectingCashIds] = useState<Record<string, boolean>>({});

  // Selected order for the full-screen anti-fraud receipt verification modal
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<KDSOrder | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Close receipt inspection modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedReceiptOrder) {
        setSelectedReceiptOrder(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedReceiptOrder]);

  // Filter tabs
  const filterTabs: Array<{ key: 'all' | 'new' | 'preparing' | 'ready'; label: string }> = [
    { key: 'all', label: 'All Orders' },
    { key: 'new', label: 'New & Pending' },
    { key: 'preparing', label: 'In Kitchen' },
    { key: 'ready', label: 'Ready for Pickup' },
  ];

  // 1. Three-Step Cascade: Session -> Merchant Profile -> Orders Initial Fetch
  useEffect(() => {
    let isMounted = true;

    const initializeKDS = async () => {
      setIsLoadingOrders(true);
      try {
        // Step 1: Fetch the active session
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (!session?.user?.id) {
          if (isMounted) setIsLoadingOrders(false);
          return;
        }

        // Step 2: Fetch the merchant profile by owner_id
        const { data: merchant, error: merchantErr } = await supabase
          .from('merchants')
          .select('id, business_name')
          .eq('owner_id', session.user.id)
          .maybeSingle();

        if (merchantErr) {
          console.error('[KDSScreen] Failed to resolve merchant profile:', merchantErr);
        }

        if (!merchant?.id) {
          if (isMounted) setIsLoadingOrders(false);
          return;
        }

        if (isMounted) {
          setMerchantId(merchant.id);
          if (merchant.business_name) {
            setMerchantName(merchant.business_name);
          }
          localStorage.setItem('tapautime_merchant_id', merchant.id);
        }

        // Step 3: ONLY after getting that merchants.id, fetch the orders
        // Only show orders that are cash OR have confirmed captured payment, strictly excluding pending_payment
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
          .eq('merchant_id', merchant.id)
          .or('payment_method.eq.cash,payment_status.eq.captured')
          .neq('status', 'pending_payment')
          .order('created_at', { ascending: false });

        let finalOrdersData = ordersData;
        if (ordersErr) {
          console.warn('[KDSScreen] Relational select failed, falling back to select("*"):', ordersErr);
          const { data: simpleOrders, error: simpleErr } = await supabase
            .from('orders')
            .select('*')
            .eq('merchant_id', merchant.id)
            .or('payment_method.eq.cash,payment_status.eq.captured')
            .neq('status', 'pending_payment')
            .order('created_at', { ascending: false });

          if (simpleErr) {
            console.error('[KDSScreen] Failed to fetch orders with select("*"):', simpleErr);
          } else {
            finalOrdersData = simpleOrders;
          }
        }

        let mappedOrders = (finalOrdersData || []).map(mapDbOrderToKDSOrder);
        
        // Hydrate customer arrived status since order_events cannot be joined directly
        const orderIds = mappedOrders.map(o => o.id);
        if (orderIds.length > 0) {
          const { data: eventsData } = await supabase
            .from('order_events')
            .select('order_id')
            .eq('event_type', 'CUSTOMER_ARRIVED')
            .in('order_id', orderIds);
          
          if (eventsData && eventsData.length > 0) {
            const arrivedOrderIds = new Set(eventsData.map(e => e.order_id));
            mappedOrders = mappedOrders.map(o => {
              if (arrivedOrderIds.has(o.id)) {
                return { ...o, customerArrived: true };
              }
              return o;
            });
          }
        }

        if (isMounted) {
          setOrders(mappedOrders);
          setIsLoadingOrders(false);
        }
      } catch (err) {
        console.error('[KDSScreen] Cascade initialization error:', err);
        if (isMounted) setIsLoadingOrders(false);
      }
    };

    initializeKDS();

    return () => {
      isMounted = false;
    };
  }, [setMerchantId, setMerchantName, setOrders]);

  // Check if any order requires immediate merchant attention
  const pendingOrdersCount = orders.filter((o) => {
    if (o.isPreorder) return false;
    if (o.status === 'pending_payment') return false;
    const isOnlineOrGateway = o.paymentMethod === 'gateway' || o.paymentMethod === 'online';
    if (isOnlineOrGateway && o.paymentStatus !== 'captured' && o.paymentStatus !== 'paid') {
      return false;
    }
    return (
      o.status === 'pending' ||
      o.status === 'verification_pending' ||
      (o.status === 'accepted' && (o.paymentStatus === 'captured' || o.paymentStatus === 'paid'))
    );
  }).length;


  const filteredOrders = orders.filter((order) => {
    // Exclude pre-orders from the live KDS feed
    if (order.isPreorder) return false;

    // Strictly exclude any pending_payment or uncaptured online/gateway orders from the kitchen display
    if (order.status === 'pending_payment') return false;
    const isOnlineOrGateway = order.paymentMethod === 'gateway' || order.paymentMethod === 'online';
    if (isOnlineOrGateway && order.paymentStatus !== 'captured' && order.paymentStatus !== 'paid') {
      return false;
    }

    if (activeFilter === 'all') return true;
    if (activeFilter === 'new') {
      return (
        order.status === 'pending' ||
        order.status === 'verification_pending' ||
        (order.status === 'accepted' && (order.paymentStatus === 'captured' || order.paymentStatus === 'paid'))
      );
    }
    if (activeFilter === 'preparing') {
      return order.status === 'preparing' || order.status === 'accepted';
    }
    if (activeFilter === 'ready') {
      return order.status === 'ready';
    }
    return true;
  });

  // Handlers for status updates (updating zustand and syncing with Supabase)
  const handleStatusChange = async (orderId: string, nextStatus: KDSStatus, extraFields: Record<string, any> = {}) => {
    updateStatus(orderId, nextStatus);

    const targetOrder = orders.find((o) => o.id === orderId);
    const orderNumber = targetOrder?.orderNumber;
    const nowIso = new Date().toISOString();

    try {
      // 1. Primary update on orders table (V3 Schema)
      const { error: ordersErr } = await supabase
        .from('orders')
        .update({
          status: nextStatus,
          order_status: nextStatus,
          updated_at: nowIso,
          ...extraFields,
        })
        .eq('id', orderId);

      if (ordersErr) {
        console.error(`[KDSScreen] Failed to persist status ${nextStatus} for ${orderId}:`, ordersErr);
      }

      // 2. Dual-update on orders_v2 table by display_id to keep current_status synchronized
      if (orderNumber) {
        const upperStatus =
          nextStatus === 'verification_pending' ? 'PENDING' : nextStatus.toUpperCase();

        const { error: v2Err } = await supabase
          .from('orders_v2')
          .update({
            current_status: upperStatus,
            updated_at: nowIso,
          })
          .eq('display_id', orderNumber);

        if (v2Err) {
          console.warn(`[KDSScreen] Failed to update orders_v2 status for ${orderNumber}:`, v2Err);
        }
      }
    } catch (err) {
      console.error('[KDSScreen] Supabase update exception:', err);
    }
  };

  // Handlers for the anti-fraud receipt verification
  const handleVerifyReceipt = async (orderId: string) => {
    await handleStatusChange(orderId, 'accepted', { payment_status: 'captured' });
    setSelectedReceiptOrder(null);
  };

  const handleRejectReceipt = async (orderId: string) => {
    await handleStatusChange(orderId, 'cancelled', { payment_status: 'failed' });
    setSelectedReceiptOrder(null);
  };

  const handleCancelAndRefund = async (orderId: string) => {
    setIsCancelling(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No access token');
      
      const { data, error } = await supabase.functions.invoke('refund-order', {
        body: { order_id: orderId },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (error) throw error;
      
      if (data?.success) {
        updateStatus(orderId, 'cancelled');
        if (data.payment_status) {
          updatePaymentStatus(orderId, data.payment_status as KDSPaymentStatus);
        }
      } else {
        throw new Error(data?.error || 'Unknown error during refund');
      }
    } catch (err: any) {
      console.error('[KDSScreen] Refund failed:', err);
      alert(err?.message || 'Failed to cancel and refund the order. Please try again or contact support.');
    } finally {
      setIsCancelling(false);
      setCancellingOrderId(null);
    }
  };

  // Handler to extend prep time by 20 mins
  const handleExtendPrepTime = async (orderId: string, currentMinutes: number = 15) => {
    const newMinutes = currentMinutes + 20;
    
    // 1. Optimistic update
    updateEstimatedPrepMinutes(orderId, newMinutes);

    // 2. Persist to DB
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          estimated_prep_minutes: newMinutes,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) {
        console.error(`[KDSScreen] Failed to extend prep time for ${orderId}:`, error);
        updateEstimatedPrepMinutes(orderId, currentMinutes);
      }
    } catch (err) {
      console.error('[KDSScreen] handleExtendPrepTime exception:', err);
      updateEstimatedPrepMinutes(orderId, currentMinutes);
    }
  };

  // Handler for collecting cash & confirming unpaid cash orders
  const handleCollectCash = async (orderId: string) => {
    if (collectingCashIds[orderId]) return;
    setCollectingCashIds((prev) => ({ ...prev, [orderId]: true }));
    const nowIso = new Date().toISOString();

    try {
      // 1. Optimistic store update to immediately unlock UI
      updatePaymentStatus(orderId, 'paid');

      // 2. Persist to Supabase orders table
      const { error: ordersErr } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          updated_at: nowIso,
        })
        .eq('id', orderId);

      if (ordersErr) {
        console.error(`[KDSScreen] Failed to persist paid cash status for ${orderId}:`, ordersErr);
        // Revert optimistic update on database failure
        updatePaymentStatus(orderId, 'pending_cash');
      } else {
        console.log(`[KDSScreen] Cash collected and confirmed for order: ${orderId}`);
      }
    } catch (err) {
      console.error('[KDSScreen] handleCollectCash exception:', err);
      updatePaymentStatus(orderId, 'pending_cash');
    } finally {
      setCollectingCashIds((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto select-none">

      {/* Top Header & Real-time Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Kitchen Display System (KDS)
            </h1>
            {merchantName && (
              <span className="px-2.5 py-0.5 rounded-full bg-orange-600/15 text-orange-400 border border-orange-500/30 text-[11px] font-mono font-bold">
                {merchantName}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Realtime order stream, anti-fraud payment audit & fulfillment pipeline
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => {
          const count =
            tab.key === 'new'
              ? orders.filter(
                  (o) => o.status === 'pending' || o.status === 'verification_pending'
                ).length
              : tab.key === 'preparing'
              ? orders.filter(
                  (o) => o.status === 'preparing' || o.status === 'accepted'
                ).length
              : tab.key === 'ready'
              ? orders.filter((o) => o.status === 'ready').length
              : orders.length;

          const isActive = activeFilter === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/25'
                  : 'bg-stone-900/90 text-stone-400 hover:text-white border border-stone-800/80 hover:border-stone-700'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-lg font-mono font-bold ${
                  isActive
                    ? 'bg-orange-700/80 text-white'
                    : 'bg-stone-800 text-stone-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Grid or Loading State */}
      {isLoadingOrders ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-stone-800 rounded-3xl text-stone-400 space-y-3">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold">Connecting to Supabase Realtime orders...</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-stone-800 rounded-3xl text-stone-500 text-sm font-bold">
          <UtensilsCrossed className="w-10 h-10 mb-2 text-stone-600" />
          No orders in this column right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const isManualTransfer = order.paymentMethod === 'manual_transfer';
            const isVerificationPending = order.status === 'verification_pending';
            const isReady = order.status === 'ready';
            const isPendingCash = order.paymentStatus === 'pending_cash';

            return (
              <div
                key={order.id}
                className={`bg-[#201d1b] rounded-3xl p-5 border-2 shadow-2xl flex flex-col justify-between transition-all duration-200 ${
                  isPendingCash
                    ? 'border-amber-400 bg-amber-950/25 ring-2 ring-amber-400/40 shadow-amber-950/50'
                    : isVerificationPending
                    ? 'border-amber-400 bg-[#201d1b] ring-2 ring-amber-400/30 shadow-amber-950/40'
                    : isReady
                    ? 'border-emerald-400 bg-emerald-950/20 ring-2 ring-emerald-400/30 shadow-emerald-950/40'
                    : order.status === 'pending'
                    ? 'border-orange-500 bg-orange-950/30 ring-2 ring-orange-500/40 animate-pulse shadow-orange-950/50'
                    : order.status === 'preparing' || order.status === 'accepted'
                    ? 'border-sky-400 bg-sky-950/20 ring-2 ring-sky-400/30 shadow-sky-950/40'
                    : 'border-white/35 hover:border-white/60 bg-[#201d1b] shadow-xl hover:shadow-2xl'
                }`}
              >
                {/* Order Details */}
                <div className="space-y-4">
                  <div className="flex justify-between items-start pb-4 border-b border-white/15 gap-3">
                    {/* Left: Avatar/Badge + Name & Order Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Big Square Badge for Table/Tapau */}
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 font-black tracking-wider shadow-inner text-[10px] ${
                        order.orderType === 'dine_in' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      }`}>
                        {order.orderType === 'dine_in' ? 'DINE-IN' : 'TAPAU'}
                      </div>
                      
                      {/* Name and Order Info */}
                      <div className="flex flex-col min-w-0">
                        {/* Customer Name */}
                        <div className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                          <span className="truncate">{order.customerName || 'Customer'}</span>
                          {order.customerArrived && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px] uppercase tracking-wider font-black animate-pulse whitespace-nowrap shadow-sm shadow-emerald-500/30">
                              WAITING AT COUNTER
                            </span>
                          )}
                        </div>
                        {/* Phone Number */}
                        {order.customerPhone && (
                          <div className="text-[11px] text-emerald-300 font-mono mt-0.5">
                            HP {order.customerPhone}
                          </div>
                        )}
                        {/* Order Number / Type */}
                        <div className="text-[11px] text-stone-400 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{order.orderNumber}</span>
                          <span className="text-stone-600">/</span>
                          <span>{order.orderType === 'dine_in' ? `TABLE ${order.tableNumber || '-'}` : 'TAPAU'}</span>
                        </div>
                        {/* Estimated Prep Time */}
                        <div className="text-[11px] text-orange-300 font-mono mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{order.estimatedPrepMinutes || 15} mins prep</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Status Badge */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl border shrink-0 tracking-wider font-mono flex items-center gap-1.5 ${
                          isPendingCash
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                            : isVerificationPending
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : order.status === 'pending'
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                            : order.status === 'preparing' || order.status === 'accepted'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                            : isReady
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-stone-800/80 text-stone-300 border-white/20'
                        }`}
                      >
                        {isReady ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Secondary info row (Phone, PIN, Promos etc) */}
                  {(order.pickupPin || isManualTransfer) && (
                    <div className="flex justify-between items-center text-xs pb-3 border-b border-white/10 text-stone-400">
                      <div className="flex items-center gap-2 flex-wrap">
                        {order.pickupPin && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-stone-800/80 text-stone-300 border border-stone-700/60 rounded-lg tracking-wider">
                            PIN {order.pickupPin}
                          </span>
                        )}

                        {isManualTransfer && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg">
                            DuitNow Transfer
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cash Payment Gate: Unpaid Cash Banner */}
                  {isPendingCash && (
                    <div className="bg-amber-500/20 border-2 border-amber-500/70 text-amber-200 px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-xs font-black animate-pulse select-none">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                        <span className="tracking-wide">CASH PAYMENT REQUIRED</span>
                      </span>
                      <span className="bg-amber-500 text-stone-950 px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase">
                        UNPAID
                      </span>
                    </div>
                  )}

                  {/* Anti-Fraud Callout Button for Manual Transfer */}
                  {isManualTransfer && (
                    <button
                      onClick={() => setSelectedReceiptOrder(order)}
                      className="w-full min-h-[4rem] h-16 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 border-2 border-amber-500/50 rounded-2xl p-3 flex items-center justify-between text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                          <Search className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                          <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                            Inspect DuitNow Receipt
                          </div>
                          <div className="text-[11px] text-amber-200/80 font-bold">
                            {isVerificationPending
                              ? 'Tap to open full-screen fraud audit'
                              : 'Receipt verified by kitchen'}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-black text-amber-300 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        <span>VIEW</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  )}

                  {/* Items List */}
                  <div className="space-y-1 text-sm text-stone-200">
                    {order.items.length === 0 ? (
                      <div className="text-xs text-stone-500 italic">No line item details</div>
                    ) : (
                      order.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-1 space-y-1"
                        >
                          {/* Dish Title & Quantity */}
                          <div className="flex items-center justify-between font-bold text-sm text-stone-100">
                            <span className="tracking-tight truncate pr-2">{item.name}</span>
                            <span className="text-stone-300 font-mono font-black text-xs shrink-0">
                              {item.quantity}
                            </span>
                          </div>

                          {/* Modifiers */}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {item.modifiers.map((m, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 text-stone-400 text-[11px] font-semibold select-none"
                                >
                                  <span className="text-stone-500 font-bold leading-none">+</span>
                                  <span className="tracking-wide">{m.option_name}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Special Instructions Kitchen Callout */}
                          {item.special_instructions && (
                            <div className="text-xs bg-rose-950/20 text-rose-300 font-medium px-2 py-1 rounded-md flex items-center gap-1.5 mt-1 select-none">
                              <span className="text-rose-400 font-bold tracking-wider">NOTE:</span>
                              <span className="italic">{item.special_instructions}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Total Amount Row */}
                  <div className="pt-3 mt-3 border-t border-white/10">
                     {order.promoCode && (
                       <div className="text-[11px] text-orange-400 font-mono text-right mb-1.5">
                         promo code: {order.promoCode}{order.discountAmount ? ` (-RM ${order.discountAmount.toFixed(2)})` : ''}
                       </div>
                     )}
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-bold text-stone-100">Total</span>
                       <span className="text-base font-black text-white font-mono">RM {order.totalAmount.toFixed(2)}</span>
                     </div>
                  </div>

                  {/* Pickup PIN / Table Delivery Banner on Ready column */}
                  {isReady && (
                    <div className="pt-2">
                      <div className="bg-stone-950 border border-emerald-500/40 rounded-2xl p-4 text-center space-y-1">
                        <div className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">
                          {order.orderType === 'dine_in'
                            ? 'Deliver Directly to Table'
                            : 'Runner / Customer Pickup PIN'}
                        </div>
                        <div className="text-3xl sm:text-4xl font-black font-mono tracking-wider text-emerald-300 drop-shadow-md">
                          {order.orderType === 'dine_in'
                            ? `TABLE ${order.tableNumber || '-'}`
                            : order.pickupPin || '----'}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {order.orderType === 'dine_in'
                            ? `Ref PIN: ${order.pickupPin || '----'} • Serve to table guests`
                            : 'Verify 4-digit code before handing over food'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons - rendered only when action exists */}
                {(isPendingCash || order.status === 'pending' || order.status === 'accepted' || order.status === 'preparing' || order.status === 'ready') && (
                  <div className="pt-4 mt-4 border-t border-white/15 flex gap-2">
                    {isPendingCash ? (
                      <button
                        onClick={() => handleCollectCash(order.id)}
                        disabled={collectingCashIds[order.id]}
                        className="w-full h-14 min-h-[3.5rem] bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-stone-950 font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Banknote className="w-5 h-5 text-stone-950 shrink-0" />
                        <span>
                          {collectingCashIds[order.id]
                            ? 'Confirming Payment...'
                            : `Collect Cash & Confirm (RM ${order.totalAmount.toFixed(2)})`}
                        </span>
                      </button>
                    ) : (
                      <>
                        {order.status === 'pending' && (
                          <div className="flex flex-col gap-2 w-full">
                            <button
                              onClick={() => handleStatusChange(order.id, 'preparing')}
                              className="w-full h-14 min-h-[3.5rem] bg-orange-600 hover:bg-orange-500 text-white font-black text-sm rounded-2xl shadow-md shadow-orange-600/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>Accept &amp; Start Cooking</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCancellingOrderId(order.id)}
                              className="w-full h-10 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-sm rounded-xl border border-rose-900/30 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>Cancel Order</span>
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {order.status === 'accepted' && (
                          <div className="flex flex-col gap-2 w-full">
                            <button
                              onClick={() => handleStatusChange(order.id, 'preparing')}
                              className="w-full h-14 min-h-[3.5rem] bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl shadow-md shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>Move to Cooking</span>
                              <Flame className="w-4 h-4 text-amber-300" />
                            </button>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleExtendPrepTime(order.id, order.estimatedPrepMinutes || 15)}
                                className="flex-1 h-10 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl border border-stone-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>+20 Mins</span>
                              </button>
                              <button
                                onClick={() => setCancellingOrderId(order.id)}
                                className="flex-1 h-10 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs rounded-xl border border-rose-900/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {order.status === 'preparing' && (
                          <div className="flex flex-col gap-2 w-full">
                            <button
                              onClick={() => handleStatusChange(order.id, 'ready')}
                              className="w-full h-14 min-h-[3.5rem] bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-2xl shadow-md shadow-emerald-600/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>
                                {order.orderType === 'dine_in'
                                  ? `Ready • Serve to Table ${order.tableNumber || ''}`
                                  : 'Mark Ready for Pickup'}
                              </span>
                              {order.orderType === 'dine_in' ? (
                                <Utensils className="w-4 h-4" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleExtendPrepTime(order.id, order.estimatedPrepMinutes || 15)}
                              className="w-full h-10 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl border border-stone-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Delay: Add 20 Mins Prep Time</span>
                            </button>
                          </div>
                        )}

                        {order.status === 'ready' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'completed')}
                            className="w-full h-14 min-h-[3.5rem] bg-stone-800 hover:bg-stone-700 text-stone-200 font-black text-sm rounded-2xl border border-stone-700 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <span>
                              {order.orderType === 'dine_in'
                                ? 'Delivered to Table • Complete'
                                : 'Complete & Clear'}
                            </span>
                            <CheckCheck className="w-4 h-4 text-emerald-400" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Anti-Fraud Full-Screen Receipt Verification Modal */}
      {selectedReceiptOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-950/95 backdrop-blur-xl flex flex-col p-4 sm:p-6 overflow-y-auto"
        >
          <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col justify-between space-y-6">
            {/* Modal Header */}
            <div className="border-b border-stone-800 pb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs uppercase rounded-xl">
                    Anti-Fraud Payment Audit
                  </span>
                  <span className="text-lg font-mono font-black text-white">
                    {selectedReceiptOrder.orderNumber}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                  Inspect DuitNow Transfer Receipt
                </h2>
                <p className="text-xs text-stone-400 font-medium">
                  Compare the bank reference and exact amount with your DuitNow merchant app before accepting.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs font-bold text-stone-400">Payable Amount</div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-orange-400">
                    RM {selectedReceiptOrder.totalAmount.toFixed(2)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedReceiptOrder(null)}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer border border-stone-700 shrink-0"
                  title="Close receipt preview"
                  aria-label="Close receipt inspection modal"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Back</span>
                </button>
              </div>
            </div>

            {/* Receipt Image Display at Maximum Resolution */}
            <div className="flex-1 min-h-[300px] flex items-center justify-center bg-black/80 rounded-3xl border-2 border-stone-800 p-3 overflow-hidden">
              {selectedReceiptOrder.receiptUrl ? (
                <img
                  src={selectedReceiptOrder.receiptUrl}
                  alt={`Receipt for ${selectedReceiptOrder.orderNumber}`}
                  className="max-h-[55vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl"
                />
              ) : (
                <div className="text-center p-8 text-stone-500 font-bold">
                  No image receipt found for this order.
                </div>
              )}
            </div>

            {/* Customer & Transaction Details */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-stone-400 font-bold">Customer</div>
                <div className="text-stone-100 font-black">{selectedReceiptOrder.customerName || 'N/A'}</div>
              </div>
              <div>
                <div className="text-stone-400 font-bold">Phone Number</div>
                <div className="text-stone-100 font-mono font-black">{selectedReceiptOrder.customerPhone || 'N/A'}</div>
              </div>
              <div>
                <div className="text-stone-400 font-bold">Order Time</div>
                <div className="text-stone-100 font-bold">
                  {new Date(selectedReceiptOrder.createdAt).toLocaleTimeString()}
                </div>
              </div>
              <div>
                <div className="text-stone-400 font-bold">Verification Status</div>
                <div className="text-amber-400 font-black uppercase">
                  {selectedReceiptOrder.status.replace('_', ' ')}
                </div>
              </div>
            </div>

            {/* Mandatory Swipe-to-Confirm Controls */}
            <div className="space-y-4 pt-2">
              <div className="text-center text-xs font-black uppercase tracking-wider text-stone-400">
                Mandatory Swipe Action — Accidental Taps Disabled
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Emerald Swipe: Verify & Accept */}
                <SwipeToConfirm
                  variant="emerald"
                  label="SLIDE TO VERIFY & ACCEPT >>"
                  confirmedLabel="PAYMENT VERIFIED"
                  onConfirm={() => handleVerifyReceipt(selectedReceiptOrder.id)}
                  className="h-16 min-h-[4rem]"
                />

                {/* Danger Swipe: Reject Fake Receipt */}
                <SwipeToConfirm
                  variant="danger"
                  label="SLIDE TO REJECT FAKE RECEIPT >>"
                  confirmedLabel="ORDER REJECTED"
                  onConfirm={() => handleRejectReceipt(selectedReceiptOrder.id)}
                  className="h-16 min-h-[4rem]"
                />
              </div>

              {/* Safe Dismiss Link without Swiping */}
              <div className="text-center pt-1 pb-2">
                <button
                  type="button"
                  onClick={() => setSelectedReceiptOrder(null)}
                  className="text-xs font-bold text-stone-400 hover:text-stone-200 transition-colors py-2 px-4 cursor-pointer"
                >
                  ← Return to Kitchen Board (Keep Order Pending)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancellingOrderId && (() => {
        const orderToCancel = orders.find(o => o.id === cancellingOrderId);
        if (!orderToCancel) return null;
        return (
          <div className="fixed inset-0 z-[60] bg-stone-950/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
              <div className="space-y-2 text-center">
                <div className="w-16 h-16 bg-rose-950 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                </div>
                <h2 className="text-xl font-black text-white">Cancel Order {orderToCancel.orderNumber}?</h2>
                <p className="text-sm text-stone-400">
                  Have you already contacted <strong className="text-white">{orderToCancel.customerName}</strong> {orderToCancel.customerPhone && <span className="font-mono text-emerald-400">({orderToCancel.customerPhone})</span>} to inform them about this cancellation?
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={() => handleCancelAndRefund(orderToCancel.id)}
                  disabled={isCancelling}
                  className="w-full h-14 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:bg-rose-800 text-white font-black rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  <span>{isCancelling ? 'Processing...' : 'Yes, Cancel Order'}</span>
                </button>
                <button
                  onClick={() => setCancellingOrderId(null)}
                  disabled={isCancelling}
                  className="w-full h-14 bg-stone-800 hover:bg-stone-700 text-stone-300 font-black rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export const KitchenDisplaySystem = KDSScreen;
