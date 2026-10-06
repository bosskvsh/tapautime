// =============================================================================
// TAPAUTIME DOMAIN & DATABASE TYPES (Technical Architecture V2.1 / V3)
// Strictly aligned with Supabase V2.1 production-hardened migration
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Enums (matching PostgreSQL custom types)
// -----------------------------------------------------------------------------

export type packaging_fee_enum = 'per_item' | 'per_order' | 'none';
export type PackagingFeeType = packaging_fee_enum;

export type ledger_entry_type = 'credit' | 'debit';
export type LedgerEntryType = ledger_entry_type;

export type payment_method_enum = 'gateway' | 'manual_transfer' | 'cash';
export type PaymentMethod = payment_method_enum;

export type menu_item_type_enum = 'standard' | 'budget_tier';
export type MenuItemType = menu_item_type_enum;

export type UserRole = 'customer' | 'merchant' | 'admin';

export type PaymentStatus = 'unpaid' | 'pending' | 'captured' | 'failed' | 'refunded';

export type OrderStatus =
  | 'pending_payment'
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'timed_out';

// -----------------------------------------------------------------------------
// 2. Value Objects & Common Structures
// -----------------------------------------------------------------------------

export interface NutritionalInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface MerchantLocation {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  postal_code?: string;
}

// -----------------------------------------------------------------------------
// 3. User & Core Entities
// -----------------------------------------------------------------------------

export interface User {
  id: string; // UUID (matches auth.users)
  role: UserRole;
  name: string;
  phone?: string | null;
  successful_orders_count?: number; // Anti-fraud trust scoring
  created_at?: string;
  updated_at?: string;
}

export interface Organization {
  id: string; // UUID
  name: string; // For multi-outlet regional franchises
  created_at?: string;
  updated_at?: string;
}

