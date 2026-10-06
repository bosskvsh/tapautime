import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface CustomerStore {
  pointsBalance: number;
  isLoading: boolean;
  fetchPointsBalance: () => Promise<void>;
  setPointsBalance: (points: number) => void;
}

export const useCustomerStore = create<CustomerStore>((set) => ({
  pointsBalance: 0,
  isLoading: false,

  fetchPointsBalance: async () => {
    set({ isLoading: true });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.id) {
        const { data, error } = await supabase
          .from('users')
          .select('points_balance')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          console.warn('[useCustomerStore] Error fetching points_balance:', error);
          set({ pointsBalance: 0 });
        } else if (data) {
          set({ pointsBalance: data.points_balance ?? 0 });
        } else {
          set({ pointsBalance: 0 });
        }
      } else {
        // Guest user or not logged in
        set({ pointsBalance: 0 });
      }
    } catch (err) {
      console.error('[useCustomerStore] Exception fetching points balance:', err);
      set({ pointsBalance: 0 });
    } finally {
      set({ isLoading: false });
    }
  },

  setPointsBalance: (pointsBalance: number) => set({ pointsBalance }),
}));
