import React from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { useMerchantOrders, MerchantOrder, SubscriptionStatus } from '../hooks/useMerchantOrders';

interface MerchantOrderListenerProps {
  supabase: SupabaseClient;
  merchantId: string;
  onOrderSelect?: (order: MerchantOrder) => void;
}

export const MerchantOrderListener: React.FC<MerchantOrderListenerProps> = ({
  supabase,
  merchantId,
  onOrderSelect
}) => {
  const { orders, subscriptionStatus, error, isLoading, refreshOrders, updateOrderStatus } =
    useMerchantOrders(supabase, merchantId);

  const getStatusBadge = (status: SubscriptionStatus) => {
    switch (status) {
      case 'SUBSCRIBED':
        return (
          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            Live Stream Connected
          </span>
        );
      case 'CONNECTING':
      case 'INITIALIZING':
        return (
          <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            Connecting to Realtime...
          </span>
        );
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED':
        return (
          <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
            Disconnected ({status})
          </span>
        );
    }
  };

  const getOrderStatusColor = (status: string) => {
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

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: '16px', background: '#18181b', color: '#f4f4f5', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Kitchen Display Stream (KDS)</h2>
          <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Merchant: {merchantId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {getStatusBadge(subscriptionStatus)}
          <button
            onClick={() => refreshOrders()}
            style={{
              background: '#27272a',
              color: '#f4f4f5',
              border: '1px solid #3f3f46',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {isLoading && orders.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#71717a' }}>Loading kitchen orders...</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#71717a' }}>No active orders in queue.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {orders.map((ord) => (
            <div
              key={ord.id}
              onClick={() => onOrderSelect && onOrderSelect(ord)}
              style={{
                background: '#27272a',
                borderRadius: '8px',
                padding: '14px',
                borderLeft: `4px solid ${getOrderStatusColor(ord.status)}`,
                cursor: onOrderSelect ? 'pointer' : 'default'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '16px' }}>#{ord.orderId}</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: getOrderStatusColor(ord.status)
                  }}
                >
                  {ord.status}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '10px' }}>
                {ord.orderType === 'dinein' ? `🍽️ Table ${ord.tableNumber || 'Dine-In'}` : '🥡 Takeaway (Tapau)'} • RM {ord.totalAmount.toFixed(2)}
              </div>

              <div style={{ borderTop: '1px dashed #3f3f46', paddingTop: '8px', marginBottom: '12px' }}>
                {ord.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span>{item.quantity}x {item.name}</span>
                    {item.variant && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{item.variant}</span>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                {ord.status === 'pending' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateOrderStatus(ord.id, 'PREPARING');
                    }}
                    style={{
                      flex: 1,
                      background: '#3b82f6',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    Accept & Cook
                  </button>
                )}
                {ord.status === 'preparing' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateOrderStatus(ord.id, 'READY');
                    }}
                    style={{
                      flex: 1,
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    Mark Ready
                  </button>
                )}
                {ord.status === 'ready' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateOrderStatus(ord.id, 'COMPLETED');
                    }}
                    style={{
                      flex: 1,
                      background: '#6b7280',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