export interface ParentHub {
  id: string; // UUID
  name: string; // For multi-stall kopitiams & food courts
  location: MerchantLocation;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Merchant {
  id: string; // UUID
  owner_id?: string;
  org_id?: string | null; // UUID FK -> organizations
  hub_id?: string | null; // UUID FK -> parent_hubs
  business_name: string;
  slug: string; // Used for unique routing in the Dine-In app
  location: MerchantLocation;
  is_open: boolean;
  last_seen?: string; // Heartbeat timestamp
  packaging_fee_type: packaging_fee_enum;
  packaging_fee_amount: number; // Numeric(10,2)
  order_buffer_time: number; // Minutes
  current_prep_delay: number; // Minutes (Surge Mode Delay)
  is_surge_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

// -----------------------------------------------------------------------------
// 4. Menu, Modifiers & Nutrition
// -----------------------------------------------------------------------------

export interface MenuItem {
  id: string; // UUID
  org_id?: string | null; // UUID FK -> organizations (Franchise Master Menu)
  merchant_id?: string | null; // UUID FK -> merchants (Local Menu; nullable if org_id is present)
  item_type?: menu_item_type_enum; // 'standard' | 'budget_tier'
  name: string;
  description?: string | null;
  price: number; // Numeric(10,2)
  stock_quantity: number; // Concurrency control
  is_available: boolean;
  image_url?: string | null;
  category_id?: string | null;
  station?: string | null;
  bestseller?: boolean;
  nutritional_info?: NutritionalInfo; // JSONB macro info
  search_tags?: string[]; // Array of dietary and culinary tags
  modifiers?: MenuItemModifier[];
  created_at?: string;
  updated_at?: string;
}

export interface MenuItemModifier {
  id: string; // UUID
  item_id: string; // UUID FK -> menu_items
  linked_item_id?: string | null; // UUID FK -> menu_items (nested/cross-referenced items)
  modifier_group: string; // e.g. "Sugar Level", "Add-ons", "Spice Level"
  option_name: string; // e.g. "Kurang Manis", "Tambah Telur"
  additional_price: number; // Numeric(10,2)
  nutritional_info?: NutritionalInfo; // JSONB macro info
  is_available: boolean;
  created_at?: string;
}

export interface SelectedModifier {
  modifier_id: string;
  modifier_group: string;
  option_name: string;
  additional_price: number;
}

// -----------------------------------------------------------------------------
// 5. Client Cart & Basket
// -----------------------------------------------------------------------------

export interface CartItem {
  cart_item_id: string; // Unique client cart key
  item_id: string; // MenuItem UUID
  name: string;
  base_price: number;
  unit_price: number; // base_price + sum(selected_modifiers.additional_price)
  quantity: number;
  selected_modifiers: SelectedModifier[];
  special_instructions?: string;
  image_url?: string | null;
}

// -----------------------------------------------------------------------------
// 6. Checkout Transactions, Orders & OCC
// -----------------------------------------------------------------------------

export interface MasterTransaction {
  id: string; // UUID
  customer_id: string; // UUID FK -> users
  hub_id?: string | null; // UUID FK -> parent_hubs
  total_amount: number; // Precise total amount Numeric(10,2)
  payment_method: payment_method_enum;
  payment_status: PaymentStatus | string;
  receipt_url?: string | null;
  pickup_pin: string; // 4-digit Auntie-proof OTP
  orders?: Order[];
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string; // UUID
  transaction_id?: string | null; // UUID FK -> master_transactions
  display_id?: string; // e.g. "#101"
  customer_id: string; // UUID FK -> users
  merchant_id: string; // UUID FK -> merchants
  idempotency_key?: string | null; // Unique charge prevention key
  pickup_pin?: string; // 4-digit handoff verification PIN
  version?: number; // Multi-Tablet Optimistic Concurrency Control (OCC)
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  order_type?: 'takeaway' | 'dine_in';
  table_number?: string | null;
  payment_method?: 'online' | 'cash' | string;
  stock_reserved_until?: string | null;
  target_prep_start_time?: string | null; // Target time to start cooking
  packaging_fee_charged?: number; // Numeric(10,2) - optional for backwards-compatible mapping
  total_amount: number; // Numeric(10,2)
  created_at: string;
  updated_at?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string; // UUID
  order_id: string; // UUID FK -> orders
  item_id: string; // UUID FK -> menu_items
  item_name?: string;
  quantity: number;
  selected_modifiers: SelectedModifier[];
  price_at_time_of_order?: number;
  special_instructions?: string | null;
  created_at?: string;
}

// -----------------------------------------------------------------------------
// 7. Immutable Fiat Ledger (Double-Entry Bookkeeping)
// -----------------------------------------------------------------------------

export interface LedgerEntry {
  id: string; // UUID
  transaction_id?: string | null; // UUID FK -> master_transactions
  order_id?: string | null; // UUID FK -> orders
  merchant_id: string; // UUID FK -> merchants
  type: ledger_entry_type; // 'credit' | 'debit'
  amount: number; // Numeric(12,4) - Sub-cent commission math precision
  description: string;
  created_at?: string;
}

// -----------------------------------------------------------------------------
// 8. Customer Fiat Receipt & Settlement Proof (SECURITY DEFINER RPC Model)
// -----------------------------------------------------------------------------

export interface CustomerReceipt {
  order_id: string; // UUID
  display_id: string; // e.g. "#101" or first 8 chars of order UUID
  total_amount: number; // Customer gross total (RM)
  pickup_pin: string; // 4-digit Auntie-proof OTP
  status: string; // Order status e.g. 'completed'
  payment_status: string; // e.g. 'captured' | 'unpaid'
  payment_method: string; // 'gateway' | 'manual_transfer' | 'cash'
  created_at: string; // ISO 8601 Timestamp
  completed_at: string; // ISO 8601 Timestamp
  ledger_verified: boolean; // True if immutable double-entry rows exist in public.ledger_entries
  merchant_name?: string;
  items?: Array<{
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    selected_modifiers?: any[];
  }>;
}


