/**
 * Database Entity: merchant_payment_settings
 * 1:1 mapping with PostgreSQL table schema
 */
export interface MerchantPaymentSettings {
  merchant_id: string;
  tng_duitnow_enabled: boolean;
  tng_duitnow_id: string | null;
  tng_duitnow_qr_url?: string | null;
  grabpay_enabled: boolean;
  grabpay_id: string | null;
  fpx_enabled: boolean;
  fpx_bank_name: string | null;
  fpx_account_number: string | null;
  cash_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Controlled Form State for React Component
 */
export interface PaymentFormState {
  tng_duitnow_enabled: boolean;
  tng_duitnow_id: string;
  tng_duitnow_qr_url: string;
  grabpay_enabled: boolean;
  grabpay_id: string;
  fpx_enabled: boolean;
  fpx_bank_name: string;
  fpx_account_number: string;
  cash_enabled: boolean;
}

/**
 * Form Validation Error State
 */
export interface PaymentFormErrors {
  tng_duitnow_id?: string;
  tng_duitnow_qr_url?: string;
  grabpay_id?: string;
  fpx_bank_name?: string;
  fpx_account_number?: string;
  general?: string;
}

/**
 * Supported FPX Bank Option
 */
export interface BankOption {
  code: string;
  name: string;
}
