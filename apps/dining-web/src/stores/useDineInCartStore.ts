import { create } from 'zustand';

export interface CartModifier {
  id: string;
  modifier_group: string;
  option_name: string;
  additional_price: number;
  is_single_select?: boolean;
}

export interface CartItem {
  cartItemId: string;
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedModifiers: CartModifier[];
  unitPriceWithModifiers: number;
  specialInstructions?: string;
}

interface DineInCartStore {
  merchantId: string | null;
  merchantSlug: string | null;
  tableNumber: string | null;
  items: CartItem[];
  setContext: (merchantId: string, merchantSlug: string, tableNumber: string) => void;
  addItem: (item: CartItem) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalCount: () => number;
  getSubtotal: () => number;
  getConvenienceFee: () => number;
  getProcessingFee: () => number;
  getServiceFee: () => number;
  getOrderBalanceFee: () => number;
  getPlatformFee: () => number;
  getTotalAmount: () => number;
}

export const useDineInCartStore = create<DineInCartStore>((set, get) => ({
  merchantId: null,
  merchantSlug: null,
  tableNumber: null,
  items: [],

  setContext: (merchantId, merchantSlug, tableNumber) => {
    const currentSlug = get().merchantSlug;
    const currentTable = get().tableNumber;
    if (currentSlug !== merchantSlug || currentTable !== tableNumber) {
      // If contextual change (different merchant/table), clear cart
      set({ merchantId, merchantSlug, tableNumber, items: [] });
    }
  },

  addItem: (newItem) => {
    set((state) => {
      const existingIndex = state.items.findIndex(
        (i) => i.cartItemId === newItem.cartItemId
      );
      if (existingIndex > -1) {
        const updated = [...state.items];
        updated[existingIndex].quantity += newItem.quantity;
        return { items: updated };
      }
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (cartItemId) => {
    set((state) => ({
      items: state.items.filter((i) => i.cartItemId !== cartItemId),
    }));
  },

  updateQuantity: (cartItemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(cartItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.cartItemId === cartItemId ? { ...i, quantity } : i
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  getTotalCount: () => get().items.reduce((acc, item) => acc + item.quantity, 0),

  getSubtotal: () =>
    get().items.reduce(
      (acc, item) => acc + item.unitPriceWithModifiers * item.quantity,
      0
    ),

  getConvenienceFee: () => {
    const hasItems = get().items.length > 0;
    return hasItems ? 1.00 : 0;
  },

  getProcessingFee: () => {
    return get().getConvenienceFee();
  },

  getServiceFee: () => {
    const subtotal = get().getSubtotal();
    if (subtotal <= 0) return 0;
    return Number((Math.round(subtotal * 100 * 0.038) / 100).toFixed(2));
  },

  getOrderBalanceFee: () => {
    const subtotal = get().getSubtotal();
    const hasItems = get().items.length > 0;
    return hasItems && subtotal < 12.00 ? 0.50 : 0;
  },

  getPlatformFee: () => {
    return Number((get().getConvenienceFee() + get().getServiceFee() + get().getOrderBalanceFee()).toFixed(2));
  },

  getTotalAmount: () =>
    Number(
      (get().getSubtotal() + get().getConvenienceFee() + get().getServiceFee() + get().getOrderBalanceFee()).toFixed(2)
    ),
}));
