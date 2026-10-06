import {
  KDSOrder,
  KDSOrderItem,
  KDSModifierItem,
  KDSStatus,
  KDSPaymentStatus,
} from '../stores/useMerchantKDSStore';

export function normalizeModifiers(rawModifiers: any): KDSModifierItem[] {
  if (!rawModifiers) return [];

  let list = rawModifiers;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return list
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((opt: string) => ({ option_name: opt }));
    }
  }

  if (!Array.isArray(list)) return [];

  return list
    .map((m: any) => {
      if (!m) return null;
      if (typeof m === 'string') {
        const trimmed = m.trim();
        return trimmed ? { option_name: trimmed } : null;
      }

      const optionName =
        m.option_name ||
        m.name ||
        m.label ||
        m.title ||
        m.modifier_name ||
        '';

      if (!optionName || typeof optionName !== 'string' || !optionName.trim()) {
        return null;
      }

      return {
        modifier_id: m.modifier_id || m.id || undefined,
        modifier_group: m.modifier_group || m.group || undefined,
        option_name: optionName.trim(),
        additional_price:
          typeof m.additional_price === 'number'
            ? m.additional_price
            : typeof m.price === 'number'
            ? m.price
            : m.additional_price
            ? Number(m.additional_price) || 0
            : undefined,
      };
    })
    .filter((m): m is KDSModifierItem => m !== null);
}

export function mapDbOrderToKDSOrder(row: any): KDSOrder {
  // Normalize items from either order_items relational table or json field
  const items: KDSOrderItem[] =
    row.order_items && Array.isArray(row.order_items) && row.order_items.length > 0
      ? row.order_items.map((oi: any) => ({
          id: oi.id,
          name: oi.item_name || oi.name || oi.menu_items?.name || 'Item',
          quantity: Number(oi.quantity) || 1,
          modifiers: normalizeModifiers(oi.selected_modifiers || oi.modifiers),
          special_instructions: oi.special_instructions || null,
        }))
      : Array.isArray(row.items)
      ? row.items.map((item: any, idx: number) => ({
          id: item.id || `item-${idx}`,
          name: item.name || item.item_name || 'Item',
          quantity: Number(item.quantity) || 1,
          modifiers: normalizeModifiers(item.modifiers || item.selected_modifiers),
          special_instructions: item.special_instructions || null,
        }))
      : [];

  const rawPaymentMethod = (
    row.payment_method ||
    row.master_transactions?.payment_method ||
    ''
  ).toLowerCase();

  const paymentMethod: 'manual_transfer' | 'gateway' | 'cash' | 'online' =
    rawPaymentMethod === 'manual_transfer' || rawPaymentMethod.includes('duitnow')
      ? 'manual_transfer'
      : rawPaymentMethod === 'cash' || rawPaymentMethod.includes('cash')
      ? 'cash'
      : rawPaymentMethod === 'online'
      ? 'online'
      : 'gateway';

  // Normalize order_type (canonical 'dine_in' or 'takeaway')
  const rawOrderType = (row.order_type || row.orderType || '').toLowerCase();
  const orderType: 'dine_in' | 'takeaway' =
    rawOrderType === 'dine_in' || rawOrderType === 'dinein' ? 'dine_in' : 'takeaway';

  // Normalize table_number
  const tableNumber = row.table_number || row.tableNumber || null;

  // Normalize payment_status
  const rawPaymentStatus = (row.payment_status || 'paid').toLowerCase();
  const paymentStatus: KDSPaymentStatus =
    rawPaymentStatus === 'pending_cash'
      ? 'pending_cash'
      : rawPaymentStatus === 'captured'
      ? 'captured'
      : rawPaymentStatus === 'paid'
      ? 'paid'
      : rawPaymentStatus === 'unpaid'
      ? 'unpaid'
      : rawPaymentStatus === 'failed'
      ? 'failed'
      : 'pending';

  // Determine KDS status
  let status: KDSStatus = 'pending';
  const rawStatus = (row.status || row.order_status || 'pending').toLowerCase();

  const isOnlineOrGateway = paymentMethod === 'gateway' || paymentMethod === 'online';
  const isCapturedOrPaid = paymentStatus === 'captured' || paymentStatus === 'paid';

  if (rawStatus === 'pending_payment' || (isOnlineOrGateway && !isCapturedOrPaid)) {
    status = 'pending_payment';
  } else if (
    rawStatus === 'verification_pending' ||
    (paymentMethod === 'manual_transfer' && (rawPaymentStatus === 'pending' || rawPaymentStatus === 'unpaid') && rawStatus === 'pending')
  ) {
    status = 'verification_pending';
  } else if (['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'].includes(rawStatus)) {
    status = rawStatus as KDSStatus;
  }

  const receiptUrl =
    row.receipt_url ||
    row.master_transactions?.receipt_url ||
    undefined;

  const userRel = Array.isArray(row.users) ? row.users[0] : row.users;
  const customerName = (userRel?.name || row.customer_name || '').trim() || 'Customer';
  const customerPhone = (userRel?.phone || row.customer_phone || '').trim() || undefined;

  return {
    id: row.id,
    orderNumber: row.display_id || `#TT-${row.id.slice(0, 4).toUpperCase()}`,
    status,
    orderType,
    tableNumber,
    customerName,
    customerPhone,
    items,
    totalAmount: Number(row.total_amount || 0),
    paymentMethod,
    paymentStatus,
    receiptUrl,
    pickupPin: row.pickup_pin || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    promoCode: row.promo_code || undefined,
    discountAmount: Number(row.discount_amount) || undefined,
    customerArrived: row.order_events && Array.isArray(row.order_events) 
      ? row.order_events.some((e: any) => e.event_type === 'CUSTOMER_ARRIVED') 
      : false,
    estimatedPrepMinutes: row.estimated_prep_minutes ? Number(row.estimated_prep_minutes) : undefined,
    isPreorder: Boolean(row.is_preorder),
    scheduledPickupDate: row.scheduled_pickup_date || null,
    scheduledPickupTime: row.scheduled_pickup_time || null,
  };
}
