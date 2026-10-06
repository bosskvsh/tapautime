import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  TicketPercent,
  Utensils,
  X,
  XCircle,
} from 'lucide-react';

type PromoCodeStatus = 'pending' | 'active' | 'rejected';
type PromoDiscountType = 'fixed' | 'percentage';
type PromoDurationType = 'expiration' | 'usage_limit';
type PromoApplicability = 'tapau' | 'dine_in' | 'both';
type PromoCodeFilter = 'pending' | 'active' | 'rejected';

interface PromoCodeRequest {
  id: string;
  merchant_id: string;
  code: string;
  status: PromoCodeStatus;
  discount_type: PromoDiscountType | null;
  discount_value: number | string | null;
  duration_type: PromoDurationType | null;
  expiration_date: string | null;
  max_uses: number | string | null;
  used_count: number | string;
  applicable_to?: PromoApplicability | null;
  created_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  merchant: { business_name: string } | null;
}

type PromoCodeQueryRow = Omit<PromoCodeRequest, 'merchant'> & {
  merchant: { business_name: string } | { business_name: string }[] | null;
};

interface RejectModalState {
  requestId: string;
  code: string;
  merchantName: string;
  reason: string;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDiscount(type: PromoDiscountType | null, value: number | string | null): string {
  if (!type || value === null || value === undefined || value === '') return 'Discount terms unavailable';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 'Discount terms unavailable';
  return type === 'fixed' ? `RM ${numericValue.toFixed(2)} discount` : `${numericValue.toFixed(2)}% discount`;
}

function formatDateOnly(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(date);
}

function formatDuration(request: Pick<PromoCodeRequest, 'duration_type' | 'expiration_date' | 'max_uses' | 'used_count'>): string {
  if (request.duration_type === 'expiration') return `Expires on ${formatDateOnly(request.expiration_date)}`;
  if (request.duration_type === 'usage_limit') {
    const maxUses = Number(request.max_uses);
    const usedCount = Number(request.used_count);
    if (!Number.isFinite(maxUses) || !Number.isFinite(usedCount)) return 'Usage limit unavailable';
    return `${usedCount} of ${maxUses} uses used · ${Math.max(maxUses - usedCount, 0)} remaining`;
  }
  return 'No duration limit';
}

function StatusBadge({ status }: { status: PromoCodeStatus }) {
  const styles = {
    pending: 'bg-amber-950/70 border-amber-800 text-amber-300',
    active: 'bg-emerald-950/70 border-emerald-800 text-emerald-300',
    rejected: 'bg-rose-950/70 border-rose-800 text-rose-300',
  }[status];
  const label = status === 'active' ? 'Active' : status === 'rejected' ? 'Rejected' : 'Pending review';
  const Icon = status === 'active' ? CheckCircle2 : status === 'rejected' ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function ApplicabilityBadge({ applicableTo }: { applicableTo?: PromoApplicability | string | null }) {
  const norm = applicableTo === 'tapau' ? 'tapau' : applicableTo === 'dine_in' ? 'dine_in' : 'both';
  const label = norm === 'tapau' ? 'Tapau only' : norm === 'dine_in' ? 'Dine-in only' : 'Tapau & Dine-in';
  const styles = {
    both: 'bg-orange-950/60 border-orange-800/80 text-orange-300',
    tapau: 'bg-sky-950/60 border-sky-800/80 text-sky-300',
    dine_in: 'bg-purple-950/60 border-purple-800/80 text-purple-300',
  }[norm];
  const Icon = norm === 'tapau' ? ShoppingBag : norm === 'dine_in' ? Utensils : TicketPercent;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export const PromoCodesScreen: React.FC = () => {
  const [requests, setRequests] = useState<PromoCodeRequest[]>([]);
  const [filter, setFilter] = useState<PromoCodeFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejectModal, setRejectModal] = useState<RejectModalState | null>(null);

  const fetchPromoCodes = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('merchant_promo_codes')
      .select('id, merchant_id, code, status, discount_type, discount_value, duration_type, expiration_date, max_uses, used_count, applicable_to, created_at, reviewed_at, rejection_reason, merchant:merchants!inner(business_name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminPromoCodesScreen] Error loading promo code requests:', error);
      setErrorMessage(error.message || 'Unable to load promo code requests.');
      setRequests([]);
    } else {
      const rows = (data || []) as unknown as PromoCodeQueryRow[];
      setRequests(
        rows.map((row) => ({
          ...row,
          merchant: Array.isArray(row.merchant) ? row.merchant[0] || null : row.merchant,
        }))
      );
      setErrorMessage(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchPromoCodes();

    const channel = supabase
      .channel('admin_merchant_promo_codes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_promo_codes' },
        () => {
          void fetchPromoCodes();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchPromoCodes]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const counts = useMemo(
    () => ({
      pending: requests.filter((request) => request.status === 'pending').length,
      active: requests.filter((request) => request.status === 'active').length,
      rejected: requests.filter((request) => request.status === 'rejected').length,
    }),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return requests.filter((request) => {
      if (request.status !== filter) return false;
      if (!query) return true;
      return (
        request.code.toLowerCase().includes(query) ||
        request.merchant?.business_name.toLowerCase().includes(query) ||
        request.merchant_id.toLowerCase().includes(query)
      );
    });
  }, [filter, requests, searchQuery]);

  const reviewRequest = async (
    requestId: string,
    action: 'approve' | 'reject',
    rejectionReason?: string
  ) => {
    setActionLoading(requestId);
    setActionMessage(null);
    const { error } = await supabase.rpc('review_merchant_promo_code', {
      p_request_id: requestId,
      p_action: action,
      p_rejection_reason: rejectionReason?.trim() || null,
    });

    if (error) {
      console.error('[AdminPromoCodesScreen] Error reviewing promo code:', error);
      setActionMessage({ type: 'error', text: error.message || 'Unable to update this promo code.' });
    } else {
      setActionMessage({
        type: 'success',
        text: action === 'approve' ? 'Promo code approved and activated.' : 'Promo code rejected.',
      });
      setRejectModal(null);
      await fetchPromoCodes();
    }
    setActionLoading(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600/15 text-orange-400 ring-1 ring-orange-500/25">
            <TicketPercent className="h-6 w-6" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-400">Storefront governance</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Promo Code Review</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
            Review merchant-submitted promo codes, activate approved codes, and keep a clear audit trail for rejected requests.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchPromoCodes()}
          disabled={isLoading}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-xl border border-stone-800 bg-[#181615] px-4 py-2 text-xs font-bold text-stone-300 transition hover:border-stone-700 hover:bg-stone-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {actionMessage && (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-medium ${actionMessage.type === 'success' ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300' : 'border-rose-800 bg-rose-950/60 text-rose-300'}`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{actionMessage.text}</span>
          </div>
          <button type="button" onClick={() => setActionMessage(null)} className="px-2 py-1 text-stone-400 hover:text-white" aria-label="Dismiss notification">✕</button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Pending review', value: counts.pending, tone: 'text-amber-300', filter: 'pending' as const },
          { label: 'Active codes', value: counts.active, tone: 'text-emerald-300', filter: 'active' as const },
          { label: 'Rejected', value: counts.rejected, tone: 'text-rose-300', filter: 'rejected' as const },
        ].map((stat) => (
          <button key={stat.filter} type="button" onClick={() => setFilter(stat.filter)} className={`rounded-2xl border p-4 text-left shadow-lg transition ${filter === stat.filter ? 'border-orange-500/60 bg-orange-950/20' : 'border-stone-800 bg-[#141211] hover:border-stone-700'}`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">{stat.label}</p>
            <p className={`mt-2 text-2xl font-black ${stat.tone}`}>{stat.value}</p>
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-stone-800 bg-[#141211] p-4 shadow-xl sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto border-b border-stone-800 pb-1">
            {(['pending', 'active', 'rejected'] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setFilter(tab)} className={`min-h-[38px] whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black capitalize transition ${filter === tab ? 'bg-orange-600 text-white' : 'text-stone-500 hover:bg-stone-800 hover:text-stone-200'}`}>
                {tab === 'pending' ? 'Pending review' : tab === 'active' ? 'Active' : 'Rejected'}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search code or merchant..." className="min-h-[42px] w-full rounded-xl border border-stone-800 bg-stone-950 pl-10 pr-4 text-xs text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
          </div>
        </div>

        {errorMessage && <div role="alert" className="mt-4 rounded-xl border border-rose-800 bg-rose-950/60 px-4 py-3 text-xs text-rose-200">{errorMessage}</div>}

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-3xl border border-stone-800 bg-[#0c0a09] px-5 py-12 text-center text-sm text-stone-500"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-orange-500" />Loading promo code requests…</div>
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-700 bg-[#0c0a09] px-5 py-12 text-center text-sm text-stone-500">No {filter} promo code requests found.</div>
          ) : (
            filteredRequests.map((request) => (
              <article key={request.id} className="rounded-3xl border border-stone-800 bg-[#0c0a09] p-5 shadow-lg">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-mono text-xl font-black tracking-widest text-white">{request.code}</p>
                      <StatusBadge status={request.status} />
                      <ApplicabilityBadge applicableTo={request.applicable_to} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-400"><span className="inline-flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />{request.merchant?.business_name || 'Merchant'}</span><span>{formatDiscount(request.discount_type, request.discount_value)}</span><span>{formatDuration(request)}</span><span>Submitted {formatDate(request.created_at)}</span>{request.reviewed_at && <span>Reviewed {formatDate(request.reviewed_at)}</span>}</div>
                    {request.rejection_reason && <p className="mt-3 rounded-xl border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200"><strong>Reason:</strong> {request.rejection_reason}</p>}
                  </div>
                  {request.status === 'pending' && <div className="flex shrink-0 gap-2 border-t border-stone-800 pt-4 lg:border-t-0 lg:pt-0"><button type="button" onClick={() => void reviewRequest(request.id, 'approve')} disabled={actionLoading === request.id} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-500 disabled:opacity-50">{actionLoading === request.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve</button><button type="button" onClick={() => setRejectModal({ requestId: request.id, code: request.code, merchantName: request.merchant?.business_name || 'Merchant', reason: '' })} disabled={actionLoading === request.id} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-800 bg-rose-950/40 px-4 py-2 text-xs font-black text-rose-300 transition hover:bg-rose-900/50 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Reject</button></div>}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {rejectModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-stone-800 bg-[#141211] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="font-black text-white">Reject promo code</h2><p className="mt-1 text-xs text-stone-400">{rejectModal.code} · {rejectModal.merchantName}</p></div><button type="button" onClick={() => setRejectModal(null)} className="rounded-lg p-1 text-stone-500 hover:bg-stone-800 hover:text-white" aria-label="Close rejection dialog"><X className="h-4 w-4" /></button></div>
            <label htmlFor="rejection-reason" className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-400">Reason <span className="font-normal normal-case text-stone-600">(optional)</span></label>
            <textarea id="rejection-reason" value={rejectModal.reason} onChange={(event) => setRejectModal((current) => current ? { ...current, reason: event.target.value } : current)} maxLength={500} rows={4} placeholder="Tell the merchant why this code was not approved..." className="mt-2 w-full resize-none rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRejectModal(null)} className="min-h-[40px] rounded-xl px-4 py-2 text-xs font-bold text-stone-400 hover:bg-stone-800 hover:text-white">Cancel</button><button type="button" onClick={() => void reviewRequest(rejectModal.requestId, 'reject', rejectModal.reason)} disabled={actionLoading === rejectModal.requestId} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-500 disabled:opacity-50">{actionLoading === rejectModal.requestId && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}Reject code</button></div>
          </div>
        </div>
      )}
    </div>
  );
};


