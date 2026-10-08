import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { KDSScreen } from './screens/KDSScreen';
import { MenuManagerScreen } from './screens/MenuManagerScreen';
import { StoreSettingsScreen } from './screens/StoreSettingsScreen';
import { PromoCodesScreen } from './screens/PromoCodesScreen';
import { WalletScreen } from './screens/WalletScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { StoreSetupScreen } from './screens/StoreSetupScreen';
import { useMerchantKDSStore } from './stores/useMerchantKDSStore';
import { useMerchantRealtimeOrders } from './hooks/useMerchantRealtimeOrders';
import { useAudioAlarm, unlockNewOrderAudio } from './hooks/useAudioAlarm';
import { PWAUpdateToast, OfflineBanner } from '@tapautime/shared-ui';
import { supabase } from './lib/supabase';
import {
  ChefHat,
  UtensilsCrossed,
  Sliders,
  TicketPercent,
  Wallet,
  LogOut,
  Power,
  AlertTriangle,
  Bell,
  ShoppingBag,
} from 'lucide-react';

import { PreOrdersScreen } from './screens/PreOrdersScreen';

type NavTab = 'kds' | 'preorders' | 'menu' | 'qr' | 'settings' | 'promo_codes' | 'wallet' | 'analytics';
type MerchantStatus = 'checking' | 'has_merchant' | 'no_merchant' | 'none';

