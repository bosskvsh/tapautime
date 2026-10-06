/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CHECKOUT_EDGE_FUNCTION_URL?: string;
  readonly VITE_STORAGE_RECEIPTS_BUCKET?: string;
  readonly VITE_CUSTOMER_APP_URL?: string;
  readonly VITE_MERCHANT_KDS_URL?: string;
  readonly VITE_LANDING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
