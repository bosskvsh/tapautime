import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCartStore } from '../stores/useCartStore';
import { ItemModifierModal } from '../components/ItemModifierModal';
import { MenuItemCard, MenuItem } from '../components/MenuItemCard';
import { MenuItemGridCard, GridTileColors, DEFAULT_GRID_TILE_COLORS } from '../components/MenuItemGridCard';
import { PreorderDateTimeModal } from '../components/PreorderDateTimeModal';
import { CartModifier } from '../stores/useCartStore';
import { supabase } from '../lib/supabase';
import { PullToRefresh } from '../components/PullToRefresh';
import { BundleSelectionModal, BundleOffer } from '../components/BundleSelectionModal';

export interface MerchantDetails {
  id: string;
  business_name: string;
  cuisine_type?: string;
  pickup_address?: string;
  is_open?: boolean;
  next_open_at?: string | null;
  distance_km?: number;
  current_prep_delay?: number;
  order_buffer_time?: number;
  rating?: number;
  image_url?: string;
  profile_url?: string;
  background_url?: string | null;
  menu_layout?: 'list' | 'grid';
  category_images?: Record<string, string> | null;
  category_order?: string[] | null;
  grid_card_bg_color?: string | null;
  grid_item_name_color?: string | null;
  grid_price_color?: string | null;
  header_bg_color?: string | null;
  header_font_color?: string | null;
  header_address_color?: string | null;
  header_icon_color?: string | null;
}

export interface MenuScreenProps {
  merchantId?: string;
  initialMerchant?: MerchantDetails | null;
  onViewCart?: () => void;
  onBack?: () => void;
  preorderOnly?: boolean;
}

/**
 * Formats an ISO timestamp as HH:mm in Asia/Kuching (UTC+8) for display.
 */
