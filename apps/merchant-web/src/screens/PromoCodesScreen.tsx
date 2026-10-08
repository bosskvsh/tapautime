import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Layers,
  Plus,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  TicketPercent,
  Trash2,
  Utensils,
  XCircle,
} from 'lucide-react';

type PromoCodeStatus = 'pending' | 'active' | 'rejected';
type PromoDiscountType = 'fixed' | 'percentage';
type PromoDurationType = 'expiration' | 'usage_limit';
type PromoApplicability = 'tapau' | 'dine_in' | 'both';

type BundleType = 'buy_2_fixed_price' | 'buy_3_fixed_price';

interface BundleOffer {
  id: string;
  merchant_id: string;
  bundle_type: BundleType;
  title: string;
  fixed_price: number;
  applicable_to: PromoApplicability;
  item_ids: string[];
  is_active: boolean;
  created_at: string;
}

interface MenuItemOption {
  id: string;
  name: string;
  price: number;
  category?: string;
}

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

  // Offers sub-navigation: 'promo_codes' or 'bundles'
  const [activeSection, setActiveSection] = useState<'promo_codes' | 'bundles'>('promo_codes');

  // Promo Codes State
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

  // Bundles State
  const [bundles, setBundles] = useState<BundleOffer[]>([]);
  const [isBundlesLoading, setIsBundlesLoading] = useState(true);
  const [bundleType, setBundleType] = useState<BundleType>('buy_2_fixed_price');
  const [bundleTitle, setBundleTitle] = useState('');
  const [bundlePrice, setBundlePrice] = useState('');
  const [bundleApplicableTo, setBundleApplicableTo] = useState<PromoApplicability>('both');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [isSubmittingBundle, setIsSubmittingBundle] = useState(false);
  const [bundleErrorMessage, setBundleErrorMessage] = useState<string | null>(null);
  const [bundleSuccessMessage, setBundleSuccessMessage] = useState<string | null>(null);

  // 1. Fetch Promo Codes
  const fetchPromoCodes = useCallback(async () => {
    if (!activeMerchantId) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('merchant_promo_codes')
      .select('*')
      .eq('merchant_id', activeMerchantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[OffersScreen] Error loading promo code requests:', error);
      setErrorMessage(error.message || 'Failed to load submissions.');
      setRequests([]);
    } else {
      setRequests(data || []);
    }

    setIsLoading(false);
  }, [activeMerchantId]);

  // 2. Fetch Bundles
  const fetchBundles = useCallback(async () => {
    if (!activeMerchantId) {
      setBundles([]);
      setIsBundlesLoading(false);
      return;
    }

    setIsBundlesLoading(true);
    try {
      const { data, error } = await supabase
        .from('merchant_bundle_offers')
        .select('*')
        .eq('merchant_id', activeMerchantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[OffersScreen] Notice querying merchant_bundle_offers:', error.message);
        setBundles([]);
      } else {
        setBundles(
          (data || []).map((b: {
            id: string;
            merchant_id: string;
            bundle_type: BundleType;
            title: string;
            fixed_price: number | string;
            applicable_to: PromoApplicability;
            item_ids?: string[] | null;
            is_active?: boolean;
            created_at: string;
          }) => ({
            id: b.id,
            merchant_id: b.merchant_id,
            bundle_type: b.bundle_type,
            title: b.title,
            fixed_price: Number(b.fixed_price) || 0,
            applicable_to: b.applicable_to || 'both',
            item_ids: Array.isArray(b.item_ids) ? b.item_ids : [],
            is_active: b.is_active !== false,
            created_at: b.created_at,
          }))
        );
      }
    } catch (err) {
      console.error('[OffersScreen] Failed to load bundles:', err);
      setBundles([]);
    } finally {
      setIsBundlesLoading(false);
    }
  }, [activeMerchantId]);

  // 3. Fetch Merchant Menu Items (for qualifying bundle items)
  const fetchMenuItems = useCallback(async () => {
    if (!activeMerchantId) return;
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price, category')
        .eq('merchant_id', activeMerchantId)
        .eq('is_available', true)
        .order('name');

      if (!error && data) {
        setMenuItems(
          data.map((item: { id: string; name: string; price: number | string; category?: string | null }) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price) || 0,
            category: item.category || undefined,
          }))
        );
      }
    } catch (err) {
      console.error('[OffersScreen] Error loading menu items for bundle selector:', err);
    }
  }, [activeMerchantId]);

  useEffect(() => {
    void fetchPromoCodes();
    void fetchBundles();
    void fetchMenuItems();
  }, [fetchPromoCodes, fetchBundles, fetchMenuItems]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!activeMerchantId) return;

    const promoChannel = supabase
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

    const bundleChannel = supabase
      .channel(`merchant_bundles_${activeMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_bundle_offers',
          filter: `merchant_id=eq.${activeMerchantId}`,
        },
        () => {
          void fetchBundles();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(promoChannel);
      void supabase.removeChannel(bundleChannel);
    };
  }, [activeMerchantId, fetchPromoCodes, fetchBundles]);

  // Promo Code Submission
  const validatePromoSubmission = (): string | null => {
    const trimmed = codeInput.trim();
    if (!trimmed) return 'Enter a promo code.';
    if (!/^[A-Z0-9_-]{1,24}$/.test(trimmed)) {
      return 'Promo code must be 1 to 24 characters and only contain letters, numbers, underscores, or hyphens.';
    }

    const numericDiscount = Number(discountValue);
    if (!discountValue || !Number.isFinite(numericDiscount) || numericDiscount <= 0) {
      return 'Enter a valid discount amount greater than zero.';
    }

    if (discountType === 'percentage' && numericDiscount > 100) {
      return 'Percentage discount cannot exceed 100%.';
    }

    if (durationType === 'expiration') {
      if (!expirationDate) return 'Select an expiration date.';
      const today = new Date().toISOString().slice(0, 10);
      if (expirationDate < today) return 'Expiration date must be today or in the future.';
    } else {
      const numericMaxUses = Number(maxUses);
      if (!maxUses || !Number.isInteger(numericMaxUses) || numericMaxUses <= 0) {
        return 'Enter a positive whole number for maximum uses.';
      }
    }

    const hasActiveSameCode = requests.some(
      (r) => r.code === trimmed && (r.status === 'pending' || r.status === 'active')
    );
    if (hasActiveSameCode) {
      return 'You already have an active or pending submission with this exact code.';
    }

    return null;
  };

  const handlePromoSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = validatePromoSubmission();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!activeMerchantId) {
      setErrorMessage('No active merchant session found.');
      return;
    }

    setIsSubmitting(true);

    const numericDiscount = Number(discountValue);
    const numericMaxUses = durationType === 'usage_limit' ? Number(maxUses) : null;

    const { error } = await supabase.from('merchant_promo_codes').insert({
      merchant_id: activeMerchantId,
      code: codeInput.trim(),
      discount_type: discountType,
      discount_value: numericDiscount,
      duration_type: durationType,
      expiration_date: durationType === 'expiration' ? expirationDate : null,
      max_uses: numericMaxUses,
      used_count: 0,
      applicable_to: applicableTo,
      status: 'pending',
    });

    if (error) {
      console.error('[OffersScreen] Error submitting promo code:', error);
      if (error.code === '23505') {
        setErrorMessage('This code is already pending review or currently active for your store.');
      } else {
        setErrorMessage(error.message || 'Failed to submit promo code.');
      }
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(`Promo code "${codeInput.trim()}" submitted for review.`);
    setCodeInput('');
    setDiscountValue('');
    setExpirationDate('');
    setMaxUses('');
    setDiscountType('fixed');
    setApplicableTo('both');
    setDurationType('expiration');
    setIsSubmitting(false);
    await fetchPromoCodes();
  };

  // Bundle Submission
  const handleBundleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBundleErrorMessage(null);
    setBundleSuccessMessage(null);

    const numericPrice = Number(bundlePrice);
    if (!bundlePrice || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      setBundleErrorMessage('Enter a valid fixed price greater than RM 0.00.');
      return;
    }

    if (!activeMerchantId) {
      setBundleErrorMessage('No active merchant session found.');
      return;
    }

    const defaultTitle =
      bundleType === 'buy_2_fixed_price' ? 'Buy 2 at a fixed price' : 'Buy 3 at a fixed price';
    const finalTitle = bundleTitle.trim() || defaultTitle;

    setIsSubmittingBundle(true);

    try {
      const { error } = await supabase.from('merchant_bundle_offers').insert({
        merchant_id: activeMerchantId,
        bundle_type: bundleType,
        title: finalTitle,
        fixed_price: numericPrice,
        applicable_to: bundleApplicableTo,
        item_ids: selectedItemIds,
        is_active: true,
      });

      if (error) {
        throw error;
      }

      setBundleSuccessMessage(`Bundle offer "${finalTitle}" created successfully.`);
      setBundleTitle('');
      setBundlePrice('');
      setSelectedItemIds([]);
      setBundleApplicableTo('both');
      await fetchBundles();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to save bundle offer.';
      console.error('[OffersScreen] Error saving bundle:', err);
      setBundleErrorMessage(message);
    } finally {
      setIsSubmittingBundle(false);
    }
  };

  const handleToggleBundleActive = async (bundleId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('merchant_bundle_offers')
        .update({
          is_active: !currentActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bundleId)
        .eq('merchant_id', activeMerchantId);

      if (error) throw error;
      setBundles((prev) =>
        prev.map((b) => (b.id === bundleId ? { ...b, is_active: !currentActive } : b))
      );
    } catch (err) {
      console.error('[OffersScreen] Failed to toggle bundle status:', err);
    }
  };

  const handleDeleteBundle = async (bundleId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete bundle offer "${title}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('merchant_bundle_offers')
        .delete()
        .eq('id', bundleId)
        .eq('merchant_id', activeMerchantId);

      if (error) throw error;
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
    } catch (err) {
      console.error('[OffersScreen] Failed to delete bundle:', err);
    }
  };

  const promoCounts = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      active: requests.filter((r) => r.status === 'active').length,
    };
  }, [requests]);

  const bundleCounts = useMemo(() => {
    return {
      total: bundles.length,
      active: bundles.filter((b) => b.is_active).length,
      buy2: bundles.filter((b) => b.bundle_type === 'buy_2_fixed_price').length,
      buy3: bundles.filter((b) => b.bundle_type === 'buy_3_fixed_price').length,
    };
  }, [bundles]);

  const handleRefresh = () => {
    if (activeSection === 'promo_codes') {
      void fetchPromoCodes();
    } else {
      void fetchBundles();
      void fetchMenuItems();
    }
  };

  const toggleMenuItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  return (
    <div className="min-h-full bg-[#1c1917] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Main Offers Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600/15 text-orange-400 ring-1 ring-orange-500/25">
              <TicketPercent className="h-6 w-6" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-400">Storefront growth</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Offers</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
              Manage your store&apos;s promotional codes and combo bundles to drive higher basket sizes and repeat orders.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={activeSection === 'promo_codes' ? isLoading : isBundlesLoading}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-xl border border-stone-700 bg-[#181615] px-4 py-2 text-xs font-bold text-stone-300 transition hover:border-stone-600 hover:bg-stone-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                (activeSection === 'promo_codes' ? isLoading : isBundlesLoading) ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </button>
        </header>

        {/* Section Navigation Tabs (Promo Codes vs Bundles) */}
        <div
          className="flex items-center bg-[#181615] p-1 rounded-2xl border border-stone-800 text-xs font-bold shadow-inner"
          role="tablist"
          aria-label="Offers Section Navigation"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'promo_codes'}
            onClick={() => setActiveSection('promo_codes')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 font-black ${
              activeSection === 'promo_codes'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <TicketPercent className="w-4 h-4" />
            <span>Promo Codes</span>
            {promoCounts.total > 0 && (
              <span className="ml-1 rounded-full bg-stone-900/70 px-2 py-0.5 text-[10px] font-mono text-stone-200">
                {promoCounts.total}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'bundles'}
            onClick={() => setActiveSection('bundles')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 font-black ${
              activeSection === 'bundles'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Bundles</span>
            {bundleCounts.total > 0 && (
              <span className="ml-1 rounded-full bg-stone-900/70 px-2 py-0.5 text-[10px] font-mono text-stone-200">
                {bundleCounts.total}
              </span>
            )}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: PROMO CODES */}
        {/* ========================================================================= */}
        {activeSection === 'promo_codes' && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Total submissions', value: promoCounts.total, tone: 'text-white' },
                { label: 'Awaiting review', value: promoCounts.pending, tone: 'text-amber-300' },
                { label: 'Active codes', value: promoCounts.active, tone: 'text-emerald-300' },
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
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">
                    Use letters, numbers, underscores, or hyphens. Maximum 24 characters.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePromoSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="min-w-0">
                    <label htmlFor="promo-code" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Promo code
                    </label>
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
                    <label htmlFor="discount-type" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Discount type
                    </label>
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
                    <label htmlFor="applicable-to" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Order type
                    </label>
                    <select
                      id="applicable-to"
                      value={applicableTo}
                      onChange={(event) => setApplicableTo(event.target.value as PromoApplicability)}
                      disabled={isSubmitting}
                      className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="both">Both (Tapau &amp; Dine-in)</option>
                      <option value="tapau">Tapau only</option>
                      <option value="dine_in">Dine-in only</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="duration-type" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Duration
                    </label>
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
                      <label htmlFor="expiration-date" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                        Expires on
                      </label>
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
                      <label htmlFor="max-uses" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                        Maximum uses
                      </label>
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
                    className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/25 transition hover:bg-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
                <span className="text-xs font-bold text-stone-500">{promoCounts.total} total</span>
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
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: BUNDLES */}
        {/* ========================================================================= */}
        {activeSection === 'bundles' && (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-800 bg-[#24201e] p-4 shadow-lg">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Total bundle deals</p>
                <p className="mt-2 text-2xl font-black text-white">{bundleCounts.total}</p>
              </div>
              <div className="rounded-2xl border border-stone-800 bg-[#24201e] p-4 shadow-lg">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Active on storefront</p>
                <p className="mt-2 text-2xl font-black text-emerald-300">{bundleCounts.active}</p>
              </div>
              <div className="rounded-2xl border border-stone-800 bg-[#24201e] p-4 shadow-lg">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Deal Types</p>
                <p className="mt-2 text-sm font-black text-orange-400">
                  {bundleCounts.buy2} Duo (Buy 2) · {bundleCounts.buy3} Trio (Buy 3)
                </p>
              </div>
            </div>

            {/* Create Bundle Offer Form */}
            <section className="rounded-3xl border border-stone-800 bg-[#24201e] p-5 shadow-xl sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600/15 text-orange-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-black text-white">Create a new bundle deal</h2>
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">
                    Choose between a &apos;Buy 2&apos; or &apos;Buy 3&apos; combo at a fixed price to attract more orders.
                  </p>
                </div>
              </div>

              <form onSubmit={handleBundleSubmit} className="space-y-5">
                {/* Bundle Choice Selection */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                    Bundle Type
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Option: Buy 2 at a fixed price */}
                    <button
                      type="button"
                      onClick={() => setBundleType('buy_2_fixed_price')}
                      className={`flex flex-col p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                        bundleType === 'buy_2_fixed_price'
                          ? 'border-orange-500 bg-orange-950/30 ring-2 ring-orange-500/30 shadow-lg'
                          : 'border-stone-800 bg-stone-900/60 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-2 text-sm font-black text-white">
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              bundleType === 'buy_2_fixed_price' ? 'border-orange-500' : 'border-stone-600'
                            }`}
                          >
                            {bundleType === 'buy_2_fixed_price' && (
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                            )}
                          </span>
                          Buy 2 at a fixed price
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-600/20 text-orange-400 text-[10px] font-black uppercase tracking-wider">
                          Duo
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        Customers can choose any 2 qualifying items for a single fixed price.
                      </p>
                    </button>

                    {/* Option: Buy 3 at a fixed price */}
                    <button
                      type="button"
                      onClick={() => setBundleType('buy_3_fixed_price')}
                      className={`flex flex-col p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                        bundleType === 'buy_3_fixed_price'
                          ? 'border-orange-500 bg-orange-950/30 ring-2 ring-orange-500/30 shadow-lg'
                          : 'border-stone-800 bg-stone-900/60 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-2 text-sm font-black text-white">
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              bundleType === 'buy_3_fixed_price' ? 'border-orange-500' : 'border-stone-600'
                            }`}
                          >
                            {bundleType === 'buy_3_fixed_price' && (
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                            )}
                          </span>
                          Buy 3 at a fixed price
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-600/20 text-orange-400 text-[10px] font-black uppercase tracking-wider">
                          Trio
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        Customers can choose any 3 qualifying items for a single fixed price.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Form Fields Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label htmlFor="bundle-title" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Bundle Deal Name
                    </label>
                    <input
                      id="bundle-title"
                      value={bundleTitle}
                      onChange={(e) => setBundleTitle(e.target.value)}
                      placeholder={
                        bundleType === 'buy_2_fixed_price'
                          ? 'e.g. Lunch Duo Special'
                          : 'e.g. 3-Course Family Trio'
                      }
                      maxLength={100}
                      disabled={isSubmittingBundle}
                      className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="bundle-price" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Fixed Price (RM)
                    </label>
                    <input
                      id="bundle-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={bundlePrice}
                      onChange={(e) => setBundlePrice(e.target.value)}
                      placeholder="e.g. 18.00"
                      disabled={isSubmittingBundle}
                      className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 font-mono text-sm font-bold text-white outline-none transition placeholder:text-stone-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="bundle-applicable-to" className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                      Order Type
                    </label>
                    <select
                      id="bundle-applicable-to"
                      value={bundleApplicableTo}
                      onChange={(e) => setBundleApplicableTo(e.target.value as PromoApplicability)}
                      disabled={isSubmittingBundle}
                      className="min-h-[48px] w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="both">Both (Tapau &amp; Dine-in)</option>
                      <option value="tapau">Tapau only</option>
                      <option value="dine_in">Dine-in only</option>
                    </select>
                  </div>
                </div>

                {/* Optional Qualifying Items Selector */}
                {menuItems.length > 0 && (
                  <div className="rounded-2xl border border-stone-800 bg-[#1c1917] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                        Qualifying Dishes (Optional)
                      </span>
                      <span className="text-xs text-stone-500">
                        {selectedItemIds.length === 0
                          ? 'Applies to all active menu items'
                          : `${selectedItemIds.length} item(s) selected`}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mb-3">
                      Select specific dishes eligible for this bundle, or leave unselected to include your entire menu.
                    </p>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                      {menuItems.map((item) => {
                        const isSelected = selectedItemIds.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleMenuItemSelection(item.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-orange-600 text-white shadow-md'
                                : 'bg-stone-900 border border-stone-700/80 text-stone-300 hover:border-stone-500'
                            }`}
                          >
                            <span>{item.name}</span>
                            <span className="font-mono text-[10px] opacity-75">RM {item.price.toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSubmittingBundle || isBundlesLoading}
                    className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-orange-600/25 transition hover:bg-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingBundle ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {isSubmittingBundle ? 'Saving Bundle…' : 'Create Bundle Deal'}
                  </button>
                </div>
              </form>

              {bundleErrorMessage && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-800 bg-rose-950/60 px-3.5 py-3 text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{bundleErrorMessage}</span>
                </div>
              )}
              {bundleSuccessMessage && (
                <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-800 bg-emerald-950/60 px-3.5 py-3 text-xs text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{bundleSuccessMessage}</span>
                </div>
              )}
            </section>

            {/* Configured Bundles Listing */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white">Your bundle deals</h2>
                  <p className="mt-1 text-xs text-stone-500">Configured fixed-price bundles for your store.</p>
                </div>
                <span className="text-xs font-bold text-stone-500">{bundleCounts.total} total</span>
              </div>

              {isBundlesLoading ? (
                <div className="rounded-3xl border border-stone-800 bg-[#141211] px-5 py-12 text-center text-sm text-stone-500">
                  <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-orange-500" />
                  Loading your bundles…
                </div>
              ) : bundles.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-stone-700 bg-[#141211] px-5 py-12 text-center">
                  <Layers className="mx-auto mb-3 h-8 w-8 text-stone-600" />
                  <h3 className="font-black text-stone-300">No bundles created yet</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    Create your first &apos;Buy 2&apos; or &apos;Buy 3&apos; fixed-price bundle above to give customers combo savings.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {bundles.map((bundle) => {
                    const isBuy3 = bundle.bundle_type === 'buy_3_fixed_price';
                    return (
                      <article
                        key={bundle.id}
                        className={`rounded-3xl border p-5 shadow-lg transition-all ${
                          bundle.is_active
                            ? 'border-stone-800 bg-[#141211]'
                            : 'border-stone-800/60 bg-[#141211]/60 opacity-70'
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                  isBuy3
                                    ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                                    : 'bg-orange-950/60 border-orange-800/80 text-orange-300'
                                }`}
                              >
                                <Layers className="h-3 w-3" />
                                {isBuy3 ? 'Buy 3 at a fixed price' : 'Buy 2 at a fixed price'}
                              </span>
                              <ApplicabilityBadge applicableTo={bundle.applicable_to} />
                            </div>

                            <h3 className="mt-2 text-lg font-black text-white">{bundle.title}</h3>
                            <p className="mt-1 font-mono text-xl font-black text-orange-400">
                              RM {bundle.fixed_price.toFixed(2)}
                            </p>
                            <p className="mt-1 text-xs text-stone-500">
                              {bundle.item_ids && bundle.item_ids.length > 0
                                ? `Limited to ${bundle.item_ids.length} qualifying dishes`
                                : 'Applies to any qualifying items on your menu'}
                            </p>
                            <p className="mt-1 text-xs text-stone-500">Created {formatDate(bundle.created_at)}</p>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleToggleBundleActive(bundle.id, bundle.is_active)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                bundle.is_active
                                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                                  : 'bg-stone-900 border-stone-700 text-stone-400 hover:text-white'
                              }`}
                            >
                              {bundle.is_active ? 'Active' : 'Paused'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBundle(bundle.id, bundle.title)}
                              className="p-2 rounded-xl border border-stone-800 bg-stone-900/80 text-stone-400 hover:border-rose-800 hover:text-rose-300 transition-all cursor-pointer"
                              title="Delete bundle"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
