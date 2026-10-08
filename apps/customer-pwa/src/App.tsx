import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { HomeScreen, Merchant } from './screens/HomeScreen';
import { MenuScreen } from './screens/MenuScreen';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { OrderStatusScreen } from './screens/OrderStatusScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { TapauAheadScreen } from './screens/TapauAheadScreen';
import { TopNavBar } from './components/TopNavBar';
import { BottomNavBar } from './components/BottomNavBar';
import { useCustomerOrderStore, isTerminalStatus, resolveOrderStatusFromRow, CustomerOrder } from './stores/useCustomerOrderStore';
import { useCartStore } from './stores/useCartStore';
import { supabase } from './lib/supabase';
import { useAuthStore } from './stores/useAuthStore';
import { PWAUpdateToast } from '@tapautime/shared-ui';
import { ContactNumberModal } from './components/auth/ContactNumberModal';

type Screen = 'home' | 'menu' | 'checkout' | 'status' | 'rewards' | 'profile' | 'orders' | 'tapau_ahead';

const CustomerAppLayout: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [isPreorderMenu, setIsPreorderMenu] = useState<boolean>(false);
  const [activeOrderId, setActiveOrderId] = useState<string>('');
  const [activePickupPin, setActivePickupPin] = useState<string>('');
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);

  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const { activeOrder, updateOrderStatus, updateActiveOrderDetails } = useCustomerOrderStore();
  const navigate = useNavigate();

  // Initialize Supabase Auth Session & Lifecycle Subscriptions
  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  // Re-sync orders whenever authenticated user state resolves
  useEffect(() => {
    if (user?.id) {
      useCustomerOrderStore.getState().syncCustomerOrders();
    }
  }, [user?.id]);

  // Automatic prompt: Prompt customer for contact number on first sign-up or sign-in if missing
  useEffect(() => {
    if (!isInitialized || !user) {
      setIsContactModalOpen(false);
      return;
    }

    // 1. If user already has phone in metadata or auth object
    const existingPhone = user.phone || user.user_metadata?.phone;
    if (existingPhone && typeof existingPhone === 'string' && existingPhone.trim().length > 0) {
      setIsContactModalOpen(false);
      return;
    }

    // 2. Check if dismissed during current browser session
    const isDismissed =
      typeof window !== 'undefined' &&
      sessionStorage.getItem(`dismissed_contact_modal_${user.id}`);
    if (isDismissed) {
      return;
    }

    // 3. Check public.users table in database in case phone was saved earlier
    let isMounted = true;
    const checkUserContact = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('phone')
          .eq('id', user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (!error && data?.phone && typeof data.phone === 'string' && data.phone.trim().length > 0) {
          // Sync database phone to user metadata in memory
          useAuthStore.getState().setUser({
            ...user,
            user_metadata: {
              ...user.user_metadata,
              phone: data.phone,
            },
          });
        } else {
          // Customer has no phone on record: display popup
          setIsContactModalOpen(true);
        }
      } catch (err) {
        console.warn('[App] Error verifying customer contact number:', err);
        if (isMounted) setIsContactModalOpen(true);
      }
    };

    checkUserContact();

    return () => {
      isMounted = false;
    };
  }, [user, isInitialized]);

  const hasActiveOrder =
    Boolean(activeOrder) &&
    !isTerminalStatus(activeOrder?.order_status);

  // Global realtime sync for active orders across all screens with zero-dependency trap
  useEffect(() => {
    // Initial sync on mount
    useCustomerOrderStore.getState().syncCustomerOrders();

    const channel = supabase
      .channel('app-global-orders-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (!row) return;

          const currentStore = useCustomerOrderStore.getState();
          const currentActive = currentStore.activeOrder;
          const currentUserId = useAuthStore.getState().user?.id;

          const isMatchingUser = currentUserId && row.customer_id === currentUserId;
          const isMatchingOrder =
            currentActive &&
            (row.id === currentActive.id ||
              row.display_id === currentActive.display_id ||
              row.pickup_pin === currentActive.pickup_pin);

          if (isMatchingUser || isMatchingOrder) {
            if (payload.eventType === 'UPDATE') {
              const nextStatus = resolveOrderStatusFromRow(row);
              if (currentActive && (row.id === currentActive.id || row.display_id === currentActive.display_id)) {
                currentStore.updateOrderStatus(currentActive.id, nextStatus);
                if (row.estimated_prep_minutes) {
                  currentStore.updateActiveOrderDetails(currentActive.id, {
                    estimated_prep_minutes: row.estimated_prep_minutes,
                  });
                }
              }
            }
            // Trigger comprehensive store sync to update history and details
            currentStore.syncCustomerOrders();
          }
        }
      )
      .subscribe();

    // Re-sync whenever app gains focus or returns to foreground (survives mobile OS sleeping)
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        useCustomerOrderStore.getState().syncCustomerOrders();
      }
    };

    const handleWindowFocus = () => {
      useCustomerOrderStore.getState().syncCustomerOrders();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleWindowFocus);
    }

    // Gentle 10-second polling fallback while user has an active, non-terminal order
    const pollInterval = setInterval(() => {
      const active = useCustomerOrderStore.getState().activeOrder;
      if (active && !isTerminalStatus(active.order_status)) {
        useCustomerOrderStore.getState().syncCustomerOrders();
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWindowFocus);
      }
      clearInterval(pollInterval);
    };
  }, []);

  // Reactive cart item count for header and navigation badges
  const cartCount = useCartStore((s) => s.getTotalCount());

  // Single-level rooted routing: Home is root; non-home screens replace each other
  // so an Android back swipe always pops directly back to Home instead of winding through history.
  const currentScreenRef = useRef<Screen>('home');
  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  const navigateTo = useCallback((screen: Screen) => {
    const prevScreen = currentScreenRef.current;
    setCurrentScreen(screen);
    currentScreenRef.current = screen;

    if (screen === 'home') {
      if (window.location.hash) {
        window.history.replaceState({ screen: 'home' }, '', window.location.pathname);
      }
      return;
    }

    const targetHash = `#/${screen}`;
    // If transitioning from home, push the subscreen on top of home
    if (prevScreen === 'home' || !window.location.hash) {
      window.history.pushState({ screen }, '', targetHash);
    } else {
      // If switching between non-home screens, replace state to avoid accumulating back stack
      window.history.replaceState({ screen }, '', targetHash);
    }
  }, []);

  useEffect(() => {
    let isHandlingSlug = false;

    // Dedicated Android back gesture interceptor:
    // When the customer swipes back on Android from ANY non-home screen,
    // immediately redirect directly to the main customer home page.
    const handlePopState = (e: PopStateEvent) => {
      // Since our history stack only ever has [Home] -> [Active Screen],
      // a genuine Back button press from any screen will always pop back to 'home'.
      // Spurious page-load popstate events (e.g. in Facebook WebView) will pop to the active screen or null.
      if (e.state?.screen === 'home') {
        setIsCartOpen(false);
        setCurrentScreen('home');
        currentScreenRef.current = 'home';
        if (window.location.hash) {
          window.history.replaceState({ screen: 'home' }, '', window.location.pathname);
        }
      }
    };

    const handleHashChange = () => {
      if (isHandlingSlug) return;
      const rawHash = window.location.hash.replace(/^#\/?/, '');
      const returnScreen = typeof window !== 'undefined' ? sessionStorage.getItem('tapau_oauth_return_screen') : null;

      if (returnScreen && ['orders', 'rewards', 'profile', 'status', 'checkout', 'menu', 'tapau_ahead'].includes(returnScreen)) {
        sessionStorage.removeItem('tapau_oauth_return_screen');
        navigateTo(returnScreen as Screen);
      } else if (rawHash === '' || rawHash === 'home') {
        setCurrentScreen('home');
        currentScreenRef.current = 'home';
      } else if (['orders', 'rewards', 'profile', 'status', 'checkout', 'menu', 'tapau_ahead'].includes(rawHash)) {
        setCurrentScreen(rawHash as Screen);
        currentScreenRef.current = rawHash as Screen;
      }
    };

    const init = async () => {
      // Handle Curlec FPX redirect return callback
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('curlec_callback')) {
        const txId = searchParams.get('tx_id');
        const pin = searchParams.get('pin');
        const displayId = searchParams.get('display_id');
        const mId = searchParams.get('merchant_id');
        const paymentId = searchParams.get('razorpay_payment_id');
        const curlecOrderId = searchParams.get('razorpay_order_id');
        const errorCode = searchParams.get('error[code]') || searchParams.get('error_code');
        const errorDesc = searchParams.get('error[description]') || searchParams.get('error_description');

        // Clean query params from browser URL bar and prime history stack with Home as root
        window.history.replaceState({ screen: 'home' }, '', window.location.pathname);
        window.history.pushState(
          { screen: errorCode ? 'checkout' : 'orders' },
          '',
          window.location.pathname + (errorCode ? '#/checkout' : '#/orders')
        );

        if (errorCode) {
          console.warn('[App] Curlec FPX payment cancelled or failed via redirect:', errorCode, errorDesc);
          setCurrentScreen('checkout');
          currentScreenRef.current = 'checkout';
          return;
        }

        if (txId) {
          // 1. Authoritative capture sync via RPC
          try {
            await supabase.rpc('confirm_dine_in_payment', {
              p_transaction_id: txId,
              p_curlec_payment_id: paymentId || 'captured_fpx',
              p_curlec_order_id: curlecOrderId || null,
              p_pickup_pin: pin || null,
            });
          } catch (rpcErr) {
            console.warn('[App] Curlec confirmation RPC warning:', rpcErr);
          }

          // 2. Fetch fresh order details from database
          let resolvedOrder: CustomerOrder | null = null;
          try {
            const { data: dbOrder } = await supabase
              .from('orders')
              .select('*')
              .or(`transaction_id.eq.${txId},id.eq.${txId}`)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (dbOrder) {
              resolvedOrder = {
                id: dbOrder.transaction_id || dbOrder.id,
                display_id: dbOrder.display_id || displayId || '#TT-ORDER',
                merchant_id: dbOrder.merchant_id || mId || '',
                order_status: 'accepted',
                payment_status: 'captured',
                payment_method: 'online',
                order_type: 'takeaway',
                table_number: null,
                pickup_pin: dbOrder.pickup_pin || pin || '----',
                receipt_url: dbOrder.receipt_url || null,
                idempotency_key: dbOrder.idempotency_key || txId,
                total_amount: Number(dbOrder.total_amount || 0),
                promo_code: dbOrder.promo_code || null,
                promo_code_id: dbOrder.promo_code_id || null,
                discount_amount: Number(dbOrder.discount_amount || 0),
                estimated_prep_minutes: 15,
                created_at: dbOrder.created_at || new Date().toISOString(),
              };
            }
          } catch (fetchErr) {
            console.warn('[App] Failed to fetch completed order row:', fetchErr);
          }

          if (!resolvedOrder) {
            resolvedOrder = {
              id: txId,
              display_id: displayId || '#TT-ORDER',
              merchant_id: mId || '',
              order_status: 'accepted',
              payment_status: 'captured',
              payment_method: 'online',
              order_type: 'takeaway',
              table_number: null,
              pickup_pin: pin || '----',
              receipt_url: null,
              idempotency_key: txId,
              total_amount: 0,
              estimated_prep_minutes: 15,
              created_at: new Date().toISOString(),
            };
          }

          useCustomerOrderStore.getState().setActiveOrder(resolvedOrder);
          useCartStore.getState().clearCart();
          if (pin || resolvedOrder.pickup_pin) setActivePickupPin(resolvedOrder.pickup_pin || pin || '');
          if (displayId || resolvedOrder.display_id) setActiveOrderId(resolvedOrder.display_id || displayId || '');
          setCurrentScreen('orders');
          currentScreenRef.current = 'orders';
          return;
        }
      }

      // Extract path or subdomain
      const hostname = window.location.hostname;
      const isSubdomain = hostname !== 'app.tapautime.my' && hostname !== 'tapautime.my' && !hostname.includes('localhost');
      
      let path = window.location.pathname.replace(/^\/app\//, '').replace(/^\//, '').replace(/\/$/, '').toLowerCase();
      
      if (isSubdomain) {
        path = hostname.split('.')[0];
      }

      const rawHash = window.location.hash.replace(/^#\/?/, '');
      const validHashScreen = ['orders', 'rewards', 'profile', 'status', 'checkout', 'menu', 'tapau_ahead'].includes(rawHash);

      if (path && path !== 'index.html') {
        isHandlingSlug = true;
        try {
          const { data } = await supabase
            .from('merchants')
            .select('*')
            .eq('slug', path)
            .maybeSingle();

          if (data) {
            setSelectedMerchantId(data.id);
            setSelectedMerchant(data as any);
            
            const targetScreen = validHashScreen ? (rawHash as Screen) : 'menu';
            
            // Seed history stack: [Home] -> [targetScreen]
            window.history.replaceState({ screen: 'home' }, '', '/');
            window.history.pushState({ screen: targetScreen }, '', `#/${targetScreen}`);
            setCurrentScreen(targetScreen);
            currentScreenRef.current = targetScreen;
          } else {
            // Slug didn't match a merchant, fallback to hash logic
            if (validHashScreen) {
              setCurrentScreen(rawHash as Screen);
              currentScreenRef.current = rawHash as Screen;
            } else {
              setCurrentScreen('home');
              currentScreenRef.current = 'home';
            }
          }
        } catch (err) {
          console.warn('Failed to load merchant from URL slug:', err);
          if (validHashScreen) {
            setCurrentScreen(rawHash as Screen);
            currentScreenRef.current = rawHash as Screen;
          } else {
            setCurrentScreen('home');
            currentScreenRef.current = 'home';
          }
        } finally {
          isHandlingSlug = false;
        }
      } else {
        if (validHashScreen) {
          // Deep link into a subscreen: seed Home root beneath it
          window.history.replaceState({ screen: 'home' }, '', window.location.pathname);
          window.history.pushState({ screen: rawHash }, '', `#/${rawHash}`);
          setCurrentScreen(rawHash as Screen);
          currentScreenRef.current = rawHash as Screen;
        } else {
          setCurrentScreen('home');
          currentScreenRef.current = 'home';
        }
      }
    };

    init();

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [navigate, navigateTo]);

  return (
    <div className="min-h-[100dvh] bg-brand-offwhite text-stone-900 font-sans antialiased pb-[env(safe-area-inset-bottom)]">
      {/* Top Navigation Bar rendered consistently across customer pages */}
      {['home', 'orders', 'rewards', 'profile', 'status', 'tapau_ahead'].includes(currentScreen) && (
        <TopNavBar
          onLogoClick={() => navigateTo('home')}
          onOpenCart={() => setIsCartOpen(true)}
          cartCount={cartCount}
        />
      )}

      {currentScreen === 'home' && (
        <HomeScreen
          onSelectMerchant={(merchant) => {
            setSelectedMerchantId(merchant.id);
            setSelectedMerchant(merchant);
            setIsPreorderMenu(false);
            navigateTo('menu');
          }}
          onOpenCart={() => setIsCartOpen(true)}
        />
      )}

      {currentScreen === 'menu' && (
        <MenuScreen
          merchantId={selectedMerchantId}
          initialMerchant={selectedMerchant}
          onViewCart={() => setIsCartOpen(true)}
          onBack={() => navigateTo('home')}
          preorderOnly={isPreorderMenu}
        />
      )}

      <CartDrawer 
        isOpen={isCartOpen} 
        onClose={() => setIsCartOpen(false)}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          navigateTo('checkout');
        }}
      />

      {currentScreen === 'checkout' && (
        <CheckoutScreen
          onBackToCart={() => {
            navigateTo('menu');
            setIsCartOpen(true);
          }}
          onOrderPlaced={(pin, orderId) => {
            setActivePickupPin(pin);
            setActiveOrderId(orderId);
            navigateTo('orders');
          }}
        />
      )}

      {currentScreen === 'tapau_ahead' && (
        <TapauAheadScreen 
          onNavigateHome={() => navigateTo('home')} 
          onSelectMerchant={() => {
            // Tapau Ahead feature is paused
          }}
        />
      )}

      {currentScreen === 'orders' && (
        <OrdersScreen onNavigateHome={() => navigateTo('home')} />
      )}

      {currentScreen === 'rewards' && (
        <RewardsScreen onNavigateHome={() => navigateTo('home')} />
      )}

      {currentScreen === 'status' && (
        <OrderStatusScreen
          orderId={activeOrder?.display_id || activeOrderId}
          pickupPin={activeOrder?.pickup_pin || activePickupPin}
          status={activeOrder?.order_status}
          onBackHome={() => navigateTo('home')}
        />
      )}

      {currentScreen === 'profile' && <ProfileScreen />}

      {/* Sleek Frosted Glass Island Bottom Navigation (hidden during checkout) */}
      {currentScreen !== 'checkout' && (
        <BottomNavBar
          currentTab={currentScreen}
          onTabChange={(tab) => navigateTo(tab as Screen)}
          onCartClick={() => setIsCartOpen(true)}
          cartCount={cartCount}
          hasActiveOrder={hasActiveOrder}
        />
      )}

      {/* Service Worker SkipWaiting Update Notification */}
      <PWAUpdateToast position="bottom" />

      {/* Contact Number Prompt Modal */}
      <ContactNumberModal
        isOpen={isContactModalOpen}
        user={user}
        onClose={() => setIsContactModalOpen(false)}
        onSuccess={() => setIsContactModalOpen(false)}
        allowDismiss={true}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="*" element={<CustomerAppLayout />} />
    </Routes>
  );
};
