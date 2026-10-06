import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  DollarSign,
  ShoppingBag,
  Store,
  Clock,
  TrendingUp,
  Percent,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface OverviewMetrics {
  grossVolume: number;
  platformTake: number;
  totalOrders: number;
  activeStalls: number;
  pendingApplications: number;
  pendingPayouts: number;
}

interface ChartPoint {
  day: string;
  gmv: number;
  platform: number;
}

export const OverviewScreen: React.FC = () => {
  const [metrics, setMetrics] = useState<OverviewMetrics>({
    grossVolume: 0,
    platformTake: 0,
    totalOrders: 0,
    activeStalls: 0,
    pendingApplications: 0,
    pendingPayouts: 0,
  });
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const debounceTimerRef = useRef<any>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setErrorNotice(null);
    try {
      // Execute all metric queries in parallel with isolated error resilience
      const [ordersRes, stallsRes, appsRes, payoutsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('total_amount, platform_fee, created_at')
          .in('payment_status', ['captured', 'paid'])
          .order('created_at', { ascending: true }),
        supabase
          .from('merchants')
          .select('id', { count: 'exact', head: true })
          .eq('is_open', true),
        supabase
          .from('merchant_applications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('payout_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      if (ordersRes.error) {
        console.warn('[OverviewScreen] Orders aggregation error:', ordersRes.error);
        setErrorNotice(`Failed to load order metrics: ${ordersRes.error.message}`);
      }
      if (stallsRes.error) {
        console.warn('[OverviewScreen] Stalls query error:', stallsRes.error);
      }
      if (appsRes.error) {
        console.warn('[OverviewScreen] Applications query error:', appsRes.error);
      }
      if (payoutsRes.error) {
        console.warn('[OverviewScreen] Payouts query error:', payoutsRes.error);
      }

      const ordersData = ordersRes.data || [];

      // 1. Orders aggregation (only captured payment status)
      const gross = ordersData.reduce(
        (acc, row) => acc + (Number(row.total_amount) || 0),
        0
      );
      const take = ordersData.reduce(
        (acc, row) => acc + (Number((row as any).platform_fee) || (Number(row.total_amount) * 0.05) || 0),
        0
      );
      const ordersCount = ordersData.length;

      // 2. Generate actual historical GMV grouped by the last 7 calendar days
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const past7Days: { dateStr: string; dayLabel: string; gmv: number; platform: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const dayLabel = daysOfWeek[d.getDay()];

        past7Days.push({
          dateStr,
          dayLabel,
          gmv: 0,
          platform: 0,
        });
      }

      // Timezone-aware date bucketing matching browser local day
      ordersData.forEach((order) => {
        if (!order.created_at) return;
        const oDate = new Date(order.created_at);
        const yyyy = oDate.getFullYear();
        const mm = String(oDate.getMonth() + 1).padStart(2, '0');
        const dd = String(oDate.getDate()).padStart(2, '0');
        const orderLocalDateStr = `${yyyy}-${mm}-${dd}`;

        const targetDay = past7Days.find((d) => d.dateStr === orderLocalDateStr);
        if (targetDay) {
          const amt = Number(order.total_amount) || 0;
          const cut = Number((order as any).platform_fee) || (amt * 0.05) || 0;
          targetDay.gmv += amt;
          targetDay.platform += cut;
        }
      });

      const dynamicPoints: ChartPoint[] = past7Days.map((d) => ({
        day: d.dayLabel,
        gmv: Number(d.gmv.toFixed(2)),
        platform: Number(d.platform.toFixed(2)),
      }));

      setChartData(dynamicPoints);

      setMetrics({
        grossVolume: gross,
        platformTake: take,
        totalOrders: ordersCount,
        activeStalls: stallsRes.count || 0,
        pendingApplications: appsRes.count || 0,
        pendingPayouts: payoutsRes.count || 0,
      });
    } catch (err: any) {
      console.error('[OverviewScreen] Error fetching metrics:', err);
      setErrorNotice(err?.message || 'Failed to connect to Supabase metrics service.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced realtime callback to prevent database thrashing during order bursts
  const debouncedFetchMetrics = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchMetrics();
    }, 400);
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics();

    // Multiplexed Realtime channel listening to orders, merchant_applications, merchants, and payout_requests
    const kpiChannel = supabase
      .channel('admin_overview_kpis')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        debouncedFetchMetrics
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_applications' },
        debouncedFetchMetrics
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchants' },
        debouncedFetchMetrics
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payout_requests' },
        debouncedFetchMetrics
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(kpiChannel);
    };
  }, [fetchMetrics, debouncedFetchMetrics]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Platform Overview</h1>
          <p className="text-xs text-stone-400 mt-1 font-medium">
            Realtime operational KPIs across Kopitiam food centers and hawkers.
          </p>
        </div>

        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2.5 bg-[#181615] hover:bg-stone-800 border border-stone-800 rounded-xl text-xs font-bold text-stone-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Realtime</span>
        </button>
      </div>

      {/* Error Notice Banner */}
      {errorNotice && (
        <div className="bg-red-950/40 border border-red-800/80 rounded-2xl p-4 flex items-center gap-3 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-medium">{errorNotice}</span>
        </div>
      )}

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Gross Volume */}
        <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              Gross Platform Volume
            </span>
            <div className="w-10 h-10 rounded-2xl bg-orange-600/10 border border-orange-600/20 flex items-center justify-center text-orange-500">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight font-mono">
              RM {metrics.grossVolume.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 font-medium flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span>Cumulative customer spend</span>
          </p>
        </div>

        {/* 5% Platform Revenue */}
        <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              TapauTime 5.0% Revenue
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-500">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
              RM {metrics.platformTake.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 font-medium">
            Retained platform commission
          </p>
        </div>

        {/* Total Orders */}
        <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              Total Processed Orders
            </span>
            <div className="w-10 h-10 rounded-2xl bg-sky-600/10 border border-sky-600/20 flex items-center justify-center text-sky-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight font-mono">
              {metrics.totalOrders}
            </span>
            <span className="text-xs font-bold text-stone-400">tickets</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 font-medium">
            Takeaway & Dine-in orders
          </p>
        </div>

        {/* Active Stalls */}
        <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              Active Stalls
            </span>
            <div className="w-10 h-10 rounded-2xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center text-purple-400">
              <Store className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight font-mono">
              {metrics.activeStalls}
            </span>
            <span className="text-xs font-bold text-stone-400">stalls live</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 font-medium">
            Registered merchant kitchens
          </p>
        </div>

        {/* Pending Applications */}
        <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              Pending Applications
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400 tracking-tight font-mono">
              {metrics.pendingApplications}
            </span>
            <span className="text-xs font-bold text-stone-400">requires review</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 font-medium">
            Unapproved stall submissions
          </p>
        </div>

        {/* Pending Payouts */}
        <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              Pending Payouts
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-600/10 border border-rose-600/20 flex items-center justify-center text-rose-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-400 tracking-tight font-mono">
              {metrics.pendingPayouts}
            </span>
            <span className="text-xs font-bold text-stone-400">awaiting settlement</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1 font-medium">
            Bank transfer requests
          </p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-black text-white tracking-tight">
              7-Day Volume Trajectory
            </h2>
            <p className="text-xs text-stone-400 font-medium">
              Live gross sales vs 5% platform commission comparison from Supabase.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-stone-300">Gross Volume (RM)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-stone-300">Platform Take (RM)</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ea580c" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="takeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
              <XAxis dataKey="day" stroke="#78716c" fontSize={11} tickLine={false} />
              <YAxis stroke="#78716c" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1c1917',
                  borderColor: '#44403c',
                  borderRadius: '1rem',
                  fontSize: '12px',
                  color: '#fafaf9',
                }}
              />
              <Area
                type="monotone"
                dataKey="gmv"
                stroke="#ea580c"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#gmvGrad)"
              />
              <Area
                type="monotone"
                dataKey="platform"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#takeGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
