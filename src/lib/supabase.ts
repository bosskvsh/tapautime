import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iaqohdvdebgxtfbxijsw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcW9oZHZkZWJneHRmYnhpanN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzkyNjIsImV4cCI6MjEwMjY1NTI2Mn0.DFFY_o-wlxonj1mlHsHe3M9_ELGWtTmaqgc1iGr33WE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
