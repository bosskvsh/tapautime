import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { CustomerReceipt } from '../../../../src/types/schema';

export type { CustomerReceipt };

export type OrderStatus =
  | 'pending_payment'
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'timed_out';

export const normalizeOrderStatus = (rawStatus?: string | null): OrderStatus => {
  const s = String(rawStatus || '').toLowerCase().trim();
  if (['completed', 'complete', 'fulfilled', 'done', 'collected'].includes(s)) return 'completed';
  if (['cancelled', 'canceled', 'rejected', 'void'].includes(s)) return 'cancelled';
  if (['timed_out', 'timeout'].includes(s)) return 'timed_out';
  if (['ready', 'ready_for_pickup'].includes(s)) return 'ready';
  if (['preparing', 'cooking', 'in_kitchen'].includes(s)) return 'preparing';
  if (['accepted', 'confirmed'].includes(s)) return 'accepted';
  if (['pending_payment', 'awaiting_payment'].includes(s)) return 'pending_payment';
  if (['pending', 'verification_pending', 'new'].includes(s)) return 'pending';
  return 'accepted';
};

export const isTerminalStatus = (status?: string | null): boolean => {
  const s = normalizeOrderStatus(status);
  return s === 'completed' || s === 'cancelled' || s === 'timed_out';
};

export const resolveOrderStatusFromRow = (row: any): OrderStatus => {
  if (!row) return 'pending';
  const s1 = normalizeOrderStatus(row.order_status);
  const s2 = normalizeOrderStatus(row.status);
  const s3 = normalizeOrderStatus(row.current_status);
  if (s1 === 'completed' || s2 === 'completed' || s3 === 'completed') return 'completed';
  if (s1 === 'cancelled' || s2 === 'cancelled' || s3 === 'cancelled') return 'cancelled';
  if (s1 === 'timed_out' || s2 === 'timed_out' || s3 === 'timed_out') return 'timed_out';
  if (s1 === 'ready' || s2 === 'ready' || s3 === 'ready') return 'ready';
  if (s1 === 'preparing' || s2 === 'preparing' || s3 === 'preparing') return 'preparing';
  if (s1 === 'accepted' || s2 === 'accepted' || s3 === 'accepted') return 'accepted';
  return s1 || s2 || s3 || 'pending';
};

export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'captured'
  | 'failed'
  | 'refunded';

export interface CustomerOrder {
  id: string;
  display_id?: string;
  merchant_id: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: 'gateway' | 'manual_transfer' | 'cash' | 'online' | string;
  order_type?: 'takeaway';
  table_number?: null;
  pickup_pin?: string;
  receipt_url?: string | null;
  idempotency_key?: string;
  total_amount: number;
  promo_code?: string | null;
  promo_code_id?: string | null;
  discount_amount?: number;
  estimated_prep_minutes?: number;
  pickup_time?: string;
  created_at: string;
  receipt?: CustomerReceipt; // Immutable fiat settlement receipt
}

interface CustomerOrderStore {
  activeOrder: CustomerOrder | null;
  orderHistory: CustomerOrder[];
  isSyncing: boolean;
  setActiveOrder: (order: CustomerOrder | null) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus | string) => void;
  updateActiveOrderDetails: (orderId: string, details: Partial<CustomerOrder>) => void;
  setOrderHistory: (orders: CustomerOrder[]) => void;
  clearActiveOrder: () => void;
  fetchOrderReceipt: (orderId: string) => Promise<CustomerReceipt | null>;
  syncCustomerOrders: () => Promise<void>;
}

