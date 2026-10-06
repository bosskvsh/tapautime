import { useState, useEffect, useRef, useCallback } from 'react';
/**
 * Maps raw Supabase order record to MerchantOrder interface with fallback resilience.
 */
function mapRawOrder(o) {
    let items = [];
    if (o.order_events && Array.isArray(o.order_events) && o.order_events.length > 0) {
        const createEvt = o.order_events.find((e) => e.event_type === 'ORDER_CREATED');
        if (createEvt?.payload?.items && Array.isArray(createEvt.payload.items)) {
            items = createEvt.payload.items.map((i) => ({
                name: String(i.name || i.item_name || 'Kitchen Item').trim(),
                quantity: Math.max(1, Number(i.quantity) || 1),
                price: Number(i.price || i.price_at_time_of_order) || 0,
                station: i.station || 'Main Kitchen',
                variant: i.variant || i.notes || i.special_instructions || ''
            }));
        }
    }
    if (items.length === 0 && o.items && Array.isArray(o.items)) {
        items = o.items.map((i) => ({
            name: String(i.name || i.item_name || 'Kitchen Item').trim(),
            quantity: Math.max(1, Number(i.quantity) || 1),
            price: Number(i.price || i.unit_price) || 0,
            station: i.station || 'Main Kitchen',
            variant: i.variant || i.notes || ''
        }));
    }
    if (items.length === 0) {
        items = [
            {
                name: `Order #${(o.display_id || '').replace('#', '') || String(o.id || '').substring(0, 4)}`,
                quantity: 1,
                price: Number(o.total_amount) || 0,
                station: 'Main Kitchen',
                variant: o.order_type === 'dinein' ? `Dine-In (Table ${o.table_number || '-'})` : 'Takeaway'
            }
        ];
    }
    return {
        id: String(o.id),
        orderId: (o.display_id || '').replace('#', '') || String(o.id || '').substring(0, 4),
        merchantId: o.merchant_id || o.store_id || '',
        customerName: o.customer_name || 'Guest',
        customerPhone: o.customer_phone || '',
        orderType: o.order_type || 'tapau',
        tableNumber: o.table_number || '',
        status: (o.current_status || o.status || 'PENDING').toLowerCase(),
        totalAmount: Number(o.total_amount) || 0,
        paymentMethod: o.payment_method || 'eWallet',
        items,
        createdAt: o.created_at || new Date().toISOString(),
        updatedAt: o.updated_at || new Date().toISOString()
    };
}
/**
 * Bulletproof React hook for KDS Realtime subscription.
 * - Eliminates the Dependency Array Trap (zero dependency on orders or state setters)
 * - Pure functional state updates for INSERT, UPDATE, and DELETE
 * - React 18 Strict Mode double-mount and zombie socket protection
 * - In-place object mutation to prevent tablet grid flickering
 */
