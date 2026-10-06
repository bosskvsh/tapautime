import React, { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Store,
  QrCode,
  Sliders,
  ArrowRight,
  Check,
  AlertTriangle,
  Camera,
  X,
  CreditCard,
  Lock,
  Eye,
  EyeOff,
  Power,
  Clock,
  Sparkles,
  ShieldCheck,
    Star,
  Mail,
  UserCheck,
  MapPin,
  Globe,
  Link2,
  Copy,
  Palette,
  LayoutGrid,
  List,
  Trash2,
  GripVertical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import { QRGeneratorScreen } from './QRGeneratorScreen';

interface StoreSettingsScreenProps {
  onNavigateToTab?: (tab: 'kds' | 'menu' | 'qr' | 'settings' | 'promo_codes' | 'wallet' | 'analytics') => void;
  initialSection?: 'general' | 'qr';
}

interface StoreNameRequest {
  id: string;
  merchant_id: string;
  current_name?: string;
  requested_name: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

/**
 * Formats an ISO timestamp as HH:mm in Asia/Kuching (UTC+8) for display.
 */
function formatKuchingClock(isoString?: string | null): string {
  if (!isoString) return '--:--';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuching',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(isoString));
  } catch {
    return '--:--';
  }
}

function getKuchingTime(): { hours: number; minutes: number; dayOfWeek: number; minutesOfDay: number } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kuching', hour12: false, hour: 'numeric', minute: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(now);
  let hours = 0;
  let minutes = 0;
  for (const part of parts) {
    if (part.type === 'hour') hours = parseInt(part.value, 10);
    if (part.type === 'minute') minutes = parseInt(part.value, 10);
  }
  const kuchingDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuching' }));
  const dayOfWeek = kuchingDate.getDay();
  const minutesOfDay = hours * 60 + minutes;
  return { hours, minutes, dayOfWeek, minutesOfDay };
}

