import { create } from 'zustand';
import { Order, OrderStatus } from '../types/schema';
import { supabase } from '../lib/supabase';

interface OrderState {
  activeOrders: Order[];
  currentOrder: Order | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  setCurrentOrder: (order: Order | null) => void;

  // Realtime Subscriptions
  subscribeToCustomerOrders: (customerId: string) => () => void;
  subscribeToMerchantOrders: (merchantId: string) => () => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  activeOrders: [],
  currentOrder: null,
  isLoading: false,
  error: null,

  setOrders: (orders: Order[]) => set({ activeOrders: orders }),

  addOrder: (order: Order) => {
    const exists = get().activeOrders.some((o) => o.id === order.id);
    if (!exists) {
      set({ activeOrders: [order, ...get().activeOrders] });
    }
  },

  updateOrderStatus: (orderId: string, status: OrderStatus) => {
    const updated = get().activeOrders.map((o) =>
      o.id === orderId ? { ...o, order_status: status } : o
    );
    set({ activeOrders: updated });

    if (get().currentOrder?.id === orderId) {
      set({ currentOrder: { ...get().currentOrder!, order_status: status } });
    }
  },

  setCurrentOrder: (order: Order | null) => set({ currentOrder: order }),

  // Listen to orders for a specific customer
  subscribeToCustomerOrders: (customerId: string) => {
    const channel = supabase
      .channel(`customer-orders-${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            get().addOrder(payload.new as Order);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Order;
            get().updateOrderStatus(
              updated.id,
              updated.order_status || (updated as any).status
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // Listen to orders for a merchant's KDS
  subscribeToMerchantOrders: (merchantId: string) => {
    const channel = supabase
      .channel(`merchant-kds-${merchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            get().addOrder(payload.new as Order);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Order;
            get().updateOrderStatus(
              updated.id,
              updated.order_status || (updated as any).status
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