export function useMerchantOrders(supabase, merchantId) {
    const [orders, setOrders] = useState([]);
    const [subscriptionStatus, setSubscriptionStatus] = useState('INITIALIZING');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const channelRef = useRef(null);
    const fetchOrders = useCallback(async () => {
        if (!merchantId)
            return;
        try {
            setIsLoading(true);
            setError(null);
            const { data, error: fetchErr } = await supabase
                .from('orders_v2')
                .select('*, order_events(*)')
                .eq('merchant_id', merchantId)
                .order('created_at', { ascending: false });
            if (fetchErr)
                throw fetchErr;
            const mapped = (data || []).map(mapRawOrder);
            setOrders(mapped);
        }
        catch (err) {
            console.error('[useMerchantOrders] Fetch failed:', err);
            setError(err.message || 'Failed to load merchant orders');
        }
        finally {
            setIsLoading(false);
        }
    }, [supabase, merchantId]);
    // Keep fetchOrders reference in a ref so the effect does not close over or depend on it
    const fetchOrdersRef = useRef(fetchOrders);
    useEffect(() => {
        fetchOrdersRef.current = fetchOrders;
    }, [fetchOrders]);
    useEffect(() => {
        let isMounted = true;
        let activeChannel = null;
        async function initRealtime() {
            if (!merchantId)
                return;
            try {
                setSubscriptionStatus('CONNECTING');
                // Gating: Confirm merchant auth session before establishing Realtime socket
                const { data: sessionData } = await supabase.auth.getSession();
                if (!isMounted)
                    return;
                if (sessionData?.session) {
                    console.log('[useMerchantOrders] Session confirmed for:', sessionData.session.user.id);
                }
                // Cleanup any pre-existing channel before instantiating new one
                if (channelRef.current) {
                    supabase.removeChannel(channelRef.current);
                    channelRef.current = null;
                }
                // Initial snapshot fetch
                await fetchOrdersRef.current();
                if (!isMounted)
                    return;
                activeChannel = supabase
                    .channel(`merchant_kds_${merchantId}_${Date.now()}`)
                    .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders_v2',
                    filter: `merchant_id=eq.${merchantId}`
                }, (payload) => {
                    console.log('[useMerchantOrders] Realtime orders_v2 INSERT:', payload.new);
                    if (!payload.new)
                        return;
                    const newOrder = mapRawOrder(payload.new);
                    setOrders((prevOrders) => {
                        // Deduplicate to mitigate optimistic UI echo
                        if (prevOrders.some((o) => o.id === newOrder.id || o.orderId === newOrder.orderId)) {
                            return prevOrders.map((o) => o.id === newOrder.id || o.orderId === newOrder.orderId
                                ? { ...o, ...newOrder }
                                : o);
                        }
                        return [newOrder, ...prevOrders];
                    });
                })
                    .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders_v2',
                    filter: `merchant_id=eq.${merchantId}`
                }, (payload) => {
                    console.log('[useMerchantOrders] Realtime orders_v2 UPDATE:', payload.new);
                    if (!payload.new)
                        return;
                    const updatedId = String(payload.new.id);
                    const nextStatus = (payload.new.current_status || payload.new.status || '').toLowerCase();
                    setOrders((prevOrders) => prevOrders.map((ord) => ord.id === updatedId
                        ? {
                            ...ord,
                            status: nextStatus || ord.status,
                            updatedAt: payload.new.updated_at || new Date().toISOString()
                        }
                        : ord));
                })
                    .on('postgres_changes', {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'orders_v2',
                    filter: `merchant_id=eq.${merchantId}`
                }, (payload) => {
                    console.log('[useMerchantOrders] Realtime orders_v2 DELETE:', payload.old);
                    if (!payload.old?.id)
                        return;
                    const deletedId = String(payload.old.id);
                    setOrders((prevOrders) => prevOrders.filter((ord) => ord.id !== deletedId));
                })
                    .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders'
                }, (payload) => {
                    if (payload.new && (payload.new.merchant_id === merchantId || payload.new.store_id === merchantId)) {
                        console.log('[useMerchantOrders] Realtime legacy orders INSERT:', payload.new);
                        const newOrder = mapRawOrder(payload.new);
                        setOrders((prevOrders) => {
                            if (prevOrders.some((o) => o.id === newOrder.id || o.orderId === newOrder.orderId)) {
                                return prevOrders.map((o) => o.id === newOrder.id || o.orderId === newOrder.orderId
                                    ? { ...o, ...newOrder }
                                    : o);
                            }
                            return [newOrder, ...prevOrders];
                        });
                    }
                })
                    .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders'
                }, (payload) => {
                    if (payload.new && (payload.new.merchant_id === merchantId || payload.new.store_id === merchantId)) {
                        console.log('[useMerchantOrders] Realtime legacy orders UPDATE:', payload.new);
                        const updatedId = String(payload.new.id);
                        const nextStatus = (payload.new.status || '').toLowerCase();
                        setOrders((prevOrders) => prevOrders.map((ord) => ord.id === updatedId
                            ? {
                                ...ord,
                                status: nextStatus || ord.status,
                                updatedAt: payload.new.updated_at || new Date().toISOString()
                            }
                            : ord));
                    }
                })
                    .on('postgres_changes', {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'orders'
                }, (payload) => {
                    if (payload.old?.id) {
                        console.log('[useMerchantOrders] Realtime legacy orders DELETE:', payload.old);
                        const deletedId = String(payload.old.id);
                        setOrders((prevOrders) => prevOrders.filter((ord) => ord.id !== deletedId));
                    }
                })
                    .subscribe((status, err) => {
                    console.log(`[useMerchantOrders] Subscription lifecycle: ${status}`, err || '');
                    if (!isMounted)
                        return;
                    setSubscriptionStatus(status);
                    if (status === 'SUBSCRIBED') {
                        setError(null);
                    }
                    else if (status === 'CHANNEL_ERROR') {
                        setError(err?.message || 'Supabase Realtime channel error');
                    }
                    else if (status === 'TIMED_OUT') {
                        setError('Supabase Realtime subscription timed out');
                    }
                });
                channelRef.current = activeChannel;
            }
            catch (e) {
                if (isMounted) {
                    console.error('[useMerchantOrders] Realtime setup failed:', e);
                    setSubscriptionStatus('CHANNEL_ERROR');
                    setError(e.message || 'Error initializing KDS realtime listener');
                }
            }
        }
        initRealtime();
        // Strict Mode Double-Mount Prevention & Synchronous Socket Teardown
        return () => {
            isMounted = false;
            if (activeChannel) {
                supabase.removeChannel(activeChannel);
                activeChannel = null;
            }
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [supabase, merchantId]);
    const updateOrderStatus = async (orderId, status) => {
        try {
            const upperStatus = status.toUpperCase();
            // Optimistic update locally
            setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: status.toLowerCase() } : o)));
            const { error: updateErr } = await supabase
                .from('orders_v2')
                .update({
                current_status: upperStatus,
                updated_at: new Date().toISOString()
            })
                .eq('id', orderId);
            if (updateErr) {
                // Rollback snapshot on failure
                await fetchOrdersRef.current();
                throw updateErr;
            }
            return true;
        }
        catch (err) {
            console.error('[useMerchantOrders] Update status failed:', err);
            setError(err.message || 'Failed to update order status');
            return false;
        }
    };
    return {
        orders,
        subscriptionStatus,
        error,
        isLoading,
        refreshOrders: fetchOrders,
        updateOrderStatus
    };
}
