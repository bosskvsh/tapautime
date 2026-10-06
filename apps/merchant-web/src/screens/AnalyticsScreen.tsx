import React, { useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useAnalyticsStore } from '../stores/useAnalyticsStore';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';

const CUSTOMER_COLORS = {
  new: '#10b981', // Emerald-500
  regular: '#ea580c', // Orange-600
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: {
      period_start: string;
      formattedDate: string;
      total_sales: number;
      order_count: number;
    };
  }>;
}

const RevenueTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#181615] border border-stone-700 rounded-xl p-3 shadow-2xl text-xs space-y-1 z-50">
        <p className="font-bold text-stone-300 border-b border-stone-800 pb-1">
          {data.formattedDate}
        </p>
        <div className="flex items-center justify-between gap-4 text-stone-200">
          <span className="text-orange-400 font-semibold">Net Sales:</span>
          <span className="font-mono font-bold">RM {data.total_sales.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-stone-400">
          <span>Orders:</span>
          <span className="font-mono font-bold text-stone-200">{data.order_count}</span>
        </div>
      </div>
    );
  }
  return null;
};

export interface AnalyticsScreenProps {
  embedded?: boolean;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({ embedded = false }) => {
  const { merchantId } = useMerchantKDSStore();
  const {
    timeframe,
    salesMetrics,
    customerMetrics,
    isLoading,
    error,
    setTimeframe,
    fetchAnalytics,
  } = useAnalyticsStore();

  const effectiveMerchantId = useMemo(() => {
    return (
      merchantId ||
      localStorage.getItem('tapautime_merchant_id') ||
      ''
    );
  }, [merchantId]);

  const handleRefresh = useCallback(() => {
    if (effectiveMerchantId) {
      fetchAnalytics(effectiveMerchantId);
    }
  }, [effectiveMerchantId, fetchAnalytics]);

  useEffect(() => {
    if (effectiveMerchantId) {
      fetchAnalytics(effectiveMerchantId);
    }
  }, [effectiveMerchantId, timeframe, fetchAnalytics]);

  // KPI Calculations
  const totalSales = useMemo(() => {
    return salesMetrics.reduce((sum, item) => sum + item.total_sales, 0);
  }, [salesMetrics]);

  const totalOrders = useMemo(() => {
    return salesMetrics.reduce((sum, item) => sum + item.order_count, 0);
  }, [salesMetrics]);

  const averageOrderValue = useMemo(() => {
    return totalOrders > 0 ? totalSales / totalOrders : 0;
  }, [totalSales, totalOrders]);

  const totalActiveCustomers = useMemo(() => {
    return customerMetrics.new_customers + customerMetrics.regular_customers;
  }, [customerMetrics]);

  const customerPieData = useMemo(() => {
    const data = [
      { name: 'New Customers', value: customerMetrics.new_customers, color: CUSTOMER_COLORS.new },
      { name: 'Regular Customers', value: customerMetrics.regular_customers, color: CUSTOMER_COLORS.regular },
    ];
    return data;
  }, [customerMetrics]);

  // Format sales chart data
  const chartData = useMemo(() => {
    return salesMetrics.map((item) => {
      const date = new Date(item.period_start);
      const formattedDate = date.toLocaleDateString('en-MY', {
        month: 'short',
        day: 'numeric',
      });
      return {
        ...item,
        formattedDate,
      };
    });
  }, [salesMetrics]);

  return (
    <div className={embedded ? 'space-y-6 pt-1' : 'min-h-full bg-[#1c1917] p-4 sm:p-6 lg:p-8 text-stone-100 max-w-7xl mx-auto space-y-6'}>
      {/* Top Header & Timeframe Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-5">
        {!embedded ? (
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Operations & Sales Analytics
              </h2>
              {isLoading && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-950/80 text-orange-400 border border-orange-800/60 animate-pulse">
                  Syncing...
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-stone-400 mt-1">
              Real-time captured sales metrics, order cadence, and customer retention dynamics.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">
              Analytics Timeframe
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-950/80 text-orange-400 border border-orange-800/60 animate-pulse">
                Syncing...
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Timeframe Toggle */}
          <div
            className="flex items-center bg-[#181615] p-1 rounded-2xl border border-stone-800 text-xs font-bold shadow-inner"
            role="group"
            aria-label="Analytics Timeframe Filter"
          >
            <button
              onClick={() => setTimeframe('7d', effectiveMerchantId)}
              className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                timeframe === '7d'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeframe('30d', effectiveMerchantId)}
              className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                timeframe === '30d'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              30 Days
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 bg-[#24201e] border border-stone-800 hover:border-stone-700 rounded-xl text-stone-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="Refresh analytics data"
            aria-label="Refresh analytics data"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-500' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/80 rounded-2xl p-4 text-xs sm:text-sm text-red-200 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="font-bold text-red-400">Error loading metrics:</span>
            <span>{error}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-red-100 rounded-lg font-bold text-xs transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Total Sales */}
        <div className="bg-[#24201e] border border-stone-800/80 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-stone-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/5 rounded-full blur-2xl group-hover:bg-orange-600/10 transition-colors pointer-events-none" />
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-stone-400">
            Total Net Sales
          </p>
          <div className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white">
            RM {totalSales.toFixed(2)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
            <span className="text-orange-500 font-bold">Sum of Merchant Cut</span>
            <span>• {timeframe === '7d' ? 'Last 7d' : 'Last 30d'}</span>
          </div>
        </div>

        {/* KPI 2: Total Orders */}
        <div className="bg-[#24201e] border border-stone-800/80 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-stone-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-600/5 rounded-full blur-2xl group-hover:bg-amber-600/10 transition-colors pointer-events-none" />
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-stone-400">
            Captured Orders
          </p>
          <div className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white">
            {totalOrders}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
            <span className="text-emerald-400 font-bold">Settlement ready</span>
            <span>• paid orders</span>
          </div>
        </div>

        {/* KPI 3: Average Order Value */}
        <div className="bg-[#24201e] border border-stone-800/80 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-stone-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-600/5 rounded-full blur-2xl group-hover:bg-emerald-600/10 transition-colors pointer-events-none" />
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-stone-400">
            Avg. Order Value
          </p>
          <div className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white">
            RM {averageOrderValue.toFixed(2)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
            <span>Per captured ticket</span>
          </div>
        </div>

        {/* KPI 4: Active Customers */}
        <div className="bg-[#24201e] border border-stone-800/80 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-stone-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-2xl group-hover:bg-blue-600/10 transition-colors pointer-events-none" />
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-stone-400">
            Purchasing Customers
          </p>
          <div className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white">
            {totalActiveCustomers}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
            <span className="text-emerald-400 font-bold">{customerMetrics.new_customers} New</span>
            <span>/</span>
            <span className="text-orange-500 font-bold">{customerMetrics.regular_customers} Regular</span>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Revenue & Orders Trend Chart */}
        <div className="lg:col-span-2 bg-[#24201e] border border-stone-800/80 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-white">
                  Revenue Trend
                </h2>
                <p className="text-xs text-stone-400">
                  Daily net sales breakdown across the active timeframe.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-orange-600 inline-block" />
                  <span className="text-stone-300 font-bold">Net Sales (RM)</span>
                </div>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-stone-500 text-xs border border-dashed border-stone-800 rounded-xl">
                <svg className="w-10 h-10 mb-2 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="font-semibold text-stone-400">No captured sales recorded in this timeframe</p>
                <p className="text-[11px] text-stone-500 mt-1">Orders with payment status 'captured' will appear here.</p>
              </div>
            ) : (
              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      stroke="#78716c"
                      tick={{ fill: '#a8a29e', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#292524' }}
                    />
                    <YAxis
                      stroke="#78716c"
                      tick={{ fill: '#a8a29e', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `RM ${val}`}
                    />
                    <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                    <Bar
                      dataKey="total_sales"
                      fill="#ea580c"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={45}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
            <span>Aggregated by day from PostgreSQL `orders`</span>
            <span className="font-mono text-stone-300">
              {salesMetrics.length} active sales {salesMetrics.length === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>

        {/* Right (1 col): Customer Mix Pie Chart */}
        <div className="bg-[#24201e] border border-stone-800/80 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              Customer Mix
            </h2>
            <p className="text-xs text-stone-400 mb-2">
              New vs. Regular customer retention.
            </p>

            {totalActiveCustomers === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-stone-500 text-xs border border-dashed border-stone-800 rounded-xl my-4">
                <svg className="w-10 h-10 mb-2 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="font-semibold text-stone-400">No active customer data</p>
                <p className="text-[11px] text-stone-500 mt-1">Customers with captured orders will appear here.</p>
              </div>
            ) : (
              <div className="h-56 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={customerPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                    >
                      {customerPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#1c1917" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: unknown, name: unknown) => {
                        const numericVal = Number(val) || 0;
                        const label = String(name || '');
                        const pct = totalActiveCustomers > 0 ? ((numericVal / totalActiveCustomers) * 100).toFixed(0) : '0';
                        return [`${numericVal} customers (${pct}%)`, label];
                      }}
                      contentStyle={{
                        backgroundColor: '#181615',
                        borderColor: '#44403c',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: '#f5f5f4',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string) => (
                        <span className="text-xs font-semibold text-stone-300">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Retention Breakdown Cards */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="bg-[#181615] p-3 rounded-xl border border-stone-800/80">
                <div className="flex items-center gap-1.5 text-xs text-stone-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>New (1st Order)</span>
                </div>
                <div className="text-lg font-black text-white mt-1">
                  {customerMetrics.new_customers}
                </div>
                <div className="text-[10px] text-stone-500">
                  {totalActiveCustomers > 0
                    ? `${((customerMetrics.new_customers / totalActiveCustomers) * 100).toFixed(1)}% share`
                    : '0% share'}
                </div>
              </div>

              <div className="bg-[#181615] p-3 rounded-xl border border-stone-800/80">
                <div className="flex items-center gap-1.5 text-xs text-stone-400">
                  <span className="w-2 h-2 rounded-full bg-orange-600" />
                  <span>Regular (&gt;1 Orders)</span>
                </div>
                <div className="text-lg font-black text-white mt-1">
                  {customerMetrics.regular_customers}
                </div>
                <div className="text-[10px] text-stone-500">
                  {totalActiveCustomers > 0
                    ? `${((customerMetrics.regular_customers / totalActiveCustomers) * 100).toFixed(1)}% share`
                    : '0% share'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
            <span>Customer Lifetime Cohort</span>
            <span className="text-stone-300 font-bold">
              {totalActiveCustomers > 0
                ? `${((customerMetrics.regular_customers / totalActiveCustomers) * 100).toFixed(0)}% repeat rate`
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="bg-[#24201e] border border-stone-800/80 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              Daily Ledger Breakdown
            </h2>
            <p className="text-xs text-stone-400">
              Aggregated financial breakdown by calendar day.
            </p>
          </div>
        </div>

        {salesMetrics.length === 0 ? (
          <div className="text-center py-8 text-stone-500 text-xs">
            No sales records available for the selected {timeframe === '7d' ? '7-day' : '30-day'} window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-300">
              <thead>
                <tr className="border-b border-stone-800 text-[11px] uppercase tracking-wider text-stone-400">
                  <th className="pb-3 font-bold">Period Start</th>
                  <th className="pb-3 font-bold text-center">Captured Orders</th>
                  <th className="pb-3 font-bold text-right">Net Sales (RM)</th>
                  <th className="pb-3 font-bold text-right">Avg Basket (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {salesMetrics.map((item, idx) => {
                  const date = new Date(item.period_start);
                  const formatted = date.toLocaleDateString('en-MY', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const avgBasket = item.order_count > 0 ? item.total_sales / item.order_count : 0;
                  return (
                    <tr key={idx} className="hover:bg-stone-800/20 transition-colors">
                      <td className="py-3 font-medium text-stone-200">{formatted}</td>
                      <td className="py-3 text-center font-mono font-bold text-stone-300">
                        {item.order_count}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-orange-400">
                        RM {item.total_sales.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-mono text-stone-400">
                        RM {avgBasket.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