interface NavItemConfig {
  key: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { key: 'kds', label: 'KDS', icon: ChefHat },
  { key: 'preorders', label: 'Tapau Ahead', icon: ShoppingBag },
  { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { key: 'promo_codes', label: 'Offers', icon: TicketPercent },
  { key: 'wallet', label: 'Finances', icon: Wallet },
  { key: 'settings', label: 'Settings', icon: Sliders },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('kds');
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [merchantStatus, setMerchantStatus] = useState<MerchantStatus>('checking');
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  const { merchantName, merchantId, orders, setMerchantId, setMerchantName, setMerchantSlug } = useMerchantKDSStore();
  const { isAlarming, triggerAlarm, acknowledgeAlarm, playNewOrderSound, stopNewOrderSound } = useAudioAlarm();

  // Root-level Realtime Orders Listener & Stall Heartbeat
  // Active across ALL pages (KDS, Menu, Promo Codes, Finances, Settings)
  useMerchantRealtimeOrders({
    merchantId,
    enabled: Boolean(merchantId),
  });

  const pendingOrdersCount = orders.filter((o) => {
    if (o.isPreorder) return false;
    if (o.status === 'pending_payment') return false;
    const isOnlineOrGateway = o.paymentMethod === 'gateway' || o.paymentMethod === 'online';
    if (isOnlineOrGateway && o.paymentStatus !== 'captured' && o.paymentStatus !== 'paid') {
      return false;
    }
    return (
      o.status === 'pending' ||
      o.status === 'verification_pending' ||
      (o.status === 'accepted' && (o.paymentStatus === 'captured' || o.paymentStatus === 'paid'))
    );
  }).length;

  // Track previous pending orders count to detect incoming new orders
  const prevPendingCountRef = useRef<number>(0);

  // Pre-unlock HTML5 audio for tapautime.mp3 upon first user interaction to comply with browser autoplay policies
  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockNewOrderAudio();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  // Auto-trigger audio alarm loop whenever new pending orders arrive across ANY page
  useEffect(() => {
    if (pendingOrdersCount > prevPendingCountRef.current) {
      triggerAlarm(undefined, { silent: true });
    } else if (pendingOrdersCount === 0 && isAlarming) {
      acknowledgeAlarm();
    }
    prevPendingCountRef.current = pendingOrdersCount;
  }, [pendingOrdersCount, isAlarming, triggerAlarm, acknowledgeAlarm]);

  // Continuous tapautime.mp3 sound playback across ALL merchant pages (KDS, Menu, Wallet, Settings, etc.)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (pendingOrdersCount > 0 && isAlarming) {
      playNewOrderSound(1, 0);
      interval = setInterval(() => {
        playNewOrderSound(1, 0);
      }, 3000);
    } else {
      stopNewOrderSound();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pendingOrdersCount, isAlarming, playNewOrderSound, stopNewOrderSound]);

  const navigateTo = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentRoute(path);
    }
  }, []);

  // Synchronize browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Query merchants table for authenticated user's uid
  const checkMerchantRecord = useCallback(async (userId: string) => {
    setMerchantStatus('checking');
    try {
      const { data, error } = await supabase
        .from('merchants')
        .select('id, business_name, slug')
        .or(`owner_id.eq.${userId},id.eq.${userId}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data?.id) {
        setMerchantId(data.id);
        if (data.business_name) {
          setMerchantName(data.business_name);
        }
        if (data.slug) {
          setMerchantSlug(data.slug);
        }
        localStorage.setItem('tapautime_merchant_id', data.id);
        setMerchantStatus('has_merchant');
      } else {
        setMerchantStatus('no_merchant');
      }
    } catch (err) {
      console.warn('[App] Merchant record check error:', err);
      // Fallback to onboarding if no merchant record found
      setMerchantStatus('no_merchant');
    }
  }, [setMerchantId, setMerchantName, setMerchantSlug]);

  // Handle Session and Realtime Auth State
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(initialSession);
        if (initialSession?.user?.id) {
          await checkMerchantRecord(initialSession.user.id);
        } else {
          setMerchantStatus('none');
        }
      } catch (err) {
        console.error('[App] Auth init failed:', err);
        if (isMounted) setMerchantStatus('none');
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);

      if (newSession?.user?.id) {
        await checkMerchantRecord(newSession.user.id);
      } else {
        setMerchantStatus('none');
        setMerchantId('');
        setMerchantName('');
        localStorage.removeItem('tapautime_merchant_id');
      }
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [checkMerchantRecord, setMerchantId, setMerchantName]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[App] Error during sign out:', err);
    }
  };

  // 1. Loading State
  if (authLoading || (session && merchantStatus === 'checking')) {
    return (
      <div className="min-h-screen bg-[#1c1917] flex flex-col items-center justify-center text-stone-100 selection:bg-orange-600 selection:text-white">
        <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-2xl shadow-lg shadow-orange-600/30 animate-pulse mb-4">
          TT
        </div>
        <p className="text-sm font-bold text-stone-300 tracking-wide">
          Verifying Merchant Credentials...
        </p>
      </div>
    );
  }

  // 2. Protected Guard: If no active session, route to Onboarding or AuthScreen
  if (!session) {
    if (currentRoute === '/onboarding') {
      return <OnboardingScreen onNavigateToLogin={() => navigateTo('/')} />;
    }
    return <AuthScreen onNavigateToOnboarding={() => navigateTo('/onboarding')} />;
  }

  // 3. Post-Login Guard: If user authenticated but has no merchant record, force StoreSetupScreen
  if (merchantStatus === 'no_merchant') {
    return (
      <StoreSetupScreen
        userId={session.user.id}
        userEmail={session.user.email}
        onSuccess={(merchant) => {
          setMerchantId(merchant.id);
          setMerchantName(merchant.business_name);
          setMerchantStatus('has_merchant');
        }}
        onSignOut={() => setIsSignOutModalOpen(true)}
      />
    );
  }

  // 4. Authenticated with Merchant Profile: Render KDS Dashboard
  return (
    <div className="h-screen overflow-hidden bg-[#1c1917] text-stone-100 font-sans antialiased flex flex-col selection:bg-orange-600 selection:text-white">
      {/* Offline network banner */}
      <OfflineBanner />

      {/* Top Merchant Header Navigation */}
      <header className="bg-[#24201e] border-b border-stone-800 px-4 sm:px-6 py-3.5 flex items-center justify-between print:hidden sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center font-black text-white text-sm shadow-md shadow-orange-600/30 shrink-0">
              TT
            </span>
            <div className="flex flex-col">
              <span className="font-black text-white tracking-tight leading-tight text-sm sm:text-base">
                TapauTime
              </span>
              <span className="text-[10px] text-orange-400 font-bold tracking-wide uppercase">
                Merchant
              </span>
            </div>
          </div>

          {/* Desktop Navigation Pills (Hidden on mobile < 768px) */}
          <nav className="hidden md:flex items-center gap-1 bg-[#181615] p-1.5 rounded-2xl border border-stone-800/90 text-xs font-bold">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              const showBadge = item.key === 'kds' && pendingOrdersCount > 0;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 relative ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 font-extrabold'
                      : 'text-stone-400 hover:text-white hover:bg-stone-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-rose-600 text-white shadow-sm animate-pulse">
                      {pendingOrdersCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-xs text-stone-400 font-bold hidden lg:block">
            Stall: <span className="text-stone-200">{merchantName || 'Kitchen Hub'}</span>
          </div>

          <button
            onClick={() => setIsSignOutModalOpen(true)}
            className="min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl bg-stone-800/80 text-stone-400 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer flex items-center gap-1.5 border border-stone-800"
            title="Sign out of TapauTime"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Global Urgent Audio Alarm Banner - active across ALL pages */}
      {isAlarming && pendingOrdersCount > 0 && (
        <div className="bg-rose-600 border-b border-rose-500 text-white px-4 py-3 sm:px-6 flex items-center justify-between shadow-lg shadow-rose-950/40 z-40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide uppercase">
                {pendingOrdersCount} New Order{pendingOrdersCount > 1 ? 's' : ''} Awaiting Kitchen Confirmation!
              </h2>
              <p className="text-xs text-rose-100 font-medium">
                TapauTime alert is ringing. Review orders to silence.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== 'kds' && (
              <button
                onClick={() => setActiveTab('kds')}
                className="h-9 px-3.5 bg-stone-900 hover:bg-black text-white font-extrabold rounded-xl text-xs shadow-md active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>View KDS</span>
              </button>
            )}
            <button
              onClick={() => acknowledgeAlarm()}
              className="h-9 px-4 bg-white text-rose-700 hover:bg-rose-50 font-black rounded-xl text-xs shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Mute Alarm
            </button>
          </div>
        </div>
      )}

      {/* Main View Area - padded bottom on mobile to accommodate fixed bottom nav */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
        {activeTab === 'kds' && <KDSScreen />}
        {activeTab === 'preorders' && <PreOrdersScreen />}
        {activeTab === 'menu' && <MenuManagerScreen />}
        {activeTab === 'qr' && <StoreSettingsScreen initialSection="qr" onNavigateToTab={(tab) => setActiveTab(tab)} />}
        {activeTab === 'settings' && <StoreSettingsScreen onNavigateToTab={(tab) => setActiveTab(tab)} />}
        {activeTab === 'promo_codes' && <PromoCodesScreen />}
        {activeTab === 'wallet' && <WalletScreen />}
        {activeTab === 'analytics' && <WalletScreen initialSection="analytics" />}
      </main>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#181615]/95 backdrop-blur-xl border-t border-stone-800/90 px-1 py-1 flex items-center justify-around select-none shadow-2xl safe-area-pb"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          const showBadge = item.key === 'kds' && pendingOrdersCount > 0;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex-1 py-1.5 px-0.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer min-h-[50px] relative ${
                isActive
                  ? 'text-orange-500 font-black'
                  : 'text-stone-400 hover:text-stone-200 font-semibold'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-colors relative ${isActive ? 'bg-orange-500/15' : ''}`}>
                <Icon className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm animate-pulse">
                    {pendingOrdersCount > 9 ? '9+' : pendingOrdersCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[56px] leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Sign Out Confirmation Modal */}
      {isSignOutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Sign Out of Stall?</h3>
                <p className="text-xs text-stone-400">End active session on this device</p>
              </div>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Signing out will disconnect your kitchen terminal and cease real-time sound alerts.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSignOutModalOpen(false)}
                className="min-h-[40px] px-4 py-2 text-xs font-bold text-stone-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignOutModalOpen(false);
                  handleSignOut();
                }}
                className="min-h-[40px] px-5 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-900/30"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Worker SkipWaiting Update Notification */}
      <PWAUpdateToast position="bottom" />
    </div>
  );
};
