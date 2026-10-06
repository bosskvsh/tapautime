import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartModifier {
  id: string;
  modifier_group: string;
  option_name: string;
  additional_price: number;
  is_single_select?: boolean;
}

export interface CartItem {
  cartItemId: string;
  id: string; // menu_item_id
  name: string;
  price: number;
  quantity: number;
  selectedModifiers: CartModifier[];
  unitPriceWithModifiers: number;
  specialInstructions?: string;
  requiresPreorder?: boolean;
  leadTimeDays?: number;
  dailyCapacity?: number | null;
  availableQuantity?: number | null;
}

interface CartStore {
  merchantId: string | null;
  items: CartItem[];
  isTakeaway: true;
  orderType: 'takeaway';
  scheduledPickupDate: string | null;
  scheduledPickupTime: string | null;
  setScheduledPickup: (date: string | null, time: string | null) => void;
  setMerchant: (merchantId: string) => void;
  addItem: (item: CartItem) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalCount: () => number;
  getSubtotal: () => number;
  getConvenienceFee: () => number;
  getServiceFee: () => number;
  getPlatformFee: () => number;
  getTotalAmount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      merchantId: null,
      items: [],
      isTakeaway: true, // Always pure takeaway
      orderType: 'takeaway',
      scheduledPickupDate: null,
      scheduledPickupTime: null,

      setScheduledPickup: (date, time) => {
        set({ scheduledPickupDate: date, scheduledPickupTime: time });
      },

      setMerchant: (merchantId) => {
        const current = get().merchantId;
        if (current && current !== merchantId) {
          set({ merchantId, items: [] });
        } else {
          set({ merchantId });
        }
      },

      addItem: (newItem) => {
        set((state) => {
          if (newItem.availableQuantity !== undefined && newItem.availableQuantity !== null) {
            const currentTotal = state.items
              .filter(i => i.id === newItem.id)
              .reduce((sum, i) => sum + i.quantity, 0);
            
            if (currentTotal + newItem.quantity > newItem.availableQuantity) {
              alert(`Only ${newItem.availableQuantity} items available in stock.`);
              return state;
            }
          }

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
        set((state) => {
          const itemToUpdate = state.items.find((i) => i.cartItemId === cartItemId);
          if (!itemToUpdate) return state;

          if (itemToUpdate.availableQuantity !== undefined && itemToUpdate.availableQuantity !== null) {
            const otherItemsQuantity = state.items
              .filter((i) => i.id === itemToUpdate.id && i.cartItemId !== cartItemId)
              .reduce((sum, i) => sum + i.quantity, 0);

            if (otherItemsQuantity + quantity > itemToUpdate.availableQuantity) {
              alert(`Only ${itemToUpdate.availableQuantity} items available in stock.`);
              return state;
            }
          }

          return {
            items: state.items.map((i) =>
              i.cartItemId === cartItemId ? { ...i, quantity } : i
            ),
          };
        });
      },

      clearCart: () =>
        set({
          items: [],
          merchantId: null,
          isTakeaway: true,
          orderType: 'takeaway',
          scheduledPickupDate: null,
          scheduledPickupTime: null,
        }),

      getTotalCount: () =>
        get().items.reduce((acc, item) => acc + item.quantity, 0),

      getSubtotal: () =>
        get().items.reduce(
          (acc, item) => acc + item.unitPriceWithModifiers * item.quantity,
          0
        ),

      getConvenienceFee: () => {
        const hasItems = get().items.length > 0;
        return hasItems ? 0.48 : 0;
      },

      getServiceFee: () => {
        const subtotal = get().getSubtotal();
        if (subtotal <= 0) return 0;
        return Number((Math.round(subtotal * 100 * 0.018) / 100).toFixed(2));
      },

      getPlatformFee: () => {
        return Number((get().getConvenienceFee() + get().getServiceFee()).toFixed(2));
      },

      getTotalAmount: () =>
        Number(
          (get().getSubtotal() + get().getConvenienceFee() + get().getServiceFee()).toFixed(2)
        ),
    }),
    {
      name: 'tapautime-customer-cart',
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: (persistedState: any) => {
        const state = { ...persistedState };
        delete state.tableNumber;
        delete state.isDineInLocked;
        state.isTakeaway = true;
        state.orderType = 'takeaway';
        return state;
      },
    }
  )
);
