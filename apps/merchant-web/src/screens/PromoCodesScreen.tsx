import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
  ShoppingBag,
  TicketPercent,
  Utensils,
  XCircle,
} from 'lucide-react';

type PromoCodeStatus = 'pending' | 'active' | 'rejected';
type PromoDiscountType = 'fixed' | 'percentage';
type PromoDurationType = 'expiration' | 'usage_limit';
type PromoApplicability = 'tapau' | 'dine_in' | 'both';

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
  applicable_to: PromoApplicability;
  created_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
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

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '_');
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
  if (request.duration_type === 'expiration') {
    return `Expires on ${formatDateOnly(request.expiration_date)}`;
  }
  if (request.duration_type === 'usage_limit') {
    const maxUses = Number(request.max_uses);
    const usedCount = Number(request.used_count);
    if (!Number.isFinite(maxUses) || !Number.isFinite(usedCount)) return 'Usage limit unavailable';
    const remaining = Math.max(maxUses - usedCount, 0);
    return `${usedCount} of ${maxUses} uses used · ${remaining} remaining`;
  }
  return 'No duration limit';
}

function statusLabel(status: PromoCodeStatus): string {
  if (status === 'active') return 'Approved · Active';
  if (status === 'rejected') return 'Rejected';
  return 'Pending review';
}

function StatusBadge({ status }: { status: PromoCodeStatus }) {
  const styles = {
    pending: 'bg-amber-950/70 border-amber-800 text-amber-300',
    active: 'bg-emerald-950/70 border-emerald-800 text-emerald-300',
    rejected: 'bg-rose-950/70 border-rose-800 text-rose-300',
  }[status];
  const Icon = status === 'active' ? CheckCircle2 : status === 'rejected' ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}>
      <Icon className="h-3 w-3" />
      {statusLabel(status)}
    </span>
  );
}

