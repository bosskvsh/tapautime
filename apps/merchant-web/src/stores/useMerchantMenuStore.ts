import { create } from 'zustand';

export interface MerchantMenuItem {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  category?: string | null;
  bestseller?: boolean;
  requires_preorder?: boolean;
  lead_time_days?: number;
  daily_capacity?: number | null;
  available_quantity?: number | null;
}

interface MerchantMenuStore {
  items: MerchantMenuItem[];
  setItems: (items: MerchantMenuItem[]) => void;
  addItem: (item: MerchantMenuItem) => void;
  updateItem: (id: string, updates: Partial<MerchantMenuItem>) => void;
  removeItem: (id: string) => void;

  toggleAvailability: (itemId: string) => void;
}

export const useMerchantMenuStore = create<MerchantMenuStore>((set) => ({
  items: [],

  setItems: (items) => set({ items }),

  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((i) => i.id !== item.id)],
    })),

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  toggleAvailability: (itemId) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, is_available: !item.is_available } : item
      ),
    }));
  },
}));
