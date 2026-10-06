import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, SUPABASE_ANON_KEY, CHECKOUT_EDGE_FUNCTION_URL } from '../lib/supabase';
import { saveActiveDineInOrder, updateActiveDineInOrderStatus, clearActiveDineInOrder } from '../lib/activeOrder';

interface OrderItemDetail {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  modifiers?: Array<{ option_name: string; additional_price?: number }>;
  special_instructions?: string;
}

interface DineInOrderData {
  id: string;
  display_id: string;
  order_status: string;
  payment_status: string;
  table_number: string;
  pickup_pin: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  items: OrderItemDetail[];
}

type StepStatus = 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';

function normalizeStatus(raw: string): StepStatus {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'preparing' || s === 'cooking' || s === 'in_preparation') return 'preparing';
  if (s === 'ready' || s === 'ready_for_pickup' || s === 'serving') return 'ready';
  if (s === 'completed' || s === 'delivered' || s === 'served') return 'completed';
  if (s === 'cancelled' || s === 'rejected') return 'cancelled';
  return 'accepted';
}

const STEP_ORDER: Record<StepStatus, number> = {
  accepted: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
  cancelled: -1,
};

const STEPS = [
  {
    key: 'accepted',
    title: 'Sent to Kitchen',
    subtext: 'Ticket confirmed',
    icon: 'receipt_long',
  },
  {
    key: 'preparing',
    title: 'Cooking',
    subtext: 'Prepared fresh',
    icon: 'skillet',
  },
  {
    key: 'ready',
    title: 'Serving',
    subtext: 'Heading to table',
    icon: 'room_service',
  },
  {
    key: 'completed',
    title: 'Enjoy Meal',
    subtext: 'Delivered',
    icon: 'task_alt',
  },
];