function timeToMinutes(time: string): number {
  const parts = (time || '').split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function checkIfCurrentlyOpenLocal(opHours: { open?: string; close?: string; days?: number[] }): boolean {
  const days = opHours.days || [0, 1, 2, 3, 4, 5, 6];
  const { dayOfWeek, minutesOfDay } = getKuchingTime();
  if (!days.includes(dayOfWeek)) return false;
  const openMin = timeToMinutes(opHours.open || '07:00');
  const closeMin = timeToMinutes(opHours.close || '22:00');
  if (closeMin <= openMin) {
    return minutesOfDay >= openMin || minutesOfDay < closeMin;
  }
  return minutesOfDay >= openMin && minutesOfDay < closeMin;
}

/**
 * Default grid-tile colours (customer PWA grid layout). These reproduce the
 * pre-customization look: white tile, stone-900 name, brand-orange price.
 */
const DEFAULT_GRID_CARD_BG = '#FFFFFF';
const DEFAULT_GRID_ITEM_NAME_COLOR = '#1C1917';
const DEFAULT_GRID_PRICE_COLOR = '#E86A1C';

export const StoreSettingsScreen: React.FC<StoreSettingsScreenProps> = ({ onNavigateToTab, initialSection = 'general' }) => {
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'qr'>(initialSection);

  useEffect(() => {
    if (initialSection) {
      setActiveSettingsTab(initialSection);
    }
  }, [initialSection]);

  // Merchant Store Identity state
  const { merchantId, merchantName, merchantSlug, setMerchantName, setMerchantSlug } = useMerchantKDSStore();
  const activeMerchantId = merchantId || localStorage.getItem('tapautime_merchant_id') || '';

  // Stall Acceptance Status state (persisted to Supabase)
  const [isOpen, setIsOpen] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Derived availability (source of truth: public.merchant_availability view)
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [scheduleEnforced, setScheduleEnforced] = useState(true);
  const [isUpdatingScheduleEnforced, setIsUpdatingScheduleEnforced] = useState(false);
  const [nextOpenAt, setNextOpenAt] = useState<string | null>(null);
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [lastOrderAt, setLastOrderAt] = useState<string | null>(null);
  const [isCurrentlyInHours, setIsCurrentlyInHours] = useState(false);

  // Operating Hours form state (persisted to public.merchants.operating_hours)
  const [operatingHours, setOperatingHours] = useState<{
    open: string;
    close: string;
    days: number[];
  }>({ open: '07:00', close: '22:00', days: [0, 1, 2, 3, 4, 5, 6] });
  const [isLoadingOpHours, setIsLoadingOpHours] = useState(true);
  const [isSavingOpHours, setIsSavingOpHours] = useState(false);
  const [isOpHoursExpanded, setIsOpHoursExpanded] = useState(false);

  const [currentStoreName, setCurrentStoreName] = useState<string>(merchantName || '');
  const [requestedNameInput, setRequestedNameInput] = useState('');
  const [latestRequest, setLatestRequest] = useState<StoreNameRequest | null>(null);
  const [isSubmittingName, setIsSubmittingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  // Storefront Studio state (custom page background, default menu layout, category tab images, grid tile colours, header pill colours)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioSuccess, setStudioSuccess] = useState<string | null>(null);
  const [menuLayout, setMenuLayout] = useState<'list' | 'grid'>('grid');
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [menuCategories, setMenuCategories] = useState<string[]>([]);
  const [isSavingCategoryOrder, setIsSavingCategoryOrder] = useState(false);
  const [draggedCatIndex, setDraggedCatIndex] = useState<number | null>(null);
  const [dragOverCatIndex, setDragOverCatIndex] = useState<number | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [gridCardBg, setGridCardBg] = useState(DEFAULT_GRID_CARD_BG);
  const [gridItemNameColor, setGridItemNameColor] = useState(DEFAULT_GRID_ITEM_NAME_COLOR);
  const [gridPriceColor, setGridPriceColor] = useState(DEFAULT_GRID_PRICE_COLOR);
  const [isSavingGridColors, setIsSavingGridColors] = useState(false);
  // Header pill colours: null = Auto (frosted white bg + dynamic light/dark text)
  const [headerBg, setHeaderBg] = useState<string | null>(null);
  const [headerFontColor, setHeaderFontColor] = useState<string | null>(null);
  const [headerAddressColor, setHeaderAddressColor] = useState<string | null>(null);
  const [headerIconColor, setHeaderIconColor] = useState<string | null>(null);
  const [isSavingHeaderColors, setIsSavingHeaderColors] = useState(false);

  // Store Profile Photo state
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Self pick-up address state (persisted to public.merchants.location.address)
  const [pickupAddress, setPickupAddress] = useState('');
  const [isLoadingPickupAddress, setIsLoadingPickupAddress] = useState(true);
  const [isSavingPickupAddress, setIsSavingPickupAddress] = useState(false);
  const [pickupAddressError, setPickupAddressError] = useState<string | null>(null);
  const [pickupAddressSuccess, setPickupAddressSuccess] = useState<string | null>(null);

  // Storefront URL state (customer-facing link resolved from public.merchants.slug)
  const [storefrontSlug, setStorefrontSlug] = useState<string>(merchantSlug || '');
  const [isLoadingStorefrontSlug, setIsLoadingStorefrontSlug] = useState<boolean>(!merchantSlug);
  const [isStorefrontUrlCopied, setIsStorefrontUrlCopied] = useState(false);

  // Account Security state
  const [merchantEmail, setMerchantEmail] = useState<string | null>(null);
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage && !nameSuccess && !studioSuccess && !profileSuccess && !pickupAddressSuccess) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
      setNameSuccess(null);
      setStudioSuccess(null);
      setProfileSuccess(null);
      setPickupAddressSuccess(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toastMessage, nameSuccess, studioSuccess, profileSuccess, pickupAddressSuccess]);

  // Fetch logged-in merchant auth email defensively
  useEffect(() => {
    let isMounted = true;

    const loadAuthEmail = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email && isMounted) {
          setMerchantEmail(session.user.email);
          setIsLoadingEmail(false);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email && isMounted) {
          setMerchantEmail(user.email);
          setIsLoadingEmail(false);
        }
      } catch (err) {
        console.warn('[StoreSettings] Error loading auth email:', err);
        setIsLoadingEmail(false);
      }
    };

    loadAuthEmail();
    return () => { isMounted = false; };
  }, []);

  // Load the saved self pick-up address once per merchant (not on the 60s
  // availability poll, so it can never clobber in-progress typing).
  useEffect(() => {
    let isMounted = true;
    const loadPickupAddress = async () => {
      if (!activeMerchantId) {
        setIsLoadingPickupAddress(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('merchants')
          .select('location')
          .eq('id', activeMerchantId)
          .maybeSingle();
        if (isMounted) {
          const addr = data?.location?.address;
          setPickupAddress(typeof addr === 'string' ? addr : '');
        }
      } catch (err) {
        console.warn('[StoreSettings] Error loading pick-up address:', err);
      } finally {
        if (isMounted) setIsLoadingPickupAddress(false);
      }
    };
    void loadPickupAddress();
    return () => { isMounted = false; };
  }, [activeMerchantId]);

  // Load latest store name change request and sync realtime updates
  useEffect(() => {
    let isMounted = true;
    if (!activeMerchantId) return;

    const loadLatestNameRequest = async () => {
      try {
        const { data, error } = await supabase
          .from('store_name_change_requests')
          .select('id, merchant_id, current_name, requested_name, status, admin_notes, created_at')
          .eq('merchant_id', activeMerchantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (isMounted && data) {
          setLatestRequest({
            id: data.id,
            merchant_id: data.merchant_id,
            current_name: data.current_name,
            requested_name: data.requested_name,
            status: data.status as 'pending' | 'approved' | 'rejected',
            admin_notes: data.admin_notes,
            rejection_reason: data.admin_notes,
            created_at: data.created_at,
          });
        }
      } catch (err) {
        console.warn('[StoreSettings] Error loading store name request:', err);
      }
    };

    void loadLatestNameRequest();

    const channel = supabase
      .channel(`merchant_name_requests_${activeMerchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_name_change_requests',
          filter: `merchant_id=eq.${activeMerchantId}`,
        },
        () => {
          void loadLatestNameRequest();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeMerchantId]);

  // Resolve the merchant storefront slug (once per merchant) so merchants can
  // see and share their customer-facing storefront URL.
  useEffect(() => {
    let isMounted = true;

    if (merchantSlug) {
      setStorefrontSlug(merchantSlug);
      setIsLoadingStorefrontSlug(false);
      return () => { isMounted = false; };
    }

    const loadStorefrontSlug = async () => {
      try {
        if (activeMerchantId) {
          const { data } = await supabase
            .from('merchants')
            .select('slug')
            .eq('id', activeMerchantId)
            .maybeSingle();
          if (isMounted && data?.slug) {
            setStorefrontSlug(data.slug);
            setMerchantSlug(data.slug);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data } = await supabase
            .from('merchants')
            .select('slug')
            .or(`owner_id.eq.${session.user.id},id.eq.${session.user.id}`)
            .limit(1)
            .maybeSingle();
          if (isMounted && data?.slug) {
            setStorefrontSlug(data.slug);
            setMerchantSlug(data.slug);
          }
        }
      } catch (err) {
        console.warn('[StoreSettings] Error loading storefront slug:', err);
      } finally {
        if (isMounted) setIsLoadingStorefrontSlug(false);
      }
    };

    void loadStorefrontSlug();
    return () => { isMounted = false; };
  }, [activeMerchantId, merchantSlug, setMerchantSlug]);

  const storefrontUrl = storefrontSlug ? `app.tapautime.my/${storefrontSlug}` : '';

  const handleCopyStorefrontUrl = () => {
    if (!storefrontSlug) return;
    navigator.clipboard.writeText(`https://app.tapautime.my/${storefrontSlug}`);
    setIsStorefrontUrlCopied(true);
    setTimeout(() => setIsStorefrontUrlCopied(false), 3000);
  };

  // Availability is DERIVED by the database (public.merchant_availability) so the
  // merchant UI, customer apps and the checkout API can never disagree.
  const refreshAvailability = useCallback(async () => {
    if (!activeMerchantId) return;
    try {
      const { data, error } = await supabase
        .from('merchant_availability')
        .select('id, is_open_flag, is_accepting_orders, schedule_enforced, schedule_open, is_currently_open, opens_at, closes_at, last_order_at, next_open_at, operating_hours, timezone')
        .eq('id', activeMerchantId)
        .maybeSingle();

      // Always fetch profile data (profile photo, background, layout, colours, header pill, name) in parallel
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('business_name, profile_url, background_url, menu_layout, category_images, category_order, grid_card_bg_color, grid_item_name_color, grid_price_color, header_bg_color, header_font_color, header_address_color, header_icon_color')
        .eq('id', activeMerchantId)
        .maybeSingle();

      if (merchantData) {
        if (merchantData.business_name) {
          setMerchantName(merchantData.business_name);
          setCurrentStoreName(merchantData.business_name);
        }
        // Always sync (null clears stale local state when an image is removed)
        setProfileUrl(merchantData.profile_url ?? null);
        setBackgroundUrl(merchantData.background_url ?? null);
        setMenuLayout(merchantData.menu_layout === 'list' ? 'list' : 'grid');
        setCategoryImages(merchantData.category_images ?? {});
        if (Array.isArray(merchantData.category_order)) {
          setCategoryOrder(merchantData.category_order);
        }
        setGridCardBg(merchantData.grid_card_bg_color ?? DEFAULT_GRID_CARD_BG);
        setGridItemNameColor(merchantData.grid_item_name_color ?? DEFAULT_GRID_ITEM_NAME_COLOR);
        setGridPriceColor(merchantData.grid_price_color ?? DEFAULT_GRID_PRICE_COLOR);
        setHeaderBg(merchantData.header_bg_color ?? null);
        setHeaderFontColor(merchantData.header_font_color ?? null);
        setHeaderAddressColor(merchantData.header_address_color ?? null);
        setHeaderIconColor(merchantData.header_icon_color ?? null);
      }

      if (error || !data) {
        // Resilience: fallback to raw merchants row if view query has any issue
        const { data: fallback } = await supabase
          .from('merchants')
          .select('operating_hours, is_open, is_accepting_orders, schedule_enforced')
          .eq('id', activeMerchantId)
          .maybeSingle();

        if (fallback) {
          const op = fallback.operating_hours || { open: '07:00', close: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
          setOperatingHours({
            open: op.open || '07:00',
            close: op.close || '22:00',
            days: op.days || [0, 1, 2, 3, 4, 5, 6],
          });
          const rawAccepting = fallback.is_accepting_orders !== false;
          const rawEnforced = fallback.schedule_enforced !== false;
          setIsAcceptingOrders(rawAccepting);
          setScheduleEnforced(rawEnforced);

          const inHours = checkIfCurrentlyOpenLocal(op);
          setIsCurrentlyInHours(inHours);
          setIsOpen((fallback.is_open !== false) && rawAccepting && (!rawEnforced || inHours));
        }
        return;
      }

      setIsOpen(Boolean(data.is_currently_open));
      setIsAcceptingOrders(data.is_accepting_orders !== false);
      setScheduleEnforced(data.schedule_enforced !== false);
      setIsCurrentlyInHours(Boolean(data.schedule_open));
      setNextOpenAt(data.next_open_at ?? null);
      setClosesAt(data.closes_at ?? null);
      setLastOrderAt(data.last_order_at ?? null);

      if (data.operating_hours) {
        setOperatingHours({
          open: data.operating_hours.open || '07:00',
          close: data.operating_hours.close || '22:00',
          days: data.operating_hours.days || [0, 1, 2, 3, 4, 5, 6],
        });
      }
    } catch (err) {
      console.warn('[StoreSettings] Error loading availability:', err);
    } finally {
      setIsLoadingOpHours(false);
    }
  }, [activeMerchantId]);

  // Initial load.
  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  // Re-evaluate every minute so the card flips automatically at open/close time.
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshAvailability();
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshAvailability]);

  const handleToggleAcceptingOrders = useCallback(async () => {
    if (isUpdatingStatus || !activeMerchantId) return;
    setIsUpdatingStatus(true);
    const nextValue = !isAcceptingOrders;
    try {
      const { error } = await supabase
        .from('merchants')
        .update({
          is_accepting_orders: nextValue,
          is_open: nextValue,
          last_seen: new Date().toISOString()
        })
        .eq('id', activeMerchantId);

      if (error) {
        console.error('[StoreSettings] Error toggling acceptance status:', error);
        setToastMessage('Failed to update stall status');
      } else {
        await refreshAvailability();
        setToastMessage(nextValue ? 'Stall is accepting orders again' : 'New orders paused');
      }
    } catch (err) {
      console.error('[StoreSettings] Unexpected error:', err);
      setToastMessage('Failed to update stall status');
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [isAcceptingOrders, isUpdatingStatus, activeMerchantId, refreshAvailability]);

  const handleToggleScheduleEnforced = useCallback(async () => {
    if (isUpdatingScheduleEnforced || !activeMerchantId) return;
    setIsUpdatingScheduleEnforced(true);
    const nextValue = !scheduleEnforced;
    setScheduleEnforced(nextValue);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({
          schedule_enforced: nextValue,
          last_seen: new Date().toISOString(),
        })
        .eq('id', activeMerchantId);

      if (error) {
        console.error('[StoreSettings] Error toggling schedule automation:', error);
        setScheduleEnforced(!nextValue);
        setToastMessage(`Failed to update schedule automation: ${error.message || error}`);
      } else {
        await refreshAvailability();
        setToastMessage(nextValue ? 'Schedule automation enabled' : 'Schedule automation disabled');
      }
    } catch (err: any) {
      console.error('[StoreSettings] Unexpected error toggling schedule automation:', err);
      setScheduleEnforced(!nextValue);
      setToastMessage('Failed to update schedule automation');
    } finally {
      setIsUpdatingScheduleEnforced(false);
    }
  }, [scheduleEnforced, isUpdatingScheduleEnforced, activeMerchantId, refreshAvailability]);

  const handleSaveOperatingHours = useCallback(async () => {
    if (isSavingOpHours || !activeMerchantId) return;
    
    // Verify authentication first
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[StoreSettings] No auth session - cannot save operating hours');
      setToastMessage('Please log in to save operating hours');
      return;
    }
    
    setIsSavingOpHours(true);
    try {
      // Verify merchant ownership before update
      const { data: merchantCheck, error: checkError } = await supabase
        .from('merchants')
        .select('id, owner_id')
        .eq('id', activeMerchantId)
        .maybeSingle();

      if (checkError) {
        console.error('[StoreSettings] Error checking merchant ownership:', checkError);
        setToastMessage('Failed to verify store ownership');
        return;
      }

      if (!merchantCheck) {
        console.error('[StoreSettings] Merchant not found:', activeMerchantId);
        setToastMessage('Store not found');
        return;
      }

      if (merchantCheck.owner_id !== session.user.id && merchantCheck.id !== session.user.id) {
        console.error('[StoreSettings] Owner mismatch - user:', session.user.id, 'owner:', merchantCheck.owner_id);
        setToastMessage('You do not have permission to modify this store');
        return;
      }

      const { error } = await supabase
        .from('merchants')
        .update({
          operating_hours: operatingHours,
          schedule_enforced: scheduleEnforced,
          is_open: isAcceptingOrders,
          last_seen: new Date().toISOString(),
        })
        .eq('id', activeMerchantId);

      if (error) {
        console.error('[StoreSettings] Error saving operating hours:', error);
        setToastMessage(`Failed to save: ${error.message || error}`);
      } else {
        await refreshAvailability();
        setToastMessage('Operating hours saved - stall status updated automatically');
      }
    } catch (err) {
      console.error('[StoreSettings] Unexpected error:', err);
      setToastMessage('Failed to save operating hours');
    } finally {
      setIsSavingOpHours(false);
    }
  }, [operatingHours, scheduleEnforced, isSavingOpHours, activeMerchantId, refreshAvailability]);


  // Helper to reconcile categories with saved custom order
  const sortCategoriesWithOrder = useCallback((cats: string[], order: string[]): string[] => {
    if (!order || order.length === 0) return cats;
    const ordered = order.filter((c) => cats.some((cat) => cat.toLowerCase() === c.toLowerCase()));
    // Map to preserve original casing
    const normalizedOrdered = ordered.map((c) => cats.find((cat) => cat.toLowerCase() === c.toLowerCase()) || c);
    const remaining = cats.filter((cat) => !normalizedOrdered.some((o) => o.toLowerCase() === cat.toLowerCase()));
    return [...normalizedOrdered, ...remaining];
  }, []);

  // Load the merchant's distinct menu categories once per merchant so the
  // Storefront Studio can offer a tab image slot for each one.
  useEffect(() => {
    let isMounted = true;
    const loadMenuCategories = async () => {
      if (!activeMerchantId) return;
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('category')
          .or(`merchant_id.eq.${activeMerchantId},store_id.eq.${activeMerchantId}`);
        if (error) throw error;
        if (isMounted) {
          const unique = Array.from(
            new Set((data || []).map((row: any) => (row.category || '').trim()).filter(Boolean))
          );
          const base = ['All', ...unique];
          setMenuCategories(sortCategoriesWithOrder(base, categoryOrder));
        }
      } catch (err) {
        console.warn('[StoreSettings] Error loading menu categories:', err);
      }
    };
    void loadMenuCategories();
    return () => { isMounted = false; };
  }, [activeMerchantId, categoryOrder, sortCategoriesWithOrder]);

  // Keep menuCategories in sync when categoryOrder loads from merchantData
  useEffect(() => {
    if (categoryOrder.length > 0) {
      setMenuCategories((prev) => sortCategoriesWithOrder(prev, categoryOrder));
    }
  }, [categoryOrder, sortCategoriesWithOrder]);

  // Handle storefront background image upload (replaces the purged store banner)
  const handleBackgroundUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMerchantId) return;
    setStudioError(null);
    setStudioSuccess(null);
    setIsUploadingBackground(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `backgrounds/${activeMerchantId}/background.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('merchant-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('merchant-assets').getPublicUrl(path);
      const burl = `${publicUrl}?t=${Date.now()}`;
      const { error: dbError } = await supabase
        .from('merchants')
        .update({ background_url: burl })
        .eq('id', activeMerchantId);
      if (dbError) throw dbError;
      setBackgroundUrl(burl);
      setStudioSuccess('Background updated successfully!');
    } catch (err: any) {
      console.error('[StoreSettings] Background upload error:', err);
      setStudioError(err?.message || 'Failed to upload background');
    } finally {
      setIsUploadingBackground(false);
      // Reset input so same file can be re-selected
      e.target.value = '';
    }
  }, [activeMerchantId]);

  // Remove the storefront background (customer menu falls back to a plain backdrop)
  const handleRemoveBackground = useCallback(async () => {
    if (!activeMerchantId) return;
    setStudioError(null);
    setStudioSuccess(null);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ background_url: null })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setBackgroundUrl(null);
      setStudioSuccess('Background removed.');
    } catch (err: any) {
      console.error('[StoreSettings] Background remove error:', err);
      setStudioError(err?.message || 'Failed to remove background');
    }
  }, [activeMerchantId]);

  // Persist the customer-facing default menu layout (list / grid)
  const handleSelectMenuLayout = useCallback(async (layout: 'list' | 'grid') => {
    if (!activeMerchantId || layout === menuLayout) return;
    const previousLayout = menuLayout;
    setStudioError(null);
    setStudioSuccess(null);
    setMenuLayout(layout);
    setIsSavingLayout(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ menu_layout: layout })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setStudioSuccess(`Customers will now see the ${layout === 'grid' ? 'Grid' : 'List'} layout.`);
    } catch (err: any) {
      console.error('[StoreSettings] Menu layout save error:', err);
      setMenuLayout(previousLayout);
      setStudioError(err?.message || 'Failed to save menu layout');
    } finally {
      setIsSavingLayout(false);
    }
  }, [activeMerchantId, menuLayout]);

  // Persist a single grid-tile colour (tile background, item name, or price)
  const handleGridColorChange = useCallback(async (
    field: 'grid_card_bg_color' | 'grid_item_name_color' | 'grid_price_color',
    value: string,
  ) => {
    if (!activeMerchantId) return;
    const setters = {
      grid_card_bg_color: setGridCardBg,
      grid_item_name_color: setGridItemNameColor,
      grid_price_color: setGridPriceColor,
    } as const;
    const previous = field === 'grid_card_bg_color'
      ? gridCardBg
      : field === 'grid_item_name_color'
        ? gridItemNameColor
        : gridPriceColor;
    if (value === previous) return;
    setStudioError(null);
    setStudioSuccess(null);
    setters[field](value);
    setIsSavingGridColors(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ [field]: value })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setStudioSuccess('Grid tile colours updated successfully!');
    } catch (err: any) {
      console.error('[StoreSettings] Grid tile colour save error:', err);
      setters[field](previous);
      setStudioError(err?.message || 'Failed to save grid tile colours');
    } finally {
      setIsSavingGridColors(false);
    }
  }, [activeMerchantId, gridCardBg, gridItemNameColor, gridPriceColor]);

  // Reset all grid-tile colours to the defaults
  const handleResetGridColors = useCallback(async () => {
    if (!activeMerchantId) return;
    setStudioError(null);
    setStudioSuccess(null);
    const previous = { bg: gridCardBg, name: gridItemNameColor, price: gridPriceColor };
    setGridCardBg(DEFAULT_GRID_CARD_BG);
    setGridItemNameColor(DEFAULT_GRID_ITEM_NAME_COLOR);
    setGridPriceColor(DEFAULT_GRID_PRICE_COLOR);
    setIsSavingGridColors(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({
          grid_card_bg_color: DEFAULT_GRID_CARD_BG,
          grid_item_name_color: DEFAULT_GRID_ITEM_NAME_COLOR,
          grid_price_color: DEFAULT_GRID_PRICE_COLOR,
        })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setStudioSuccess('Grid tile colours reset to defaults.');
    } catch (err: any) {
      console.error('[StoreSettings] Grid tile colour reset error:', err);
      setGridCardBg(previous.bg);
      setGridItemNameColor(previous.name);
      setGridPriceColor(previous.price);
      setStudioError(err?.message || 'Failed to reset grid tile colours');
    } finally {
      setIsSavingGridColors(false);
    }
  }, [activeMerchantId, gridCardBg, gridItemNameColor, gridPriceColor]);

  // Persist a single header pill colour (pill background, font, address, or icons).
  // null = Auto: frosted white bg + dynamic light/dark text + default icons.
  const handleHeaderColorChange = useCallback(async (
    field: 'header_bg_color' | 'header_font_color' | 'header_address_color' | 'header_icon_color',
    value: string,
  ) => {
    if (!activeMerchantId) return;
    const setters = {
      header_bg_color: setHeaderBg,
      header_font_color: setHeaderFontColor,
      header_address_color: setHeaderAddressColor,
      header_icon_color: setHeaderIconColor,
    } as const;
    const previous = field === 'header_bg_color'
      ? headerBg
      : field === 'header_font_color'
        ? headerFontColor
        : field === 'header_address_color'
          ? headerAddressColor
          : headerIconColor;
    if (value === previous) return;
    setStudioError(null);
    setStudioSuccess(null);
    setters[field](value);
    setIsSavingHeaderColors(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ [field]: value })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setStudioSuccess('Header pill colours updated successfully!');
    } catch (err: any) {
      console.error('[StoreSettings] Header pill colour save error:', err);
      setters[field](previous);
      setStudioError(err?.message || 'Failed to save header pill colours');
    } finally {
      setIsSavingHeaderColors(false);
    }
  }, [activeMerchantId, headerBg, headerFontColor, headerAddressColor, headerIconColor]);

  // Reset all header pill colours to Auto (dynamic look)
  const handleResetHeaderColors = useCallback(async () => {
    if (!activeMerchantId) return;
    setStudioError(null);
    setStudioSuccess(null);
    const previous = { bg: headerBg, font: headerFontColor, address: headerAddressColor, icon: headerIconColor };
    setHeaderBg(null);
    setHeaderFontColor(null);
    setHeaderAddressColor(null);
    setHeaderIconColor(null);
    setIsSavingHeaderColors(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({
          header_bg_color: null,
          header_font_color: null,
          header_address_color: null,
          header_icon_color: null,
        })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setStudioSuccess('Header pill colours reset to auto.');
    } catch (err: any) {
      console.error('[StoreSettings] Header pill colour reset error:', err);
      setHeaderBg(previous.bg);
      setHeaderFontColor(previous.font);
      setHeaderAddressColor(previous.address);
      setHeaderIconColor(previous.icon);
      setStudioError(err?.message || 'Failed to reset header pill colours');
    } finally {
      setIsSavingHeaderColors(false);
    }
  }, [activeMerchantId, headerBg, headerFontColor, headerAddressColor, headerIconColor]);

  // Upload a picture for a category tab shown on the customer menu page
  const handleCategoryImageUpload = useCallback(async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMerchantId) return;
    setStudioError(null);
    setStudioSuccess(null);
    setUploadingCategory(category);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
      const path = `category-icons/${activeMerchantId}/${slug}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('merchant-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('merchant-assets').getPublicUrl(path);
      const curl = `${publicUrl}?t=${Date.now()}`;
      const nextImages = { ...categoryImages, [category]: curl };
      const { error: dbError } = await supabase
        .from('merchants')
        .update({ category_images: nextImages })
        .eq('id', activeMerchantId);
      if (dbError) throw dbError;
      setCategoryImages(nextImages);
      setStudioSuccess(`Image updated for "${category}".`);
    } catch (err: any) {
      console.error('[StoreSettings] Category image upload error:', err);
      setStudioError(err?.message || 'Failed to upload category image');
    } finally {
      setUploadingCategory(null);
      e.target.value = '';
    }
  }, [activeMerchantId, categoryImages]);

  // Persist reordered category tabs
  const handleReorderCategories = useCallback(async (newOrder: string[]) => {
    if (!activeMerchantId) return;
    const previous = menuCategories;
    setMenuCategories(newOrder);
    setCategoryOrder(newOrder);
    setIsSavingCategoryOrder(true);
    setStudioError(null);
    setStudioSuccess(null);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ category_order: newOrder })
        .eq('id', activeMerchantId);
      if (error) throw error;
      setStudioSuccess('Category tab order saved!');
    } catch (err: any) {
      console.error('[StoreSettings] Category order save error:', err);
      setMenuCategories(previous);
      setCategoryOrder(previous);
      setStudioError(err?.message || 'Failed to save category order');
    } finally {
      setIsSavingCategoryOrder(false);
    }
  }, [activeMerchantId, menuCategories]);

  // Drag and drop event handlers
  const handleCategoryDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCatIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleCategoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCatIndex !== index) {
      setDragOverCatIndex(index);
    }
  };

  const handleCategoryDragEnd = () => {
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
  };

  const handleCategoryDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedCatIndex === null || draggedCatIndex === targetIndex) {
      setDraggedCatIndex(null);
      setDragOverCatIndex(null);
      return;
    }
    const nextCategories = [...menuCategories];
    const [moved] = nextCategories.splice(draggedCatIndex, 1);
    nextCategories.splice(targetIndex, 0, moved);
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
    void handleReorderCategories(nextCategories);
  };

  // Accessible mobile touch shift handler
  const handleCategoryShift = (fromIndex: number, direction: 'left' | 'right') => {
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= menuCategories.length) return;
    const nextCategories = [...menuCategories];
    const [moved] = nextCategories.splice(fromIndex, 1);
    nextCategories.splice(toIndex, 0, moved);
    void handleReorderCategories(nextCategories);
  };

  // Handle profile photo image upload
  const handleProfileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMerchantId) return;
    setProfileError(null);
    setProfileSuccess(null);
    setIsUploadingProfile(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `profiles/${activeMerchantId}/profile.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('merchant-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('merchant-assets').getPublicUrl(path);
      const purl = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('merchants').update({ profile_url: purl }).eq('id', activeMerchantId);
      setProfileUrl(purl);
      setProfileSuccess('Profile photo updated successfully!');
    } catch (err: any) {
      console.error('[StoreSettings] Profile upload error:', err);
      setProfileError(err?.message || 'Failed to upload profile photo');
    } finally {
      setIsUploadingProfile(false);
      e.target.value = '';
    }
  }, [activeMerchantId]);

  // Handle store name change request
  const handleSubmitNameRequest = useCallback(async () => {
    const trimmed = requestedNameInput.trim();
    if (!trimmed || !activeMerchantId) return;
    if (trimmed.length < 3) {
      setNameError('Name must be at least 3 characters');
      return;
    }
    setNameError(null);
    setNameSuccess(null);
    setIsSubmittingName(true);
    try {
      const currentName = currentStoreName.trim() || merchantName?.trim() || 'Store';
      const { data, error } = await supabase
        .from('store_name_change_requests')
        .insert({
          merchant_id: activeMerchantId,
          current_name: currentName,
          requested_name: trimmed,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      setLatestRequest({
        id: data?.id || '',
        merchant_id: activeMerchantId,
        current_name: currentName,
        requested_name: trimmed,
        status: 'pending',
        admin_notes: null,
        rejection_reason: null,
        created_at: data?.created_at || new Date().toISOString(),
      });
      setRequestedNameInput('');
      setNameSuccess('Name change request submitted!');
    } catch (err: any) {
      console.error('[StoreSettings] Name request error:', err);
      setNameError(err?.message || 'Failed to submit request');
    } finally {
      setIsSubmittingName(false);
    }
  }, [requestedNameInput, activeMerchantId, currentStoreName, merchantName]);

  // Persist the self pick-up address shown to customers in the customer PWA.
  // Stored inside the existing merchants.location JSONB so lat/lng and any
  // other keys are preserved, and RLS "Owners can manage merchant" applies.
  const handleSavePickupAddress = useCallback(async () => {
    if (isSavingPickupAddress || !activeMerchantId) return;
    const trimmed = pickupAddress.trim();
    if (!trimmed) {
      setPickupAddressError('Pick-up address cannot be empty');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setPickupAddressError('Please log in to save the pick-up address');
      return;
    }
    setPickupAddressError(null);
    setIsSavingPickupAddress(true);
    try {
      const { data: merchantRow, error: readErr } = await supabase
        .from('merchants')
        .select('location')
        .eq('id', activeMerchantId)
        .maybeSingle();
      if (readErr) throw readErr;

      const existingLocation =
        merchantRow?.location && typeof merchantRow.location === 'object' && !Array.isArray(merchantRow.location)
          ? merchantRow.location
          : {};

      const { error } = await supabase
        .from('merchants')
        .update({ location: { ...existingLocation, address: trimmed } })
        .eq('id', activeMerchantId);
      if (error) throw error;

      setPickupAddress(trimmed);
      setPickupAddressSuccess('Pick-up address saved! Customers will now see it in the app.');
    } catch (err: any) {
      console.error('[StoreSettings] Pick-up address save error:', err);
      setPickupAddressError(err?.message || 'Failed to save pick-up address');
    } finally {
      setIsSavingPickupAddress(false);
    }
  }, [pickupAddress, isSavingPickupAddress, activeMerchantId]);

  // Handle password update
  const handleUpdatePassword = useCallback(async () => {
    if (!newPassword || !confirmPassword) return;
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setPasswordError(null);
    setIsUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setToastMessage('Password updated successfully!');
    } catch (err: any) {
      console.error('[StoreSettings] Password update error:', err);
      setPasswordError(err?.message || 'Failed to update password');
    } finally {
      setIsUpdating(false);
    }
  }, [newPassword, confirmPassword]);

  const acceptanceSummary = !isAcceptingOrders
    ? 'CLOSED - you paused new orders.'
    : isOpen
      ? (scheduleEnforced
        ? 'OPEN - accepting orders within your scheduled hours.'
        : 'OPEN - accepting orders (schedule automation is off).')
      : (scheduleEnforced
        ? 'CLOSED - outside your operating hours.'
        : 'CLOSED - stall ordering is turned off.');

  const acceptanceDetail = !isAcceptingOrders
    ? 'Click "Resume Orders" above when you are ready to accept customer orders.'
    : scheduleEnforced
      ? (isOpen
        ? (closesAt
          ? `Closes ${formatKuchingClock(closesAt)} - last order ${formatKuchingClock(lastOrderAt)} (Asia/Kuching)`
          : 'Set your weekly schedule below.')
        : (nextOpenAt
          ? `Next opening: ${formatKuchingClock(nextOpenAt)} (Asia/Kuching)`
          : 'Outside configured operating hours.'))
      : 'Automation is off - update your schedule and switch automation back on.';
  return (

    <div className="min-h-screen bg-stone-950 text-stone-100 selection:bg-orange-500/30">

      {/* Toast */}
      {(toastMessage || nameSuccess || studioSuccess || profileSuccess) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 print:hidden">
          <Check className="w-4 h-4" />
          {toastMessage || nameSuccess || studioSuccess || profileSuccess}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 print:p-0 print:m-0 print:max-w-none">
        {/* Page Title Card & Sub-navigation */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30 flex items-center justify-center shrink-0">
              {activeSettingsTab === 'general' ? (
                <Store className="w-6 h-6 text-orange-400" />
              ) : (
                <QrCode className="w-6 h-6 text-orange-400" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Store Settings</h2>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                {activeSettingsTab === 'general'
                  ? 'Configure business operations, online acceptance status, and storefront appearance'
                  : 'Generate and print high-resolution QR codes for dine-in tables and stall counter'}
              </p>
            </div>
          </div>

          <div className="flex items-center bg-[#181615] p-1 rounded-2xl border border-stone-800 text-xs font-bold shadow-inner shrink-0" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeSettingsTab === 'general'}
              onClick={() => setActiveSettingsTab('general')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSettingsTab === 'general'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>General Settings</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSettingsTab === 'qr'}
              onClick={() => setActiveSettingsTab('qr')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSettingsTab === 'qr'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Table & Counter QRs</span>
            </button>
          </div>
        </div>

        {activeSettingsTab === 'qr' ? (
          <QRGeneratorScreen embedded={true} />
        ) : (
          <>

        {/* Stall Acceptance Status */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-xl">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${isOpen ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
              <Power className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Stall Acceptance Status</h3>
                {scheduleEnforced ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-[10px] font-semibold text-orange-400">
                    <Clock className="w-3 h-3" />SCHEDULED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-[10px] font-medium text-stone-400">
                    <Clock className="w-3 h-3" />MANUAL
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400 mt-0.5">{acceptanceSummary}</p>
              <p className="text-[10px] text-stone-500 mt-1">{acceptanceDetail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleAcceptingOrders}
            disabled={isUpdatingStatus}
            title={isAcceptingOrders ? 'Temporarily stop accepting new orders' : 'Resume accepting new orders'}
            className={`min-h-[44px] min-w-[170px] px-5 py-2.5 rounded-2xl text-xs font-black tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer ${isAcceptingOrders ? 'bg-stone-700 hover:bg-stone-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'}`}
          >
            {isUpdatingStatus
              ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>SAVING...</>
              : isAcceptingOrders
                ? <><span className="w-2 h-2 rounded-full bg-white"></span>PAUSE NEW ORDERS</>
                : <><span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>RESUME ORDERS</>}
          </button>
        </div>

        {/* Operating Hours */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl shadow-xl overflow-hidden">
          {/* Header row */}
          <button
            type="button"
            onClick={() => setIsOpHoursExpanded(prev => !prev)}
            className="w-full p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-stone-800/40 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${isCurrentlyInHours ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-stone-800 border-stone-700 text-stone-400'}`}>
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-base">Operating Hours</h3>
                  {scheduleEnforced && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-[10px] font-semibold text-orange-400">
                      <Sparkles className="w-3 h-3" />AUTO
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  {isLoadingOpHours
                    ? 'Loading schedule...'
                    : `${operatingHours.open} - ${operatingHours.close} | ${operatingHours.days.length === 7 ? 'Every day' : operatingHours.days.length === 0 ? 'No days set' : `${operatingHours.days.length} days/week`}`}
                </p>
              </div>
            </div>
            <div className={`w-5 h-5 text-stone-400 transition-transform ${isOpHoursExpanded ? 'rotate-90' : ''}`}>
              <ArrowRight className="w-5 h-5" />
            </div>
          </button>

          {/* Expandable body */}
          {isOpHoursExpanded && (
            <div className="px-5 sm:px-6 pb-6 space-y-5 border-t border-stone-800">
              {isLoadingOpHours ? (
                <div className="py-8 flex items-center justify-center gap-2 text-stone-500 text-sm">
                  <span className="w-4 h-4 border-2 border-stone-600 border-t-stone-400 rounded-full animate-spin"></span>
                  Loading operating hours…
                </div>
              ) : (
                <>
                  {/* Schedule automation */}
                  <div className="mt-5 flex items-center justify-between gap-4 p-4 rounded-2xl bg-stone-800/60 border border-stone-700">
                    <div>
                      <p className="text-sm font-semibold text-white">Auto-manage Acceptance Status</p>
                      <p className="text-xs text-stone-400 mt-0.5">Open and close the stall automatically from this schedule</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleScheduleEnforced}
                      disabled={isUpdatingScheduleEnforced}
                      title={scheduleEnforced ? 'Turn off automatic schedule management' : 'Turn on automatic schedule management'}
                      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${scheduleEnforced ? 'bg-orange-500' : 'bg-stone-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${scheduleEnforced ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Open / Close time */}
                  <div className="grid grid-cols-2 gap-3">
                    {(['open', 'close'] as const).map(key => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-stone-400 mb-1.5 capitalize">{key} Time</label>
                        <input
                          type="time"
                          value={key === 'open' ? operatingHours.open : operatingHours.close}
                          onChange={e => setOperatingHours(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Days of week */}
                  <div>
                    <label className="block text-xs font-medium text-stone-400 mb-2">Operating Days</label>
                    <div className="flex flex-wrap gap-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                        const active = operatingHours.days.includes(idx);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setOperatingHours(prev => ({
                              ...prev,
                              days: active ? prev.days.filter(d => d !== idx) : [...prev.days, idx].sort((a, b) => a - b),
                            }))}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${active ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600'}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Live derived status */}
                  <div className={`flex flex-col gap-1 px-4 py-3 rounded-2xl text-xs font-medium ${isCurrentlyInHours ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-stone-800/60 border border-stone-700 text-stone-400'}`}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isCurrentlyInHours ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} />
                      {isCurrentlyInHours ? 'Within operating hours (Asia/Kuching)' : 'Outside operating hours (Asia/Kuching)'}
                    </span>
                    <span className="text-[10px] text-stone-500 pl-4">
                      {isCurrentlyInHours
                        ? (closesAt ? `Closes ${formatKuchingClock(closesAt)} - last order ${formatKuchingClock(lastOrderAt)}` : 'No closing time configured')
                        : (nextOpenAt ? `Opens ${formatKuchingClock(nextOpenAt)}` : 'No upcoming window configured')}
                    </span>
                  </div>

                  {/* Save button */}
                  <button
                    type="button"
                    onClick={handleSaveOperatingHours}
                    disabled={isSavingOpHours}
                    className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-bold tracking-wide transition-colors flex items-center justify-center gap-2"
                  >
                    {isSavingOpHours
                      ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>Saving…</>
                      : 'Save Operating Hours'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Storefront Studio ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <Palette className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Storefront Studio</h3>
              <p className="text-xs text-stone-400">Customize how your menu page looks to customers</p>
            </div>
          </div>

          {studioError && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{studioError}</p>}
          {studioSuccess && <p className="text-xs text-emerald-400 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{studioSuccess}</p>}

          {/* Page Background */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-stone-400">Page Background</span>
            <div className="relative w-full h-36 rounded-2xl overflow-hidden bg-stone-800 border border-stone-700 group">
              {backgroundUrl
                ? <img src={backgroundUrl} alt="Store background" className="w-full h-full object-cover" />
                : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-500">
                    <ImageIcon className="w-8 h-8" />
                    <p className="text-xs text-center px-4">No background uploaded — menu uses a plain backdrop</p>
                  </div>
                )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-semibold backdrop-blur-sm">
                  <Camera className="w-4 h-4" />
                  {isUploadingBackground ? 'Uploading…' : backgroundUrl ? 'Change Background' : 'Upload Background'}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploadingBackground}
                  onChange={handleBackgroundUpload}
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-stone-500">Shown behind your whole menu page in the customer app.</p>
              {backgroundUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemoveBackground()}
                  disabled={isUploadingBackground}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-rose-600/20 border border-stone-700 hover:border-rose-500/40 text-stone-400 hover:text-rose-400 text-[11px] font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Default Menu Layout */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-stone-400">Menu Layout</span>
            <div className="flex gap-2 bg-stone-800 border border-stone-700 p-1.5 rounded-2xl">
              {([ { key: 'list' as const, label: 'List', icon: <List className="w-4 h-4" /> }, { key: 'grid' as const, label: 'Grid', icon: <LayoutGrid className="w-4 h-4" /> } ]).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void handleSelectMenuLayout(key)}
                  disabled={isSavingLayout}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                    menuLayout === key ? 'bg-orange-500 text-white shadow' : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-500">Customers see your menu in this view by default.</p>
          </div>

          {/* Grid Tile Colours */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-stone-400">Grid Tile Colours</span>
            <div className="space-y-2">
              {([
                { field: 'grid_card_bg_color' as const, label: 'Tile Background', value: gridCardBg },
                { field: 'grid_item_name_color' as const, label: 'Item Name', value: gridItemNameColor },
                { field: 'grid_price_color' as const, label: 'Price', value: gridPriceColor },
              ]).map(({ field, label, value }) => (
                <div key={field} className="flex items-center justify-between gap-3 bg-stone-800 border border-stone-700 px-3 py-2 rounded-2xl">
                  <span className="text-xs text-stone-300 font-medium">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-500 font-mono uppercase">{value}</span>
                    <label
                      className="relative w-8 h-8 rounded-full overflow-hidden border border-stone-600 cursor-pointer shrink-0"
                      style={{ backgroundColor: value }}
                    >
                      <input
                        type="color"
                        value={value}
                        disabled={isSavingGridColors}
                        onChange={(e) => void handleGridColorChange(field, e.target.value.toUpperCase())}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {/* Live preview */}
            <div className="flex items-center gap-3">
              <div
                className="w-20 rounded-2xl overflow-hidden border border-black/10 shadow"
                style={{ backgroundColor: gridCardBg }}
              >
                <div className="aspect-square bg-stone-200/60 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-stone-400" />
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-extrabold leading-tight truncate" style={{ color: gridItemNameColor }}>Signature Dish</p>
                  <p className="text-[11px] font-black tabular-nums" style={{ color: gridPriceColor }}>RM 9.90</p>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-stone-500 leading-relaxed">Preview of your grid tiles. Applies to the grid layout only.</p>
                <button
                  type="button"
                  onClick={() => void handleResetGridColors()}
                  disabled={isSavingGridColors}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-[11px] font-bold transition-colors disabled:opacity-60"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>

          {/* Header Pill Colours */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-stone-400">Header Pill Colours</span>
            <div className="space-y-2">
              {([
                { field: 'header_bg_color' as const, label: 'Pill Background', value: headerBg },
                { field: 'header_font_color' as const, label: 'Storefront Name', value: headerFontColor },
                { field: 'header_address_color' as const, label: 'Pick-up Address', value: headerAddressColor },
                { field: 'header_icon_color' as const, label: 'Icons', value: headerIconColor },
              ]).map(({ field, label, value }) => (
                <div key={field} className="flex items-center justify-between gap-3 bg-stone-800 border border-stone-700 px-3 py-2 rounded-2xl">
                  <span className="text-xs text-stone-300 font-medium">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-500 font-mono uppercase">{value || 'Auto'}</span>
                    <label
                      className="relative w-8 h-8 rounded-full overflow-hidden border border-stone-600 cursor-pointer shrink-0"
                      style={{ backgroundColor: value || '#888888' }}
                    >
                      <input
                        type="color"
                        value={value || '#888888'}
                        disabled={isSavingHeaderColors}
                        onChange={(e) => void handleHeaderColorChange(field, e.target.value.toUpperCase())}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {/* Live preview */}
            <div className="flex items-center gap-3">
              <div
                className="px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl sm:rounded-3xl border border-white/40 shadow-[0_12px_32px_rgba(0,0,0,0.25),0_2px_8px_rgba(0,0,0,0.12)] flex flex-col gap-1 max-w-xs w-full"
                style={{
                  backgroundColor: headerBg || 'rgba(255,255,255,0.1)',
                }}
              >
                <span
                  className="text-xs sm:text-sm font-black truncate leading-tight"
                  style={{ color: headerFontColor || '#ffffff' }}
                >
                  {merchantName || 'Storefront Name'}
                </span>
                <span
                  className="text-[11px] font-medium flex items-start gap-1.5"
                  style={{ color: headerAddressColor || '#d6d3d1' }}
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ color: headerIconColor || '#fbbf24' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <span className="leading-snug break-words">{pickupAddress ? `Self Pick-up: ${pickupAddress}` : 'Self Pick-up: Full Stall Address'}</span>
                </span>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-stone-500 leading-relaxed">Preview of your menu page header pill. Auto = dynamic based on background.</p>
                <button
                  type="button"
                  onClick={() => void handleResetHeaderColors()}
                  disabled={isSavingHeaderColors}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-[11px] font-bold transition-colors disabled:opacity-60"
                >
                  Reset to Auto
                </button>
              </div>
            </div>
          </div>

          {/* Category Tab Images */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <span className="block text-xs font-semibold text-stone-300">Category Tab Images</span>
                <span className="text-[11px] text-stone-500 block">Drag & re-arrange tabs to set their display sequence on your customer menu. Click any circle to upload a picture.</span>
              </div>
              {isSavingCategoryOrder && (
                <span className="text-[11px] font-semibold text-brand-orange animate-pulse">Saving order...</span>
              )}
            </div>

            {menuCategories.length === 0 ? (
              <p className="text-[11px] text-stone-500">No categories yet — add categories to your dishes in the Menu tab and they will appear here.</p>
            ) : (
              <div className="flex flex-wrap gap-2.5 sm:gap-3 pt-1">
                {menuCategories.map((cat, idx) => {
                  const img = categoryImages[cat];
                  const isDragging = draggedCatIndex === idx;
                  const isDragOver = dragOverCatIndex === idx;
                  return (
                    <div
                      key={cat}
                      draggable
                      onDragStart={(e) => handleCategoryDragStart(e, idx)}
                      onDragOver={(e) => handleCategoryDragOver(e, idx)}
                      onDragEnd={handleCategoryDragEnd}
                      onDrop={(e) => handleCategoryDrop(e, idx)}
                      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all select-none cursor-grab active:cursor-grabbing group ${
                        isDragging
                          ? 'opacity-35 scale-95 border-dashed border-brand-orange bg-brand-orange/10'
                          : isDragOver
                          ? 'border-brand-orange bg-brand-orange/15 scale-105 shadow-lg shadow-brand-orange/20 ring-2 ring-brand-orange'
                          : 'border-stone-800 bg-stone-900/80 hover:border-stone-700 hover:bg-stone-850'
                      }`}
                      style={{ width: '5.5rem' }}
                      title={`Drag to re-arrange "${cat}"`}
                    >
                      {/* Drag Grip Handle Indicator */}
                      <div className="flex items-center justify-between w-full px-0.5 text-stone-500 group-hover:text-stone-400">
                        <GripVertical className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-bold text-stone-500">#{idx + 1}</span>
                      </div>

                      {/* Circular Image / Upload Target */}
                      <label
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        className="relative w-13 h-13 rounded-full overflow-hidden bg-stone-800 border border-stone-700 group/img flex items-center justify-center cursor-pointer shadow-inner shrink-0"
                        title={`Upload image for "${cat}"`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {img ? (
                          <img src={img} alt={cat} draggable={false} className="w-full h-full object-cover pointer-events-none" />
                        ) : (
                          <span className="text-base font-black text-stone-400 pointer-events-none">{cat.charAt(0).toUpperCase()}</span>
                        )}
                        <span className="absolute inset-0 bg-black/55 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-4 h-4 text-white" />
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingCategory === cat}
                          onChange={(e) => void handleCategoryImageUpload(cat, e)}
                        />
                      </label>

                      {/* Category Label */}
                      <span className="text-[10px] font-semibold text-stone-300 text-center w-full truncate px-0.5">
                        {cat}
                      </span>

                      {/* Accessible Mobile/Touch Reorder Chevrons */}
                      <div className="flex items-center justify-between w-full pt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryShift(idx, 'left');
                          }}
                          disabled={idx === 0 || isSavingCategoryOrder}
                          className="p-0.5 rounded text-stone-500 hover:text-stone-200 hover:bg-stone-800 disabled:opacity-20 disabled:pointer-events-none"
                          title="Move left"
                          aria-label={`Move ${cat} left`}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryShift(idx, 'right');
                          }}
                          disabled={idx === menuCategories.length - 1 || isSavingCategoryOrder}
                          className="p-0.5 rounded text-stone-500 hover:text-stone-200 hover:bg-stone-800 disabled:opacity-20 disabled:pointer-events-none"
                          title="Move right"
                          aria-label={`Move ${cat} right`}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Store Profile Photo ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Profile Photo</h3>
              <p className="text-xs text-stone-400">Shown in the merchant list and your menu page header</p>
            </div>
          </div>

          {/* Profile Photo Preview */}
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 rounded-full overflow-hidden bg-stone-800 border border-stone-700 group shrink-0">
              {profileUrl
                ? <img src={profileUrl} alt="Store profile" className="w-full h-full object-cover" />
                : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-stone-500">
                    <Camera className="w-6 h-6" />
                  </div>
                )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-white text-[11px] font-semibold backdrop-blur-sm">
                  <Camera className="w-3.5 h-3.5" />
                  {isUploadingProfile ? 'Uploading…' : 'Change'}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploadingProfile}
                  onChange={handleProfileUpload}
                />
              </label>
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-xs text-stone-400 leading-relaxed">Square images work best. This photo appears as your stall avatar in the merchant list and at the top of your menu page.</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-white text-xs font-semibold cursor-pointer transition-colors">
                <Camera className="w-4 h-4" />
                {isUploadingProfile ? 'Uploading…' : (profileUrl ? 'Change Photo' : 'Upload Photo')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploadingProfile}
                  onChange={handleProfileUpload}
                />
              </label>
            </div>
          </div>

          {profileError && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{profileError}</p>}
          {profileSuccess && <p className="text-xs text-emerald-400 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{profileSuccess}</p>}
        </div>

        {/* ── Self Pick-up Address ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Self Pick-up Address</h3>
              <p className="text-xs text-stone-400">Shown to customers in the app as the collection point for self pick-up orders</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1.5">Pick-up Address</label>
            <input
              type="text"
              value={pickupAddress}
              onChange={e => { setPickupAddress(e.target.value); setPickupAddressError(null); }}
              placeholder="e.g. Stall 08, Jalan Merbau, Miri"
              maxLength={160}
              disabled={isLoadingPickupAddress || isSavingPickupAddress}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-60"
            />
            {isLoadingPickupAddress && (
              <p className="text-[11px] text-stone-500 mt-1.5">Loading current pick-up address…</p>
            )}
          </div>

          {pickupAddressError && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{pickupAddressError}</p>}
          {pickupAddressSuccess && <p className="text-xs text-emerald-400 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{pickupAddressSuccess}</p>}

          <button
            type="button"
            onClick={handleSavePickupAddress}
            disabled={isSavingPickupAddress || isLoadingPickupAddress || !pickupAddress.trim()}
            className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-bold tracking-wide transition-colors flex items-center justify-center gap-2"
          >
            {isSavingPickupAddress
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>Saving…</>
              : 'Save Pick-up Address'}
          </button>
        </div>

        {/* ── Store Name Request ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <Star className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Store Name</h3>
              <p className="text-xs text-stone-400">Current: <span className="text-white font-medium">{currentStoreName || '—'}</span></p>
            </div>
          </div>

          {latestRequest && (
            <div className={`px-4 py-3 rounded-2xl text-xs border ${latestRequest.status === 'pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : latestRequest.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
              <span className="font-semibold capitalize">{latestRequest.status}</span>
              {latestRequest.status === 'pending' && ` · "${latestRequest.requested_name}" is awaiting admin review`}
              {latestRequest.status === 'approved' && ` · "${latestRequest.requested_name}" has been approved`}
              {latestRequest.status === 'rejected' && ` · "${latestRequest.requested_name}" was rejected${(latestRequest.admin_notes || latestRequest.rejection_reason) ? ` — ${latestRequest.admin_notes || latestRequest.rejection_reason}` : ''}`}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={requestedNameInput}
              onChange={e => { setRequestedNameInput(e.target.value); setNameError(null); setNameSuccess(null); }}
              placeholder="Request a new store name…"
              maxLength={60}
              className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <button
              type="button"
              onClick={handleSubmitNameRequest}
              disabled={isSubmittingName || !requestedNameInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              {isSubmittingName ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Submit
            </button>
          </div>

          {nameError && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{nameError}</p>}
          {nameSuccess && <p className="text-xs text-emerald-400 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{nameSuccess}</p>}
        </div>

        {/* ── Account Security ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Account Security</h3>
              <p className="text-xs text-stone-400">Update your merchant login credentials</p>
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1.5">Merchant Email</label>
            <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5">
              <Mail className="w-4 h-4 text-stone-500 shrink-0" />
              {isLoadingEmail
                ? <span className="text-xs text-stone-500">Loading…</span>
                : <span className="text-sm text-stone-300 truncate">{merchantEmail || 'Not available'}</span>}
            </div>
          </div>

          {/* Password update */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setPasswordError(null); }}
                  placeholder="Min. 8 characters"
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <button type="button" onClick={() => setShowNewPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 transition-colors">
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  placeholder="Re-enter new password"
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <button type="button" onClick={() => setShowConfirmPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 transition-colors">
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {passwordError && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{passwordError}</p>}

          <button
            type="button"
            onClick={handleUpdatePassword}
            disabled={isUpdating || !newPassword || !confirmPassword}
            className="w-full py-3 rounded-2xl bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white text-sm font-bold tracking-wide transition-colors flex items-center justify-center gap-2"
          >
            {isUpdating
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>Updating…</>
              : <><Lock className="w-4 h-4" />Update Password</>}
          </button>
        </div>

        {/* ── Storefront URL ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <Globe className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Storefront URL</h3>
              <p className="text-xs text-stone-400">Share this link so customers can open your store</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5">
            <Link2 className="w-4 h-4 text-stone-500 shrink-0" />
            <span className="flex-1 text-xs text-stone-300 font-mono truncate">
              {isLoadingStorefrontSlug ? 'Loading…' : storefrontUrl || 'Not available'}
            </span>
            {storefrontUrl && (
              <button
                type="button"
                onClick={handleCopyStorefrontUrl}
                className="shrink-0 text-stone-400 hover:text-orange-400 transition-colors"
                title="Copy storefront URL"
              >
                {isStorefrontUrlCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Table & Counter QRs Quick Banner ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-orange-600/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Dine-in Table & Counter QRs</h3>
              <p className="text-xs text-stone-400 mt-0.5">Generate, configure table counts (1-50), and print physical QR codes for customer ordering</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveSettingsTab('qr')}
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-lg shadow-orange-600/20"
          >
            <span>Open QR Generator</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── QR / Merchant ID ── */}
        <div className="bg-stone-900 border border-stone-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-stone-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Merchant ID</h3>
              <p className="text-xs text-stone-400">Share this with support or use for QR linking</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5">
            <CreditCard className="w-4 h-4 text-stone-500 shrink-0" />
            <span className="text-xs text-stone-300 font-mono truncate">{activeMerchantId || 'Not available'}</span>
          </div>
        </div>
      </>
    )}

        <div className="h-8 print:hidden" />
      </main>
    </div>
  );
};
