import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useDineInCartStore, CartModifier } from '../stores/useDineInCartStore';
import { MenuItemCard, MenuItem } from '../components/MenuItemCard';
import { CategoryPills } from '../components/CategoryPills';
import { CartIsland } from '../components/CartIsland';
import { ItemModifierModal } from '../components/ItemModifierModal';
import {
  getActiveDineInOrder,
  clearActiveDineInOrder,
  isTerminalStatus,
  ActiveDineInOrder,
} from '../lib/activeOrder';

interface Merchant {
  id: string;
  business_name: string;
  is_open: boolean;
  next_open_at?: string | null;
  slug: string;
  image_url?: string | null;
  cuisine?: string | null;
  rating?: number | null;
}

const DEFAULT_CATEGORIES = ['All', 'Popular', 'Noodles', 'Rice', 'Drinks', 'Snacks'];

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

export function MenuScreen() {
  const { merchantSlug, tableNumber } = useParams<{ merchantSlug: string; tableNumber: string }>();
  const navigate = useNavigate();

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedItemForModal, setSelectedItemForModal] = useState<MenuItem | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveDineInOrder | null>(() =>
    getActiveDineInOrder(merchantSlug, tableNumber)
  );

  const setContext = useDineInCartStore((state) => state.setContext);
  const addItem = useDineInCartStore((state) => state.addItem);
  const cartItems = useDineInCartStore((state) => state.items);
  const totalCount = useDineInCartStore((state) => state.getTotalCount());
  const totalAmount = useDineInCartStore((state) => state.getTotalAmount());

  // Realtime verification of active dine-in order status
  useEffect(() => {
    const currentOrder = getActiveDineInOrder(merchantSlug, tableNumber);
    if (!currentOrder || !currentOrder.txId) {
      setActiveOrder(null);
      return;
    }

    const orderTxId = currentOrder.txId;
    let isSubscribed = true;

    async function checkOrderStatus() {
      try {
        const { data, error: ordErr } = await supabase
          .from('orders')
          .select('order_status, status')
          .or(`transaction_id.eq.${orderTxId},id.eq.${orderTxId},display_id.eq.${orderTxId}`)
          .maybeSingle();

        if (!isSubscribed) return;

        if (ordErr || !data) return;

        const resolvedStatus = (data.order_status || data.status || '').toLowerCase().trim();
        if (isTerminalStatus(resolvedStatus)) {
          clearActiveDineInOrder();
          setActiveOrder(null);
        }
      } catch (e) {
        // ignore network error
      }
    }

    checkOrderStatus();

    const channel = supabase
      .channel(`menu-active-order-${orderTxId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `transaction_id=eq.${orderTxId}`,
        },
        (payload) => {
          const newStatus = (payload.new?.order_status || payload.new?.status || '').toLowerCase().trim();
          if (isTerminalStatus(newStatus)) {
            clearActiveDineInOrder();
            setActiveOrder(null);
          }
        }
      )
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [merchantSlug, tableNumber]);

  useEffect(() => {
    async function loadMenu() {
      try {
        if (!merchantSlug || !tableNumber) throw new Error('Invalid URL parameters');

        // Fetch merchant details
        const { data: merchantData, error: merchantError } = await supabase
          .from('merchants')
          .select('id, business_name, is_open, slug, image_url')
          .eq('slug', merchantSlug)
          .single();

        if (merchantError || !merchantData) {
          throw new Error('Merchant not found');
        }

        // Availability is DERIVED server-side by public.merchant_availability
        // (schedule + operator pause + last-order cutoff).
        const { data: availability } = await supabase
          .from('merchant_availability')
          .select('id, is_currently_open, next_open_at, closes_at')
          .eq('slug', merchantSlug)
          .maybeSingle();

        const derivedOpen = availability
          ? availability.is_currently_open === true
          : merchantData.is_open === true;

        setMerchant({
          ...merchantData,
          is_open: derivedOpen,
          next_open_at: availability?.next_open_at ?? null,
        });
        setContext(merchantData.id, merchantSlug, tableNumber);

        // Fetch menu items and their modifier counts
        if (derivedOpen) {
          const { data: items, error: itemsError } = await supabase
            .from('menu_items')
            .select('id, name, description, price, is_available, stock_quantity, image_url, bestseller, menu_item_modifiers!menu_item_modifiers_item_id_fkey(id)')
            .eq('merchant_id', merchantData.id)
            .eq('is_available', true)
            .order('created_at', { ascending: true });

          if (itemsError) throw itemsError;

          // Map items to MenuItem interface
          const mappedItems: MenuItem[] = (items || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            price: Number(row.price) || 0,
            imageUrl: row.image_url || undefined,
            badges: row.bestseller ? ['Popular'] : undefined,
            is_available: row.is_available !== false,
            stock_quantity: row.stock_quantity ?? 999,
            has_modifiers: Array.isArray(row.menu_item_modifiers) && row.menu_item_modifiers.length > 0,
          }));

          setMenuItems(mappedItems);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load menu');
      } finally {
        setLoading(false);
      }
    }

    loadMenu();

    // Re-check the derived availability every minute (schedule boundaries).
    const interval = setInterval(async () => {
      if (!merchantSlug) return;
      try {
        const { data: availability } = await supabase
          .from('merchant_availability')
          .select('is_currently_open, next_open_at')
          .eq('slug', merchantSlug)
          .maybeSingle();

        if (availability) {
          setMerchant((prev) =>
            prev
              ? {
                  ...prev,
                  is_open: availability.is_currently_open === true,
                  next_open_at: availability.next_open_at ?? null,
                }
              : prev
          );
        }
      } catch (err) {
        console.warn('[DineInMenu] Availability refresh failed:', err);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [merchantSlug, tableNumber, setContext]);

  // Derive active category items
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return menuItems;

    const query = selectedCategory.toLowerCase();
    if (query === 'popular') {
      return menuItems.filter((i) => i.badges?.includes('Popular'));
    }

    return menuItems.filter((item) => {
      const matchName = item.name.toLowerCase().includes(query);
      const matchDesc = item.description.toLowerCase().includes(query);
      return matchName || matchDesc;
    });
  }, [menuItems, selectedCategory]);

  const handleAddFromModal = (
    item: MenuItem,
    modifiers: CartModifier[],
    quantity: number,
    specialInstructions?: string
  ) => {
    const modifiersCost = modifiers.reduce((sum, m) => sum + (Number(m.additional_price) || 0), 0);
    const unitPriceWithModifiers = item.price + modifiersCost;
    const modifierKey = modifiers.map((m) => m.id).sort().join('-');
    const cartItemId = `${item.id}_${modifierKey}_${specialInstructions || ''}`;

    addItem({
      cartItemId,
      id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      selectedModifiers: modifiers,
      unitPriceWithModifiers,
      specialInstructions,
    });
  };

  const handleQuickAdd = (item: MenuItem) => {
    addItem({
      cartItemId: item.id,
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      selectedModifiers: [],
      unitPriceWithModifiers: item.price,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAF9] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-brand-orange rounded-full animate-spin mb-4" />
        <p className="text-sm font-black text-stone-600">Loading Kopitiam Menu...</p>
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="min-h-screen bg-[#F9FAF9] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 text-2xl">
          ⚠️
        </div>
        <h2 className="text-lg font-black text-stone-900 mb-1">Unable to Load Stall</h2>
        <p className="text-xs text-stone-500 mb-4">{error || 'Merchant not found.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-stone-900 text-white text-xs font-black rounded-xl cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="relative pb-32 min-h-screen bg-[#F9FAF9]">
      {/* Hero Header */}
      <div className="relative bg-stone-900 text-white overflow-hidden">
        {/* Cover Photo / Gradient */}
        <div className="relative h-44 sm:h-52 w-full overflow-hidden">
          {merchant.image_url ? (
            <img
              src={merchant.image_url}
              alt={merchant.business_name}
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-950 flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-white/10">storefront</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Top-Right Check Order Pill Button */}
          {activeOrder && (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/${merchantSlug}/${tableNumber}/success?pin=${activeOrder.pickupPin}&tx=${activeOrder.txId}&order_number=${encodeURIComponent(
                    activeOrder.orderNumber
                  )}`
                )
              }
              className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-white/95 hover:bg-white text-stone-900 rounded-full font-black text-xs shadow-lg backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <span className="w-2 h-2 rounded-full bg-brand-orange" />
              <span>Check Order</span>
            </button>
          )}
        </div>

        {/* Header Overlay Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
          {/* Table Service Beacon Chip */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-black uppercase tracking-wider backdrop-blur-md mb-2 shadow-sm">
            <span>🍽️</span>
            <span>Dine-In • Table {tableNumber}</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
            {merchant.business_name}
          </h1>

          <div className="flex items-center gap-3 text-xs text-stone-300 mt-1 font-bold">
            <span className={`flex items-center gap-1 ${merchant.is_open ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`w-2 h-2 rounded-full ${merchant.is_open ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span>{merchant.is_open ? 'Kitchen Open' : 'Kitchen Closed'}</span>
            </span>
            <span>•</span>
            <span className="text-stone-300">Direct Table Service</span>
          </div>
        </div>
      </div>

      {/* Active Order Banner / Check Order Bar */}
      {activeOrder && (
        <div className="max-w-md mx-auto px-4 pt-3">
          <div
            onClick={() =>
              navigate(
                `/${merchantSlug}/${tableNumber}/success?pin=${activeOrder.pickupPin}&tx=${activeOrder.txId}&order_number=${encodeURIComponent(
                  activeOrder.orderNumber
                )}`
              )
            }
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl p-3.5 shadow-md shadow-orange-500/20 flex items-center justify-between cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-orange-100 leading-tight">
                  Active Order Placed
                </div>
                <div className="text-sm font-black flex items-center gap-1.5">
                  <span>{activeOrder.orderNumber}</span>
                  <span className="text-xs text-orange-100 font-bold">• Table {tableNumber}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 px-3 py-1.5 bg-white text-orange-600 font-black text-xs rounded-xl shadow-xs">
              <span>Check Order</span>
              <span className="material-symbols-outlined text-base font-bold">arrow_forward</span>
            </div>
          </div>
        </div>
      )}

      {!merchant.is_open ? (
        <div className="p-6 text-center max-w-md mx-auto mt-6">
          <div className="bg-white border border-stone-200 p-8 rounded-3xl shadow-sm space-y-3">
            <div className="text-3xl">☕</div>
            <h2 className="text-lg font-black text-stone-900">Kitchen Closed Right Now</h2>
            <p className="text-xs text-stone-500 leading-relaxed">
              This stall is currently not accepting orders. Please check back during operating hours.
              {merchant.next_open_at ? ` Opens again at ${formatKuchingClock(merchant.next_open_at)}.` : ''}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Sticky Category Pills */}
          <CategoryPills
            categories={DEFAULT_CATEGORIES}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          {/* Menu Items Grid */}
          <div className="max-w-md mx-auto p-4 space-y-3">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-stone-400 space-y-1">
                <span className="material-symbols-outlined text-4xl text-stone-300">lunch_dining</span>
                <p className="text-xs font-bold">No dishes found in this category.</p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const inCart = cartItems
                  .filter((c) => c.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);

                return (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    inCartCount={inCart}
                    onSelect={(it) => setSelectedItemForModal(it)}
                    onQuickAdd={handleQuickAdd}
                  />
                );
              })
            )}
          </div>
        </>
      )}

      {/* Floating Bottom Cart Island */}
      <CartIsland
        totalCount={totalCount}
        totalAmount={totalAmount}
        tableNumber={tableNumber}
        onClick={() => navigate(`/${merchantSlug}/${tableNumber}/checkout`)}
      />

      {/* Item Modifier Customization Modal */}
      <ItemModifierModal
        isOpen={Boolean(selectedItemForModal)}
        onClose={() => setSelectedItemForModal(null)}
        item={selectedItemForModal}
        onAddToCart={handleAddFromModal}
      />
    </div>
  );
}