export function SuccessScreen() {
  const { merchantSlug, tableNumber } = useParams<{ merchantSlug: string; tableNumber: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pickupPinParam = searchParams.get('pin') || '';
  const txIdParam = searchParams.get('tx') || '';
  const orderNumberParam = searchParams.get('order_number') || '';

  const [orderData, setOrderData] = useState<DineInOrderData | null>(null);
  const [currentStatus, setCurrentStatus] = useState<StepStatus>('accepted');
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);
  const [isOrderSummaryOpen, setIsOrderSummaryOpen] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const isMountedRef = useRef(true);

  // 1. Unified Status Fetcher (RPC first with PIN, direct fallback)
  const fetchOrderStatus = useCallback(async () => {
    if (!txIdParam) return;

    try {
      // First attempt: Secure RPC verifying order_id + PIN
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_dine_in_order_status', {
        p_order_id: txIdParam,
        p_pickup_pin: pickupPinParam || null,
      });

      if (!rpcErr && rpcData && rpcData.success && rpcData.order) {
        if (!isMountedRef.current) return;
        const ord = rpcData.order as DineInOrderData;
        setOrderData(ord);
        setCurrentStatus(normalizeStatus(ord.order_status));
        setLastRefreshedAt(new Date());
        setIsLiveConnected(true);

        saveActiveDineInOrder({
          orderNumber: ord.display_id || orderNumberParam,
          pickupPin: ord.pickup_pin || pickupPinParam,
          txId: txIdParam,
          merchantSlug: merchantSlug || '',
          tableNumber: ord.table_number || tableNumber || '',
          status: ord.order_status,
        });

        // If gateway payment is still pending, trigger active reconciliation check
        if (ord.payment_status === 'pending') {
          fetch(CHECKOUT_EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({
              action: 'verify_payment',
              master_transaction_id: txIdParam,
              pickup_pin: pickupPinParam,
            }),
          })
            .then((r) => r.json())
            .then((v) => {
              if (v.success && v.payment_status === 'captured') {
                fetchOrderStatus();
              }
            })
            .catch(console.warn);
        }

        return;
      }

      // Fallback: Direct query on orders
      const { data: directOrder, error: directErr } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .or(`id.eq.${txIdParam},transaction_id.eq.${txIdParam},display_id.eq.${txIdParam}`)
        .eq('order_type', 'dine_in')
        .maybeSingle();

      if (!directErr && directOrder) {
        if (!isMountedRef.current) return;
        const normalizedItems: OrderItemDetail[] = (directOrder.order_items || []).map((oi: any) => ({
          id: oi.id,
          name: oi.item_name || 'Dish',
          quantity: oi.quantity || 1,
          unit_price: Number(oi.unit_price || 0),
          modifiers: Array.isArray(oi.selected_modifiers)
            ? oi.selected_modifiers
            : typeof oi.selected_modifiers === 'string'
            ? JSON.parse(oi.selected_modifiers || '[]')
            : [],
          special_instructions: oi.special_instructions || '',
        }));

        const builtData: DineInOrderData = {
          id: directOrder.id,
          display_id: directOrder.display_id || directOrder.id.slice(0, 8).toUpperCase(),
          order_status: directOrder.order_status || directOrder.status || 'accepted',
          payment_status: directOrder.payment_status || 'captured',
          table_number: directOrder.table_number || tableNumber || '',
          pickup_pin: directOrder.pickup_pin || pickupPinParam,
          total_amount: Number(directOrder.total_amount || 0),
          created_at: directOrder.created_at,
          updated_at: directOrder.updated_at,
          items: normalizedItems,
        };

        setOrderData(builtData);
        setCurrentStatus(normalizeStatus(builtData.order_status));
        setLastRefreshedAt(new Date());
        setIsLiveConnected(true);
      }
    } catch (err) {
      console.warn('[Dine-In Tracking] Fetch status exception:', err);
      setIsLiveConnected(false);
    }
  }, [txIdParam, pickupPinParam, tableNumber]);

  // 2. Initial Fetch + Realtime Subscription + Resilient Fallback Polling
  useEffect(() => {
    isMountedRef.current = true;
    fetchOrderStatus();

    if (!txIdParam) return;

    // Realtime WebSocket Channel
    const channel = supabase
      .channel(`dine-in-tracking-${txIdParam}`)
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
            (updated.id === txIdParam ||
              updated.transaction_id === txIdParam ||
              updated.display_id === txIdParam ||
              (pickupPinParam && updated.pickup_pin === pickupPinParam))
          ) {
            const nextStatus = normalizeStatus(updated.order_status || updated.status);
            setCurrentStatus(nextStatus);
            updateActiveDineInOrderStatus(nextStatus);
            setLastRefreshedAt(new Date());
            setIsLiveConnected(true);

            // Re-fetch complete details if needed
            fetchOrderStatus();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLiveConnected(true);
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setIsLiveConnected(false);
        }
      });

    // Fallback heartbeat polling every 6 seconds (resilient to mobile background pausing)
    const interval = setInterval(() => {
      fetchOrderStatus();
    }, 6000);

    // Instant refresh when user returns to browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchOrderStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [txIdParam, pickupPinParam, fetchOrderStatus]);

  const currentStepIndex = STEP_ORDER[currentStatus] ?? 0;
  const displayPin = orderData?.pickup_pin || pickupPinParam || '----';
  const displayTable = orderData?.table_number || tableNumber || '-';
  const displayOrderNumber =
    orderData?.display_id ||
    orderNumberParam ||
    (txIdParam ? `#${txIdParam.slice(0, 4).toUpperCase()}-1` : 'Active Order');

  return (
    <div className="min-h-screen bg-[#F9FAF9] pb-24">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-stone-200/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🍽️</span>
          <div>
            <div className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>Table {displayTable}</span>
              <span className="text-[10px] text-stone-400 font-medium">• Dine-In</span>
            </div>
          </div>
        </div>

        {/* Live Pulse Beacon */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200/80 text-[11px] font-bold">
          <span
            className={`w-2 h-2 rounded-full ${
              isLiveConnected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span className={isLiveConnected ? 'text-emerald-700' : 'text-amber-700'}>
            {isLiveConnected ? 'Kitchen Live' : 'Reconnecting'}
          </span>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* 1. Main Status Hero Card */}
        <div className="bg-white border border-stone-200/90 rounded-3xl p-6 text-center shadow-xs space-y-4 overflow-hidden relative">
          {/* Subtle status top accent bar */}
          <div
            className={`absolute top-0 inset-x-0 h-1.5 ${
              currentStatus === 'completed'
                ? 'bg-emerald-500'
                : currentStatus === 'ready'
                ? 'bg-sky-500'
                : currentStatus === 'preparing'
                ? 'bg-brand-orange'
                : 'bg-emerald-500'
            }`}
          />

          {/* Hero Icon */}
          <div className="pt-2">
            {currentStatus === 'accepted' && (
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <span className="material-symbols-outlined text-4xl font-black">receipt_long</span>
              </div>
            )}

            {currentStatus === 'preparing' && (
              <div className="w-20 h-20 bg-orange-100 text-brand-orange rounded-3xl flex items-center justify-center mx-auto shadow-inner animate-bounce">
                <span className="material-symbols-outlined text-4xl font-black">skillet</span>
              </div>
            )}

            {currentStatus === 'ready' && (
              <div className="w-20 h-20 bg-sky-100 text-sky-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner ring-4 ring-sky-100">
                <span className="material-symbols-outlined text-4xl font-black">room_service</span>
              </div>
            )}

            {currentStatus === 'completed' && (
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <span className="material-symbols-outlined text-4xl font-black">task_alt</span>
              </div>
            )}

            {currentStatus === 'cancelled' && (
              <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <span className="material-symbols-outlined text-4xl font-black">cancel</span>
              </div>
            )}
          </div>

          {/* Hero Title & Context Message */}
          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              {currentStatus === 'accepted' && 'Order Sent to Kitchen!'}
              {currentStatus === 'preparing' && 'Kitchen is Cooking Fresh!'}
              {currentStatus === 'ready' && `Serving to Table ${displayTable}!`}
              {currentStatus === 'completed' && 'Enjoy Your Meal!'}
              {currentStatus === 'cancelled' && 'Order Cancelled'}
            </h1>

            <p className="text-xs text-stone-500 font-medium leading-relaxed max-w-xs mx-auto">
              {currentStatus === 'accepted' &&
                'Your payment is confirmed. The stall has received your order ticket and will start preparation.'}
              {currentStatus === 'preparing' &&
                'The chef is currently preparing your dishes. Sit back and relax at your table.'}
              {currentStatus === 'ready' &&
                `Your dishes are cooked hot and ready! The staff is bringing them to Table ${displayTable} now.`}
              {currentStatus === 'completed' &&
                `All dishes have been delivered to Table ${displayTable}. Enjoy your meal!`}
              {currentStatus === 'cancelled' &&
                'This order was cancelled. Please check with stall staff for assistance.'}
            </p>
          </div>

          {/* 4-Stage Visual Stepper */}
          <div className="pt-2">
            <div className="grid grid-cols-4 gap-1 relative">
              {STEPS.map((step, idx) => {
                const isStepCompleted = currentStepIndex > idx || currentStatus === 'completed';
                const isStepActive = currentStepIndex === idx && currentStatus !== 'completed';

                return (
                  <div key={step.key} className="flex flex-col items-center text-center">
                    {/* Node Icon Circle */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        isStepCompleted
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : isStepActive
                          ? 'bg-brand-orange text-white ring-4 ring-orange-100 shadow-md'
                          : 'bg-stone-100 text-stone-400 border border-stone-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base font-bold">
                        {isStepCompleted ? 'check' : step.icon}
                      </span>
                    </div>

                    {/* Step Title */}
                    <span
                      className={`mt-1.5 text-[10px] font-black uppercase tracking-tight ${
                        isStepCompleted
                          ? 'text-emerald-700'
                          : isStepActive
                          ? 'text-brand-orange'
                          : 'text-stone-400'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Order Reference & Table Delivery Box */}
        <div className="p-4.5 bg-white border-2 border-stone-200/90 rounded-3xl shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">
                Order Number
              </span>
              <div className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2 mt-0.5">
                <span>{displayOrderNumber}</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200 uppercase">
                  Kitchen Ticket
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-black rounded-xl uppercase tracking-wider inline-flex items-center gap-1 shadow-xs">
                <span>🍽️ Table {displayTable}</span>
              </span>
              <div className="text-[10px] text-stone-400 font-medium mt-1">
                Direct table service
              </div>
            </div>
          </div>

          {/* Verification PIN Section */}
          <div className="bg-orange-50/80 border border-orange-200/80 rounded-2xl p-3 flex items-center justify-between text-orange-950">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-orange text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-base font-bold">pin</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-600 block leading-tight">
                  Verification PIN
                </span>
                <span className="text-[11px] text-stone-400 font-medium">
                  Matches kitchen ticket
                </span>
              </div>
            </div>
            <div className="text-2xl font-black text-brand-orange font-mono tracking-widest tabular-nums">
              {displayPin}
            </div>
          </div>
        </div>

        {/* 3. Itemized Dishes Accordion */}
        {orderData && orderData.items && orderData.items.length > 0 && (
          <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsOrderSummaryOpen(!isOrderSummaryOpen)}
              className="w-full p-4 flex items-center justify-between bg-stone-50/70 hover:bg-stone-100/70 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-stone-600 text-lg">restaurant_menu</span>
                <span className="text-xs font-black uppercase tracking-wider text-stone-800">
                  Ordered Dishes
                </span>
                <span className="text-[11px] font-bold text-stone-400">
                  ({orderData.items.reduce((s, i) => s + i.quantity, 0)} items)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-stone-900 tabular-nums">
                  RM {orderData.total_amount.toFixed(2)}
                </span>
                <span
                  className={`material-symbols-outlined text-stone-400 text-lg transition-transform duration-200 ${
                    isOrderSummaryOpen ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </span>
              </div>
            </button>

            {isOrderSummaryOpen && (
              <div className="p-4 divide-y divide-stone-100 space-y-3">
                {orderData.items.map((item) => (
                  <div key={item.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-orange-100 text-brand-orange text-[11px] font-black flex items-center justify-center shrink-0">
                          {item.quantity}×
                        </span>
                        <h4 className="text-xs font-black text-stone-900 truncate">
                          {item.name}
                        </h4>
                      </div>

                      {/* Modifiers */}
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 pl-7">
                          {item.modifiers.map((m, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600"
                            >
                              {m.option_name}
                              {m.additional_price && m.additional_price > 0
                                ? ` (+RM${m.additional_price.toFixed(2)})`
                                : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Special Instructions */}
                      {item.special_instructions && (
                        <div className="mt-1 ml-7 text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/50 italic">
                          "{item.special_instructions}"
                        </div>
                      )}
                    </div>

                    <div className="text-xs font-black text-stone-900 tabular-nums shrink-0 pt-0.5">
                      RM {(item.unit_price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (currentStatus === 'completed' || currentStatus === 'cancelled') {
                clearActiveDineInOrder();
              }
              navigate(`/${merchantSlug}/${tableNumber}`);
            }}
            className="w-full h-14 rounded-2xl bg-brand-orange hover:bg-orange-600 active:scale-[0.98] text-white font-black text-sm shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">add_circle</span>
            <span>Order More Dishes / Add Drinks</span>
          </button>

          <div className="text-center">
            <span className="text-[10px] text-stone-400">
              Synced at {lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
