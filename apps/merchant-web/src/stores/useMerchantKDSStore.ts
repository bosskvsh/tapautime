import { create } from 'zustand';

export type KDSStatus =
  | 'pending_payment'
  | 'pending'
  | 'verification_pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export interface KDSModifierItem {
  modifier_id?: string;
  modifier_group?: string;
  option_name: string;
  additional_price?: number;
}

export interface KDSOrderItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: KDSModifierItem[];
  special_instructions?: string | null;
}

export type KDSPaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'pending_cash'
  | 'paid'
  | 'captured'
  | 'failed';

export type KDSPaymentMethod =
  | 'gateway'
  | 'manual_transfer'
  | 'cash'
  | 'online'
  | string;

export interface KDSOrder {
  id: string;
  orderNumber: string;
  status: KDSStatus;
  orderType: 'dine_in' | 'takeaway';
  tableNumber?: string | null;
  customerName?: string;
  customerPhone?: string;
  items: KDSOrderItem[];
  totalAmount: number;
  paymentMethod?: KDSPaymentMethod;
  paymentStatus: KDSPaymentStatus;
  receiptUrl?: string;
  pickupPin?: string;
  createdAt: string;
  promoCode?: string | null;
  discountAmount?: number;
  customerArrived?: boolean;
  estimatedPrepMinutes?: number;
  isPreorder?: boolean;
  scheduledPickupDate?: string | null;
  scheduledPickupTime?: string | null;
}

interface MerchantKDSStore {
  orders: KDSOrder[];
  activeFilter: 'all' | 'new' | 'preparing' | 'ready';
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  setMerchantId: (id: string) => void;
  setMerchantName: (name: string) => void;
  setMerchantSlug: (slug: string) => void;
  setOrders: (orders: KDSOrder[]) => void;
  addOrder: (order: KDSOrder) => void;
  updateStatus: (orderId: string, status: KDSStatus) => void;
  updatePaymentStatus: (orderId: string, paymentStatus: KDSPaymentStatus) => void;
  markCustomerArrived: (orderId: string) => void;
  updateEstimatedPrepMinutes: (orderId: string, minutes: number) => void;
  setActiveFilter: (filter: 'all' | 'new' | 'preparing' | 'ready') => void;
}

export const useMerchantKDSStore = create<MerchantKDSStore>((set) => ({
  orders: [],
  activeFilter: 'all',
  merchantId: typeof window !== 'undefined' ? (localStorage.getItem('tapautime_merchant_id') || '') : '',
  merchantName: '',
  merchantSlug: '',

  setMerchantId: (merchantId) => set({ merchantId }),
  setMerchantName: (merchantName) => set({ merchantName }),
  setMerchantSlug: (merchantSlug) => set({ merchantSlug }),
  setOrders: (orders) => set({ orders }),

  addOrder: (order) => {
    set((state) => {
      if (state.orders.some((o) => o.id === order.id)) {
        return {
          orders: state.orders.map((o) => (o.id === order.id ? order : o)),
        };
      }
      return {
        orders: [order, ...state.orders],
      };
    });
  },

  updateStatus: (orderId, status) => {
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status } : o
      ),
    }));
  },

  updatePaymentStatus: (orderId, paymentStatus) => {
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, paymentStatus } : o
      ),
    }));
  },

  markCustomerArrived: (orderId) => {
    set((state) => ({
      orders: state.orders.map((o) =>
        (o.id === orderId || o.orderNumber === orderId) ? { ...o, customerArrived: true } : o
      ),
    }));
  },

  updateEstimatedPrepMinutes: (orderId, minutes) => {
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, estimatedPrepMinutes: minutes } : o
      ),
    }));
  },

  setActiveFilter: (activeFilter) => set({ activeFilter }),
}));