function ApplicabilityBadge({ applicableTo }: { applicableTo: PromoApplicability | string | null | undefined }) {
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
  const { merchantId } = useMerchantKDSStore();
  const activeMerchantId = merchantId || localStorage.getItem('tapautime_merchant_id') || '';
  const [requests, setRequests] = useState<PromoCodeRequest[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [discountType, setDiscountType] = useState<PromoDiscountType>('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [applicableTo, setApplicableTo] = useState<PromoApplicability>('both');
  const [durationType, setDurationType] = useState<PromoDurationType>('expiration');
  const [expirationDate, setExpirationDate] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPromoCodes = useCallback(async () => {
    if (!activeMerchantId) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from('merchant_promo_codes')
      .select('id, merchant_id, code, status, discount_type, discount_value, duration_type, expiration_date, max_uses, used_count, applicable_to, created_at, reviewed_at, rejection_reason')
      .eq('merchant_id', activeMerchantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PromoCodesScreen] Error loading promo code requests:', error);
      setErrorMessage(error.message || 'Unable to load your promo code requests.');
      setRequests([]);
    } else {
      setRequests((data || []) as PromoCodeRequest[]);
      setErrorMessage(null);
    }
    setIsLoading(false);
  }, [activeMerchantId]);

  useEffect(() => {
    void fetchPromoCodes();

    if (!activeMerchantId) return;
    const channel = supabase
      .channel(`merchant_promo_codes_${activeMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_promo_codes',
          filter: `merchant_id=eq.${activeMerchantId}`,
        },
        () => {
          void fetchPromoCodes();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeMerchantId, fetchPromoCodes]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = normalizeCode(codeInput.trim());

    if (!activeMerchantId) {
      setErrorMessage('Your merchant profile is still loading. Please try again shortly.');
      return;
    }
    if (!code) {
      setErrorMessage('Enter a promo code before submitting.');
      return;
    }
    if (code.length > 24 || !/^[A-Z0-9_-]+$/.test(code)) {
      setErrorMessage('Use up to 24 letters, numbers, underscores, or hyphens only.');
      return;
    }
    const numericDiscount = Number(discountValue);
    if (!Number.isFinite(numericDiscount) || numericDiscount <= 0) {
      setErrorMessage('Enter a discount value greater than zero.');
      return;
    }
    if (discountType === 'percentage' && numericDiscount > 100) {
      setErrorMessage('Percentage discounts must be 100% or less.');
      return;
    }
    const selectedExpirationDate = expirationDate.trim();
    const numericMaxUses = Number(maxUses);
    if (durationType === 'expiration') {
      if (!selectedExpirationDate) {
        setErrorMessage('Choose an expiration date for this promo code.');
        return;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(`${selectedExpirationDate}T00:00:00`) < today) {
        setErrorMessage('Expiration date must be today or later.');
        return;
      }
    } else if (!Number.isInteger(numericMaxUses) || numericMaxUses < 1) {
      setErrorMessage('Maximum uses must be a whole number of at least 1.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.from('merchant_promo_codes').insert({
      merchant_id: activeMerchantId,
      code,
      discount_type: discountType,
      discount_value: Number(numericDiscount.toFixed(2)),
      duration_type: durationType,
      expiration_date: durationType === 'expiration' ? selectedExpirationDate : null,
      max_uses: durationType === 'usage_limit' ? numericMaxUses : null,
      applicable_to: applicableTo,
      used_count: 0,
      status: 'pending',
    });

    if (error) {
      console.error('[PromoCodesScreen] Error submitting promo code:', error);
      setErrorMessage(
        error.code === '23505'
          ? 'You already have a pending or active request for this code.'
          : error.message || 'Unable to submit this promo code.'
      );
    } else {
      setCodeInput('');
      setDiscountValue('');
      setExpirationDate('');
      setMaxUses('');
      setApplicableTo('both');
      setSuccessMessage(`${code} was submitted for administrator review.`);
      await fetchPromoCodes();
    }
    setIsSubmitting(false);
  };

  const counts = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter((request) => request.status === 'pending').length,
      active: requests.filter((request) => request.status === 'active').length,
    }),
    [requests]
  );

  // Keep the submission form and its status messages inside the same section.
  return (
    <div className="min-h-full bg-[#1c1917] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600/15 text-orange-400 ring-1 ring-orange-500/25">
              <TicketPercent className="h-6 w-6" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-400">Storefront growth</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Promo Codes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
              Submit a promo code for administrator review. Approved codes become active for your storefront; rejected submissions stay here with the reviewer&apos;s reason.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchPromoCodes()}
            disabled={isLoading}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-xl border border-stone-700 bg-[#181615] px-4 py-2 text-xs font-bold text-stone-300 transition hover:border-stone-600 hover:bg-stone-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Total submissions', value: counts.total, tone: 'text-white' },
            { label: 'Awaiting review', value: counts.pending, tone: 'text-amber-300' },
            { label: 'Active codes', value: counts.active, tone: 'text-emerald-300' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-stone-800 bg-[#24201e] p-4 shadow-lg">
              <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">{stat.label}</p>
              <p className={`mt-2 text-2xl font-black ${stat.tone}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-3xl border border-stone-800 bg-[#24201e] p-5 shadow-xl sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600/15 text-orange-400">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-black text-white">Submit a new code</h2>
              <p className="mt-1 text-xs leading-relaxed text-stone-400">Use letters, numbers, underscores, or hyphens. Maximum 24 characters.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="min-w-0">
                <label htmlFor="promo-code" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Promo code</label>
                <input
                  id="promo-code"
                  value={codeInput}
                  onChange={(event) => setCodeInput(normalizeCode(event.target.value))}
                  placeholder="e.g. BREAKFAST20"
                  maxLength={24}
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="discount-type" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Discount type</label>
                <select
                  id="discount-type"
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value as PromoDiscountType)}
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="fixed">RM Discount</option>
                  <option value="percentage">Percentage Discount</option>
                </select>
              </div>
              <div>
                <label htmlFor="discount-value" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                  {discountType === 'fixed' ? 'RM value' : 'Percentage'}
                </label>
                <input
                  id="discount-value"
                  type="number"
                  min="0.01"
                  max={discountType === 'percentage' ? '100' : undefined}
                  step="0.01"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  placeholder={discountType === 'fixed' ? 'e.g. 5.00' : 'e.g. 10'}
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="applicable-to" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Order type</label>
                <select
                  id="applicable-to"
                  value={applicableTo}
                  onChange={(event) => setApplicableTo(event.target.value as PromoApplicability)}
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="both">Both (Tapau & Dine-in)</option>
                  <option value="tapau">Tapau only</option>
                  <option value="dine_in">Dine-in only</option>
                </select>
              </div>
              <div>
                <label htmlFor="duration-type" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Duration</label>
                <select
                  id="duration-type"
                  value={durationType}
                  onChange={(event) => setDurationType(event.target.value as PromoDurationType)}
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="expiration">Expiration date</option>
                  <option value="usage_limit">Maximum uses</option>
                </select>
              </div>
              {durationType === 'expiration' ? (
                <div>
                  <label htmlFor="expiration-date" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Expires on</label>
                  <input
                    id="expiration-date"
                    type="date"
                    value={expirationDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setExpirationDate(event.target.value)}
                    disabled={isSubmitting}
                    className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="max-uses" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Maximum uses</label>
                  <input
                    id="max-uses"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                    placeholder="e.g. 100"
                    disabled={isSubmitting}
                    className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/25 transition hover:bg-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
          </form>
          {errorMessage && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-800 bg-rose-950/60 px-3.5 py-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-800 bg-emerald-950/60 px-3.5 py-3 text-xs text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Your submissions</h2>
              <p className="mt-1 text-xs text-stone-500">Newest submissions appear first.</p>
            </div>
            <span className="text-xs font-bold text-stone-500">{counts.total} total</span>
          </div>

          {isLoading ? (
            <div className="rounded-3xl border border-stone-800 bg-[#141211] px-5 py-12 text-center text-sm text-stone-500">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-orange-500" />
              Loading your submissions…
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-700 bg-[#141211] px-5 py-12 text-center">
              <TicketPercent className="mx-auto mb-3 h-8 w-8 text-stone-600" />
              <h3 className="font-black text-stone-300">No promo codes submitted yet</h3>
              <p className="mt-1 text-xs text-stone-500">Submit your first code above to start the review process.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {requests.map((request) => (
                <article key={request.id} className="rounded-3xl border border-stone-800 bg-[#141211] p-5 shadow-lg">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="font-mono text-xl font-black tracking-widest text-white">{request.code}</p>
                        <ApplicabilityBadge applicableTo={request.applicable_to} />
                      </div>
                      <p className="mt-1 text-xs text-stone-500">{formatDiscount(request.discount_type, request.discount_value)}</p>
                      <p className="mt-1 text-xs text-stone-500">{formatDuration(request)}</p>
                      <p className="mt-1 text-xs text-stone-500">Submitted {formatDate(request.created_at)}</p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-stone-800/80 pt-3 text-xs text-stone-500">
                    <span>Reviewed: {formatDate(request.reviewed_at)}</span>
                    {request.status === 'active' && <span className="text-emerald-400">Approved by TapauTime admin</span>}
                  </div>
                  {request.status === 'rejected' && (
                    <div className="mt-3 rounded-xl border border-rose-900/70 bg-rose-950/30 px-3.5 py-3 text-xs text-rose-200">
                      <span className="font-black text-rose-300">Reviewer reason: </span>
                      {request.rejection_reason || 'No reason was provided.'}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
