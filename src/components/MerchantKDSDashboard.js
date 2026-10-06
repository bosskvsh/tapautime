import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useMemo } from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { supabase } from '../lib/supabase';
export const MerchantKDSDashboard = ({ merchantId, storeName = 'Tapau Stall', }) => {
    const { activeOrders, setOrders, updateOrderStatus, subscribeToMerchantOrders, } = useOrderStore();
    const [activeTab, setActiveTab] = useState('all');
    const [currentTime, setCurrentTime] = useState(Date.now());
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
                    const mapped = data.map((d) => ({
                        id: d.id,
                        display_id: d.display_id || `#${d.id.slice(0, 4).toUpperCase()}`,
                        customer_id: d.customer_id,
                        merchant_id: d.merchant_id,
                        order_status: (d.order_status || d.status || 'pending').toLowerCase(),
                        payment_status: d.payment_status || 'pending',
                        total_amount: Number(d.total_amount) || 0,
                        created_at: d.created_at,
                        items: (d.order_items || []).map((item) => ({
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
            }
            catch (err) {
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
    const handleAdvanceStatus = async (orderId, nextStatus) => {
        // Optimistic state update in Zustand
        updateOrderStatus(orderId, nextStatus);
        try {
            await supabase
                .from('orders')
                .update({
                status: nextStatus,
                order_status: nextStatus,
                updated_at: new Date().toISOString(),
            })
                .eq('id', orderId);
        }
        catch (e) {
            console.error('[KDS Dashboard] Status update error:', e);
        }
    };
    // Filtered Orders List
    const filteredOrders = useMemo(() => {
        return activeOrders.filter((order) => {
            const s = order.order_status.toLowerCase();
            if (activeTab === 'all')
                return s !== 'completed' && s !== 'cancelled';
            if (activeTab === 'pending')
                return s === 'pending' || s === 'accepted';
            if (activeTab === 'preparing')
                return s === 'preparing';
            if (activeTab === 'ready')
                return s === 'ready';
            return true;
        });
    }, [activeOrders, activeTab]);
    // Metrics
    const pendingCount = activeOrders.filter((o) => ['pending', 'accepted'].includes(o.order_status.toLowerCase())).length;
    const preparingCount = activeOrders.filter((o) => o.order_status.toLowerCase() === 'preparing').length;
    const readyCount = activeOrders.filter((o) => o.order_status.toLowerCase() === 'ready').length;
    return (_jsxs("div", { className: "min-h-screen bg-[#121214] text-stone-100 flex flex-col font-sans", children: [_jsxs("header", { className: "px-6 py-4 bg-[#1a1a1e] border-b border-stone-800 flex items-center justify-between sticky top-0 z-20 shadow-md", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-lg shadow-sm", children: "\uD83C\uDF73" }), _jsxs("div", { children: [_jsx("h1", { className: "text-lg font-black tracking-tight text-white", children: storeName }), _jsxs("span", { className: "text-xs text-stone-400 font-mono", children: ["KDS \u2022 ID: ", merchantId.slice(0, 8)] })] })] }), _jsx("div", { className: "flex items-center gap-4", children: _jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 text-xs font-bold", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-emerald-400 animate-ping" }), _jsx("span", { children: "Live Stream Connected" })] }) })] }), _jsx("div", { className: "px-6 py-3 bg-[#161619] border-b border-stone-800/80 flex flex-wrap items-center justify-between gap-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => setActiveTab('all'), className: `px-4 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'all'
                                ? 'bg-stone-100 text-stone-900 shadow-sm'
                                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'}`, children: ["All Active (", pendingCount + preparingCount + readyCount, ")"] }), _jsxs("button", { onClick: () => setActiveTab('pending'), className: `px-4 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'pending'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'}`, children: ["New Orders (", pendingCount, ")"] }), _jsxs("button", { onClick: () => setActiveTab('preparing'), className: `px-4 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'preparing'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'}`, children: ["Cooking (", preparingCount, ")"] }), _jsxs("button", { onClick: () => setActiveTab('ready'), className: `px-4 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'ready'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-stone-800/60 text-stone-400 hover:text-stone-200'}`, children: ["Ready for Pickup (", readyCount, ")"] })] }) }), _jsx("main", { className: "flex-1 p-6 overflow-x-auto", children: filteredOrders.length === 0 ? (_jsxs("div", { className: "h-96 flex flex-col items-center justify-center text-center text-stone-500", children: [_jsx("span", { className: "text-4xl mb-3", children: "\uD83D\uDC68\u200D\uD83C\uDF73" }), _jsx("h3", { className: "text-base font-bold text-stone-400", children: "All caught up!" }), _jsx("p", { className: "text-xs text-stone-600 mt-1", children: "No pending orders on the kitchen display board." })] })) : (_jsx("div", { className: "flex items-start gap-4 pb-4", children: filteredOrders.map((order) => {
                        const elapsedSecs = Math.max(0, Math.floor((currentTime - new Date(order.created_at).getTime()) / 1000));
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
                        }
                        else if (isPreparing) {
                            cardBg = 'bg-[#211706] border-amber-500/50 shadow-lg shadow-amber-950/20';
                            headerBg = 'bg-amber-600 text-white';
                            statusLabel = 'COOKING';
                        }
                        else if (mins >= 15) {
                            cardBg = 'bg-[#260e0e] border-rose-600/60 shadow-lg shadow-rose-950/20';
                            headerBg = 'bg-rose-700 text-white';
                            statusLabel = 'RUSH / OVERDUE';
                        }
                        return (_jsxs("div", { className: `w-80 shrink-0 rounded-2xl border ${cardBg} flex flex-col overflow-hidden shadow-xl transition-all`, children: [_jsxs("div", { className: `p-3.5 ${headerBg} flex items-center justify-between`, children: [_jsxs("div", { children: [_jsx("span", { className: "text-2xl font-black", children: order.display_id }), _jsx("span", { className: "block text-[10px] uppercase tracking-wider font-extrabold opacity-80 mt-0.5", children: statusLabel })] }), _jsxs("div", { className: "text-right font-mono text-xs font-black", children: ["\u23F1 ", timeFormatted] })] }), _jsx("div", { className: "p-4 flex-1 space-y-3 max-h-80 overflow-y-auto divide-y divide-stone-800/60", children: (order.items || []).map((item, idx) => (_jsx("div", { className: "pt-2.5 first:pt-0", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsxs("span", { className: "text-sm font-black text-orange-400 min-w-[20px]", children: [item.quantity, "x"] }), _jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-sm font-bold text-stone-200 block leading-snug", children: item.item_name }), item.selected_modifiers && item.selected_modifiers.length > 0 && (_jsx("div", { className: "mt-1 space-y-0.5", children: item.selected_modifiers.map((mod, mIdx) => (_jsxs("span", { className: "inline-block text-[11px] font-medium text-stone-400 bg-stone-800/80 px-2 py-0.5 rounded mr-1 mb-1", children: ["\u2022 ", mod.option_name, mod.additional_price > 0 && ` (+RM ${mod.additional_price.toFixed(2)})`] }, mIdx))) })), item.special_instructions && (_jsxs("p", { className: "text-[11px] text-amber-300 italic mt-1 bg-amber-950/30 p-1.5 rounded border border-amber-900/40", children: ["\"", item.special_instructions, "\""] }))] })] }) }, item.id || idx))) }), _jsx("div", { className: "p-3 bg-[#131316] border-t border-stone-800/80 flex items-center gap-2", children: isReady ? (_jsxs("button", { onClick: () => handleAdvanceStatus(order.id, 'completed'), className: "flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5", children: [_jsx("span", { children: "\u2713" }), _jsx("span", { children: "Complete / Handoff" })] })) : isPreparing ? (_jsxs("button", { onClick: () => handleAdvanceStatus(order.id, 'ready'), className: "flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5", children: [_jsx("span", { children: "\uD83D\uDD14" }), _jsx("span", { children: "Ready for Pickup" })] })) : (_jsxs("button", { onClick: () => handleAdvanceStatus(order.id, 'preparing'), className: "flex-1 py-3 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5", children: [_jsx("span", { children: "\uD83D\uDC68\u200D\uD83C\uDF73" }), _jsx("span", { children: "Accept & Prepare" })] })) })] }, order.id));
                    }) })) })] }));
};
