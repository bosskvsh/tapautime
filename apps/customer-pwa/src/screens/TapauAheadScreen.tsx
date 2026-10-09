import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MerchantCard } from '../components/MerchantCard';
import { PullToRefresh } from '../components/PullToRefresh';
import type { Merchant } from './HomeScreen';

export interface TapauAheadScreenProps {
  onNavigateHome?: () => void;
  onSelectMerchant?: (merchant: Merchant) => void;
}

export const TapauAheadScreen: React.FC<TapauAheadScreenProps> = ({ 
  onNavigateHome,
  onSelectMerchant
}) => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPreOrderMerchants = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Get IDs of merchants offering pre-order items
      const { data: menuData, error: menuError } = await supabase
        .from('menu_items')
        .select('merchant_id')
        .eq('requires_preorder', true)
        .eq('is_available', true);

      if (menuError) throw menuError;

      const merchantIds = Array.from(new Set(menuData?.map(m => m.merchant_id) || []));

      if (merchantIds.length === 0) {
        setMerchants([]);
        return;
      }

      // 2. Fetch those merchants
      const { data: merchantsData, error: merchantsError } = await supabase
        .from('merchants')
        .select('*')
        .in('id', merchantIds)
        .order('created_at', { ascending: false });

      if (merchantsError) throw merchantsError;

      // 3. Fetch availability and promos
      let availabilityMap: Record<string, { is_currently_open: boolean }> = {};
      let activePromoMerchantIds = new Set<string>();

      if (merchantsData && merchantsData.length > 0) {
        const [
          { data: availabilityData },
          { data: activePromosData },
        ] = await Promise.all([
          supabase
            .from('merchant_availability')
            .select('id, is_currently_open')
            .in('id', merchantIds),
          supabase.rpc('get_merchants_with_active_promos', {
            p_merchant_ids: merchantIds,
          }),
        ]);

        if (availabilityData) {
          availabilityMap = availabilityData.reduce((acc, item) => {
            acc[item.id] = { is_currently_open: item.is_currently_open };
            return acc;
          }, {} as Record<string, { is_currently_open: boolean }>);
        }

        if (activePromosData) {
          activePromoMerchantIds = new Set(
            activePromosData.map((item: any) => item.merchant_id).filter(Boolean)
          );
        }
      }

      if (merchantsData) {
        const mappedMerchants: Merchant[] = merchantsData.map((row: any) => {
          const availability = availabilityMap[row.id];
          // Since Tapau Ahead is for future orders, the stall being closed right now shouldn't necessarily block pre-orders.
          // But we use is_currently_open for the UI badge so the user knows if they are taking live orders too.
          const is_open = availability
            ? availability.is_currently_open === true
            : (row.is_open ?? true);

          return {
            id: row.id,
            business_name: row.business_name || 'Merchant Stall',
            cuisine_type: row.cuisine_type || 'Specialty Pre-Orders',
            pickup_address: typeof row.location?.address === 'string' && row.location.address ? row.location.address : undefined,
            is_open,
            distance_km: row.distance_km ?? 0.5,
            current_prep_delay: row.current_prep_delay ?? row.order_buffer_time ?? 10,
            image_url: row.image_url || undefined,
            profile_url: row.profile_url || undefined,
            banner_url: row.banner_url || undefined,
            has_active_promo: activePromoMerchantIds.has(row.id),
          };
        });

        // Place open merchants at the top, closed merchants at the bottom (preserving relative recency)
        mappedMerchants.sort((a, b) => {
          if (a.is_open === b.is_open) return 0;
          return a.is_open ? -1 : 1;
        });

        setMerchants(mappedMerchants);
      }
    } catch (err) {
      console.warn('[TapauAheadScreen] Error loading pre-order merchants:', err);
      setMerchants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreOrderMerchants();

    // Supabase Realtime subscription to live merchants & menu_items updates
    const channel = supabase
      .channel('customer-tapau-ahead-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        () => fetchPreOrderMerchants()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchants' },
        () => fetchPreOrderMerchants()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPreOrderMerchants]);

  return (
    <PullToRefresh
      onRefresh={fetchPreOrderMerchants}
      pullingText="Pull to refresh..."
      refreshingText="Refreshing stalls..."
      completeText="Updated!"
    >
      <div className="flex flex-col space-y-6 pb-36 bg-brand-offwhite min-h-screen">
        <div className="max-w-lg mx-auto w-full space-y-6 p-4">
          {/* Page Header */}
          <header className="pt-2">
            <h1 className="text-3xl font-black text-stone-900 tracking-tight">Tapau Ahead</h1>
            <p className="text-sm text-stone-500 font-medium mt-1">
              Order from specialty bakers & caterers in advance. 
            </p>
          </header>

          {/* Coming Soon & Paused Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 p-5 text-white shadow-lg shadow-orange-500/15 border border-orange-400/40">
            <div className="relative z-10 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 text-white shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-white text-orange-600 text-[10px] font-black uppercase tracking-wider shadow-xs">
                    Coming Soon
                  </span>
                </div>
                <h2 className="text-base font-black text-white tracking-tight leading-snug">
                  Tapau Ahead is taking a short break!
                </h2>
                <p className="text-xs text-white/90 mt-1 leading-relaxed font-medium">
                  We are working with our merchants to make ordering ahead as smooth as possible. Advance orders are on hold for now, but we will be back soon!
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {isLoading ? (
              <div className="bg-white p-8 rounded-2xl border border-stone-200/70 text-center text-stone-400 text-sm shadow-xs">
                Finding pre-order stalls...
              </div>
            ) : merchants.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-stone-200/70 text-center flex flex-col items-center gap-3 shadow-xs">
                 <div className="w-12 h-12 rounded-xl bg-stone-50 text-stone-300 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                <p className="text-stone-500 text-sm font-medium">No merchants are offering Tapau Ahead right now.</p>
              </div>
            ) : (
              merchants.map((merchant) => (
                <div key={merchant.id} className="relative group">
                  <div className="opacity-75 pointer-events-none select-none">
                    <MerchantCard
                      merchant={merchant}
                      onSelect={() => {}}
                    />
                  </div>
                  {/* Paused Overlay Badge */}
                  <div className="absolute top-3 right-3 z-10 pointer-events-none">
                    <span className="px-2.5 py-1 rounded-full bg-stone-900/85 backdrop-blur-md text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider shadow-md">
                      Pre-orders Paused
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
};
