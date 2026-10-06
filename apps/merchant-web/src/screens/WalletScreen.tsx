import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Banknote,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  ArrowRight,
  TicketPercent,
  BarChart3,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import { AnalyticsScreen } from './AnalyticsScreen';

type SaleDisplayStatus = 'completed' | 'pending' | 'processing' | 'settled' | 'cancelled';

interface OrderSaleItem {
  id: string;
  display_id: string | null;
  created_at: string;
  total_amount: number;
  merchant_cut: number;
  order_status: string;
  status: string;
  payment_status: string;
  payout_status: string;
  effective_status: SaleDisplayStatus;
  promo_code?: string | null;
  discount_amount: number;
}

interface PayoutRequestItem {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'settled' | 'rejected';
  created_at: string;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

// Deterministic status resolver ensuring pending orders are clearly marked
const resolveEffectiveStatus = (
  orderStatus: string,
  genStatus: string,
  payStatus: string,
  payoutStatus: string
): SaleDisplayStatus => {
  const os = (orderStatus || '').toLowerCase();
  const gs = (genStatus || '').toLowerCase();
  const ps = (payStatus || '').toLowerCase();
  const py = (payoutStatus || '').toLowerCase();

  if (os === 'cancelled' || gs === 'cancelled' || ps === 'failed') {
    return 'cancelled';
  }
  if (py === 'settled' || py === 'completed') {
    return 'settled';
  }
  if (py === 'processing') {
    return 'processing';
  }
  // If order or payment is pending, status is strictly pending
  if (os === 'pending' || gs === 'pending' || ps === 'pending' || ps === 'pending_cash') {
    return 'pending';
  }
  if ((os === 'completed' || gs === 'completed') && (ps === 'captured' || ps === 'paid')) {
    return 'completed';
  }

  return 'pending';
};

export interface WalletScreenProps {
  initialSection?: 'wallet' | 'analytics';
}

export const WalletScreen: React.FC<WalletScreenProps> = ({ initialSection = 'wallet' }) => {
  const { merchantId, merchantName } = useMerchantKDSStore();
  const activeMerchantId =
    merchantId || localStorage.getItem('tapautime_merchant_id') || '';

  const [financeSection, setFinanceSection] = useState<'wallet' | 'analytics'>(initialSection);

  useEffect(() => {
    if (initialSection) {
      setFinanceSection(initialSection);
    }
  }, [initialSection]);

  // Data states
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);
  const [recentSales, setRecentSales] = useState<OrderSaleItem[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRequestItem[]>([]);
  const [bankInfo, setBankInfo] = useState<{ bankName: string; accountMask: string } | null>(null);

  // UI states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'sales' | 'withdrawals'>('sales');
  const [toast, setToast] = useState<ToastState | null>(null);

  // Auto dismiss toast after 4.5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch Wallet Data: Balance, Recent Sales, Bank Info, and Payout History
  const fetchWalletData = useCallback(async () => {
    if (!activeMerchantId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      // 0. Fetch merchant banking details from location jsonb
      const { data: merchantRow } = await supabase
        .from('merchants')
        .select('location')
        .eq('id', activeMerchantId)
        .maybeSingle();

      if (merchantRow?.location && typeof merchantRow.location === 'object') {
        const loc = merchantRow.location as Record<string, any>;
        if (loc.bank_name) {
          const accNum = String(loc.bank_account_number || '');
          setBankInfo({
            bankName: loc.bank_name,
            accountMask: accNum.length > 4 ? `•••• ${accNum.slice(-4)}` : accNum,
          });
        }
      }

      // 0. Automatically sweep expired pending payment sessions (>15 mins)
      try {
        await supabase.rpc('cancel_expired_pending_orders', { p_max_age_minutes: 15 });
      } catch (sweepErr) {
        console.warn('[Wallet] Expired order sweep notice:', sweepErr);
      }

      // 1. Fetch orders to calculate available balance.
      // STRICT RULE: Anything in 'pending' status is NOT accounted for in available balance.
      const { data: eligibleOrders, error: balanceError } = await supabase
        .from('orders')
        .select('id, merchant_cut, order_status, status, payment_status, payout_status')
        .eq('merchant_id', activeMerchantId)
        .eq('payout_status', 'pending')
        .in('payment_status', ['captured', 'paid']);

      if (balanceError) throw balanceError;

      const completedOrders = (eligibleOrders || []).filter((o) => {
        const orderStatus = (o.order_status || '').toLowerCase();
        const genStatus = (o.status || '').toLowerCase();
        const payStatus = (o.payment_status || '').toLowerCase();

        if (
          orderStatus === 'pending' ||
          genStatus === 'pending' ||
          payStatus === 'pending' ||
          payStatus === 'pending_cash'
        ) {
          return false;
        }

        return orderStatus === 'completed' || genStatus === 'completed';
      });

      const sum = completedOrders.reduce(
        (acc, row) => acc + (Number(row.merchant_cut) || 0),
        0
      );
      setAvailableBalance(Number(sum.toFixed(2)));

      // 2. Fetch recent sales (last 50 orders)
      const { data: salesData, error: salesError } = await supabase
        .from('orders')
        .select('id, display_id, created_at, total_amount, merchant_cut, order_status, status, payment_status, payout_status, promo_code, discount_amount')
        .eq('merchant_id', activeMerchantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (salesError) throw salesError;

      let pendingCount = 0;
      const mappedSales: OrderSaleItem[] = (salesData || []).map((o) => {
        const effective = resolveEffectiveStatus(
          o.order_status,
          o.status,
          o.payment_status,
          o.payout_status
        );
        if (effective === 'pending') {
          pendingCount += 1;
        }

        return {
          id: o.id,
          display_id: o.display_id,
          created_at: o.created_at,
          total_amount: Number(o.total_amount) || 0,
          merchant_cut: Number(o.merchant_cut) || 0,
          order_status: o.order_status || '',
          status: o.status || '',
          payment_status: o.payment_status || '',
          payout_status: o.payout_status || '',
          effective_status: effective,
          promo_code: o.promo_code || null,
          discount_amount: Number(o.discount_amount) || 0,
        };
      });

      setRecentSales(mappedSales);
      setPendingOrdersCount(pendingCount);

      // 3. Fetch withdrawal history (payout_requests)
      const { data: payoutsData, error: payoutsError } = await supabase
        .from('payout_requests')
        .select('id, amount, status, created_at')
        .eq('merchant_id', activeMerchantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (payoutsError) throw payoutsError;

      const mappedPayouts: PayoutRequestItem[] = (payoutsData || []).map((p) => ({
        id: p.id,
        amount: Number(p.amount) || 0,
        status: p.status,
        created_at: p.created_at,
      }));
      setPayoutHistory(mappedPayouts);
    } catch (err: unknown) {
      console.error('[WalletScreen] Failed to fetch wallet data:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load wallet data';
      setToast({ type: 'error', message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [activeMerchantId]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Execute full withdrawal handler after user confirmation
  const handleConfirmWithdrawal = async () => {
    if (availableBalance <= 0 || isWithdrawing) return;

    setIsWithdrawing(true);
    try {
      const { data: payoutRequestId, error } = await supabase.rpc(
        'request_full_withdrawal',
        { p_merchant_id: activeMerchantId }
      );

      if (error) throw error;

      setIsConfirmModalOpen(false);
      setToast({
        type: 'success',
        message: `Withdrawal request for RM ${availableBalance.toFixed(2)} submitted successfully! (ID: ${String(payoutRequestId).slice(0, 8)})`,
      });

      await fetchWalletData();
      setActiveTab('withdrawals');
    } catch (err: unknown) {
      console.error('[WalletScreen] Withdrawal failed:', err);
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ||
            'Failed to submit withdrawal request. Please try again.';
      setToast({ type: 'error', message: msg });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getStatusBadge = (status: SaleDisplayStatus | string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'settled':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Settled
          </span>
        );
      case 'processing':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1 shrink-0">
            <RotateCw className="w-3 h-3 animate-spin" /> Processing
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case 'rejected':
      case 'cancelled':
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1 shrink-0">
            <X className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-800 text-stone-300 shrink-0">
            {status}
          </span>
        );
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-MY', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto text-stone-100 pb-24 md:pb-8">
      {/* Toast Notification Alert Banner */}
      {toast && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between border shadow-xl transition-all animate-fadeIn ${
            toast.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-600/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-600/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3 text-sm font-semibold">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-stone-400 hover:text-white text-xs font-black ml-4 p-1.5 rounded-lg bg-black/20 cursor-pointer"
            aria-label="Dismiss toast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Screen Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
              <Wallet className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Finances & Analytics
            </h1>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            {financeSection === 'wallet' ? (
              <>
                Sales earnings, bank payouts, and audit reports for{' '}
                <span className="text-stone-200 font-bold">{merchantName || 'Your Stall'}</span>
              </>
            ) : (
              'Real-time captured sales metrics, order cadence, and customer retention dynamics.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sub-navigation Pills */}
          <div
            className="flex items-center bg-[#181615] p-1 rounded-2xl border border-stone-800 text-xs font-bold shadow-inner"
            role="tablist"
            aria-label="Finances Section"
          >
            <button
              role="tab"
              aria-selected={financeSection === 'wallet'}
              onClick={() => setFinanceSection('wallet')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                financeSection === 'wallet'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Wallet & Payouts</span>
            </button>
            <button
              role="tab"
              aria-selected={financeSection === 'analytics'}
              onClick={() => setFinanceSection('analytics')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                financeSection === 'analytics'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Sales & Analytics</span>
            </button>
          </div>

          {financeSection === 'wallet' && (
            <button
              onClick={() => fetchWalletData()}
              disabled={isLoading}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1f1c1a] hover:bg-stone-800 border border-stone-800 text-stone-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Refresh ledger"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {financeSection === 'analytics' ? (
        <AnalyticsScreen embedded={true} />
      ) : (
        <>
          {/* Balance & Actions Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Available Balance Card */}
            <div className="lg:col-span-7 bg-[#1c1917] border border-stone-800/80 rounded-3xl p-6 sm:p-7 relative overflow-hidden shadow-2xl flex flex-col justify-between group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/10 rounded-full blur-3xl pointer-events-none group-hover:bg-orange-600/15 transition-all duration-500" />
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

              <div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-orange-500 flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    Available Balance
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-black text-stone-400 font-mono">RM</span>
                  <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight font-mono">
                    {isLoading ? '...' : availableBalance.toFixed(2)}
                  </span>
                </div>

                {/* Quick Metrics Chips */}
                {pendingOrdersCount > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        <strong className="text-amber-200 font-bold">{pendingOrdersCount}</strong> pending fulfillment
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400">
                {bankInfo ? (
                  <span className="font-mono text-xs text-stone-200 flex items-center gap-1.5 bg-stone-900/60 px-3 py-1 rounded-xl border border-stone-800">
                    <Building2 className="w-3.5 h-3.5 text-orange-400" />
                    <span className="font-bold">{bankInfo.bankName}</span>
                    <span className="text-stone-400">{bankInfo.accountMask}</span>
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-stone-500">
                    Stall ID: {activeMerchantId.slice(0, 8)}...
                  </span>
                )}
              </div>
            </div>

            {/* Withdraw Action Card */}
            <div className="lg:col-span-5 bg-[#1c1917] border border-stone-800/80 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xl relative overflow-hidden">
              <div>
                <div>
                  <h3 className="font-black text-white text-base tracking-tight flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-orange-500" />
                    <span>Request Bank Transfer</span>
                  </h3>
                </div>
                <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                  Transfer settled sales earnings directly to your registered Malaysian bank account.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  onClick={() => setIsConfirmModalOpen(true)}
                  disabled={availableBalance <= 0 || isWithdrawing || isLoading}
                  className={`min-h-[48px] w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                    availableBalance > 0 && !isWithdrawing
                      ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-orange-600/25 active:scale-[0.98]'
                      : 'bg-stone-900 text-stone-500 cursor-not-allowed border border-stone-800 shadow-none'
                  }`}
                >
                  {availableBalance <= 0 ? (
                    <span>No Balance to Withdraw</span>
                  ) : (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Withdraw RM {availableBalance.toFixed(2)}</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Direct automated payouts via DuitNow FPX rails</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity & Ledger Section */}
          <div className="bg-[#181615] border border-stone-800/80 rounded-3xl overflow-hidden shadow-2xl">
            {/* Ledger Navigation Tabs */}
            <div className="border-b border-stone-800/80 px-4 sm:px-6 py-4 flex items-center justify-between bg-stone-950/40">
              <div className="flex items-center gap-2 bg-[#121110] p-1 rounded-2xl border border-stone-800/80 text-xs font-bold w-fit">
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'sales'
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  <span>Recent Sales</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      activeTab === 'sales' ? 'bg-orange-700/60 text-white' : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {recentSales.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('withdrawals')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'withdrawals'
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  <span>Withdrawals</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      activeTab === 'withdrawals' ? 'bg-orange-700/60 text-white' : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {payoutHistory.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Tab 1: Recent Sales */}
            {activeTab === 'sales' && (
              <div className="divide-y divide-stone-800/50">
                {recentSales.length === 0 ? (
                  <div className="py-16 text-center text-stone-500 font-bold text-sm">
                    No recent orders found for this merchant.
                  </div>
                ) : (
                  recentSales.map((sale) => {
                    const isPending = sale.effective_status === 'pending';
                    const isCancelled = sale.effective_status === 'cancelled';

                    return (
                      <div
                        key={sale.id}
                        className="p-4 sm:px-6 sm:py-4 flex items-center justify-between gap-3 hover:bg-stone-800/30 transition-colors group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-transform group-hover:scale-105 ${
                              isCancelled
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : isPending
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isCancelled ? (
                              <X className="w-4 h-4" />
                            ) : isPending ? (
                              <Clock className="w-4 h-4" />
                            ) : (
                              <Banknote className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm font-mono tracking-tight">
                                {sale.display_id || `#${sale.id.slice(0, 8)}`}
                              </span>
                              {getStatusBadge(sale.effective_status)}
                              {sale.promo_code && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400 font-mono">
                                  <TicketPercent className="h-3 w-3 shrink-0" />
                                  {sale.promo_code}
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-stone-400 mt-1 flex items-center gap-2 flex-wrap">
                              <span>{formatDate(sale.created_at)}</span>
                              <span className="text-stone-600 font-bold">•</span>
                              {sale.discount_amount > 0 ? (
                                <>
                                  <span className="font-mono text-stone-400">
                                    Gross RM {(sale.total_amount + sale.discount_amount).toFixed(2)}
                                  </span>
                                  <span className="text-stone-600 font-bold">•</span>
                                  <span className="text-orange-400 font-mono font-medium">
                                    -RM {sale.discount_amount.toFixed(2)} promo
                                  </span>
                                  <span className="text-stone-600 font-bold">•</span>
                                  <span className="font-mono text-stone-200 font-bold">
                                    Paid RM {sale.total_amount.toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <span className="font-mono text-stone-300">
                                  Total RM {sale.total_amount.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-base sm:text-lg font-black font-mono tracking-tight ${
                              isCancelled
                                ? 'text-stone-500 line-through'
                                : isPending
                                ? 'text-amber-400/90'
                                : 'text-emerald-400'
                            }`}
                          >
                            +RM {sale.merchant_cut.toFixed(2)}
                          </span>
                          <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                            {isCancelled ? 'Voided' : isPending ? 'Pending Cut' : 'Stall Cut'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Withdrawal History */}
            {activeTab === 'withdrawals' && (
              <div className="divide-y divide-stone-800/50">
                {payoutHistory.length === 0 ? (
                  <div className="py-16 text-center text-stone-500 font-bold text-sm">
                    No withdrawal requests have been submitted yet.
                  </div>
                ) : (
                  payoutHistory.map((payout) => (
                    <div
                      key={payout.id}
                      className="p-4 sm:px-6 sm:py-4 flex items-center justify-between gap-3 hover:bg-stone-800/30 transition-colors group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm font-mono tracking-tight">
                              REQ-{payout.id.slice(0, 8).toUpperCase()}
                            </span>
                            {getStatusBadge(payout.status)}
                          </div>
                          <div className="text-[11px] text-stone-400 mt-1 flex items-center gap-2">
                            <span>{formatDate(payout.created_at)}</span>
                            <span className="text-stone-600 font-bold">•</span>
                            <span className="text-stone-300">Bank Transfer</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                          RM {payout.amount.toFixed(2)}
                        </span>
                        <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                          Payout Request
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Quick Jump Banner to Analytics */}
          <div className="bg-[#1c1917] border border-stone-800/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-orange-600/5 rounded-full blur-2xl pointer-events-none group-hover:bg-orange-600/10 transition-colors" />
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Operations & Sales Analytics</p>
                <p className="text-stone-400 text-xs mt-0.5">
                  Review revenue trends, average order ticket size, and customer retention metrics.
                </p>
              </div>
            </div>
            <button
              onClick={() => setFinanceSection('analytics')}
              className="self-start sm:self-auto px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-200 font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer shrink-0 border border-stone-800 hover:border-stone-700"
            >
              <span>View Analytics</span>
              <ArrowRight className="w-3.5 h-3.5 text-orange-400" />
            </button>
          </div>
        </>
      )}

      {/* 2-Step Withdrawal Confirmation Modal */}
      {isConfirmModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[#1c1917] border border-stone-800/90 rounded-3xl w-full max-w-md p-6 sm:p-7 space-y-5 shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-center border-b border-stone-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                  <Wallet className="w-4 h-4" />
                </div>
                <h2 className="text-base sm:text-lg font-black text-white">Confirm Bank Transfer</h2>
              </div>
              <button
                onClick={() => !isWithdrawing && setIsConfirmModalOpen(false)}
                disabled={isWithdrawing}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-stone-950/70 rounded-2xl border border-stone-800/80 space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block font-mono">
                  Transfer Amount
                </span>
                <span className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">
                  RM {availableBalance.toFixed(2)}
                </span>
              </div>

              <div className="pt-3 border-t border-stone-800/70 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Destination Account</span>
                  <span className="font-bold text-stone-200 font-mono">
                    {bankInfo ? `${bankInfo.bankName} (${bankInfo.accountMask})` : 'Registered Payout Bank'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Processing Rail</span>
                  <span className="font-bold text-stone-200">DuitNow FPX Instant</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Platform Transfer Fee</span>
                  <span className="font-bold text-emerald-400">RM 0.00 (Free)</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Funds will be dispatched to your registered Malaysian bank account immediately upon confirmation.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isWithdrawing}
                className="min-h-[44px] px-4 py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold text-xs rounded-xl cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdrawal}
                disabled={isWithdrawing}
                className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-600/25 cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                {isWithdrawing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Transfer...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Withdraw</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
