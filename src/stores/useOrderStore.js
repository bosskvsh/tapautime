import { create } from 'zustand';
import { supabase } from '../lib/supabase';
export const useOrderStore = create((set, get) => ({
    activeOrders: [],
    currentOrder: null,
    isLoading: false,
    error: null,
    setOrders: (orders) => set({ activeOrders: orders }),
    addOrder: (order) => {
        const exists = get().activeOrders.some((o) => o.id === order.id);
        if (!exists) {
            set({ activeOrders: [order, ...get().activeOrders] });
        }
    },
    updateOrderStatus: (orderId, status) => {
        const updated = get().activeOrders.map((o) => o.id === orderId ? { ...o, order_status: status } : o);
        set({ activeOrders: updated });
        if (get().currentOrder?.id === orderId) {
            set({ currentOrder: { ...get().currentOrder, order_status: status } });
        }
    },
    setCurrentOrder: (order) => set({ currentOrder: order }),
    // Listen to orders for a specific customer
    subscribeToCustomerOrders: (customerId) => {
        const channel = supabase
            .channel(`customer-orders-${customerId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `customer_id=eq.${customerId}`,
        }, (payload) => {
            if (payload.eventType === 'INSERT') {
                get().addOrder(payload.new);
            }
            else if (payload.eventType === 'UPDATE') {
                const updated = payload.new;
                get().updateOrderStatus(updated.id, updated.order_status || updated.status);
            }
        })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    },
    // Listen to orders for a merchant's KDS
    subscribeToMerchantOrders: (merchantId) => {
        const channel = supabase
            .channel(`merchant-kds-${merchantId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `merchant_id=eq.${merchantId}`,
        }, (payload) => {
            if (payload.eventType === 'INSERT') {
                get().addOrder(payload.new);
            }
            else if (payload.eventType === 'UPDATE') {
                const updated = payload.new;
                get().updateOrderStatus(updated.id, updated.order_status || updated.status);
            }
        })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    },
}));
