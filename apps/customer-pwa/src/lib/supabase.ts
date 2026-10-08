import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string) ||
  'https://iaqohdvdebgxtfbxijsw.supabase.co';

export const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcW9oZHZkZWJneHRmYnhpanN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzkyNjIsImV4cCI6MjEwMjY1NTI2Mn0.DFFY_o-wlxonj1mlHsHe3M9_ELGWtTmaqgc1iGr33WE';

export const CHECKOUT_EDGE_FUNCTION_URL =
  (import.meta.env?.VITE_CHECKOUT_EDGE_FUNCTION_URL as string) ||
  `${SUPABASE_URL}/functions/v1/checkout`;

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

const hybridAuthStorage = {
  getItem: (key: string): string | null => {
    if (!isBrowser) return null;
    try {
      // 1. Primary: localStorage (fast, resilient, 5MB quota, survives PWA lifecycles & bank redirects)
      const localValue = window.localStorage.getItem(key);
      if (localValue) {
        return localValue;
      }

      // 2. Cross-subdomain SSO bridge: check document.cookie if not in localStorage
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedKey}=([^;]+)`));
      if (match && match[1]) {
        try {
          const decoded = decodeURIComponent(match[1]);
          // Hydrate localStorage immediately so future reads are instantaneous
          window.localStorage.setItem(key, decoded);
          return decoded;
        } catch {
          window.localStorage.setItem(key, match[1]);
          return match[1];
        }
      }
    } catch (err) {
      console.warn('[Supabase Auth Storage] Error reading storage key:', key, err);
    }
    return null;
  },

  setItem: (key: string, value: string): void => {
    if (!isBrowser) return;
    try {
      // 1. Primary: Always write to localStorage
      window.localStorage.setItem(key, value);

      // 2. Cross-subdomain SSO bridge: If running on tapautime.my, sync to cookie
      const hostname = window.location.hostname;
      const isTapauDomain = hostname.endsWith('tapautime.my');
      const domainAttr = isTapauDomain ? '; domain=.tapautime.my' : '';
      const secureAttr = window.location.protocol === 'https:' ? '; secure' : '';
      const encoded = encodeURIComponent(value);

      // Guard: Cookies have strict 4KB limits. Only set cookie if it fits safely (< 3800 bytes)
      if (encoded.length < 3800) {
        document.cookie = `${key}=${encoded}; path=/; max-age=31536000${domainAttr}${secureAttr}; samesite=Lax`;
      }
    } catch (err) {
      console.warn('[Supabase Auth Storage] Error writing storage key:', key, err);
    }
  },

  removeItem: (key: string): void => {
    if (!isBrowser) return;
    try {
      // 1. Clear from localStorage
      window.localStorage.removeItem(key);

      // 2. Clear cookie across all possible domain permutations
      const hostname = window.location.hostname;
      const isTapauDomain = hostname.endsWith('tapautime.my');
      const domainAttr = isTapauDomain ? '; domain=.tapautime.my' : '';
      document.cookie = `${key}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainAttr}`;
      document.cookie = `${key}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    } catch (err) {
      console.warn('[Supabase Auth Storage] Error removing storage key:', key, err);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: hybridAuthStorage,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
