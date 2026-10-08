import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      isInitialized: false,

      initialize: async () => {
        try {
          // 1. Setup reactive auth state change listener immediately to avoid missing events
          if (!authSubscription) {
            const {
              data: { subscription },
            } = supabase.auth.onAuthStateChange((event, newSession) => {
              if (event === 'SIGNED_OUT') {
                set({
                  session: null,
                  user: null,
                  isInitialized: true,
                });
              } else if (newSession) {
                set({
                  session: newSession,
                  user: newSession.user,
                  isInitialized: true,
                });
                if (newSession.access_token) {
                  try {
                    supabase.realtime.setAuth(newSession.access_token);
                  } catch (_) {}
                }
              } else if (event === 'INITIAL_SESSION' && !newSession) {
                // Do not prematurely wipe persisted session; getSession will verify authoritatively
              }
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
            if (session.access_token) {
              try {
                supabase.realtime.setAuth(session.access_token);
              } catch (_) {}
            }
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
            if (resolvedSession?.access_token) {
              try {
                supabase.realtime.setAuth(resolvedSession.access_token);
              } catch (_) {}
            }
          } else {
            // If getSession returned null and there's no in-flight OAuth exchange
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
        } catch (err) {
          console.error('[useAuthStore] Error signing out:', err);
        } finally {
          set({
            user: null,
            session: null,
            isInitialized: true,
          });
          // Explicit user logout: safely clear customer order state
          try {
            const { useCustomerOrderStore } = await import('./useCustomerOrderStore');
            useCustomerOrderStore.getState().clearActiveOrder();
            useCustomerOrderStore.getState().setOrderHistory([]);
          } catch (_) {}
        }
      },

      setUser: (user: User | null) => {
        set((state) => ({
          user,
          session: state.session && user ? { ...state.session, user } : state.session,
        }));
      },
    }),
    {
      name: 'tapautime-customer-auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        session: state.session,
      }),
    }
  )
);

