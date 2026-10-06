import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AdminAuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  isDbAdmin: boolean;
  dbRoleWarning: boolean;
  isLoading: boolean;
  adminName: string;
  adminEmail: string;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Configured fallback admin identifiers
const FALLBACK_ADMIN_EMAILS = ['boss@tapautime.my', 'admin@tapautime.my'];
const FALLBACK_ADMIN_IDS = ['c1c3e079-1a1a-4344-8d14-de12aba74bf1', 'd10a2290-4e4c-4c52-a347-f92be16ad21a'];

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  session: null,
  user: null,
  isAdmin: false,
  isDbAdmin: false,
  dbRoleWarning: false,
  isLoading: true,
  adminName: '',
  adminEmail: '',

  initialize: async () => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        set({
          session: null,
          user: null,
          isAdmin: false,
          isDbAdmin: false,
          dbRoleWarning: false,
          isLoading: false,
          adminName: '',
          adminEmail: '',
        });
        return;
      }

      const user = session.user;
      const userEmail = user.email?.toLowerCase().trim() || '';
      const userId = user.id;

      // 1. Check env overrides or hardcoded platform owner identifiers
      const envAdminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
        .toLowerCase()
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

      const envAdminIds = (import.meta.env.VITE_ADMIN_USER_IDS || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

      const isEnvAdmin =
        FALLBACK_ADMIN_EMAILS.includes(userEmail) ||
        FALLBACK_ADMIN_IDS.includes(userId) ||
        envAdminEmails.includes(userEmail) ||
        envAdminIds.includes(userId);

      // 2. Query public.users for role column
      let isDbAdmin = false;
      let dbName = userEmail;

      try {
        const { data: profile } = await supabase
          .from('users')
          .select('role, name')
          .eq('id', userId)
          .maybeSingle();

        if (profile?.role === 'admin') {
          isDbAdmin = true;
        }
        if (profile?.name) {
          dbName = profile.name;
        }
      } catch (profileErr) {
        console.warn('[AdminAuthStore] Could not query public.users profile:', profileErr);
      }

      // Self-healing: if caller is an approved environment admin but DB role is missing, sync role = admin
      if (isEnvAdmin && !isDbAdmin) {
        try {
          const { error: syncErr } = await supabase
            .from('users')
            .update({ role: 'admin' })
            .eq('id', userId);

          if (!syncErr) {
            isDbAdmin = true;
          }
        } catch (syncErr) {
          console.warn('[AdminAuthStore] Self-healing DB role sync exception:', syncErr);
        }
      }

      const hasAdminRights = isEnvAdmin || isDbAdmin;

      set({
        session,
        user,
        isAdmin: hasAdminRights,
        isDbAdmin,
        dbRoleWarning: isEnvAdmin && !isDbAdmin,
        isLoading: false,
        adminName: dbName || userEmail.split('@')[0],
        adminEmail: userEmail,
      });
    } catch (err) {
      console.error('[AdminAuthStore] Failed to initialize admin auth state:', err);
      set({
        session: null,
        user: null,
        isAdmin: false,
        isDbAdmin: false,
        dbRoleWarning: false,
        isLoading: false,
      });
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[AdminAuthStore] Error during signOut:', err);
    } finally {
      set({
        session: null,
        user: null,
        isAdmin: false,
        isLoading: false,
        adminName: '',
        adminEmail: '',
      });
    }
  },
}));
