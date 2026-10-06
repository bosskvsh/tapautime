import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isInitialized: false,

  initialize: async () => {
    try {
      // 1. Setup reactive auth state change listener immediately to avoid missing events
      if (!authSubscription) {
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
          set({
            session: newSession ?? null,
            user: newSession?.user ?? null,
            isInitialized: true,
          });
        });
        authSubscription = subscription;
      }

      // 2. Fetch current session from Supabase Client
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.warn('[useAuthStore] Error fetching initial session:', error);
      }

      const hasOAuthCode = typeof window !== 'undefined' && window.location.search.includes('code=');

      if (session) {
        set({
          session,
          user: session.user,
          isInitialized: true,
        });
      } else if (hasOAuthCode) {
        // In PKCE flow: give detectSessionInUrl up to 2.5 seconds to complete token exchange
        let resolvedSession: Session | null = null;
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 200));
          const res = await supabase.auth.getSession();
          if (res.data?.session) {
            resolvedSession = res.data.session;
            break;
          }
        }
        set({
          session: resolvedSession,
          user: resolvedSession?.user ?? null,
          isInitialized: true,
        });
      } else {
        set({
          session: null,
          user: null,
          isInitialized: true,
        });
      }

      // 3. Clean OAuth query params from address bar once authenticated
      if (hasOAuthCode && typeof window !== 'undefined' && window.history?.replaceState) {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (err) {
      console.error('[useAuthStore] Initialization failed:', err);
      set({ isInitialized: true });
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
      set({
        user: null,
        session: null,
      });
    } catch (err) {
      console.error('[useAuthStore] Error signing out:', err);
    }
  },

  setUser: (user: User | null) => {
    set({ user });
  },
}));
