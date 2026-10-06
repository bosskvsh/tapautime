import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type AnalyticsTimeframe = '7d' | '30d';

export interface SalesMetricPoint {
  period_start: string;
  total_sales: number;
  order_count: number;
}

export interface CustomerMetricData {
  new_customers: number;
  regular_customers: number;
}

interface AnalyticsState {
  timeframe: AnalyticsTimeframe;
  salesMetrics: SalesMetricPoint[];
  customerMetrics: CustomerMetricData;
  isLoading: boolean;
  error: string | null;
  setTimeframe: (timeframe: AnalyticsTimeframe, merchantId?: string) => void;
  fetchAnalytics: (merchantId: string) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  timeframe: '7d',
  salesMetrics: [],
  customerMetrics: {
    new_customers: 0,
    regular_customers: 0,
  },
  isLoading: false,
  error: null,

  setTimeframe: (timeframe, merchantId) => {
    set({ timeframe });
    if (merchantId) {
      get().fetchAnalytics(merchantId);
    }
  },

  fetchAnalytics: async (merchantId: string) => {
    if (!merchantId) {
      set({
        salesMetrics: [],
        customerMetrics: { new_customers: 0, regular_customers: 0 },
        isLoading: false,
        error: null,
      });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const { timeframe } = get();
      const days = timeframe === '7d' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const [salesRes, customerRes] = await Promise.all([
        supabase.rpc('get_merchant_sales_metrics', {
          p_merchant_id: merchantId,
          p_start_date: startDate.toISOString(),
          p_interval: 'day',
        }),
        supabase.rpc('get_merchant_customer_metrics', {
          p_merchant_id: merchantId,
          p_start_date: startDate.toISOString(),
        }),
      ]);

      if (salesRes.error) {
        console.error('[useAnalyticsStore] Failed to fetch sales metrics:', salesRes.error);
        throw new Error(salesRes.error.message || 'Failed to load sales metrics');
      }

      if (customerRes.error) {
        console.error('[useAnalyticsStore] Failed to fetch customer metrics:', customerRes.error);
        throw new Error(customerRes.error.message || 'Failed to load customer metrics');
      }

      const formattedSales: SalesMetricPoint[] = Array.isArray(salesRes.data)
        ? salesRes.data.map((row: { period_start: string; total_sales: string | number; order_count: string | number }) => ({
            period_start: row.period_start,
            total_sales: parseFloat(String(row.total_sales || 0)),
            order_count: parseInt(String(row.order_count || 0), 10),
          }))
        : [];

      const rawCustomer = customerRes.data?.[0];
      const formattedCustomers: CustomerMetricData = {
        new_customers: parseInt(String(rawCustomer?.new_customers || 0), 10),
        regular_customers: parseInt(String(rawCustomer?.regular_customers || 0), 10),
      };

      set({
        salesMetrics: formattedSales,
        customerMetrics: formattedCustomers,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown analytics error';
      set({
        isLoading: false,
        error: errorMessage,
      });
    }
  },
}));