export const useCustomerOrderStore = create<CustomerOrderStore>()(
  persist(
    (set, get) => ({
      activeOrder: null,
      orderHistory: [],
      isSyncing: false,

      setActiveOrder: (order) => {
        if (!order) {
          set({ activeOrder: null });
          return;
        }
        const normalized = {
          ...order,
          order_status: normalizeOrderStatus(order.order_status),
        };
        set({ activeOrder: normalized });
      },

      updateOrderStatus: (orderId, rawStatus) => {
        const status = normalizeOrderStatus(rawStatus);
        set((state) => {
          const isTargetActive =
            state.activeOrder &&
            (state.activeOrder.id === orderId ||
              state.activeOrder.display_id === orderId ||
              state.activeOrder.pickup_pin === orderId);

          let nextActive = state.activeOrder;
          let nextHistory = [...state.orderHistory];

          if (isTargetActive && state.activeOrder) {
            const updatedActive = { ...state.activeOrder, order_status: status };
            nextActive = updatedActive;

            if (isTerminalStatus(status)) {
              const existsInHistory = nextHistory.some(
                (o) => o.id === updatedActive.id || o.display_id === updatedActive.display_id
              );
              if (!existsInHistory) {
                nextHistory = [updatedActive, ...nextHistory];
              } else {
                nextHistory = nextHistory.map((o) =>
                  o.id === updatedActive.id || o.display_id === updatedActive.display_id
                    ? { ...o, order_status: status }
                    : o
                );
              }
            }
          }

          nextHistory = nextHistory.map((o) =>
            o.id === orderId || o.display_id === orderId || o.pickup_pin === orderId
              ? { ...o, order_status: status }
              : o
          );

          return { activeOrder: nextActive, orderHistory: nextHistory };
        });
      },

      updateActiveOrderDetails: (orderId, details) => {
        set((state) => {
          let nextActive = state.activeOrder;
          let nextHistory = [...state.orderHistory];

          if (
            state.activeOrder &&
            (state.activeOrder.id === orderId ||
              state.activeOrder.display_id === orderId ||
              state.activeOrder.pickup_pin === orderId)
          ) {
            nextActive = { ...state.activeOrder, ...details };
          }

          nextHistory = nextHistory.map((o) =>
            o.id === orderId || o.display_id === orderId || o.pickup_pin === orderId
              ? { ...o, ...details }
              : o
          );

          return { activeOrder: nextActive, orderHistory: nextHistory };
        });
      },

      setOrderHistory: (orders) => set({ orderHistory: orders }),

      clearActiveOrder: () => set({ activeOrder: null }),

      fetchOrderReceipt: async (orderId: string) => {
        try {
          const isUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              orderId
            );

          let orderQuery = supabase
            .from('orders')
            .select('*, order_items(*, menu_items(*)), master_transactions(*)');

          if (isUuid) {
            orderQuery = orderQuery.eq('id', orderId);
          } else {
            orderQuery = orderQuery.eq('display_id', orderId);
          }

          const { data: order, error: orderError } = await orderQuery.maybeSingle();

          if (orderError) {
            console.error('[useCustomerOrderStore] fetchOrderReceipt relational query error:', orderError);
            return null;
          }

          if (!order) {
            console.warn('[useCustomerOrderStore] fetchOrderReceipt order not found:', orderId);
            return null;
          }

          // Fetch stall/merchant details
          let merchantName = 'TapauTime Kopitiam Network';
          if (order.merchant_id) {
            const { data: merchantData } = await supabase
              .from('merchants')
              .select('business_name')
              .eq('id', order.merchant_id)
              .maybeSingle();

            if (merchantData?.business_name) {
              merchantName = merchantData.business_name;
            }
          } else if (order.order_items?.[0]?.menu_items?.merchants?.business_name) {
            merchantName = order.order_items[0].menu_items.merchants.business_name;
          }

          // Check if double-entry ledger entry exists for settlement proof
          let hasLedger = false;
          try {
            const { data: ledgerData } = await supabase
              .from('ledger_entries')
              .select('id')
              .eq('order_id', order.id)
              .limit(1);
            hasLedger = Boolean(ledgerData && ledgerData.length > 0);
          } catch {
            hasLedger = false;
          }

          // Map itemized orders
          const orderItems = (order.order_items || []).map((oi: any) => ({
            id: oi.id,
            item_name: oi.item_name || oi.menu_items?.name || 'Menu Item',
            quantity: Number(oi.quantity) || 1,
            unit_price: Number(
              oi.unit_price ?? oi.price_at_time_of_order ?? oi.menu_items?.price ?? 0
            ),
            selected_modifiers: oi.selected_modifiers || [],
          }));

          const receipt: CustomerReceipt = {
            order_id: order.id,
            display_id: order.display_id || order.id.slice(0, 8).toUpperCase(),
            total_amount: Number(order.total_amount) || 0,
            pickup_pin:
              order.pickup_pin ||
              order.master_transactions?.pickup_pin ||
              '8492',
            status: order.order_status || order.status || 'completed',
            payment_status:
              order.payment_status ||
              order.master_transactions?.payment_status ||
              'captured',
            payment_method:
              order.payment_method ||
              order.master_transactions?.payment_method ||
              'gateway',
            created_at: order.created_at,
            completed_at: order.updated_at || order.created_at,
            ledger_verified: hasLedger,
            merchant_name: merchantName,
            items: orderItems,
          };

          set((state) => {
            let nextActive = state.activeOrder;
            if (
              state.activeOrder &&
              (state.activeOrder.id === order.id ||
                state.activeOrder.id === orderId ||
                state.activeOrder.display_id === orderId)
            ) {
              nextActive = { ...state.activeOrder, receipt };
            }

            const history = state.orderHistory.map((o) =>
              o.id === order.id || o.id === orderId || o.display_id === orderId
                ? { ...o, receipt }
                : o
            );
            return { activeOrder: nextActive, orderHistory: history };
          });

          return receipt;
        } catch (err) {
          console.error('[useCustomerOrderStore] fetchOrderReceipt exception:', err);
          return null;
        }
      },

      syncCustomerOrders: async () => {
        try {
          set({ isSyncing: true });
          const { data: { session } } = await supabase.auth.getSession();
          const customerId = session?.user?.id;
          const currentActive = get().activeOrder;

          // If neither an authenticated user nor a local active order exists, skip network query
          if (!customerId && !currentActive) {
            set({ isSyncing: false });
            return;
          }

          let dbOrders: any[] = [];

          if (customerId) {
            const { data, error } = await supabase
              .from('orders')
              .select('*')
              .eq('customer_id', customerId)
              .order('created_at', { ascending: false })
              .limit(50);

            if (!error && data) {
              dbOrders = data;
            }
          }

          // If a local active order exists (e.g. from guest checkout or before session token sync), query it directly
          if (
            currentActive &&
            !dbOrders.some((o) => o.id === currentActive.id || o.display_id === currentActive.display_id)
          ) {
            const targetId = currentActive.id;
            const queryFilter = [
              targetId ? `id.eq.${targetId}` : null,
              currentActive.display_id ? `display_id.eq.${currentActive.display_id}` : null,
              currentActive.pickup_pin ? `pickup_pin.eq.${currentActive.pickup_pin}` : null,
            ]
              .filter(Boolean)
              .join(',');

            if (queryFilter) {
              const { data: singleOrder } = await supabase
                .from('orders')
                .select('*')
                .or(queryFilter)
                .maybeSingle();

              if (singleOrder) {
                dbOrders.unshift(singleOrder);
              }
            }
          }

          if (dbOrders.length === 0) {
            set({ isSyncing: false });
            return;
          }

          // 1. Identify active non-terminal order
          const activeItem = dbOrders.find((o) => {
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
            const updatedActive: CustomerOrder = {
              id: activeItem.id,
              display_id: activeItem.display_id || activeItem.id.slice(0, 8).toUpperCase(),
              merchant_id: activeItem.merchant_id,
              order_status: resolvedStatus,
              payment_status: activeItem.payment_status || 'captured',
              payment_method: activeItem.payment_method || 'online',
              order_type: 'takeaway',
              pickup_pin: activeItem.pickup_pin || '',
              total_amount: Number(activeItem.total_amount) || 0,
              promo_code: activeItem.promo_code || null,
              promo_code_id: activeItem.promo_code_id || null,
              discount_amount: Number(activeItem.discount_amount || 0),
              estimated_prep_minutes: activeItem.estimated_prep_minutes || 15,
              created_at: activeItem.created_at,
              receipt: currentActive && currentActive.id === activeItem.id ? currentActive.receipt : undefined,
            };
            set({ activeOrder: updatedActive });
          } else if (currentActive) {
            // Check if currentActive transitioned to terminal status in database
            const matchingRow = dbOrders.find(
              (o) => o.id === currentActive.id || o.display_id === currentActive.display_id
            );
            if (matchingRow) {
              const terminalStatus = resolveOrderStatusFromRow(matchingRow);
              if (isTerminalStatus(terminalStatus)) {
                const completedActive: CustomerOrder = {
                  ...currentActive,
                  order_status: terminalStatus,
                };
                set({ activeOrder: completedActive });
                // If completed and no receipt yet, proactively fetch receipt
                if (terminalStatus === 'completed' && !currentActive.receipt) {
                  get().fetchOrderReceipt(currentActive.id);
                }
              }
            }
          }

          // 2. Map history items (terminal orders)
          const historyItems: CustomerOrder[] = dbOrders
            .filter((o) => {
              const resolved = resolveOrderStatusFromRow(o);
              if (
                resolved === 'pending_payment' ||
                (o.payment_method === 'gateway' && o.payment_status === 'pending')
              ) {
                return false;
              }
              return isTerminalStatus(resolved);
            })
            .map((o) => ({
              id: o.id,
              display_id: o.display_id || o.id.slice(0, 8).toUpperCase(),
              merchant_id: o.merchant_id,
              order_status: resolveOrderStatusFromRow(o),
              payment_status: o.payment_status || 'captured',
              payment_method: o.payment_method || 'online',
              pickup_pin: o.pickup_pin,
              total_amount: Number(o.total_amount) || 0,
              promo_code: o.promo_code || null,
              promo_code_id: o.promo_code_id || null,
              discount_amount: Number(o.discount_amount || 0),
              created_at: o.created_at,
            }));

          set({ orderHistory: historyItems });
        } catch (err) {
          console.warn('[useCustomerOrderStore] syncCustomerOrders exception:', err);
        } finally {
          set({ isSyncing: false });
        }
      },
    }),
    {
      name: 'tapautime-customer-order-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
