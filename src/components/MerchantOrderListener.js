import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMerchantOrders } from '../hooks/useMerchantOrders';
export const MerchantOrderListener = ({ supabase, merchantId, onOrderSelect }) => {
    const { orders, subscriptionStatus, error, isLoading, refreshOrders, updateOrderStatus } = useMerchantOrders(supabase, merchantId);
    const getStatusBadge = (status) => {
        switch (status) {
            case 'SUBSCRIBED':
                return (_jsxs("span", { style: { color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }, children: [_jsx("span", { style: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' } }), "Live Stream Connected"] }));
            case 'CONNECTING':
            case 'INITIALIZING':
                return (_jsxs("span", { style: { color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }, children: [_jsx("span", { style: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' } }), "Connecting to Realtime..."] }));
            case 'CHANNEL_ERROR':
            case 'TIMED_OUT':
            case 'CLOSED':
                return (_jsxs("span", { style: { color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }, children: [_jsx("span", { style: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' } }), "Disconnected (", status, ")"] }));
        }
    };
    const getOrderStatusColor = (status) => {
        switch (status.toLowerCase()) {
            case 'pending':
                return '#f59e0b';
            case 'accepted':
            case 'preparing':
                return '#3b82f6';
            case 'ready':
                return '#10b981';
            case 'completed':
                return '#6b7280';
            default:
                return '#8b5cf6';
        }
    };
    return (_jsxs("div", { style: { fontFamily: 'Inter, system-ui, sans-serif', padding: '16px', background: '#18181b', color: '#f4f4f5', borderRadius: '12px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '12px', marginBottom: '16px' }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: '18px', fontWeight: 600 }, children: "Kitchen Display Stream (KDS)" }), _jsxs("span", { style: { fontSize: '12px', color: '#a1a1aa' }, children: ["Merchant: ", merchantId] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [getStatusBadge(subscriptionStatus), _jsx("button", { onClick: () => refreshOrders(), style: {
                                    background: '#27272a',
                                    color: '#f4f4f5',
                                    border: '1px solid #3f3f46',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }, children: "Refresh" })] })] }), error && (_jsxs("div", { style: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }, children: ["\u26A0\uFE0F ", error] })), isLoading && orders.length === 0 ? (_jsx("div", { style: { padding: '32px', textAlign: 'center', color: '#71717a' }, children: "Loading kitchen orders..." })) : orders.length === 0 ? (_jsx("div", { style: { padding: '32px', textAlign: 'center', color: '#71717a' }, children: "No active orders in queue." })) : (_jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }, children: orders.map((ord) => (_jsxs("div", { onClick: () => onOrderSelect && onOrderSelect(ord), style: {
                        background: '#27272a',
                        borderRadius: '8px',
                        padding: '14px',
                        borderLeft: `4px solid ${getOrderStatusColor(ord.status)}`,
                        cursor: onOrderSelect ? 'pointer' : 'default'
                    }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }, children: [_jsxs("span", { style: { fontWeight: 700, fontSize: '16px' }, children: ["#", ord.orderId] }), _jsx("span", { style: {
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: getOrderStatusColor(ord.status)
                                    }, children: ord.status })] }), _jsxs("div", { style: { fontSize: '12px', color: '#a1a1aa', marginBottom: '10px' }, children: [ord.orderType === 'dinein' ? `🍽️ Table ${ord.tableNumber || 'Dine-In'}` : '🥡 Takeaway (Tapau)', " \u2022 RM ", ord.totalAmount.toFixed(2)] }), _jsx("div", { style: { borderTop: '1px dashed #3f3f46', paddingTop: '8px', marginBottom: '12px' }, children: ord.items.map((item, idx) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }, children: [_jsxs("span", { children: [item.quantity, "x ", item.name] }), item.variant && _jsx("span", { style: { fontSize: '11px', color: '#9ca3af' }, children: item.variant })] }, idx))) }), _jsxs("div", { style: { display: 'flex', gap: '6px' }, children: [ord.status === 'pending' && (_jsx("button", { onClick: (e) => {
                                        e.stopPropagation();
                                        updateOrderStatus(ord.id, 'PREPARING');
                                    }, style: {
                                        flex: 1,
                                        background: '#3b82f6',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600
                                    }, children: "Accept & Cook" })), ord.status === 'preparing' && (_jsx("button", { onClick: (e) => {
                                        e.stopPropagation();
                                        updateOrderStatus(ord.id, 'READY');
                                    }, style: {
                                        flex: 1,
                                        background: '#10b981',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600
                                    }, children: "Mark Ready" })), ord.status === 'ready' && (_jsx("button", { onClick: (e) => {
                                        e.stopPropagation();
                                        updateOrderStatus(ord.id, 'COMPLETED');
                                    }, style: {
                                        flex: 1,
                                        background: '#6b7280',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600
                                    }, children: "Complete" }))] })] }, ord.id))) }))] }));
};
