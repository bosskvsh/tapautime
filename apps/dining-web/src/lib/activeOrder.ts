// =============================================================================
// TapauTime Dine-In: Active Order Session Tracker
// Persists active order details so customers can seamlessly track back their order
// =============================================================================

export interface ActiveDineInOrder {
  orderNumber: string; // e.g. "#7D0E-1"
  pickupPin: string;   // e.g. "6847"
  txId: string;        // e.g. "7d0e4ff0-0c97-4558-8b0e-2e6a5dca7896"
  merchantSlug: string;
  tableNumber: string;
  createdAt: number;
  status?: string;     // e.g. "accepted", "preparing", "ready", "completed"
}

const STORAGE_KEY = 'tapautime_active_dine_in_order';
const EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

export const TERMINAL_STATUSES = new Set([
  'completed',
  'delivered',
  'served',
  'cancelled',
  'rejected',
  'failed',
]);

export function isTerminalStatus(status?: string | null): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.has(status.toLowerCase().trim());
}

export function saveActiveDineInOrder(order: Omit<ActiveDineInOrder, 'createdAt'>): void {
  try {
    if (isTerminalStatus(order.status)) {
      clearActiveDineInOrder();
      return;
    }

    const payload: ActiveDineInOrder = {
      ...order,
      createdAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[ActiveOrder] Failed to save active order to localStorage:', e);
  }
}

export function getActiveDineInOrder(merchantSlug?: string, tableNumber?: string): ActiveDineInOrder | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: ActiveDineInOrder = JSON.parse(raw);
    if (!parsed || !parsed.txId) return null;

    // Terminal orders (completed / cancelled) are never active
    if (isTerminalStatus(parsed.status)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Check expiry
    if (Date.now() - (parsed.createdAt || 0) > EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // If context provided, ensure it matches current table/stall
    if (merchantSlug && parsed.merchantSlug && parsed.merchantSlug !== merchantSlug) {
      return null;
    }
    if (tableNumber && parsed.tableNumber && parsed.tableNumber !== tableNumber) {
      return null;
    }

    return parsed;
  } catch (e) {
    return null;
  }
}

export function updateActiveDineInOrderStatus(status: string): void {
  try {
    if (isTerminalStatus(status)) {
      clearActiveDineInOrder();
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: ActiveDineInOrder = JSON.parse(raw);
    parsed.status = status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (e) {
    // ignore
  }
}

export function clearActiveDineInOrder(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}
