import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartItem, MenuItem, SelectedModifier } from '../types/schema';

interface CartState {
  merchantId: string | null;
  orderType: 'tapau' | 'dinein';
  tableNumber: string;
  items: CartItem[];

  // Actions
  setMerchant: (merchantId: string) => void;
  setOrderType: (type: 'tapau' | 'dinein') => void;
  setTableNumber: (table: string) => void;
  addItem: (
    item: MenuItem,
    selectedModifiers: SelectedModifier[],
    quantity?: number,
    specialInstructions?: string
  ) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;

  // Selectors
  getSubtotal: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      merchantId: null,
      orderType: 'tapau',
      tableNumber: '',
      items: [],

      setMerchant: (merchantId: string) => {
        const current = get().merchantId;
        // If switching merchants, reset basket to avoid multi-merchant conflict
        if (current && current !== merchantId) {
          set({ merchantId, items: [] });
        } else {
          set({ merchantId });
        }
      },

      setOrderType: (_orderType?: 'tapau' | 'dinein') => set({ orderType: 'tapau' }),

      setTableNumber: (tableNumber: string) => set({ tableNumber }),

      addItem: (
        item: MenuItem,
        selectedModifiers: SelectedModifier[],
        quantity = 1,
        specialInstructions = ''
      ) => {
        // Calculate unit price with selected modifiers
        const modTotal = selectedModifiers.reduce(
          (sum, m) => sum + (Number(m.additional_price) || 0),
          0
        );
        const unitPrice = Number(item.price) + modTotal;

        // Generate deterministic key based on item + sorted modifiers
        const modKey = selectedModifiers
          .map((m) => m.modifier_id)
          .sort()
          .join('-');
        const cartItemId = `${item.id}_${modKey}_${specialInstructions.trim()}`;

        const existingIdx = get().items.findIndex(
          (i) => i.cart_item_id === cartItemId
        );

        if (existingIdx !== -1) {
          const updated = [...get().items];
          updated[existingIdx].quantity += quantity;
          set({ items: updated });
        } else {
          const newItem: CartItem = {
            cart_item_id: cartItemId,
            item_id: item.id,
            name: item.name,
            base_price: Number(item.price),
            unit_price: unitPrice,
            quantity,
            selected_modifiers: selectedModifiers,
            special_instructions: specialInstructions,
            image_url: item.image_url,
          };
          set({ items: [...get().items, newItem] });
        }
      },

      updateQuantity: (cartItemId: string, delta: number) => {
        const updated = get()
          .items.map((i) => {
            if (i.cart_item_id === cartItemId) {
              const newQty = i.quantity + delta;
              return newQty > 0 ? { ...i, quantity: newQty } : null;
            }
            return i;
          })
          .filter(Boolean) as CartItem[];

        set({ items: updated });
      },

      removeItem: (cartItemId: string) => {
        set({ items: get().items.filter((i) => i.cart_item_id !== cartItemId) });
      },

      clearCart: () => set({ items: [] }),

      getSubtotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.unit_price * item.quantity,
          0
        );
      },

      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'tapautime_cart_storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
