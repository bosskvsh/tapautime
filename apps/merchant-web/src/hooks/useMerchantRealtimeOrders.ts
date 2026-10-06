import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import { mapDbOrderToKDSOrder } from '../lib/orderMapper';
import { playNewOrderSound, useAudioAlarm } from './useAudioAlarm';
import { useHeartbeat } from './useHeartbeat';

interface UseMerchantRealtimeOrdersOptions {
  merchantId: string;
  enabled: boolean;
}

export function useMerchantRealtimeOrders({
  merchantId,
  enabled,
}: UseMerchantRealtimeOrdersOptions): void {
  const { addOrder } = useMerchantKDSStore();
  const { triggerAlarm } = useAudioAlarm();

  // 1. Maintain persistent stall heartbeat across all merchant tabs while shift is active
  useHeartbeat(enabled && merchantId ? merchantId : '', {
    intervalMs: 60_000,
  });

  // 2. Global Supabase Realtime Orders Stream & Cross-Tab Broadcast Channel
  useEffect(() => {
    if (!enabled || !merchantId) return;

    let isMounted = true;
    let syncChannel: BroadcastChannel | null = null;

    // Initial fetch of active orders for the merchant across all portal tabs
    const fetchActiveOrders = async () => {
      try {
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
          .eq('merchant_id', merchantId)
          .or('payment_method.eq.cash,payment_status.eq.captured')
          .neq('status', 'pending_payment')
          .order('created_at', { ascending: false });

        let finalOrdersData = ordersData;
        if (ordersErr) {
          const { data: simpleOrders } = await supabase
            .from('orders')
            .select('*')
            .eq('merchant_id', merchantId)
            .or('payment_method.eq.cash,payment_status.eq.captured')
            .neq('status', 'pending_payment')
            .order('created_at', { ascending: false });
          finalOrdersData = simpleOrders;
        }

        if (!isMounted) return;
        let mappedOrders = (finalOrdersData || []).map(mapDbOrderToKDSOrder);

        const orderIds = mappedOrders.map((o) => o.id);
        if (orderIds.length > 0) {
          const { data: eventsData } = await supabase
            .from('order_events')
            .select('order_id')
            .eq('event_type', 'CUSTOMER_ARRIVED')
            .in('order_id', orderIds);

          if (eventsData && eventsData.length > 0) {
            const arrivedOrderIds = new Set(eventsData.map((e) => e.order_id));
            mappedOrders = mappedOrders.map((o) => {
              if (arrivedOrderIds.has(o.id)) {
                return { ...o, customerArrived: true };
              }
              return o;
            });
          }
        }

        if (isMounted) {
          useMerchantKDSStore.getState().setOrders(mappedOrders);
        }
      } catch (err) {
        console.error('[useMerchantRealtimeOrders] Initial orders fetch failed:', err);
      }
    };

    fetchActiveOrders();

    // Listen for customer arrival and cross-tab order dispatches
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        syncChannel = new BroadcastChannel('tapau_time_sync');
        syncChannel.onmessage = (event) => {
          if (!isMounted || !event?.data) return;

          if (event.data.type === 'CUSTOMER_ARRIVED') {
            console.log('[useMerchantRealtimeOrders] Customer arrived at counter:', event.data);
            useMerchantKDSStore.getState().markCustomerArrived(event.data.orderId);
            playNewOrderSound(3, 3000);
          } else if (event.data.type === 'NEW_ORDER' && event.data.order) {
            console.log('[useMerchantRealtimeOrders] New order received via broadcast channel:', event.data.order);
            const kdsOrder = mapDbOrderToKDSOrder(event.data.order);
            addOrder(kdsOrder);
            triggerAlarm(kdsOrder.id, { silent: true });
            playNewOrderSound(1, 0);
          }
        };
      } catch (bcErr) {
        console.warn('[useMerchantRealtimeOrders] BroadcastChannel setup failed:', bcErr);
      }
    }

    // Subscribe to Supabase Postgres Realtime for orders
    const channelName = `kds-orders-stream-${merchantId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          console.log('[useMerchantRealtimeOrders] New order INSERT payload:', payload.new);

          const paymentMethod = (payload.new?.payment_method || '').toLowerCase();
          const paymentStatus = (payload.new?.payment_status || '').toLowerCase();
          const status = (payload.new?.status || payload.new?.order_status || '').toLowerCase();

          // Ignore gateway orders awaiting payment or orders in pending_payment status
          if (
            (paymentMethod === 'gateway' || paymentMethod === 'online') &&
            paymentStatus !== 'captured'
          ) {
            return;
          }
          if (status === 'pending_payment') {
            return;
          }

          // Hydrate relational order items
          let { data: fullOrder } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
            .eq('id', payload.new.id)
            .maybeSingle();

          // Race-condition fallback: If order_items are still writing, retry after 500ms
          if (!fullOrder?.order_items || fullOrder.order_items.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (!isMounted) return;
            const { data: hydratedOrder } = await supabase
              .from('orders')
              .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
              .eq('id', payload.new.id)
              .maybeSingle();
            if (hydratedOrder && hydratedOrder.order_items && hydratedOrder.order_items.length > 0) {
              fullOrder = hydratedOrder;
            }
          }

          const kdsOrder = fullOrder
            ? mapDbOrderToKDSOrder(fullOrder)
            : mapDbOrderToKDSOrder(payload.new);

          addOrder(kdsOrder);

          // Play incoming order sound across ANY active page in the merchant portal
          triggerAlarm(kdsOrder.id, { silent: true });
          playNewOrderSound(1, 0);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          console.log('[useMerchantRealtimeOrders] Order UPDATE payload:', payload.new);

          const oldPaymentStatus = payload.old?.payment_status?.toLowerCase();
          const newPaymentStatus = payload.new?.payment_status?.toLowerCase();
          const oldStatus = (payload.old?.status || payload.old?.order_status || '').toLowerCase();

          const currentStoreOrders = useMerchantKDSStore.getState().orders;
          const existingOrder = currentStoreOrders.find((o) => o.id === payload.new?.id);

          const isNewlyCaptured =
            newPaymentStatus === 'captured' &&
            (oldPaymentStatus === 'pending' ||
              oldStatus === 'pending_payment' ||
              !existingOrder ||
              existingOrder.paymentStatus !== 'captured');

          // Hydrate relational order items
          let { data: fullOrder } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
            .eq('id', payload.new.id)
            .maybeSingle();

          if (!fullOrder?.order_items || fullOrder.order_items.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (!isMounted) return;
            const { data: hydratedOrder } = await supabase
              .from('orders')
              .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method)')
              .eq('id', payload.new.id)
              .maybeSingle();
            if (hydratedOrder && hydratedOrder.order_items && hydratedOrder.order_items.length > 0) {
              fullOrder = hydratedOrder;
            }
          }

          const updatedKDSOrder = fullOrder
            ? mapDbOrderToKDSOrder(fullOrder)
            : mapDbOrderToKDSOrder(payload.new);

          // Preserve customerArrived if it was already true in the store
          if (existingOrder && existingOrder.customerArrived) {
            updatedKDSOrder.customerArrived = true;
          }

          const isOnlineUnpaid =
            (updatedKDSOrder.paymentMethod === 'gateway' || updatedKDSOrder.paymentMethod === 'online') &&
            updatedKDSOrder.paymentStatus !== 'captured' &&
            updatedKDSOrder.paymentStatus !== 'paid';

          if (
            updatedKDSOrder.status === 'pending_payment' ||
            payload.new?.status === 'pending_payment' ||
            isOnlineUnpaid
          ) {
            return;
          }

          if (isNewlyCaptured) {
            updatedKDSOrder.status = 'accepted';
            updatedKDSOrder.paymentStatus = 'captured';
            addOrder(updatedKDSOrder);
            triggerAlarm(updatedKDSOrder.id, { silent: true });
            playNewOrderSound(1, 0);
          } else {
            addOrder(updatedKDSOrder);

            if (
              payload.new?.status === 'accepted' &&
              payload.old?.status !== 'accepted'
            ) {
              triggerAlarm(updatedKDSOrder.id, { silent: true });
              playNewOrderSound(1, 0);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_events',
          // No column filter — column filters on text fields require REPLICA IDENTITY FULL
          // and are unreliable across Supabase versions. Filter in the callback instead.
        },
        async (payload) => {
          if (!isMounted) return;
          // Filter in JS: only process CUSTOMER_ARRIVED events
          if (payload.new?.event_type !== 'CUSTOMER_ARRIVED') return;
          const targetOrderId = payload.new?.order_id;
          if (!targetOrderId) return;

          const storeState = useMerchantKDSStore.getState();
          const exists = storeState.orders.some(o => o.id === targetOrderId || o.orderNumber === targetOrderId);
          if (exists) {
            console.log('[useMerchantRealtimeOrders] Customer arrived via DB event:', payload.new);
            storeState.markCustomerArrived(targetOrderId);
            playNewOrderSound(3, 3000);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      if (syncChannel) {
        try {
          syncChannel.close();
        } catch (_) {}
      }
      supabase.removeChannel(channel);
    };
  }, [merchantId, enabled, addOrder, triggerAlarm]);
}
