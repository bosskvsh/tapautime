import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iaqohdvdebgxtfbxijsw.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const CHECKOUT_EDGE_FUNCTION_URL =
  import.meta.env.VITE_CHECKOUT_EDGE_FUNCTION_URL ||
  `${SUPABASE_URL}/functions/v1/checkout`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