function formatKuchingClock(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuching',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

/**
 * Analyses a background photo's perceived brightness and reports whether
 * white or dark overlay text will read better on top of it.
 * Returns 'dark' (photo is dark -> use white text),
 * 'light' (photo is light -> use dark text), or null (no photo / not yet analysed).
 */
function useBackgroundTone(imageUrl?: string | null): 'dark' | 'light' | null {
  const [tone, setTone] = useState<'dark' | 'light' | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setTone(null);
      return;
    }
    let cancelled = false;
    setTone(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        if (!cancelled) {
          setTone(total / (data.length / 4) / 255 > 0.55 ? 'light' : 'dark');
        }
      } catch {
        // CORS-tainted canvas or decode failure -> fall back to light theme.
        if (!cancelled) setTone(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setTone(null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return tone;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({
  merchantId,
  initialMerchant,
  onViewCart,
  onBack,
  preorderOnly,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);
  const [failedCategoryImages, setFailedCategoryImages] = useState<Record<string, boolean>>({});
  const [pendingPreorderItem, setPendingPreorderItem] = useState<MenuItem | null>(null);
  const [bundles, setBundles] = useState<BundleOffer[]>([]);
  const [promoCodes, setPromoCodes] = useState<Array<{ id: string; code: string; discount_type: string; discount_value: number }>>([]);
  const [activeBundleModal, setActiveBundleModal] = useState<BundleOffer | null>(null);
  const [copiedPromoCode, setCopiedPromoCode] = useState<string | null>(null);
  const { 
    items: cartItems, 
    getTotalAmount, 
    getTotalCount, 
    addItem, 
    setMerchant: setCartMerchant,
    scheduledPickupDate,
    scheduledPickupTime,
    setScheduledPickup
  } = useCartStore();

  const targetMerchantId =
    merchantId && merchantId.length === 36 ? merchantId : '';

  // Zero-Latency State: initialize with initialMerchant if ID matches
  const [merchant, setMerchant] = useState<MerchantDetails | null>(
    initialMerchant && initialMerchant.id === targetMerchantId ? initialMerchant : null
  );

  // Sync state if initialMerchant prop changes
  useEffect(() => {
    if (initialMerchant && initialMerchant.id === targetMerchantId) {
      setMerchant(initialMerchant);
    }
  }, [initialMerchant, targetMerchantId]);

  // Dynamic text tone: white overlay text on dark photos, near-black on light photos.
  const backgroundTone = useBackgroundTone(merchant?.background_url);
  const textOnPhoto = backgroundTone === 'dark';

  // Keep a ref to the latest merchant open-state so fetchMenuItems can
  // short-circuit without depending on the merchant state variable.
  const merchantOpenRef = useRef<boolean>(true);
  merchantOpenRef.current = merchant?.is_open !== false;

  useEffect(() => {
    merchantOpenRef.current = merchant?.is_open !== false;
  }, [merchant]);

  // Resilient Supabase fetch. Availability is DERIVED server-side by
  // public.merchant_availability (schedule + operator pause + last-order cutoff)
  // so this banner can never disagree with what checkout will allow.
  const fetchMerchantDetails = useCallback(async () => {
    if (!targetMerchantId) return;
    try {
      const [merchantResult, availabilityResult] = await Promise.all([
        supabase
          .from('merchants')
          .select('*')
          .eq('id', targetMerchantId)
          .maybeSingle(),
        supabase
          .from('merchant_availability')
          .select('id, is_currently_open, next_open_at, closes_at, is_accepting_orders')
          .eq('id', targetMerchantId)
          .maybeSingle(),
      ]);

      const data = merchantResult.data;
      const availability = availabilityResult.data;

      if (!merchantResult.error && data) {
        setMerchant((prev) => ({
          ...prev,
          id: data.id,
          business_name: data.business_name || prev?.business_name || 'Merchant Stall',
          cuisine_type: data.cuisine_type || prev?.cuisine_type || 'Local Delights',
          pickup_address:
            typeof data.location?.address === 'string' && data.location.address
              ? data.location.address
              : prev?.pickup_address,
          is_open: availability
            ? availability.is_currently_open === true
            : (data.is_open ?? prev?.is_open ?? true),
          next_open_at: availability?.next_open_at ?? prev?.next_open_at ?? null,
          current_prep_delay:
            data.current_prep_delay ?? data.order_buffer_time ?? prev?.current_prep_delay ?? 10,
          rating: data.rating ?? prev?.rating ?? 4.9,
          image_url: data.image_url || prev?.image_url || undefined,
          profile_url: data.profile_url || prev?.profile_url || undefined,
          background_url: data.background_url ?? null,
          menu_layout: data.menu_layout === 'list' ? 'list' : 'grid',
          category_images: data.category_images ?? {},
          category_order: Array.isArray(data.category_order) ? data.category_order : null,
          grid_card_bg_color: data.grid_card_bg_color ?? null,
          grid_item_name_color: data.grid_item_name_color ?? null,
          grid_price_color: data.grid_price_color ?? null,
          header_bg_color: data.header_bg_color ?? null,
          header_font_color: data.header_font_color ?? null,
          header_address_color: data.header_address_color ?? null,
          header_icon_color: data.header_icon_color ?? null,
        }));
      }
    } catch (err) {
      console.warn('[MenuScreen] Error loading merchant details:', err);
    }
  }, [targetMerchantId]);

  // Re-evaluate every minute so the banner flips exactly at the schedule boundary.
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchMerchantDetails();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchMerchantDetails]);

  const fetchMenuItems = useCallback(async () => {
    if (!targetMerchantId) {
      setMenuItems([]);
      setIsLoading(false);
      return;
    }
    // We no longer short-circuit when closed, as customers should still be able to browse the greyed-out menu.
    setIsLoading(true);
    try {
      let query = supabase
        .from('menu_items')
        .select('id, name, description, price, category, is_available, available_quantity, image_url, bestseller, requires_preorder, lead_time_days, daily_capacity, menu_item_modifiers!menu_item_modifiers_item_id_fkey(id)')
        .eq('merchant_id', targetMerchantId);

      if (preorderOnly) {
        query = query.eq('requires_preorder', true);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) {
        console.error('[MenuScreen] Supabase fetchMenuItems query failed:', error);
        setMenuItems([]);
        return;
      }

      if (data && data.length > 0) {
        setMenuItems(
          data.map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            price: Number(row.price),
            category: row.category || undefined,
            imageUrl: row.image_url || undefined,
            is_available: row.is_available ?? true,
            available_quantity: row.available_quantity != null ? Number(row.available_quantity) : null,
            badges: row.bestseller ? ['Popular'] : undefined,
            bestseller: Boolean(row.bestseller),
            requires_preorder: Boolean(row.requires_preorder),
            lead_time_days: Number(row.lead_time_days ?? 0),
            daily_capacity: row.daily_capacity != null ? Number(row.daily_capacity) : undefined,
            has_modifiers: Array.isArray(row.menu_item_modifiers) && row.menu_item_modifiers.length > 0,
          }))
        );
      } else {
        setMenuItems([]);
      }
    } catch (err) {
      console.error('[MenuScreen] Unexpected error loading menu items:', err);
      setMenuItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [targetMerchantId, preorderOnly]);

  const fetchOffers = useCallback(async () => {
    if (!targetMerchantId) {
      setBundles([]);
      setPromoCodes([]);
      return;
    }
    try {
      const [bundlesRes, promosRes] = await Promise.all([
        supabase
          .from('merchant_bundle_offers')
          .select('*')
          .eq('merchant_id', targetMerchantId)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('merchant_promo_codes')
          .select('id, code, discount_type, discount_value, status, duration_type, expiration_date, max_uses, used_count')
          .eq('merchant_id', targetMerchantId)
          .eq('status', 'active'),
      ]);

      if (!bundlesRes.error && bundlesRes.data) {
        setBundles(
          bundlesRes.data.map((b: any) => ({
            id: b.id,
            merchant_id: b.merchant_id,
            bundle_type: b.bundle_type,
            title: b.title,
            fixed_price: Number(b.fixed_price) || 0,
            applicable_to: b.applicable_to || 'both',
            item_ids: Array.isArray(b.item_ids) ? b.item_ids : [],
            is_active: b.is_active !== false,
          }))
        );
      } else {
        setBundles([]);
      }

      if (!promosRes.error && promosRes.data) {
        const today = new Date().toISOString().slice(0, 10);
        const valid = promosRes.data.filter((p: any) => {
          if (p.duration_type === 'expiration' && p.expiration_date && p.expiration_date < today) return false;
          if (p.duration_type === 'usage_limit' && p.max_uses && Number(p.used_count) >= Number(p.max_uses)) return false;
          return true;
        });
        setPromoCodes(
          valid.map((p: any) => ({
            id: p.id,
            code: p.code,
            discount_type: p.discount_type,
            discount_value: Number(p.discount_value) || 0,
          }))
        );
      } else {
        setPromoCodes([]);
      }
    } catch (err) {
      console.warn('[MenuScreen] Error fetching offers:', err);
      setBundles([]);
      setPromoCodes([]);
    }
  }, [targetMerchantId]);

  useEffect(() => {
    if (!targetMerchantId) return;

    setCartMerchant(targetMerchantId);
    fetchMerchantDetails();
    fetchMenuItems();
    fetchOffers();

    // Supabase Realtime subscription to live menu updates
    const menuChannel = supabase
      .channel(`customer-menu-sync-${targetMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'menu_items',
        },
        () => {
          fetchMenuItems();
        }
      )
      .subscribe();

    // Supabase Realtime subscription to live merchant details updates
    const merchantChannel = supabase
      .channel(`customer-merchant-details-${targetMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchants',
          filter: `id=eq.${targetMerchantId}`,
        },
        () => {
          fetchMerchantDetails();
        }
      )
      .subscribe();

    // Realtime subscriptions to bundle offers and promo codes
    const bundleChannel = supabase
      .channel(`customer-bundle-offers-${targetMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_bundle_offers',
          filter: `merchant_id=eq.${targetMerchantId}`,
        },
        () => {
          fetchOffers();
        }
      )
      .subscribe();

    const promoChannel = supabase
      .channel(`customer-promos-${targetMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_promo_codes',
          filter: `merchant_id=eq.${targetMerchantId}`,
        },
        () => {
          fetchOffers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(merchantChannel);
      supabase.removeChannel(bundleChannel);
      supabase.removeChannel(promoChannel);
    };
  }, [fetchMerchantDetails, fetchMenuItems, fetchOffers, setCartMerchant, targetMerchantId]);

  const handleAddToCart = (
    item: MenuItem,
    modifiers: CartModifier[],
    quantity: number,
    specialInstructions?: string
  ) => {
    if (!isOpen) {
      console.warn('[MenuScreen] Cannot add to cart: stall is closed.');
      return;
    }
    setCartMerchant(targetMerchantId);
    // Generate a unique ID for the cart item based on item, selected modifiers, and special instructions
    const modString = modifiers.map((m) => m.id).sort().join('|');
    const noteClean = (specialInstructions || '').trim();
    const cartItemId = noteClean
      ? `${item.id}-${modString}-${noteClean}`
      : `${item.id}-${modString}`;
    const unitPriceWithModifiers =
      item.price + modifiers.reduce((sum, mod) => sum + mod.additional_price, 0);

    addItem({
      cartItemId,
      id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      selectedModifiers: modifiers,
      unitPriceWithModifiers,
      specialInstructions: noteClean || undefined,
      availableQuantity: item.available_quantity,
    });
  };

  const handleAddBundleToCart = (
    bundle: BundleOffer,
    selectedDishes: MenuItem[],
    instructions?: string
  ) => {
    if (!isOpen) {
      console.warn('[MenuScreen] Cannot add bundle to cart: stall is closed.');
      return;
    }
    setCartMerchant(targetMerchantId);

    const dishesNames = selectedDishes.map((d) => d.name).join(', ');
    const dishesIds = selectedDishes.map((d) => d.id).sort().join('-');
    const cartItemId = `bundle-${bundle.id}-${dishesIds}-${Date.now()}`;
    const noteText = instructions
      ? `Combo items: ${dishesNames}. Note: ${instructions}`
      : `Combo items: ${dishesNames}`;

    addItem({
      cartItemId,
      id: selectedDishes[0]?.id || bundle.id,
      name: `${bundle.title} (${bundle.bundle_type === 'buy_3_fixed_price' ? '3-Item' : '2-Item'} Combo)`,
      price: bundle.fixed_price,
      quantity: 1,
      selectedModifiers: [],
      unitPriceWithModifiers: bundle.fixed_price,
      specialInstructions: noteText,
    });
  };

  // Dynamic categories derived from the merchant's actual dishes, sorted by custom category_order
  const categories = useMemo(() => {
    const rawCats = menuItems
      .map((item) => item.category?.trim())
      .filter((cat): cat is string => Boolean(cat));
    const unique = Array.from(new Set(rawCats));
    const base = [...unique];
    const order = merchant?.category_order;
    if (!order || !Array.isArray(order) || order.length === 0) {
      return base;
    }
    const validSaved = order.filter((c) => base.some((b) => b.toLowerCase() === c.toLowerCase()));
    const normalizedOrdered = validSaved.map((c) => base.find((b) => b.toLowerCase() === c.toLowerCase()) || c);
    const remaining = base.filter((b) => !normalizedOrdered.some((o) => o.toLowerCase() === b.toLowerCase()));
    return [...normalizedOrdered, ...remaining];
  }, [menuItems, merchant?.category_order]);

  useEffect(() => {
    if (categories.length > 0 && (!selectedCategory || !categories.some((c: string) => c.toLowerCase() === selectedCategory.toLowerCase()))) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  // Best sellers: maximum of 6 items, active only when at least 2 items selected
  const bestSellerItems = useMemo(() => {
    return menuItems.filter((item) => Boolean(item.bestseller)).slice(0, 6);
  }, [menuItems]);

  const totalCount = getTotalCount();

  const isOpen = merchant?.is_open !== false;

  const handleItemSelect = useCallback((selected: MenuItem) => {
    if (!isOpen) return;

    if (selected.requires_preorder || preorderOnly) {
      alert('Tapau Ahead pre-orders are currently paused. Coming soon!');
      return;
    }

    setSelectedItem(selected);
  }, [isOpen, scheduledPickupDate, preorderOnly]);

  const stallName = merchant?.business_name || 'Merchant Stall';
  const menuLayout: 'list' | 'grid' = merchant?.menu_layout === 'list' ? 'list' : 'grid';

  // Merchant-customized grid tile colours (defaults reproduce the original look).
  const tileColors: GridTileColors = {
    cardBg: merchant?.grid_card_bg_color || DEFAULT_GRID_TILE_COLORS.cardBg,
    nameColor: merchant?.grid_item_name_color || DEFAULT_GRID_TILE_COLORS.nameColor,
    priceColor: merchant?.grid_price_color || DEFAULT_GRID_TILE_COLORS.priceColor,
  };

  // Case-insensitive lookup for merchant-uploaded category tab images.
  const getCategoryImage = (category: string): string | undefined => {
    const map = merchant?.category_images;
    if (!map) return undefined;
    if (map[category]) return map[category];
    const key = Object.keys(map).find((k) => k.toLowerCase() === category.toLowerCase());
    return key ? map[key] : undefined;
  };

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchMerchantDetails(), fetchMenuItems(), fetchOffers()]);
  }, [fetchMerchantDetails, fetchMenuItems, fetchOffers]);

  return (
    <PullToRefresh
      onRefresh={handleRefresh}
      disabled={Boolean(selectedItem)}
      pullingText="Pull to refresh menu..."
      refreshingText="Refreshing dishes..."
      completeText="Menu updated!"
    >
      {scheduledPickupDate && scheduledPickupTime && (
        <div className="sticky top-0 z-50 bg-stone-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-medium border-b border-stone-800 shadow-sm w-full">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-brand-orange">calendar_clock</span>
            <span>Scheduling for: <strong className="text-brand-orange">{scheduledPickupDate}</strong> at <strong className="text-brand-orange">{scheduledPickupTime}</strong></span>
          </div>
          <button 
            onClick={() => setScheduledPickup(null, null)}
            className="text-stone-400 hover:text-white underline decoration-stone-600 underline-offset-2"
          >
            Edit
          </button>
        </div>
      )}
      <div
        className="min-h-[100dvh] bg-stone-50 pb-[calc(160px+env(safe-area-inset-bottom))] flex flex-col"
        style={merchant?.background_url ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url("${merchant.background_url}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        } : undefined}
      >
      {/* Custom Background Header - transparent so the single page-level background photo shows through */}
      <div className="relative min-h-[14rem] sm:min-h-[15.5rem] overflow-hidden">
        {!merchant?.background_url && (
          <div className="absolute inset-0 bg-gradient-to-br from-stone-800 via-stone-900 to-black" />
        )}
        {onBack && (
          <button
            onClick={onBack}
            className="absolute left-4 z-20 w-10 h-10 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/65 active:scale-90 transition-all shadow-md"
            style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            aria-label="Back to merchants"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="absolute inset-0" />

        {/* Store profile photo + title */}
        <div className="absolute inset-x-0 bottom-0 z-10 max-w-lg mx-auto w-full px-4 pb-4 sm:pb-5 flex items-end gap-3 sm:gap-3.5">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-stone-800 border-[3px] border-white/90 shadow-xl shrink-0 flex items-center justify-center">
            {profilePhotoFailed || !merchant?.profile_url ? (
              <span className="text-2xl sm:text-3xl font-black text-white">{stallName.charAt(0).toUpperCase()}</span>
            ) : (
              <img
                src={merchant.profile_url}
                alt={stallName}
                className="w-full h-full object-cover"
                onError={() => setProfilePhotoFailed(true)}
              />
            )}
          </div>
          {/* Storefront name + pickup details pill (profile photo stays outside) */}
          <div
            className="min-w-0 flex-1 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl sm:rounded-3xl backdrop-blur-[7px] border border-white/40 shadow-[0_12px_32px_rgba(0,0,0,0.25),0_2px_8px_rgba(0,0,0,0.12)] space-y-1"
            style={{ backgroundColor: merchant?.header_bg_color || 'rgba(255,255,255,0.1)' }}
          >
            {/* Dynamic Stall Title */}
            <h1
              className={`text-lg sm:text-xl font-black drop-shadow-md tracking-tight leading-tight truncate ${textOnPhoto ? 'text-white' : 'text-stone-900'}`}
              style={{ color: merchant?.header_font_color || undefined }}
            >
              {stallName}
            </h1>

          {/* Meta Information Row */}
          <div className="text-xs flex flex-col gap-1 font-medium drop-shadow-sm">
            {!isOpen && (
              <span className="inline-flex items-center gap-1 text-rose-300 font-bold">
                <span
                  className="material-symbols-outlined text-[15px] text-rose-400"
                  style={{ color: merchant?.header_icon_color || undefined }}
                >
                  event_busy
                </span>
                <span>Currently Closed</span>
              </span>
            )}
            {merchant?.pickup_address ? (
              <span
                className={`inline-flex items-start gap-1.5 min-w-0 ${isOpen ? (textOnPhoto ? 'text-stone-200' : 'text-stone-700') : 'text-rose-100'}`}
                style={{ color: merchant?.header_address_color || undefined }}
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isOpen ? 'text-amber-400' : 'text-rose-400'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  style={{ color: merchant?.header_icon_color || undefined }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span className="text-[11px] sm:text-xs leading-snug break-words">Self Pick-up: {merchant.pickup_address}</span>
              </span>
            ) : null}
          </div>
          </div>
        </div>
      </div>

      {/* Sticky Picture Category Tabs - circular images instead of text pills */}
      {categories.length > 1 && (
        <div className="sticky top-0 z-30 pt-2 pb-2 bg-white/10 backdrop-blur-md border-b border-white/20 shadow-sm">
          <div className="flex overflow-x-auto no-scrollbar gap-3 items-start px-4">
            {categories.map((category: string) => {
              const isActive = selectedCategory.toLowerCase() === category.toLowerCase();
              const categoryImage = failedCategoryImages[category] ? undefined : getCategoryImage(category);
              return (
                <button
                  key={category}
                  onClick={() => {
                    setSelectedCategory(category);
                    const el = document.getElementById(`category-${category.replace(/\\s+/g, '-')}`);
                    if (el) {
                      const y = el.getBoundingClientRect().top + window.scrollY - 110;
                      window.scrollTo({ top: y, behavior: 'smooth' });
                    }
                  }}
                  className="shrink-0 w-16 flex flex-col items-center gap-1 active:scale-95 transition-all duration-200"
                  aria-pressed={isActive}
                >
                  <span
                    className={`w-14 h-14 rounded-full overflow-hidden border-2 flex items-center justify-center bg-stone-100 transition-colors ${
                      isActive
                        ? 'border-brand-orange shadow-md shadow-brand-orange/30'
                        : 'border-stone-200'
                    }`}
                  >
                    {categoryImage ? (
                      <img
                        src={categoryImage}
                        alt={category}
                        className="w-full h-full object-cover"
                        onError={() => setFailedCategoryImages((prev) => ({ ...prev, [category]: true }))}
                      />
                    ) : (
                      <span className={`text-lg font-black ${isActive ? 'text-brand-orange' : 'text-stone-500'}`}>
                        {category.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] font-black leading-tight max-w-full truncate drop-shadow-sm ${isActive ? 'text-brand-orange' : textOnPhoto ? 'text-white/90' : 'text-stone-700'}`}>
                    {category}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Closed Stall Notification Banner */}
      {!isOpen && (
        <div className="max-w-lg mx-auto w-full px-4 pt-3">
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 font-bold mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-rose-900 tracking-tight">
                  Merchant is Currently Closed
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                  Closed
                </span>
              </div>
              <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                This merchant is not accepting new orders right now. You may browse menu, but ordering is disabled.
                {merchant?.next_open_at ? ` Opens again at ${formatKuchingClock(merchant.next_open_at)}.` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menu List */}
      <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6">
        {/* Special Offers & Combo Deals Section */}
        {(bundles.length > 0 || promoCodes.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/15 text-orange-500 text-sm">
                  🎁
                </span>
                <h2 className={`text-base sm:text-lg font-black tracking-tight drop-shadow-sm ${textOnPhoto ? 'text-white' : 'text-stone-900'}`}>
                  Offers &amp; Bundles
                </h2>
              </div>
            </div>

            {/* Bundle Deals Cards */}
            {bundles.length > 0 && (
              <div className="grid grid-cols-1 gap-2.5">
                {bundles.map((bundle) => {
                  const isBuy3 = bundle.bundle_type === 'buy_3_fixed_price';
                  return (
                    <div
                      key={bundle.id}
                      className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white via-orange-50/40 to-amber-50/20 border border-orange-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-stone-900"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
                            {isBuy3 ? 'Buy 3 at a fixed price' : 'Buy 2 at a fixed price'}
                          </span>
                        </div>
                        <h3 className="font-extrabold text-sm sm:text-base text-stone-900 mt-1">
                          {bundle.title}
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {bundle.item_ids && bundle.item_ids.length > 0
                            ? `Choose ${isBuy3 ? 3 : 2} dishes from ${bundle.item_ids.length} qualifying items`
                            : `Mix & match any ${isBuy3 ? 3 : 2} dishes on the menu`}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-orange-100">
                        <span className="font-mono text-base sm:text-lg font-black text-brand-orange">
                          RM {bundle.fixed_price.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          disabled={!isOpen}
                          onClick={() => setActiveBundleModal(bundle)}
                          className="min-h-[38px] px-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-stone-200 disabled:text-stone-400 text-white font-black text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Select Combo</span>
                          <span className="text-[11px]">→</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Promo Code Chips */}
            {promoCodes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {promoCodes.map((promo) => (
                  <div
                    key={promo.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-stone-200/90 shadow-2xs text-xs"
                  >
                    <span className="font-mono font-black text-stone-900 tracking-wider">
                      🎟️ {promo.code}
                    </span>
                    <span className="text-stone-500 text-[11px]">
                      ({promo.discount_type === 'fixed' ? `RM ${promo.discount_value.toFixed(2)} off` : `${promo.discount_value}% off`})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(promo.code);
                        setCopiedPromoCode(promo.code);
                        setTimeout(() => setCopiedPromoCode(null), 2500);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-brand-orange text-[10px] font-black uppercase transition-colors cursor-pointer"
                    >
                      {copiedPromoCode === promo.code ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Best Seller Section — 2 columns of 3 items (min 2 items, max 6 items) */}
        {bestSellerItems.length >= 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-500 text-sm">
                  🔥
                </span>
                <h2 className={`text-base sm:text-lg font-black tracking-tight drop-shadow-sm ${textOnPhoto ? 'text-white' : 'text-stone-900'}`}>
                  Best Seller
                </h2>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  textOnPhoto ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                }`}>
                  {bestSellerItems.length} items
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {bestSellerItems.map((item) => {
                const inCartCount = cartItems
                  .filter((ci) => ci.id === item.id)
                  .reduce((sum, ci) => sum + ci.quantity, 0);

                return (
                  <MenuItemGridCard
                    key={`bestseller-${item.id}`}
                    item={item}
                    inCartCount={inCartCount}
                    onSelect={handleItemSelect}
                    isStallClosed={!isOpen}
                    tileColors={tileColors}
                    hideBestSellerBadge={true}
                  />
                );
              })}
            </div>
          </div>
        )}

        {categories.map((category, index) => {
          const categoryItems = menuItems.filter(item => item.category?.toLowerCase() === category.toLowerCase());
          
          if (categoryItems.length === 0) return null;

          return (
            <div key={category} id={`category-${category.replace(/\\s+/g, '-')}`}>
              <div className="flex items-center justify-between mb-3.5 px-0.5 mt-8 first:mt-0">
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-black tracking-tight drop-shadow-sm ${textOnPhoto ? 'text-white' : 'text-stone-900'}`}>{category}</h2>
                  <span className={`text-xs font-bold drop-shadow-sm ${textOnPhoto ? 'text-stone-200' : 'text-stone-500'}`}>
                    ({categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'})
                  </span>
                </div>
                {isLoading && index === 0 && (
                  <span className="text-xs text-brand-orange font-bold flex items-center gap-1">
                    Syncing menu...
                  </span>
                )}
              </div>

              {menuLayout === 'grid' ? (
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {categoryItems.map((item) => {
                    const inCartCount = cartItems
                      .filter((ci) => ci.id === item.id)
                      .reduce((sum, ci) => sum + ci.quantity, 0);

                    return (
                      <MenuItemGridCard
                        key={item.id}
                        item={item}
                        inCartCount={inCartCount}
                        onSelect={handleItemSelect}
                        isStallClosed={!isOpen}
                        tileColors={tileColors}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {categoryItems.map((item) => {
                    const inCartCount = cartItems
                      .filter((ci) => ci.id === item.id)
                      .reduce((sum, ci) => sum + ci.quantity, 0);

                    return (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        inCartCount={inCartCount}
                        onSelect={handleItemSelect}
                        isStallClosed={!isOpen}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Cart Island - Harmonized Frosted Glass Island Above Bottom Nav */}
      {totalCount > 0 && (
        <div className="fixed bottom-[calc(4.85rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 px-4 pointer-events-none flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="max-w-lg w-full pointer-events-auto">
            <button
              onClick={onViewCart}
              className={`w-full py-3.5 px-5 rounded-2xl backdrop-blur-xl text-white font-black shadow-[0_12px_32px_rgba(0,0,0,0.28),0_2px_8px_rgba(0,0,0,0.12)] border border-white/15 flex items-center justify-between active:scale-[0.98] transition-all duration-200 group ${
                !isOpen
                  ? 'bg-stone-800/95 hover:bg-stone-800'
                  : 'bg-stone-900/95 hover:bg-stone-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-md ${
                  !isOpen ? 'bg-rose-600 text-white' : 'bg-brand-orange text-white'
                }`}>
                  {totalCount}
                </div>
                <div className="text-left">
                  <span className="text-sm font-black tracking-tight block">
                    {!isOpen ? 'Stall Closed • View Bag' : 'View Bag'}
                  </span>
                  <span className="text-[10px] text-stone-400 font-medium block">
                    {!isOpen ? 'Ordering currently disabled' : 'Tap to review & checkout'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-amber-400 tabular-nums">
                  RM {getTotalAmount().toFixed(2)}
                </span>
                <span className="material-symbols-outlined text-lg text-stone-300 group-hover:translate-x-0.5 transition-transform">
                  arrow_forward
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Item Modifier Modal */}
      <ItemModifierModal
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        onAddToCart={handleAddToCart}
      />
      
      {/* Preorder Date Time Intercept Modal */}
      <PreorderDateTimeModal
        isOpen={!!pendingPreorderItem}
        onClose={() => setPendingPreorderItem(null)}
        leadTimeDays={pendingPreorderItem?.lead_time_days || 0}
        onConfirm={(date, time) => {
          setScheduledPickup(date, time);
          const itemToOpen = pendingPreorderItem;
          setPendingPreorderItem(null);
          if (itemToOpen) {
            setSelectedItem(itemToOpen);
          }
        }}
      />
      {/* Bundle Selection Modal */}
      <BundleSelectionModal
        bundle={activeBundleModal}
        menuItems={menuItems}
        isOpen={Boolean(activeBundleModal)}
        onClose={() => setActiveBundleModal(null)}
        onConfirm={handleAddBundleToCart}
      />
      </div>
    </PullToRefresh>
  );
};
