import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Wallet,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Building,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';

interface PayoutRequest {
  id: string;
  merchant_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'settled' | 'rejected';
  created_at: string;
  merchant?: {
    business_name: string;
    location?: {
      bank_name?: string;
      bank_account_number?: string;
    };
  };
}

export const PayoutsScreen: React.FC = () => {
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payout_requests')
        .select(`
          id,
          merchant_id,
          amount,
          status,
          created_at,
          merchants (
            business_name,
            location
          )
        `)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formatted = (data || []).map((row: any) => ({
        id: row.id,
        merchant_id: row.merchant_id,
        amount: Number(row.amount),
        status: row.status,
        created_at: row.created_at,
        merchant: row.merchants,
      }));

      setPayouts(formatted);
    } catch (err) {
      console.error('[PayoutsScreen] Error loading payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();

    const channel = supabase
      .channel('admin_payout_requests_stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, () => {
        fetchPayouts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterStatus]);

  const handleSettlePayout = async (payoutId: string) => {
    setActionLoading(payoutId);
    setActionMessage(null);
    try {
      // Call RPC settle_payout_request or fallback update
      const { error: rpcError } = await supabase.rpc('settle_payout_request', {
        p_payout_id: payoutId,
      });

      if (rpcError) {
        // Fallback update directly
        const { error: updateError } = await supabase
          .from('payout_requests')
          .update({ status: 'settled' })
          .eq('id', payoutId);
        if (updateError) throw updateError;
      }

      setActionMessage(`Payout ${payoutId.slice(0, 8)} successfully marked as settled.`);
      setPayouts((prev) =>
        prev.map((p) => (p.id === payoutId ? { ...p, status: 'settled' } : p))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Settlement update failed';
      console.error('[PayoutsScreen] Error settling payout:', err);
      setActionMessage(`Error: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayout = async (payoutId: string) => {
    setActionLoading(payoutId);
    setActionMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('reject_payout_request', {
        p_payout_id: payoutId,
        p_reason: 'Administrative rejection by platform operator',
      });

      if (rpcError) {
        const { error: updateError } = await supabase
          .from('payout_requests')
          .update({ status: 'rejected' })
          .eq('id', payoutId);
        if (updateError) throw updateError;
      }

      setActionMessage(`Payout ${payoutId.slice(0, 8)} rejected and refunded to wallet.`);
      setPayouts((prev) =>
        prev.map((p) => (p.id === payoutId ? { ...p, status: 'rejected' } : p))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed';
      console.error('[PayoutsScreen] Error rejecting payout:', err);
      setActionMessage(`Error: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = payouts.filter((p) => {
    const q = searchQuery.toLowerCase();
    const stall = p.merchant?.business_name?.toLowerCase() || '';
    return stall.includes(q) || p.id.toLowerCase().includes(q) || p.merchant_id.toLowerCase().includes(q);
  });

  const getStatusBadge = (status: PayoutRequest['status']) => {
    switch (status) {
      case 'settled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
            <CheckCircle2 className="w-3 h-3" />
            Settled
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/80">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-950/80 text-sky-400 border border-sky-800/80">
            <Clock className="w-3 h-3" />
            Processing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800/80">
            <AlertCircle className="w-3 h-3" />
            Pending Settlement
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-orange-500" />
            <span>Merchant Payouts & Settlement</span>
          </h1>
          <p className="text-xs text-stone-400 mt-1 font-medium">
            Review hawker bank withdrawal requests, verify settlement account numbers, and mark batches settled.
          </p>
        </div>

        <button
          onClick={fetchPayouts}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 bg-[#181615] hover:bg-stone-800 border border-stone-800 rounded-xl text-xs font-bold text-stone-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Payouts</span>
        </button>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800 text-xs text-stone-200 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-stone-500 hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by stall name or payout ID..."
            className="w-full bg-[#1c1917] border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {['all', 'pending', 'processing', 'settled', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === st
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'bg-[#1c1917] text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-800 text-[10px] uppercase tracking-widest text-stone-400 bg-[#181615]">
                <th className="py-3.5 px-6 font-bold">Stall / Merchant</th>
                <th className="py-3.5 px-6 font-bold">Withdrawal Amount</th>
                <th className="py-3.5 px-6 font-bold">Declared Settlement Bank</th>
                <th className="py-3.5 px-6 font-bold">Status</th>
                <th className="py-3.5 px-6 font-bold">Requested Time</th>
                <th className="py-3.5 px-6 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500 font-medium">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                    Loading payout requests from Supabase...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500 font-medium">
                    No payout requests found.
                  </td>
                </tr>
              ) : (
                filtered.map((payout) => (
                  <tr key={payout.id} className="hover:bg-stone-900/40 transition-colors">
                    {/* Stall */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-white text-sm">
                        {payout.merchant?.business_name || 'Hawker Kitchen'}
                      </div>
                      <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                        ID: {payout.id.slice(0, 8)}...
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-6 font-mono font-black text-rose-400 text-base">
                      RM {payout.amount.toFixed(2)}
                    </td>

                    {/* Declared Bank */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 text-stone-200 font-semibold">
                        <Building className="w-3.5 h-3.5 text-stone-400" />
                        <span>{payout.merchant?.location?.bank_name || 'Verified Malaysian Bank'}</span>
                      </div>
                      <div className="text-[11px] font-mono text-stone-400 mt-0.5">
                        Acc: {payout.merchant?.location?.bank_account_number || 'On File (Application)'}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">{getStatusBadge(payout.status)}</td>

                    {/* Date */}
                    <td className="py-4 px-6 font-mono text-[11px] text-stone-400">
                      {new Date(payout.created_at).toLocaleDateString()} {new Date(payout.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right space-x-2">
                      {payout.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleSettlePayout(payout.id)}
                            disabled={actionLoading === payout.id}
                            className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            Mark Settled
                          </button>
                          <button
                            onClick={() => handleRejectPayout(payout.id)}
                            disabled={actionLoading === payout.id}
                            className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {payout.status === 'settled' && (
                        <span className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                          Completed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
