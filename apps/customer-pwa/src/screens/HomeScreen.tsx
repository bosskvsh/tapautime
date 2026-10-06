import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { HeroCard } from '../components/HeroCard';
import { MerchantCard } from '../components/MerchantCard';
import { SearchFilterStrip } from '../components/SearchFilterStrip';
import { PullToRefresh } from '../components/PullToRefresh';

export interface Merchant {
  id: string;
  business_name: string;
  cuisine_type?: string;
  pickup_address?: string;
  is_open: boolean;
  distance_km?: number;
  current_prep_delay?: number;
  rating?: number;
  image_url?: string;
  profile_url?: string;
  banner_url?: string;
  has_active_promo?: boolean;
}

export interface HomeScreenProps {
  onSelectMerchant?: (merchant: Merchant) => void;
  onOpenCart?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectMerchant }) => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // minimal live fetch & map from Supabase merchants table
  // IMPORTANT: is_open comes from merchant_availability view (derived: schedule + operator pause + last-order cutoff)
  // so the home screen can never disagree with what checkout will allow.
  const fetchMerchants = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch merchants with their derived availability status
      const { data: merchantsData, error: merchantsError } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch availability and active promo flags for all fetched merchants in parallel
      let availabilityMap: Record<string, { is_currently_open: boolean }> = {};
      let activePromoMerchantIds = new Set<string>();

      if (!merchantsError && merchantsData && merchantsData.length > 0) {
        const merchantIds = merchantsData.map((m: any) => m.id);
        const [
          { data: availabilityData, error: availabilityError },
          { data: activePromosData, error: activePromosError },
        ] = await Promise.all([
          supabase
            .from('merchant_availability')
            .select('id, is_currently_open')
            .in('id', merchantIds),
          supabase.rpc('get_merchants_with_active_promos', {
            p_merchant_ids: merchantIds,
          }),
        ]);

        if (!availabilityError && availabilityData) {
          availabilityMap = availabilityData.reduce((acc, item) => {
            acc[item.id] = { is_currently_open: item.is_currently_open };
            return acc;
          }, {} as Record<string, { is_currently_open: boolean }>);
        }

        if (!activePromosError && activePromosData) {
          activePromoMerchantIds = new Set(
            activePromosData.map((item: any) => item.merchant_id).filter(Boolean)
          );
        }
      }

      if (!merchantsError && merchantsData) {
        setMerchants(
          merchantsData.map((row: any) => {
            const availability = availabilityMap[row.id];
            // Use derived is_currently_open from merchant_availability view,
            // fallback to merchants.is_open if availability data is missing
            const is_open = availability
              ? availability.is_currently_open === true
              : (row.is_open ?? true);

            return {
              id: row.id,
              business_name: row.business_name || 'Merchant Stall',
              cuisine_type: row.cuisine_type || 'Local Delights',
              pickup_address: typeof row.location?.address === 'string' && row.location.address ? row.location.address : undefined,
              is_open,
              distance_km: row.distance_km ?? 0.5,
              current_prep_delay: row.current_prep_delay ?? row.order_buffer_time ?? 10,
              image_url: row.image_url || undefined,
              profile_url: row.profile_url || undefined,
              banner_url: row.banner_url || undefined,
              has_active_promo: activePromoMerchantIds.has(row.id),
            };
          })
        );
      } else {
        setMerchants([]);
      }
    } catch (err) {
      console.warn('[HomeScreen] Error loading merchants:', err);
      setMerchants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

    useEffect(() => {
    fetchMerchants();

    // Supabase Realtime subscription to live merchants & promo updates
    const channel = supabase
      .channel('customer-merchants-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchants',
        },
        () => {
          fetchMerchants();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_promo_codes',
        },
        () => {
          fetchMerchants();
        }
      )
      .subscribe();

    // Re-fetch every 60 seconds to catch time-based availability changes
    // (schedule-driven open/close, last-order cutoffs, overnight windows)
    const availabilityInterval = setInterval(() => {
      fetchMerchants();
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(availabilityInterval);
    };
  }, [fetchMerchants]);

  const handleRefresh = useCallback(async () => {
    await fetchMerchants();
  }, [fetchMerchants]);

  const filteredMerchants = merchants.filter((m) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      m.business_name.toLowerCase().includes(query) ||
      (m.cuisine_type && m.cuisine_type.toLowerCase().includes(query)) ||
      (m.pickup_address && m.pickup_address.toLowerCase().includes(query))
    );
  });

  return (
    <PullToRefresh
      onRefresh={handleRefresh}
      pullingText="Pull to refresh stalls..."
      refreshingText="Refreshing merchant stalls..."
      completeText="Stalls updated!"
    >
      <div className="min-h-[100dvh] flex flex-col space-y-5 pb-32">
        {/* Top Hero Section */}
        <HeroCard />

        {/* Search Bar */}
        <SearchFilterStrip
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Popular Merchants List */}
        <div className="px-4 space-y-3.5">
          <div className="flex justify-between items-baseline mb-1">
            <h3 className="text-lg font-black text-stone-900 tracking-tight">Popular Merchants & Stalls</h3>
            <span className="text-brand-orange text-xs font-bold">Near You</span>
          </div>

          {isLoading ? (
            <div className="bg-white p-8 rounded-2xl border border-stone-200/70 text-center text-stone-400 text-sm">
              Loading merchant stalls...
            </div>
          ) : filteredMerchants.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-stone-200/70 text-center text-stone-500 text-sm">
              {searchQuery.trim() ? `No stalls found matching "${searchQuery}"` : 'No stalls currently open or available.'}
            </div>
          ) : (
            filteredMerchants.map((merchant) => (
              <MerchantCard
                key={merchant.id}
                merchant={merchant}
                onSelect={() => onSelectMerchant?.(merchant)}
              />
            ))
          )}
        </div>
      </div>
    </PullToRefresh>
  );
};
