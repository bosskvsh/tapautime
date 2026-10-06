/**
 * Tapau Time - Progressive Web App (PWA) Core Engine
 * Full-featured Food Ordering, Table Ordering, Live Order Tracking & KDS
 */

// ==========================================
// SUPABASE CLOUD REST & REALTIME CLIENT
// ==========================================
const TapauCloud = {
  url: 'https://iaqohdvdebgxtfbxijsw.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcW9oZHZkZWJneHRmYnhpanN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzkyNjIsImV4cCI6MjEwMjY1NTI2Mn0.DFFY_o-wlxonj1mlHsHe3M9_ELGWtTmaqgc1iGr33WE',
  
  storeMap: {},

  getHeaders() {
    return {
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  },

  async placeOrder(orderPayload, lineItems) {
    try {
      const enrichedPayload = {
        ...orderPayload,
        status: orderPayload.status || 'pending',
        merchant_id: orderPayload.merchant_id || orderPayload.store_id || localStorage.getItem('tapau_current_merchant_id') || '',
        items: (lineItems || []).map(c => ({
          name: c.name + (c.variantName ? ` (${c.variantName})` : ''),
          quantity: Math.max(1, Number(c.quantity) || 1),
          price: Number(c.unitPrice !== undefined ? c.unitPrice : (c.price || 0)) || 0,
          variant: c.notes || c.variantName || ''
        }))
      };

      // Execute legacy orders placement & v2 state machine event stream placement concurrently
      this.placeOrderV2(enrichedPayload, lineItems).catch(() => {});
      const res = await fetch(`${this.url}/rest/v1/orders`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(enrichedPayload)
      });
      const data = await res.json();
      if (data && data[0]) {
        const created = data[0];
        if (lineItems && lineItems.length > 0) {
          const itemsPayload = lineItems.map(c => ({
            order_id: created.id,
            item_name: c.name + (c.variantName ? ` (${c.variantName})` : ''),
            quantity: c.quantity,
            price_at_time_of_order: c.unitPrice || c.price || 0,
            special_instructions: c.notes || ''
          }));
          await fetch(`${this.url}/rest/v1/order_items`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(itemsPayload)
          }).catch(() => {});
        }
        if (window.store && typeof window.store.fetchCustomerOrdersFromSupabase === 'function') {
          window.store.fetchCustomerOrdersFromSupabase().catch(() => {});
        }
        return created;
      }
    } catch (e) {
      console.error('[TapauCloud] Order placement error:', e);
    }
    return null;
  },

  async placeOrderV2(orderPayload, lineItems) {
    try {
      // Resolve the real merchant_id — prefer explicit store_id/merchant_id from payload.
      // NEVER fall back to a hardcoded wrong store slug.
      const resolvedMerchantId =
        orderPayload.merchant_id ||
        orderPayload.store_id ||
        localStorage.getItem('tapau_current_merchant_id') ||
        '';

      if (!resolvedMerchantId) {
        console.error('[TapauCloud] placeOrderV2: No merchant_id resolved — order aborted.');
        return null;
      }

      // NOTE: orders_v2 schema only has: display_id, merchant_id, current_status,
      // total_amount, table_number, order_type. Do NOT send customer_name/phone
      // (those columns do not exist and will cause HTTP 400 PGRST204).
      const res = await fetch(`${this.url}/rest/v1/orders_v2`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          display_id: String(orderPayload.display_id || ('#' + Math.floor(Math.random() * 900 + 100))),
          merchant_id: String(resolvedMerchantId),
          current_status: 'PENDING',
          total_amount: Number(orderPayload.total_amount) || 0,
          table_number: String(orderPayload.table_number || ''),
          order_type: orderPayload.order_type === 'dinein' ? 'dinein' : 'tapau'
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[TapauCloud] placeOrderV2 HTTP error:', res.status, errText);
        return null;
      }

      const data = await res.json();
      if (data && data[0]) {
        const created = data[0];
        // Emit genesis event to order_events ledger (includes customer info + line items)
        fetch(`${this.url}/rest/v1/order_events`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            order_id: created.id,
            event_type: 'ORDER_CREATED',
            target_status: 'PENDING',
            actor_role: 'CUSTOMER',
            payload: {
              customer_name: orderPayload.customer_name || '',
              customer_phone: orderPayload.customer_phone || '',
              line_items_count: lineItems ? lineItems.length : 0,
              items: (lineItems || []).map(c => ({
                name: c.name + (c.variantName ? ` (${c.variantName})` : ''),
                quantity: Number(c.quantity) || 1,
                price: Number(c.unitPrice || c.price) || 0,
                station: 'Main Kitchen',
                variant: c.notes || c.variantName || ''
              }))
            }
          })
        }).catch(e => console.warn('[TapauCloud] order_events emit failed:', e));
        return created;
      }
    } catch (e) {
      console.error('[TapauCloud] Order v2 placement error:', e);
    }
    return null;
  },

  async emitOrderEvent(orderId, targetStatus, actorRole = 'MERCHANT', eventType = '') {
    try {
      const res = await fetch(`${this.url}/rest/v1/order_events`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          order_id: orderId,
          event_type: eventType || `MARK_${targetStatus}`,
          target_status: targetStatus,
          actor_role: actorRole,
          payload: { timestamp: new Date().toISOString() }
        })
      });
      return await res.json();
    } catch (e) {
      console.error('[TapauCloud] Event emission error:', e);
    }
    return null;
  },

  async fetchCartItems(sessionId) {
    if (!sessionId) return [];
    try {
      const res = await fetch(`${this.url}/rest/v1/cart_items?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc`, {
        headers: this.getHeaders()
      });
      return await res.json();
    } catch (e) {
      console.warn('[TapauCloud] Fetch cart items failed:', e);
      return [];
    }
  },

  async syncCartItem(item, sessionId) {
    if (!sessionId || !item) return null;
    try {
      const payload = {
        session_id: sessionId,
        item_id: item.cartItemId || item.id,
        merchant_id: item.merchantId || window.store?.selectedMerchantId || 'wok-hey',
        name: item.name,
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit_price: Number(item.unitPrice !== undefined ? item.unitPrice : (item.price || 0)) || 0,
        variant_name: item.variantName || '',
        spice_level: item.spiceLevel || '',
        notes: item.notes || '',
        add_ons: item.addOns || [],
        updated_at: new Date().toISOString()
      };
      const res = await fetch(`${this.url}/rest/v1/cart_items`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      console.warn('[TapauCloud] Sync cart item failed:', e);
      return null;
    }
  },

  async deleteCartItem(cartItemId, sessionId) {
    if (!sessionId || !cartItemId) return;
    try {
      await fetch(`${this.url}/rest/v1/cart_items?session_id=eq.${encodeURIComponent(sessionId)}&item_id=eq.${encodeURIComponent(cartItemId)}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.warn('[TapauCloud] Delete cart item failed:', e);
    }
  },

  async clearCartItems(sessionId) {
    if (!sessionId) return;
    try {
      await fetch(`${this.url}/rest/v1/cart_items?session_id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
    } catch (e) {
      console.warn('[TapauCloud] Clear cart items failed:', e);
    }
  }
};

let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient && typeof supabase !== 'undefined' && supabase.createClient) {
    try {
      supabaseClient = supabase.createClient(TapauCloud.url, TapauCloud.anonKey, {
        auth: { detectSessionInUrl: true, flowType: 'pkce', persistSession: true }
      });
    } catch (e) {
      console.warn('Supabase client error', e);
    }
  }
  return supabaseClient;
}
getSupabase();

// ==========================================
// 1. DATA STORE (Merchants & Menu Database)
// ==========================================
const APP_DATA = {
  merchants: []
};

// ==========================================
// 2. STATE MANAGER & PERSISTENCE
// ==========================================
class Store {
  constructor() {
    // Clear legacy shared merchant order key if present so customer starts with 0 orders
    try {
      if (localStorage.getItem('tapau_orders')) {
        localStorage.removeItem('tapau_orders');
      }
    } catch(e) {}

    this.cart = this.load('tapau_cart') || [];
    this.cartSessionId = this.load('tapau_cart_session_id');
    if (!this.cartSessionId) {
      this.cartSessionId = 'sess_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
      this.save('tapau_cart_session_id', this.cartSessionId);
    }
    this.orderType = 'tapau'; // 100% Takeaway only
    this.tableNumber = '';
    this.selectedMerchantId = this.load('tapau_merchant') || null;
    this.favorites = this.load('tapau_favorites') || [];
    this.activeOrders = this.load('tapau_customer_orders') || [];
    this.promoCode = null;
    this.promoDiscount = 0;
    this.currentView = this.load('tapau_current_view') || 'discover'; // 'tapau', 'discover', 'menu', 'orders', 'kds', 'profile', 'rewards'
    this.purgeLegacyCookies();
    this.sanitizeContaminatedStorage();

    // Hydrate remote cart and listen for cross-device realtime mutations
    setTimeout(() => {
      this.fetchCartFromSupabase().catch(() => {});
      this.initCartRealtimeSync();
    }, 150);

    // Real-time synchronization channel with Merchant Portal
    if ('BroadcastChannel' in window) {
      try {
        this.syncChannel = new BroadcastChannel('tapau_time_sync');
        this.syncChannel.onmessage = (e) => {
          if (e.data) {
            if (e.data.type === 'ORDER_STATUS_CHANGED') {
              const targetId = String(e.data.orderId || '').replace('#', '').trim();
              const newStatus = String(e.data.status || 'received').toLowerCase();
              const ord = this.activeOrders.find(o => 
                (o.dbId && String(o.dbId) === targetId) ||
                String(o.orderId || '').replace('#', '').trim() === targetId
              );
              if (ord) {
                ord.status = newStatus;
                this.save('tapau_customer_orders', this.activeOrders);
                if (window.UI) {
                  if (typeof UI.renderOrders === 'function') UI.renderOrders();
                  if (typeof UI.renderKDS === 'function') UI.renderKDS();
                  if (ord.status === 'ready') {
                    AudioEngine.playReadyChime();
                    Haptic.pattern([100, 50, 100, 50, 200]);
                  }
                }
              } else {
                this.fetchCustomerOrdersFromSupabase().catch(() => {});
              }
            } else if (e.data.type === 'NEW_ORDER_SYNC' || e.data.type === 'NEW_ORDER') {
              const incomingOrder = e.data.order;
              if (incomingOrder) {
                const incomingId = String(incomingOrder.orderId || '').replace('#', '').trim();
                const exists = this.activeOrders.some(o => 
                  String(o.orderId || '').replace('#', '').trim() === incomingId ||
                  (incomingOrder.dbId && o.dbId === incomingOrder.dbId)
                );
                if (!exists) {
                  this.activeOrders.unshift(incomingOrder);
                  this.save('tapau_customer_orders', this.activeOrders);
                  if (window.UI) {
                    if (typeof UI.renderOrders === 'function') UI.renderOrders();
                    if (typeof UI.renderProfile === 'function') UI.renderProfile();
                    if (typeof UI.updateOrdersNavBadge === 'function') UI.updateOrdersNavBadge();
                  }
                }
              }
            } else if (e.data.type === 'STORE_CUSTOMIZATION_UPDATED' || e.data.type === 'INVENTORY_UPDATED' || e.data.type === 'CROSS_DOMAIN_SYNC') {
              const targetId = e.data.merchantId || (e.data.key && e.data.key.startsWith('tapau_store_customization_') ? e.data.key.replace('tapau_store_customization_', '') : null);
              if (!targetId) return;
              const menuData = e.data.menu || (Array.isArray(e.data.value) ? e.data.value : null);
              if (menuData && Array.isArray(menuData)) {
                this.save('tapau_merchant_menu_' + targetId, menuData);
              }
              let custom = e.data.customization;
              if (!custom && e.data.value && typeof e.data.value === 'object' && !Array.isArray(e.data.value)) {
                custom = e.data.value;
              }
              if (custom) {
                custom.merchantId = targetId;
                this.save('tapau_store_customization_' + targetId, custom);
              }
              if (window.UI) {
                if (typeof UI.renderDiscover === 'function') UI.renderDiscover();
                if (typeof UI.renderTapauView === 'function') UI.renderTapauView();
                if (targetId === store.selectedMerchantId) {
                  if (custom && typeof UI.applyCustomization === 'function') UI.applyCustomization(custom);
                  if (typeof UI.renderMenu === 'function') UI.renderMenu();
                }
              }
            }
          }
        };
      } catch(err) {}
    }

    // Defensive Cross-Tab Storage Sync (Foolproof Architecture Directive #3 & #4)
    window.addEventListener('storage', (e) => {
      if (!e.key) return;

      // Sync customer orders, favorites, and profile changes across windows / desktop & app views
      if (e.key === 'tapau_customer_orders' || e.key === 'tapau_favorites' || e.key === 'tapau_user_profile') {
        this.activeOrders = this.load('tapau_customer_orders') || [];
        this.favorites = this.load('tapau_favorites') || [];
        if (window.UI) {
          if (typeof UI.renderOrders === 'function' && store.currentView === 'orders') UI.renderOrders();
          if (typeof UI.renderProfile === 'function') UI.renderProfile();
          if (typeof UI.updateOrdersNavBadge === 'function') UI.updateOrdersNavBadge();
        }
      }

      if (e.key.startsWith('tapau_store_customization') || e.key.startsWith('tapau_merchant_menu')) {
        if (window.UI) {
          if (typeof UI.renderDiscover === 'function') UI.renderDiscover();
          if (typeof UI.renderTapauView === 'function') UI.renderTapauView();
          const currentM = store.getMerchant();
          if (currentM && currentM.customization && typeof UI.applyCustomization === 'function') {
            UI.applyCustomization(currentM.customization);
          }
          if (typeof UI.renderMenu === 'function') UI.renderMenu();
        }
      }
    });

    this.initRealtimeSubscriptions();
  }

  normalizeCustomization(d) {
    if (!d) return null;
    const mId = d.merchant_id || d.merchantId || '';
    const sanitize = (url) => {
      if (!url || typeof url !== 'string') return '';
      if (url.includes('fbcdn.net') || url.includes('cdninstagram.com')) return './icons/tapau-logo.png';
      return url;
    };
    return {
      merchantId: mId,
      storeName: d.store_name || d.storeName || 'Merchant Store',
      tagline: d.tagline || '',
      isOpen: d.is_open !== undefined ? d.is_open : (d.isOpen !== undefined ? d.isOpen : true),
      theme: d.theme || d.atmosphere || 'kopitiam-marble',
      atmosphere: d.atmosphere || d.theme || 'kopitiam-marble',
      waitingAnimation: d.waiting_animation || d.waitingAnimation || 'dripping-coffee',
      readyAlert: d.ready_alert || d.readyAlert || 'kopitiam-bell',
      buttonStyle: d.button_style || d.buttonStyle || 'pill',
      menuLayout: d.menu_layout || d.menuLayout || 'grid',
      bestsellersFirst: d.bestsellers_first !== undefined ? d.bestsellers_first : (d.bestsellersFirst !== false),
      logoUrl: sanitize(d.logo_url || d.logoUrl || ''),
      coverUrl: sanitize(d.cover_url || d.coverUrl || ''),
      shoutout: d.shoutout || '',
      promoCode: d.promo_code || d.promoCode || '',
      promoMessage: d.promo_message || d.promoMessage || '',
      promoType: d.promo_type || d.promoType || 'percent',
      promoValue: Number(d.promo_value || d.promoValue || 0),
      promoEnabled: d.promo_enabled !== undefined ? d.promo_enabled : !!d.promoEnabled
    };
  }

  parseMenuData(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return null;
  }

  initRealtimeSubscriptions() {
    const sb = getSupabase();
    if (sb && !this.realtimeSubscribed) {
      try {
        this.realtimeSubscribed = true;
        sb.channel('public_store_customization_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'store_customization' }, (payload) => {
            console.log('🔥 [Realtime Change Received]:', payload);
            if (payload && payload.new) {
              const d = payload.new;
              const custom = this.normalizeCustomization(d);
              this.save('tapau_store_customization_' + d.merchant_id, custom);

              // Register dynamic merchant into APP_DATA.merchants so it renders on Discover screen
              const existingM = APP_DATA.merchants.find(m => m.id === d.merchant_id);
              if (!existingM) {
                APP_DATA.merchants.push({
                  id: d.merchant_id,
                  name: custom.storeName || 'Merchant Store',
                  tagline: custom.tagline || '',
                  isOpen: custom.isOpen,
                  image: custom.logoUrl || './icons/tapau-logo.png',
                  cover: custom.coverUrl || '',
                  rating: 4.9,
                  reviewsCount: 1,
                  prepTime: '10-15 mins',
                  distance: '50m away',
                  tags: ['Halal-Friendly', 'Local'],
                  customization: custom
                });
              } else {
                existingM.name = custom.storeName || existingM.name;
                existingM.tagline = custom.tagline || existingM.tagline;
                existingM.isOpen = custom.isOpen;
                existingM.customization = custom;
              }

              // Live Sync Menu from Supabase Realtime payload!
              const parsedMenu = this.parseMenuData(d.menu_data);
              if (parsedMenu && parsedMenu.length > 0) {
                this.save('tapau_merchant_menu_' + d.merchant_id, parsedMenu);
              } else {
                this.fetchMenuSync(d.merchant_id);
              }
              if (typeof UI !== 'undefined') {
                if (typeof UI.renderDiscover === 'function') UI.renderDiscover();
                if (typeof UI.renderTapauView === 'function') UI.renderTapauView();
                if (d.merchant_id === this.selectedMerchantId) {
                  if (typeof UI.applyCustomization === 'function') UI.applyCustomization(custom);
                  if (typeof UI.renderMenu === 'function') UI.renderMenu();
                }
              }
            }
          })
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('[TapauTime Realtime] public_store_customization_changes: SUBSCRIBED ✅');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn('[TapauTime Realtime] store_customization connection notice:', status, err);
            }
          });

        sb.channel('public_merchants_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, () => {
            this.fetchServerSync().then(() => {
              if (typeof UI !== 'undefined' && typeof UI.renderTapauView === 'function') {
                UI.renderTapauView();
              }
            }).catch(() => {});
          })
          .subscribe();

        sb.channel('customer_live_order_status_feed')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            if (payload && payload.new) this.handleRealtimeOrderStatusUpdate(payload.new);
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders_v2' }, (payload) => {
            if (payload && payload.new) this.handleRealtimeOrderStatusUpdate(payload.new);
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
            this.fetchCustomerOrdersFromSupabase().catch(() => {});
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders_v2' }, () => {
            this.fetchCustomerOrdersFromSupabase().catch(() => {});
          })
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('[TapauTime Realtime] customer_live_order_status_feed: SUBSCRIBED ✅');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn('[TapauTime Realtime] customer_live_order_status_feed connection lost:', status, err);
              this.realtimeSubscribed = false;
            }
          });
      } catch (e) {
        this.realtimeSubscribed = false;
      }
    }

    this.fetchServerSync();
    if (!this.backgroundSyncInterval) {
      // Periodic background poll to catch any WebSocket reconnect gaps.
      // Only sync active merchant in background and respect document visibility.
      this.backgroundSyncInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        const activeMerchant = this.selectedMerchantId || localStorage.getItem('tapau_current_merchant_id');
        if (activeMerchant) {
          this.syncSingleMerchant(activeMerchant).catch(() => {});
        }

        // Auto-poll customer orders only if uncompleted orders exist
        const hasUncompleted = (this.activeOrders || []).some(o => o.status !== 'completed' && o.status !== 'cancelled');
        if (hasUncompleted) {
          this.fetchCustomerOrdersFromSupabase().catch(() => {});
        }
      }, 20000);
    }
  }

  save(key, val) {
    try {
      const jsonStr = JSON.stringify(val);
      localStorage.setItem(key, jsonStr);

      // Clear legacy large cookies to prevent HTTP 400 Header Overflow
      try {
        const isProd = window.location.hostname.includes('tapautime.my');
        const domainPart = isProd ? '; domain=.tapautime.my' : '';
        document.cookie = `${key}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainPart}`;
        document.cookie = `${key}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      } catch (e) {}
    } catch (e) {
      console.warn('Storage save failed', e);
    }
  }

  purgeLegacyCookies() {
    try {
      const isProd = window.location.hostname.includes('tapautime.my');
      const domainPart = isProd ? '; domain=.tapautime.my' : '';
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        if (name.startsWith('tapau_')) {
          document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainPart}`;
          document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      }
    } catch (e) {}
  }

  sanitizeContaminatedStorage() {
    try {
      const mockMerchantIds = ['wok-hey', 'satay-street', 'chicken-rice', 'kopi-co', 'hawker-hub-demo', 'the-hawker-hub'];
      mockMerchantIds.forEach(id => {
        localStorage.removeItem('tapau_store_customization_' + id);
        localStorage.removeItem('tapau_merchant_menu_' + id);
      });
      localStorage.removeItem('tapau_merchants');
      localStorage.removeItem('tapau_merchant_list');
      localStorage.removeItem('tapau_merchant_history');
      localStorage.removeItem('tapau_orders');

      const keysToClean = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('tapau_store_customization_')) {
          const val = localStorage.getItem(k);
          if (val) {
            try {
              const parsed = JSON.parse(val);
              const merchantIdFromKey = k.replace('tapau_store_customization_', '');
              if (!parsed.merchantId || parsed.merchantId !== merchantIdFromKey) {
                keysToClean.push(k);
              }
            } catch(e) {}
          }
        }
      }
      keysToClean.forEach(k => localStorage.removeItem(k));
    } catch(e) {}
  }

  load(key) {
    try {
      // 1. Try LocalStorage
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch (e) {
      return null;
    }
    return null;
  }

  async fetchServerSync(targetMerchantId = null) {
    if (targetMerchantId) {
      await this.syncSingleMerchant(targetMerchantId);
      return;
    }
    // Auto-discover all dynamic merchants registered in Supabase
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: allStores } = await sb.from('store_customization').select('*');
        if (allStores && Array.isArray(allStores)) {
          allStores.forEach(d => {
            if (d && d.merchant_id && d.store_name) {
              const custom = this.normalizeCustomization(d);
              TapauCloud.storeMap[d.merchant_id] = d.merchant_id;
              this.save('tapau_store_customization_' + d.merchant_id, custom);
              const parsedMenu = this.parseMenuData(d.menu_data);
              if (parsedMenu) {
                this.save('tapau_merchant_menu_' + d.merchant_id, parsedMenu);
              }
              const existingM = APP_DATA.merchants.find(m => m.id === d.merchant_id);
              if (!existingM) {
                APP_DATA.merchants.push({
                  id: d.merchant_id,
                  name: d.store_name,
                  tagline: d.tagline || '',
                  isOpen: d.is_open !== undefined ? d.is_open : true,
                  image: d.logo_url || './icons/tapau-logo.png',
                  cover: d.cover_url || '',
                  rating: 4.9,
                  reviewsCount: 1,
                  prepTime: '10-15 mins',
                  distance: '50m away',
                  tags: ['Halal-Friendly', 'Local'],
                  customization: custom
                });
              } else {
                existingM.name = d.store_name || existingM.name;
                existingM.tagline = d.tagline || existingM.tagline;
                existingM.isOpen = d.is_open !== undefined ? d.is_open : existingM.isOpen;
                existingM.customization = custom;
              }
            }
          });
        }

        // ponytail: also discover real stores from public.merchants table
        const { data: realMerchants } = await sb.from('merchants').select('*');
        if (realMerchants && Array.isArray(realMerchants)) {
          realMerchants.forEach(m => {
            if (m && m.id && m.business_name) {
              const existingM = APP_DATA.merchants.find(x => x.id === m.id);
              const address = m.location && m.location.address ? m.location.address : '';
              if (!existingM) {
                APP_DATA.merchants.push({
                  id: m.id,
                  name: m.business_name,
                  tagline: address || 'Local Delights',
                  isOpen: m.is_open !== undefined ? m.is_open : true,
                  image: './icons/tapau-logo.png',
                  cover: '',
                  rating: 4.9,
                  reviewsCount: 1,
                  prepTime: (m.current_prep_delay || m.order_buffer_time || 10) + ' mins',
                  distance: '50m away',
                  tags: ['Halal-Friendly', 'Local']
                });
              } else {
                existingM.name = m.business_name || existingM.name;
                existingM.isOpen = m.is_open !== undefined ? m.is_open : existingM.isOpen;
                if (address && !existingM.tagline) existingM.tagline = address;
              }
            }
          });
        }
          if (typeof UI !== 'undefined') {
            if ((!this.selectedMerchantId || this.selectedMerchantId === 'm1') && APP_DATA.merchants.length > 0) {
              const latestM = APP_DATA.merchants.find(m => m.id.startsWith('merchant-')) || APP_DATA.merchants[0];
              if (latestM && latestM.id) {
                this.selectedMerchantId = latestM.id;
                this.save('tapau_merchant', latestM.id);
              }
            }
            if (typeof UI.renderDiscover === 'function') UI.renderDiscover();
            if (typeof UI.renderTapauView === 'function') UI.renderTapauView();
            if (typeof UI.renderMenu === 'function') UI.renderMenu();
          }
      } catch (e) {
        console.warn('[Store] Auto-discovery query notice:', e);
      }
    }

    // Fetch customer orders concurrently so orders load immediately without waiting for merchant sync
    const orderPromise = this.fetchCustomerOrdersFromSupabase();

    const curMId = localStorage.getItem('tapau_current_merchant_id') || this.selectedMerchantId;
    const knownIds = APP_DATA.merchants.map(m => m.id);
    const combined = Array.from(new Set([curMId, ...knownIds].filter(Boolean)));
    for (const merchantId of combined) {
      await this.syncSingleMerchant(merchantId);
    }
    await orderPromise;
  }

  async fetchCustomerOrdersFromSupabase(force = false) {
    const now = Date.now();
    if (this._fetchingOrders || (!force && this._lastCustomerOrderFetch && (now - this._lastCustomerOrderFetch < 3000))) {
      return;
    }
    this._fetchingOrders = true;
    this._lastCustomerOrderFetch = now;
    try {
      let profileJson = localStorage.getItem('tapau_user_profile');
      let profile = null;
      try {
        profile = profileJson ? JSON.parse(profileJson) : null;
      } catch (e) {}

      // Auto-restore profile with authentic user credentials from Supabase token if missing
      if (!profile || !profile.email) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.includes('auth-token') || k.includes('supabase'))) {
              const val = localStorage.getItem(k);
              if (val && val.startsWith('{')) {
                try {
                  const parsed = JSON.parse(val);
                  const u = parsed?.user || parsed?.currentSession?.user;
                  if (u && u.email) {
                    const realName = u.user_metadata?.full_name || u.user_metadata?.name || u.email.split('@')[0];
                    const realEmail = u.email;
                    profile = { name: realName, email: realEmail, id: u.id };
                    localStorage.setItem('tapau_user_profile', JSON.stringify(profile));
                    break;
                  }
                } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }

      const userEmail = profile && profile.email ? profile.email.trim().toLowerCase() : '';
      const userId = profile && (profile.id || profile.userId) ? String(profile.id || profile.userId).trim() : '';

      // Fetch recent orders joining order_events so customer identity (email/phone) and line items
      // are captured for v2 state machine orders as well as legacy orders.
      const resV2 = await fetch(`${TapauCloud.url}/rest/v1/orders_v2?select=*,order_events(payload,event_type)&order=created_at.desc&limit=50`, {
        headers: TapauCloud.getHeaders()
      });
      let v2Data = [];
      if (resV2.ok) {
        const parsed = await resV2.json();
        v2Data = Array.isArray(parsed) ? parsed : [];
      }

      const resLegacy = await fetch(`${TapauCloud.url}/rest/v1/orders?select=*,order_items(*)&order=created_at.desc&limit=50`, {
        headers: TapauCloud.getHeaders()
      });
      let legacyData = [];
      if (resLegacy.ok) {
        const parsed = await resLegacy.json();
        legacyData = Array.isArray(parsed) ? parsed : [];
      }

      const orderMap = new Map();

      // Process legacyData first as it contains order_items
      for (const ord of legacyData) {
        const orderNumber = String(ord.display_id || ord.id || '').replace('#', '').trim();
        if (!orderNumber) continue;

        const rawStatus = (ord.current_status || ord.status || ord.order_status || 'received').toLowerCase();
        const normalizedStatus = (rawStatus === 'pending' || rawStatus === 'received') ? 'received' : rawStatus;
        const merchantId = ord.store_id || ord.merchant_id || '';

        let resolvedMerchantName = 'Tapau Merchant';
        if (typeof this.getMerchant === 'function') {
          const m = this.getMerchant(merchantId);
          if (m && m.name) resolvedMerchantName = m.name;
        } else if (typeof APP_DATA !== 'undefined' && APP_DATA.merchants) {
          const foundM = APP_DATA.merchants.find(m => m.id === merchantId);
          if (foundM && foundM.name) resolvedMerchantName = foundM.name;
        }

        const items = (ord.order_items && Array.isArray(ord.order_items) && ord.order_items.length > 0)
          ? ord.order_items.map(i => ({
              name: i.item_name || i.name || 'Item',
              quantity: Number(i.quantity) || 1,
              price: Number(i.price_at_time_of_order || i.price) || 0,
              addOns: i.special_instructions ? [i.special_instructions] : []
            }))
          : [];

        orderMap.set(orderNumber, {
          orderId: orderNumber,
          dbId: ord.id,
          customerId: ord.customer_id || '',
          merchantId,
          merchantName: resolvedMerchantName,
          customerPhone: ord.customer_phone || '',
          orderType: ord.order_type || 'tapau',
          tableNumber: ord.table_number || '',
          status: normalizedStatus,
          createdAt: ord.created_at ? new Date(ord.created_at).getTime() : Date.now(),
          estimatedPrepMins: 12,
          paymentMethod: ord.payment_method || 'eWallet',
          items,
          total: Number(ord.total_amount) || 0,
          subtotal: Number(ord.total_amount) || 0
        });
      }

      // Process v2Data: merge status, customer identity from order_events, or insert if not present
      for (const ord of v2Data) {
        const orderNumber = String(ord.display_id || ord.id || '').replace('#', '').trim();
        if (!orderNumber) continue;

        const rawStatus = (ord.current_status || ord.status || ord.order_status || 'received').toLowerCase();
        const normalizedStatus = (rawStatus === 'pending' || rawStatus === 'received') ? 'received' : rawStatus;
        const merchantId = ord.store_id || ord.merchant_id || '';

        let resolvedMerchantName = 'Tapau Merchant';
        if (typeof this.getMerchant === 'function') {
          const m = this.getMerchant(merchantId);
          if (m && m.name) resolvedMerchantName = m.name;
        } else if (typeof APP_DATA !== 'undefined' && APP_DATA.merchants) {
          const foundM = APP_DATA.merchants.find(m => m.id === merchantId);
          if (foundM && foundM.name) resolvedMerchantName = foundM.name;
        }

        const createdEvt = (ord.order_events && Array.isArray(ord.order_events))
          ? ord.order_events.find(e => e.event_type === 'ORDER_CREATED')
          : null;
        const v2Phone = (createdEvt?.payload?.customer_phone || ord.customer_phone || '').trim();
        const v2Items = (createdEvt?.payload?.items && Array.isArray(createdEvt.payload.items))
          ? createdEvt.payload.items.map(i => ({
              name: i.name || 'Item',
              quantity: Number(i.quantity) || 1,
              price: Number(i.price) || 0,
              addOns: i.variant ? [i.variant] : []
            }))
          : [];

        if (orderMap.has(orderNumber)) {
          const existing = orderMap.get(orderNumber);
          existing.status = normalizedStatus || existing.status;
          if (ord.total_amount) existing.total = Number(ord.total_amount) || existing.total;
          if (!existing.customerPhone && v2Phone) existing.customerPhone = v2Phone;
          if (ord.customer_id && !existing.customerId) existing.customerId = ord.customer_id;
          if ((!existing.items || existing.items.length === 0) && v2Items.length > 0) existing.items = v2Items;
        } else {
          orderMap.set(orderNumber, {
            orderId: orderNumber,
            dbId: ord.id,
            customerId: ord.customer_id || '',
            merchantId,
            merchantName: resolvedMerchantName,
            customerPhone: v2Phone,
            orderType: ord.order_type || 'tapau',
            tableNumber: ord.table_number || '',
            status: normalizedStatus,
            createdAt: ord.created_at ? new Date(ord.created_at).getTime() : Date.now(),
            estimatedPrepMins: 12,
            paymentMethod: ord.payment_method || 'eWallet',
            items: v2Items,
            total: Number(ord.total_amount) || 0,
            subtotal: Number(ord.total_amount) || 0
          });
        }
      }

      const cloudOrders = Array.from(orderMap.values());

      // Intelligently merge cloud orders with existing local active orders without wiping un-synced recent orders
      const existingLocalOrders = this.activeOrders || this.load('tapau_customer_orders') || [];
      const mergedOrders = [...existingLocalOrders];
      // Build a set of local order IDs so we only absorb cloud orders that
      // belong to this session/device — matched by display_id or dbId.
      const localOrderIds = new Set(
        existingLocalOrders.map(o => String(o.orderId || '').replace('#', '').trim()).filter(Boolean)
      );
      const localDbIds = new Set(
        existingLocalOrders.map(o => o.dbId).filter(Boolean)
      );

      for (const cloudOrd of cloudOrders) {
        // Only show this cloud order if it matches a locally-known order,
        // OR it belongs to the logged-in user's email/phone/customerId.
        const matchesLocal = localOrderIds.has(cloudOrd.orderId) ||
          (cloudOrd.dbId && localDbIds.has(cloudOrd.dbId));
        const ordPhone = (cloudOrd.customerPhone || '').trim().toLowerCase();
        const matchesUser = Boolean(
          (userEmail && ordPhone && (ordPhone === userEmail || ordPhone.includes(userEmail) || userEmail.includes(ordPhone))) ||
          (userId && cloudOrd.customerId && String(cloudOrd.customerId).trim() === userId)
        );

        if (!matchesLocal && !matchesUser) continue;

        const existingIdx = mergedOrders.findIndex(o =>
          String(o.orderId || '').replace('#', '').trim() === cloudOrd.orderId ||
          (cloudOrd.dbId && o.dbId && o.dbId === cloudOrd.dbId)
        );

        if (existingIdx >= 0) {
          const existing = mergedOrders[existingIdx];
          // Cloud wins for authoritative fields (orderId, dbId, status).
          // Local wins for rich fields only available client-side (items, merchantName).
          mergedOrders[existingIdx] = {
            ...existing,
            ...cloudOrd,
            orderId: cloudOrd.orderId || existing.orderId,
            dbId: cloudOrd.dbId || existing.dbId,
            status: cloudOrd.status || existing.status,
            items: (existing.items && Array.isArray(existing.items) && existing.items.length > 0) ? existing.items : (cloudOrd.items || []),
            total: (typeof cloudOrd.total === 'number' && cloudOrd.total > 0) ? cloudOrd.total : (existing.total || 0),
            merchantName: (existing.merchantName && existing.merchantName !== 'Guest Customer' && existing.merchantName !== 'Tapau Merchant')
              ? existing.merchantName
              : cloudOrd.merchantName
          };
        } else {
          mergedOrders.push(cloudOrd);
        }
      }

      // Sort by createdAt descending
      mergedOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      this.activeOrders = mergedOrders;
      this.save('tapau_customer_orders', this.activeOrders);

      if (typeof UI !== 'undefined') {
        if (typeof UI.renderOrders === 'function' && store.currentView === 'orders') UI.renderOrders();
        const profileCount = document.getElementById('profile-orders-count');
        if (profileCount) profileCount.textContent = this.activeOrders.length;
        if (typeof UI.updateOrdersNavBadge === 'function') UI.updateOrdersNavBadge();
      }
    } catch(e) {
      console.warn('[TapauCloud] Fetch customer orders notice:', e);
    } finally {
      this._fetchingOrders = false;
    }
  }

  handleRealtimeOrderStatusUpdate(updated) {
    if (!updated) return;
    const targetId = String(updated.display_id || updated.id || '').replace('#', '').trim();
    const rawStatus = String(updated.current_status || updated.status || updated.order_status || 'received').toLowerCase();
    const normalizedStatus = (rawStatus === 'pending' || rawStatus === 'received') ? 'received' : rawStatus;

    const ord = this.activeOrders.find(o => 
      (updated.id && o.dbId === updated.id) ||
      (targetId && String(o.orderId || '').replace('#', '').trim() === targetId)
    );

    if (ord) {
      ord.status = normalizedStatus;
      if (updated.id && !ord.dbId) ord.dbId = updated.id;
      this.save('tapau_customer_orders', this.activeOrders);
      this.save('tapau_orders', this.activeOrders);
      if (window.UI) {
        if (typeof UI.renderOrders === 'function') UI.renderOrders();
        if (typeof UI.renderKDS === 'function') UI.renderKDS();
        if (typeof UI.updateOrdersNavBadge === 'function') UI.updateOrdersNavBadge();
        if (normalizedStatus === 'ready') {
          AudioEngine.playReadyChime();
          Haptic.pattern([100, 50, 100, 50, 200]);
        }
      }
    } else {
      this.fetchCustomerOrdersFromSupabase().catch(() => {});
    }
  }

  async syncSingleMerchant(merchantId) {
    try {
      let custom = null;
      let menuData = null;

      // 1. Try Supabase Cloud Database first
      const sb = getSupabase();
      if (sb) {
        if (!this.realtimeSubscribed) {
          this.initRealtimeSubscriptions();
        }
        const { data } = await sb
          .from('store_customization')
          .select('*')
          .eq('merchant_id', merchantId)
          .maybeSingle();

        if (data && data.store_name) {
          custom = this.normalizeCustomization(data);
          const parsedMenu = this.parseMenuData(data.menu_data);
          if (parsedMenu && parsedMenu.length > 0) {
            menuData = parsedMenu;
          } else {
            this.fetchMenuSync(merchantId);
          }
        }
      }

      // 2. Fallback to PHP sync if Supabase did not yield customized store data
      if (!custom) {
        const isProd = window.location.hostname.includes('tapautime.my');
        const apiPath = isProd ? 'https://tapautime.my/api.php' : './api.php';
        const res = await fetch(`${apiPath}?action=get_customization&merchant=${merchantId}`).catch(() => null);
        if (res && res.ok) {
          const phpCustom = await res.json().catch(() => null);
          if (phpCustom && phpCustom.storeName) {
            custom = this.normalizeCustomization(phpCustom);
          }
        }
      }

      if (custom) {
        const key = 'tapau_store_customization_' + merchantId;
        const menuKey = 'tapau_merchant_menu_' + merchantId;
        const prevCustomStr = localStorage.getItem(key);
        const prevMenuStr = localStorage.getItem(menuKey);
        const newCustomStr = JSON.stringify(custom);
        const newMenuStr = menuData ? JSON.stringify(menuData) : null;

        this.save(key, custom);
        if (menuData) {
          this.save(menuKey, menuData);
        }

        const hasChanged = (prevCustomStr !== newCustomStr) || (newMenuStr !== null && prevMenuStr !== newMenuStr);

        // Always trigger DOM re-renders for active merchant or when data changes
        if (typeof UI !== 'undefined') {
          const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
          const isUserEditing = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
          if (!isUserEditing) {
            if (merchantId === this.selectedMerchantId) {
              if (typeof UI.applyCustomization === 'function') UI.applyCustomization(custom);
              if (typeof UI.renderMenu === 'function') UI.renderMenu();
            }
            if (hasChanged) {
              if (typeof UI.renderDiscover === 'function') UI.renderDiscover();
              if (typeof UI.renderTapauView === 'function') UI.renderTapauView();
            }
          }
        }
      }
    } catch (e) {}
  }

  async fetchMenuSync(merchantId) {
    try {
      const isProd = window.location.hostname.includes('tapautime.my');
      const apiPath = isProd ? 'https://tapautime.my/api.php' : './api.php';
      const resM = await fetch(`${apiPath}?action=get_menu&merchant=${merchantId}`);
      if (resM.ok) {
        const menu = await resM.json();
        const parsedMenu = this.parseMenuData(menu);
        if (parsedMenu) {
          this.save('tapau_merchant_menu_' + merchantId, parsedMenu);
          if (typeof UI !== 'undefined' && typeof UI.renderMenu === 'function') {
            UI.renderMenu();
          }
        }
      }
    } catch (e) {
      console.warn('[Store] Menu sync warning', e);
    }
  }

  setMerchant(merchantId) {
    this.selectedMerchantId = merchantId;
    this.save('tapau_merchant', merchantId);
    this.fetchServerSync(merchantId);
  }

  getMerchant(merchantId = this.selectedMerchantId) {
    let defaultM = APP_DATA.merchants.find(m => m.id === merchantId);
    if (!defaultM) {
      defaultM = {
        id: merchantId,
        name: 'Merchant Store',
        tagline: 'Freshly prepared meals',
        tags: ['Hawker', 'Local'],
        rating: 5.0,
        reviewsCount: 1,
        prepTime: '10-15 mins',
        distance: '100m away',
        priceRange: '$$',
        isOpen: true,
        image: './icons/tapau-logo.png',
        cover: '',
        categories: [],
        menu: []
      };
    }

    let custom = this.load('tapau_store_customization_' + defaultM.id) || this.load('tapau_store_customization');
    if (custom && custom.merchantId && custom.merchantId !== defaultM.id && defaultM.id.startsWith('merchant-')) {
      custom = null;
    }

    let customMenu = this.load('tapau_merchant_menu_' + defaultM.id);

    const merged = { ...defaultM };
    if (custom) {
      if (custom.storeName !== undefined && custom.storeName !== null && custom.storeName.trim() !== '') {
        merged.name = custom.storeName;
      }
      if (custom.tagline !== undefined && custom.tagline !== null) {
        merged.tagline = custom.tagline;
      }
      if (custom.logoUrl !== undefined && custom.logoUrl !== null && custom.logoUrl.trim() !== '') {
        merged.image = custom.logoUrl;
      }
      if (custom.coverUrl !== undefined && custom.coverUrl !== null) {
        merged.cover = custom.coverUrl;
      }
      if (custom.isOpen !== undefined) {
        merged.isOpen = custom.isOpen;
      }
      merged.customization = custom;
    }

    if (customMenu && Array.isArray(customMenu)) {
      merged.menu = customMenu;
    } else {
      merged.menu = [];
    }

    if (!APP_DATA.merchants.some(m => m.id === merchantId)) {
      APP_DATA.merchants.push(merged);
    }

    return merged;
  }

  isFalseyOpen(val) {
    if (val === false || val === 0) return true;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      return s === 'false' || s === '0' || s === 'closed' || s === 'paused' || s === 'off';
    }
    return false;
  }

  isKitchenPaused(merchant) {
    // 1. Check explicitly passed merchant or selected merchant
    const m = merchant || this.getMerchant();
    if (m) {
      const custom = m.customization || {};
      if (this.isFalseyOpen(custom.isOpen) || this.isFalseyOpen(m.isOpen)) return true;
    }

    // 2. Check active cart items' merchant if present
    if (this.cart && this.cart.length > 0) {
      const cartMId = this.cart[0].merchantId || (this.selectedMerchantId);
      if (cartMId && (!m || cartMId !== m.id)) {
        const cartM = this.getMerchant(cartMId);
        if (cartM) {
          const cartCustom = cartM.customization || {};
          if (this.isFalseyOpen(cartCustom.isOpen) || this.isFalseyOpen(cartM.isOpen)) return true;
        }
      }
    }

    // 3. Fallback: inspect raw localStorage keys for any merchant customization marked closed/paused
    try {
      const curId = this.selectedMerchantId || (m ? m.id : null);
      if (curId) {
        const rawCustom = this.load('tapau_store_customization_' + curId) || this.load('tapau_store_customization');
        if (rawCustom && this.isFalseyOpen(rawCustom.isOpen)) return true;
      }
    } catch(e) {}

    return false;
  }

  addToCart(item) {
    const cartItemId = item.cartItemId || ('c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const fullItem = { ...item, cartItemId };
    this.cart.push(fullItem);
    this.save('tapau_cart', this.cart);
    AudioEngine.playPop();
    Haptic.trigger(30);
    this.syncCartItemToSupabase(fullItem).catch(() => {});
  }

  updateCartItemQty(cartItemId, delta) {
    const idx = this.cart.findIndex(i => i.cartItemId === cartItemId);
    if (idx !== -1) {
      this.cart[idx].quantity += delta;
      const targetItem = this.cart[idx];
      if (this.cart[idx].quantity <= 0) {
        this.cart.splice(idx, 1);
        this.deleteCartItemFromSupabase(cartItemId).catch(() => {});
      } else {
        this.syncCartItemToSupabase(targetItem).catch(() => {});
      }
      this.save('tapau_cart', this.cart);
      Haptic.trigger(20);
    }
  }

  clearCart() {
    this.cart = [];
    this.promoCode = null;
    this.promoDiscount = 0;
    this.save('tapau_cart', this.cart);
    this.clearCartInSupabase().catch(() => {});
  }

  async fetchCartFromSupabase() {
    if (!this.cartSessionId) return;
    try {
      const items = await TapauCloud.fetchCartItems(this.cartSessionId);
      if (items && Array.isArray(items)) {
        if (items.length > 0) {
          this.cart = items.map(dbItem => ({
            cartItemId: dbItem.item_id,
            id: dbItem.item_id,
            name: dbItem.name,
            quantity: Math.max(1, Number(dbItem.quantity) || 1),
            price: Number(dbItem.unit_price) || 0,
            unitPrice: Number(dbItem.unit_price) || 0,
            variantName: dbItem.variant_name || '',
            spiceLevel: dbItem.spice_level || '',
            notes: dbItem.notes || '',
            addOns: dbItem.add_ons || [],
            merchantId: dbItem.merchant_id
          }));
          this.save('tapau_cart', this.cart);
          if (window.UI) {
            if (typeof UI.renderCartBadge === 'function') UI.renderCartBadge();
            if (typeof UI.renderCartDrawer === 'function') UI.renderCartDrawer();
          }
        }
      }
    } catch (e) {
      console.warn('[Store] Remote cart hydration failed:', e);
    }
  }

  async syncCartItemToSupabase(item) {
    if (!this.cartSessionId || !item) return;
    try {
      await TapauCloud.syncCartItem(item, this.cartSessionId);
    } catch (e) {
      console.warn('[Store] Remote cart sync item failed:', e);
    }
  }

  async deleteCartItemFromSupabase(cartItemId) {
    if (!this.cartSessionId || !cartItemId) return;
    try {
      await TapauCloud.deleteCartItem(cartItemId, this.cartSessionId);
    } catch (e) {
      console.warn('[Store] Remote cart delete item failed:', e);
    }
  }

  async clearCartInSupabase() {
    if (!this.cartSessionId) return;
    try {
      await TapauCloud.clearCartItems(this.cartSessionId);
    } catch (e) {
      console.warn('[Store] Remote cart clear failed:', e);
    }
  }

  initCartRealtimeSync() {
    const sb = getSupabase();
    if (!sb || !this.cartSessionId) return;
    try {
      if (this.cartRealtimeChannel) {
        sb.removeChannel(this.cartRealtimeChannel);
      }
      this.cartRealtimeChannel = sb.channel(`cart_sync_${this.cartSessionId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'cart_items',
          filter: `session_id=eq.${this.cartSessionId}`
        }, (payload) => {
          console.log('[Cart Realtime] Sync event received:', payload.eventType);
          this.fetchCartFromSupabase().catch(() => {});
        })
        .subscribe((status, err) => {
          console.log(`[Cart Realtime] Channel status: ${status}`, err || '');
        });
    } catch (e) {
      console.warn('[Store] Cart realtime subscription notice:', e);
    }
  }

  getCartCount() {
    return this.cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  }

  getCartSubtotal() {
    return this.cart.reduce((sum, item) => {
      const p = Number(item.unitPrice !== undefined ? item.unitPrice : (item.price || 0)) || 0;
      const q = Number(item.quantity) || 1;
      return sum + (p * q);
    }, 0);
  }

  calculatePromoDiscount() {
    if (!this.promoCode) {
      this.promoDiscount = 0;
      return 0;
    }
    const subtotal = this.getCartSubtotal();
    if (subtotal === 0) {
      this.promoDiscount = 0;
      return 0;
    }

    const code = String(this.promoCode).trim().toUpperCase();
    const merchant = this.getMerchant();
    const custom = merchant ? (merchant.customization || {}) : {};

    // 1. Merchant-specific custom promo code (e.g. ARUARU10 or studio promo code)
    const merchantCode = (custom.promoCode || '').trim().toUpperCase();
    if (merchantCode && (merchantCode === code || code.includes(merchantCode))) {
      const pType = custom.promoType || 'percent';
      const pVal = parseFloat(custom.promoValue) || 10;
      if (pType === 'percent') {
        this.promoDiscount = Math.round(subtotal * (pVal / 100) * 100) / 100;
      } else if (pType === 'fixed') {
        this.promoDiscount = Math.min(subtotal, pVal);
      } else if (pType === 'freeitem') {
        this.promoDiscount = Math.min(subtotal, pVal > 0 ? pVal : 5.00);
      }
      return this.promoDiscount;
    }

    // 2. Global Fixed & Percentage codes
    if (code === 'TAPAU5' || code === 'SAVE5' || code === '5OFF' || code === 'RM5' || code === 'CUSTOM5') {
      this.promoDiscount = Math.min(subtotal, 5.00);
    } else if (code === 'TAPAU10' || code === 'SAVE10' || code === '10OFF' || code === 'WELCOME10' || code === 'ARUARU10' || code === 'PROMO10' || code === 'DISCOUNT10') {
      this.promoDiscount = Math.round(subtotal * 0.10 * 100) / 100;
    } else if (code === 'TAPAU20' || code === 'SAVE20' || code === '20OFF' || code === 'FIRSTORDER' || code === 'WELCOME20' || code === 'DISCOUNT20') {
      this.promoDiscount = Math.round(subtotal * 0.20 * 100) / 100;
    } else if (code === 'TAPAU50' || code === '50OFF' || code === 'HALFPRICE') {
      this.promoDiscount = Math.round(subtotal * 0.50 * 100) / 100;
    } else {
      // 3. Dynamic numeric parser for custom codes e.g. "OFF15", "SAVE25", "DISCOUNT30", "15OFF"
      const pctMatch = code.match(/(?:OFF|SAVE|DISCOUNT|TAPAU|PROMO|CODE)?(\d{1,2})(?:OFF|PCT|PERCENT)?/);
      if (pctMatch && pctMatch[1]) {
        const pct = parseInt(pctMatch[1], 10);
        if (pct > 0 && pct <= 90) {
          this.promoDiscount = Math.round(subtotal * (pct / 100) * 100) / 100;
          return this.promoDiscount;
        }
      }
      this.promoDiscount = 0;
    }

    return this.promoDiscount;
  }

  getCartTotal() {
    const subtotal = this.getCartSubtotal();
    if (subtotal === 0) return 0;
    const tax = subtotal * 0.06;
    const packaging = (this.orderType === 'tapau') ? 0.60 : 0.00;
    const discount = this.calculatePromoDiscount();
    const total = Math.max(0, subtotal + tax + packaging - discount);
    return total;
  }

  createOrder(paymentMethod = 'Touch \'n Go eWallet') {
    if (this.isKitchenPaused()) {
      throw new Error('Kitchen is currently paused. Cannot place order.');
    }
    if (!this.cart || this.cart.length === 0) {
      throw new Error('Cannot place an order with an empty basket.');
    }
    const orderNumber = String(Math.floor(10 + Math.random() * 890)).padStart(3, '0');
    const merchant = this.getMerchant();
    const subtotal = this.getCartSubtotal();
    const tax = subtotal * 0.06;
    const packagingFee = (this.orderType === 'tapau') ? 0.60 : 0.00;
    const total = this.getCartTotal();
    
    // Retrieve user profile if logged in
    const profileJson = localStorage.getItem('tapau_user_profile');
    const profile = profileJson ? JSON.parse(profileJson) : null;
    let customerName = (profile && profile.name) ? profile.name : 'Guest Customer';

    const newOrder = {
      orderId: orderNumber,
      merchantId: merchant.id,
      merchantName: merchant.name,
      orderType: 'tapau',
      tableNumber: '',
      status: 'received',
      createdAt: Date.now(),
      estimatedPrepMins: parseInt(merchant.prepTime) || 12,
      paymentMethod,
      items: this.cart.map(c => ({
        name: c.name,
        variant: c.variantName || '',
        spice: c.spiceLevel || '',
        quantity: c.quantity,
        price: (c.unitPrice || c.price || 0) * c.quantity,
        addOns: c.addOns || []
      })),
      subtotal,
      tax,
      packagingFee,
      discount: this.promoDiscount,
      total
    };

    this.activeOrders.unshift(newOrder);
    this.save('tapau_customer_orders', this.activeOrders);
    this.save('tapau_orders', this.activeOrders);
    if (merchant && merchant.id) {
      this.save('tapau_orders_' + merchant.id, this.activeOrders);
    }
    
    // 1. Broadcast to Merchant KDS in real-time (Same browser tabs)
    if (this.syncChannel) {
      this.syncChannel.postMessage({ type: 'NEW_ORDER', order: newOrder });
    }

    // 2. Insert into Supabase Cloud (Direct REST API + Realtime Push)
    const cartSnapshot = [...this.cart];
    const targetStoreId = (merchant && merchant.id) ? merchant.id : (TapauCloud.storeMap[merchant ? merchant.id : ''] || '');
    if (!targetStoreId) {
      console.warn('Place order warning: No active merchant store_id found.');
    }

    TapauCloud.placeOrder({
      store_id: targetStoreId,
      display_id: '#' + orderNumber,
      customer_name: customerName,
      customer_phone: profile && profile.email ? profile.email : '',
      order_type: 'tapau',
      table_number: '',
      total_amount: total,
      status: 'pending',
      payment_method: paymentMethod
    }, cartSnapshot).then(created => {
      if (created && created.id) {
        newOrder.dbId = created.id;
        this.save('tapau_customer_orders', this.activeOrders);
        this.save('tapau_orders', this.activeOrders);
      }
    }).catch(() => {});

    this.clearCart();
    return newOrder;
  }

  updateOrderStatus(orderId, newStatus) {
    const targetId = String(orderId || '').replace('#', '').trim();
    const normalizedStatus = String(newStatus || 'received').toLowerCase();
    const order = this.activeOrders.find(o => 
      (o.dbId && String(o.dbId) === targetId) ||
      String(o.orderId || '').replace('#', '').trim() === targetId
    );
    if (order) {
      order.status = normalizedStatus;
      this.save('tapau_customer_orders', this.activeOrders);
      if (typeof UI !== 'undefined' && typeof UI.renderOrders === 'function') {
        UI.renderOrders();
      }
      if (this.syncChannel) {
        this.syncChannel.postMessage({ type: 'ORDER_STATUS_CHANGED', orderId: targetId, status: newStatus });
      }
      if (newStatus === 'ready') {
        AudioEngine.playReadyChime();
        Haptic.pattern([100, 50, 100, 50, 200]);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`Tapau Time - Order #${orderId} Ready!`, {
              body: `Your order from ${order.merchantName} is hot and ready for pickup at the counter!`,
              icon: './icons/tapau-logo.png'
            });
          } catch(e) {}
        }
      }
    }
  }

  toggleFavorite(dishId) {
    const idx = this.favorites.indexOf(dishId);
    if (idx !== -1) {
      this.favorites.splice(idx, 1);
    } else {
      this.favorites.push(dishId);
      AudioEngine.playPop();
    }
    this.save('tapau_favorites', this.favorites);
  }
}

// Global Store Instance
const store = new Store();

// ==========================================
// 3. AUDIO ENGINE & HAPTICS (Zero external dependencies)
// ==========================================
const AudioEngine = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },
  playPop() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
  },
  playSuccessChime() {
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + (i * 0.09));
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime + (i * 0.09));
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (i * 0.09) + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + (i * 0.09));
      osc.stop(this.ctx.currentTime + (i * 0.09) + 0.3);
    });
  },
  playReadyChime() {
    this.init();
    if (!this.ctx) return;
    // Pleasant service bell chime
    const notes = [880, 1174.66, 1318.51, 1760];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + (i * 0.12));
      gain.gain.setValueAtTime(0.35, this.ctx.currentTime + (i * 0.12));
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (i * 0.12) + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + (i * 0.12));
      osc.stop(this.ctx.currentTime + (i * 0.12) + 0.7);
    });
  }
};

const Haptic = {
  trigger(ms = 30) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  },
  pattern(arr = [50, 50, 50]) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(arr); } catch (e) {}
    }
  }
};

// ==========================================
// 4. UI CONTROLLER & ROUTING
// ==========================================
const UI = {
  activeCustomizingDish: null,
  selectedVariantIdx: 0,
  selectedSpice: '',
  selectedAddOns: new Set(),
  itemModalQty: 1,

  checkAuthLanding() {
    const params = new URLSearchParams(window.location.search);
    const hasDirectParam = params.get('table') || params.get('merchant') || params.get('view') || params.get('guest') === '1' || params.has('code');

    if (hasDirectParam) return true;
    if (localStorage.getItem('tapau_guest_session') === 'true') return true;

    // Check valid user profile
    let hasProfile = false;
    try {
      const p = localStorage.getItem('tapau_user_profile');
      if (p) {
        const obj = JSON.parse(p);
        if (obj && (obj.name || obj.email)) {
          hasProfile = true;
        }
      }
    } catch (e) {}

    if (hasProfile) return true;

    // Check active Supabase auth token
    let hasAuthToken = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.includes('auth-token') || k.includes('supabase'))) {
          const val = localStorage.getItem(k);
          if (val && val.startsWith('{')) {
            try {
              const parsed = JSON.parse(val);
              let u = parsed?.user || parsed?.currentSession?.user;
              if (!u && k.includes('auth-token') && !k.endsWith('-user')) {
                const userVal = localStorage.getItem(k + '-user');
                if (userVal && userVal.startsWith('{')) {
                  try { u = JSON.parse(userVal); } catch (e) {}
                }
              }
              if (!u && parsed?.access_token && typeof parsed.access_token === 'string') {
                try {
                  const parts = parsed.access_token.split('.');
                  if (parts.length >= 2) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload && payload.email) {
                      u = { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} };
                    }
                  }
                } catch (e) {}
              }
              if (u && u.email) {
                hasAuthToken = true;
                const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email.split('@')[0];
                const email = u.email;
                localStorage.setItem('tapau_user_profile', JSON.stringify({
                  name: name,
                  email: email,
                  userId: u.id || null,
                  savedAt: Date.now()
                }));
                break;
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    if (hasAuthToken) return true;

    // Unauthenticated — redirect to login page
    window.location.replace('customer_login.html');
    return false;
  },

  init() {
    this.initPWA();
    if (!this.checkAuthLanding()) return;
    this.parseURLParams();
    this.bindEvents();
    this.renderHeader();
    this.renderView(store.currentView);
    this.initHeroSwipe();
    this.updateCartBar();
    this.startOrderProgressionLoop();
    this.initMerchantSyncChannel();
    this.initPullToRefresh();
  },

  initMerchantSyncChannel() {
    // store already sets up the BroadcastChannel in its constructor.
    // This method intentionally left as a no-op; the store's onmessage
    // handler calls UI.renderMenu() when STORE_CUSTOMIZATION_UPDATED fires.
  },

  initPullToRefresh() {
    if (this._pullToRefreshInitialized) return;
    this._pullToRefreshInitialized = true;

    // Inject indicator container if not already present
    let indicator = document.getElementById('tapau-pull-refresh-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'tapau-pull-refresh-indicator';
      indicator.className = 'pointer-events-none fixed top-16 left-0 right-0 z-[65] flex justify-center opacity-0 -translate-y-4 transition-opacity duration-200';
      indicator.innerHTML = `
        <div class="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-stone-200/80 shadow-lg text-stone-800">
          <div id="tapau-pull-refresh-icon" class="w-5 h-5 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[18px] text-orange-600 transition-transform duration-150">arrow_downward</span>
          </div>
          <span id="tapau-pull-refresh-label" class="text-[11px] font-extrabold tracking-tight text-stone-700 select-none">Pull to refresh</span>
        </div>
      `;
      document.body.appendChild(indicator);
    }

    const iconEl = indicator.querySelector('#tapau-pull-refresh-icon');
    const labelEl = indicator.querySelector('#tapau-pull-refresh-label');
    const mainArea = document.getElementById('main-content-area');

    let startY = 0;
    let startX = 0;
    let isEligible = false;
    let isPulling = false;
    let isRefreshing = false;
    let hapticFired = false;
    let currentDamped = 0;
    const THRESHOLD = 64;
    const MAX_PULL = 90;

    const isTop = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      return scrollY <= 2;
    };

    const hasOpenModal = () => {
      const cart = document.getElementById('cart-drawer');
      if (cart && !cart.classList.contains('hidden') && !cart.classList.contains('translate-y-full')) return true;
      const modal = document.getElementById('item-modifier-modal') || document.getElementById('customization-modal');
      if (modal && !modal.classList.contains('hidden')) return true;
      const receiptModal = document.getElementById('receipt-modal');
      if (receiptModal && !receiptModal.classList.contains('hidden')) return true;
      return false;
    };

    window.addEventListener('touchstart', (e) => {
      if (isRefreshing || hasOpenModal() || !isTop()) {
        isEligible = false;
        return;
      }
      const touch = e.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      isEligible = true;
      isPulling = false;
      hapticFired = false;
      currentDamped = 0;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isEligible || isRefreshing || hasOpenModal()) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;

      if (!isPulling) {
        if (Math.abs(deltaX) > Math.abs(deltaY) || deltaY <= 0 || !isTop()) {
          isEligible = false;
          return;
        }
        isPulling = true;
      }

      if (deltaY > 0) {
        currentDamped = Math.min(MAX_PULL, Math.pow(deltaY, 0.85) * 1.5);
        indicator.style.opacity = '1';
        indicator.style.transform = `translate3d(0, ${Math.max(0, currentDamped - 16)}px, 0)`;
        if (mainArea) {
          mainArea.style.transform = `translate3d(0, ${currentDamped}px, 0)`;
          mainArea.style.transition = 'none';
        }

        const progress = Math.min(1, currentDamped / THRESHOLD);
        const rotation = Math.min(180, progress * 180);

        if (currentDamped >= THRESHOLD) {
          if (!hapticFired) {
            hapticFired = true;
            if (typeof window !== 'undefined' && 'vibrate' in navigator) {
              try { navigator.vibrate(12); } catch (_) {}
            }
          }
          if (iconEl) iconEl.innerHTML = `<span class="material-symbols-outlined text-[18px] text-orange-600" style="transform: rotate(180deg)">arrow_downward</span>`;
          if (labelEl) labelEl.textContent = 'Release to refresh';
        } else {
          hapticFired = false;
          if (iconEl) iconEl.innerHTML = `<span class="material-symbols-outlined text-[18px] text-orange-600" style="transform: rotate(${rotation}deg)">arrow_downward</span>`;
          if (labelEl) labelEl.textContent = 'Pull to refresh';
        }

        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    const handleEnd = async () => {
      if (!isPulling || isRefreshing) return;
      isEligible = false;
      isPulling = false;

      if (hapticFired || currentDamped >= THRESHOLD || (labelEl && labelEl.textContent === 'Release to refresh')) {
        isRefreshing = true;
        indicator.style.opacity = '1';
        indicator.style.transform = `translate3d(0, 52px, 0)`;
        indicator.style.transition = 'transform 0.25s ease, opacity 0.2s';
        if (mainArea) {
          mainArea.style.transform = `translate3d(0, 52px, 0)`;
          mainArea.style.transition = 'transform 0.25s ease';
        }

        if (iconEl) {
          iconEl.innerHTML = `<svg class="w-4 h-4 animate-spin text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle><path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"></path></svg>`;
        }
        if (labelEl) labelEl.textContent = 'Refreshing...';

        const startTime = Date.now();
        try {
          await UI.refreshCurrentView();
        } catch (err) {
          console.warn('[PullToRefresh] Refresh failed:', err);
        }

        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, 450 - elapsed);

        setTimeout(() => {
          if (iconEl) iconEl.innerHTML = `<span class="material-symbols-outlined text-[18px] text-emerald-600">check</span>`;
          if (labelEl) labelEl.textContent = 'Updated!';

          setTimeout(() => {
            indicator.style.opacity = '0';
            indicator.style.transform = `translate3d(0, -16px, 0)`;
            if (mainArea) {
              mainArea.style.transform = '';
              mainArea.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            }
            isRefreshing = false;
          }, 350);
        }, remainingDelay);
      } else {
        indicator.style.opacity = '0';
        indicator.style.transform = `translate3d(0, -16px, 0)`;
        if (mainArea) {
          mainArea.style.transform = '';
          mainArea.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        }
      }
    };

    window.addEventListener('touchend', handleEnd, { passive: true });
    window.addEventListener('touchcancel', handleEnd, { passive: true });
  },

  async refreshCurrentView() {
    const v = store.currentView;
    if (v === 'discover') {
      if (store.fetchServerSync) await store.fetchServerSync();
      this.renderDiscover();
      this.initHeroSwipe();
    } else if (v === 'tapau') {
      if (store.fetchServerSync) await store.fetchServerSync();
      this.renderTapauView();
    } else if (v === 'menu') {
      if (store.fetchMenuSync && store.selectedMerchantId) await store.fetchMenuSync(store.selectedMerchantId);
      this.renderMenu();
    } else if (v === 'orders') {
      if (store.fetchCustomerOrdersFromSupabase) await store.fetchCustomerOrdersFromSupabase(true);
      this.renderOrders();
    } else if (v === 'rewards') {
      this.renderRewards();
    } else if (v === 'profile') {
      if (store.fetchCustomerOrdersFromSupabase) await store.fetchCustomerOrdersFromSupabase(true);
      this.renderProfile();
    }
  },

  showToast(message, type = 'info') {
    let toast = document.getElementById('tapau-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tapau-toast-notification';
      toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-full bg-stone-900/90 text-white text-xs font-bold shadow-2xl backdrop-blur-md flex items-center gap-2 transition-all duration-300 pointer-events-none opacity-0 -translate-y-2';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('opacity-0', '-translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');
    
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      if (toast) {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', '-translate-y-2');
      }
    }, 2800);
  },

  applyCustomization(custom) {
    const menuView = document.getElementById('menu-view');
    const modal = document.getElementById('customizer-modal');
    if (!menuView) return;

    // --- Map atmosphere to primary theme color ---
    const atmosphereThemeMap = {
      'kopitiam-marble':    { primary: '#ff6600', container: '#cc5200', secondary: '#fe9d00', onPrimary: '#ffffff', onContainer: '#ffe0cc' },
      'industrial-terrazzo':{ primary: '#d97706', container: '#b45309', secondary: '#2b2d42', onPrimary: '#ffffff', onContainer: '#fff3cd' },
      'warm-woodgrain':     { primary: '#b45309', container: '#92400e', secondary: '#d97706', onPrimary: '#ffffff', onContainer: '#fef3c7' },
      'dark-neon':          { primary: '#00f2fe', container: '#0e7490', secondary: '#00f2fe', onPrimary: '#000000', onContainer: '#cffafe' },
    };
    const atm = (custom && custom.atmosphere) || 'kopitiam-marble';
    const selectedTheme = atmosphereThemeMap[atm] || atmosphereThemeMap['kopitiam-marble'];

    let radius = '9999px';
    if (custom && custom.buttonStyle === 'rounded') radius = '12px';
    else if (custom && custom.buttonStyle === 'square') radius = '6px';

    // Apply CSS variable theme to menu view and dish customizer modal
    [menuView, modal].forEach(el => {
      if (el) {
        el.style.setProperty('--color-primary', selectedTheme.primary);
        el.style.setProperty('--color-primary-container', selectedTheme.container);
        el.style.setProperty('--color-secondary-container', selectedTheme.secondary);
        el.style.setProperty('--color-on-primary', selectedTheme.onPrimary);
        el.style.setProperty('--color-on-primary-container', selectedTheme.onContainer);
        el.style.setProperty('--btn-radius', radius);
      }
    });

    // --- Apply atmosphere background to menu-view wrapper ---
    const menuBgOverlay = document.getElementById('menu-bg-overlay');
    if (menuBgOverlay) {
      const bgMap = {
        'kopitiam-marble':     'background-color: #f4f5f0; background-image: radial-gradient(#d3dbd0 1px, transparent 1px); background-size: 16px 16px;',
        'industrial-terrazzo': 'background-color: #efebe4; background-image: radial-gradient(#d97706 1.5px, transparent 1.5px), radial-gradient(#2b2d42 1px, transparent 1px); background-size: 24px 24px, 16px 16px;',
        'warm-woodgrain':      'background-color: #fbf5ec; background-image: linear-gradient(135deg, #fbf5ec 0%, #ecdcc9 100%);',
        'dark-neon':           'background-color: #0f172a; color: #f1f5f9;',
      };
      menuBgOverlay.style.cssText = bgMap[atm] || '';
    }

    // --- Apply text colors to Store Title & Tagline according to atmosphere ---
    const headerTitle = document.getElementById('menu-merchant-title');
    const headerDesc = document.getElementById('menu-merchant-desc');
    if (atm === 'dark-neon') {
      if (headerTitle) headerTitle.style.color = '#f8fafc';
      if (headerDesc) headerDesc.style.color = '#94a3b8';
    } else if (atm === 'warm-woodgrain') {
      if (headerTitle) headerTitle.style.color = '#2b1810';
      if (headerDesc) headerDesc.style.color = 'rgba(43, 24, 16, 0.75)';
    } else if (atm === 'industrial-terrazzo') {
      if (headerTitle) headerTitle.style.color = '#191c1d';
      if (headerDesc) headerDesc.style.color = 'rgba(25, 28, 29, 0.75)';
    } else { // kopitiam-marble
      if (headerTitle) headerTitle.style.color = '#191c1d';
      if (headerDesc) headerDesc.style.color = 'rgba(25, 28, 29, 0.75)';
    }

    // --- Render Promotional Banner (Matching Merchant preview-promo-strip) ---
    const promoSection = document.getElementById('menu-promo-banner-section');
    const isPromoEnabled = !!(custom && custom.promoEnabled && (custom.promoCode || custom.promoMessage));
    if (promoSection) {
      if (isPromoEnabled) {
        const pCode = (custom.promoCode || '').trim().toUpperCase();
        const pVal = custom.promoValue || 10;
        const pType = custom.promoType || 'percent';
        const pMsg = custom.promoMessage || (pCode ? `Use ${pCode} for ${pVal}${pType === 'percent' ? '%' : (pType === 'fixed' ? ' RM' : '')} off your first order!` : 'Special Promo Available!');
        const isApplied = (store.promoCode && store.promoCode.toUpperCase() === pCode);

        promoSection.className = 'w-full py-2 px-4 bg-secondary-container text-on-secondary-container flex items-center justify-center gap-2 shrink-0 shadow-sm z-20 cursor-pointer active:opacity-90 transition-all';
        promoSection.onclick = () => UI.applyPromoFromBanner(pCode);
        promoSection.innerHTML = `
          <span class="material-symbols-outlined text-[14px]">local_offer</span>
          <span class="text-[11px] font-black tracking-wide truncate">${pMsg}</span>
          ${pCode ? `<span class="shrink-0 px-1.5 py-0.5 bg-black/20 rounded font-mono text-[10px] font-black">${isApplied ? '✓ ' + pCode : pCode}</span>` : ''}
        `;
        promoSection.classList.remove('hidden');
      } else {
        promoSection.innerHTML = '';
        promoSection.classList.add('hidden');
        promoSection.onclick = null;
      }
    }

    // --- Render Owner's Shoutout card ---
    const shoutoutSection = document.getElementById('menu-shoutout-section');
    const shoutout = custom && custom.shoutout;
    if (shoutoutSection) {
      if (shoutout && shoutout.trim()) {
        const cardColorMap = {
          'kopitiam-marble':     'bg-emerald-50 border-emerald-200 text-emerald-900',
          'industrial-terrazzo': 'bg-amber-50 border-amber-200 text-amber-900',
          'warm-woodgrain':      'bg-[#fffbf5] border-[#b45309]/30 text-[#4a2c11]',
          'dark-neon':           'bg-slate-800 border-cyan-500/40 text-cyan-200',
        };
        const cardCls = cardColorMap[atm] || cardColorMap['kopitiam-marble'];
        shoutoutSection.innerHTML = `
          <div class="p-3.5 rounded-2xl border ${cardCls} shadow-sm relative overflow-hidden">
            <div class="flex items-center gap-1.5 mb-1 text-[11px] font-black uppercase tracking-wider opacity-80">
              <span class="material-symbols-outlined text-[15px]">push_pin</span>
              <span>Owner's Daily Shoutout</span>
            </div>
            <p class="font-serif italic text-xs leading-relaxed">"${shoutout}"</p>
          </div>
        `;
        shoutoutSection.classList.remove('hidden');
      } else {
        shoutoutSection.innerHTML = '';
        shoutoutSection.classList.add('hidden');
      }
    }

    // --- Render Live Tracker Experience Widget ---
    const trackerSection = document.getElementById('menu-tracker-experience-section');
    if (trackerSection) {
      const waitAnim = (custom && custom.waitingAnimation) || 'dripping-coffee';
      const readyAlert = (custom && custom.readyAlert) || 'kopitiam-bell';
      const alertMap = {
        'kopitiam-bell': '🔔 Kopitiam Bell',
        'digital-chime': '✨ Digital Chime',
        'loudspeaker-buzz': '📢 Loudspeaker Buzz'
      };
      const alertLabel = alertMap[readyAlert] || '🔔 Kopitiam Bell';

      let animHtml = '';
      if (waitAnim === 'dripping-coffee') {
        animHtml = `
          <div class="flex items-center gap-3.5 w-full px-3">
            <div class="relative w-12 h-12 flex items-center justify-center bg-amber-100/80 rounded-full text-amber-900 shadow-inner shrink-0">
              <span class="material-symbols-outlined text-2xl animate-bounce">coffee</span>
              <span class="absolute -bottom-1 w-2 h-2 rounded-full bg-amber-800 animate-ping"></span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-black block text-gray-900 truncate">Kopi Tarik Dripping...</span>
              <span class="text-[10px] text-gray-600 block">Slow-brewed traditional nanyang roast</span>
            </div>
          </div>
        `;
      } else if (waitAnim === 'steaming-dimsum') {
        animHtml = `
          <div class="flex items-center gap-3.5 w-full px-3">
            <div class="relative w-12 h-12 flex items-center justify-center bg-orange-100/80 rounded-full text-orange-900 shadow-inner shrink-0">
              <span class="material-symbols-outlined text-2xl animate-pulse">lunch_dining</span>
              <span class="absolute -top-1 w-3 h-3 rounded-full bg-white/80 animate-ping"></span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-black block text-gray-900 truncate">Bamboo Steamer Puffing...</span>
              <span class="text-[10px] text-gray-600 block">Fresh batches steaming at 100°C</span>
            </div>
          </div>
        `;
      } else if (waitAnim === 'sizzling-wok') {
        animHtml = `
          <div class="flex items-center gap-3.5 w-full px-3">
            <div class="relative w-12 h-12 flex items-center justify-center bg-rose-100/80 rounded-full text-rose-900 shadow-inner shrink-0">
              <span class="material-symbols-outlined text-2xl animate-bounce">local_fire_department</span>
              <span class="absolute -top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-black block text-gray-900 truncate">High-Heat Wok Hei Toss...</span>
              <span class="text-[10px] text-gray-600 block">Charred to perfection in seasoned cast iron</span>
            </div>
          </div>
        `;
      } else if (waitAnim === 'crispy-chicken') {
        animHtml = `
          <div class="flex items-center gap-3.5 w-full px-3">
            <div class="relative w-12 h-12 flex items-center justify-center bg-amber-100/80 rounded-full text-amber-900 shadow-inner shrink-0">
              <span class="material-symbols-outlined text-2xl animate-spin" style="animation-duration: 4s;">skillet</span>
              <span class="absolute -top-1 w-2.5 h-2.5 rounded-full bg-amber-600 animate-ping"></span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-black block text-gray-900 truncate">Golden Crispy Sizzling...</span>
              <span class="text-[10px] text-gray-600 block">Double spiced berempah crunch</span>
            </div>
          </div>
        `;
      }

      trackerSection.innerHTML = `
        <div class="space-y-2 mt-3">
          <div class="flex items-center justify-between text-[11px] font-bold opacity-80">
            <span class="uppercase tracking-wider font-black">Live Order Experience</span>
            <span class="px-2 py-0.5 rounded bg-black/10 font-mono text-[10px]">${alertLabel}</span>
          </div>

          <div class="p-3.5 bg-white text-gray-900 rounded-2xl border border-black/10 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <span class="font-extrabold text-xs">Preparing your order...</span>
              </div>
              <span class="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-900">#088 • Table 06</span>
            </div>

            <div class="py-3 bg-black/5 rounded-xl flex flex-col items-center justify-center gap-2">
              ${animHtml}
            </div>

            <div class="flex items-center justify-between text-[10px] opacity-70 border-t border-black/10 pt-2 font-medium">
              <span>Estimated hot pickup: ~8 mins</span>
              <span class="text-primary font-bold">In Kitchen</span>
            </div>
          </div>
        </div>
      `;
    }
  },

  parseURLParams() {
    store.orderType = 'tapau';
    const params = new URLSearchParams(window.location.search);
    const merchantId = params.get('merchant') || params.get('m');
    const viewParam = params.get('view');
    if (merchantId) {
      store.setMerchant(merchantId);
      if (!viewParam) {
        store.currentView = 'menu';
      }
    } else {
      const activeM = localStorage.getItem('tapau_current_merchant_id');
      if (activeM) {
        store.setMerchant(activeM);
      } else if (APP_DATA.merchants && APP_DATA.merchants.length > 0) {
        store.setMerchant(APP_DATA.merchants[0].id);
      }
    }
    if (viewParam) {
      store.currentView = viewParam;
    } else if (!merchantId) {
      const savedView = store.load('tapau_current_view');
      if (savedView) {
        store.currentView = savedView;
      }
    }
  },

  bindEvents() {
    // Bottom nav tabs
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = btn.getAttribute('data-nav');
        if (view === 'cart') return;
        if (view === 'tapau') {
          this.openFullTenantsList();
          return;
        }
        this.renderView(view);
      });
    });

    // Customizer Modal
    document.getElementById('close-customizer-btn')?.addEventListener('click', () => this.closeCustomizer());
    document.getElementById('customizer-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'customizer-modal-backdrop') this.closeCustomizer();
    });

    // Customizer Qty buttons
    document.getElementById('customizer-minus-btn')?.addEventListener('click', () => {
      if (this.itemModalQty > 1) {
        this.itemModalQty--;
        this.updateCustomizerPrice();
      }
    });
    document.getElementById('customizer-plus-btn')?.addEventListener('click', () => {
      this.itemModalQty++;
      this.updateCustomizerPrice();
    });

    // Add to Cart from customizer
    document.getElementById('customizer-add-btn')?.addEventListener('click', () => {
      this.confirmAddToCart();
    });

    // Cart Drawer Open/Close
    document.getElementById('floating-cart-bar')?.addEventListener('click', () => this.openCartDrawer());
    document.getElementById('close-cart-btn')?.addEventListener('click', () => this.closeCartDrawer());
    document.getElementById('cart-drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'cart-drawer-backdrop') this.closeCartDrawer();
    });

    // Promo code apply
    document.getElementById('apply-promo-btn')?.addEventListener('click', () => {
      this.handleApplyPromo();
    });

    // Checkout button inside cart drawer
    document.getElementById('checkout-btn')?.addEventListener('click', () => {
      this.openCheckoutModal();
    });

    // Confirm Pay inside Checkout Modal
    document.getElementById('confirm-pay-btn')?.addEventListener('click', () => {
      this.processPayment();
    });
    document.getElementById('close-checkout-btn')?.addEventListener('click', () => {
      this.closeCheckoutModal();
    });

    // Listen for orientation/resize to optimize layout
    window.addEventListener('resize', () => this.updateCartBar());
    this.initScrollHeader();
  },

  renderHeader() {
    this.applyThemeMode();
    this.renderOrderModeToggle();
  },

  applyThemeMode() {
    document.body.classList.remove('mode-dinein');
    document.body.classList.add('mode-tapau');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', '#ff8533');
  },

  setOrderMode(_mode) {
    store.orderType = 'tapau';
    store.save('tapau_ordertype', 'tapau');
    AudioEngine.playPop();
    Haptic.trigger(25);
    this.renderHeader();
    this.renderCartItems();
    this.updateCartBar();
  },

  renderOrderModeToggle() {
    const heroTag = document.getElementById('hero-tag-text');
    const heroHeading = document.getElementById('hero-heading-text');
    const heroSub = document.getElementById('hero-sub-text');
    const heroImg = document.getElementById('hero-illustration');

    if (heroTag) heroTag.textContent = 'Fast & Fresh';
    if (heroHeading) heroHeading.textContent = 'Ready to Tapau?';
    if (heroSub) heroSub.textContent = 'Skip long hawker queues. Order on your phone, pick up piping hot!';
    if (heroImg) {
      heroImg.src = './icons/tapau-hero.png';
      heroImg.alt = 'Tapau Drink Bag';
    }
  },

  renderView(viewName) {
    const isNewView = store.currentView !== viewName;
    store.currentView = viewName;
    store.save('tapau_current_view', viewName);
    if (isNewView) {
      window.scrollTo(0, 0);
    }

    // Defensive URL state synchronization so refresh retains the active view
    try {
      const url = new URL(window.location.href);
      if (viewName === 'menu') {
        if (store.selectedMerchantId) url.searchParams.set('merchant', store.selectedMerchantId);
        url.searchParams.set('view', 'menu');
      } else {
        url.searchParams.delete('merchant');
        url.searchParams.delete('m');
        url.searchParams.set('view', viewName);
      }
      window.history.replaceState({}, '', url.toString());
    } catch(e) {}

    // Hide or show the global platform header depending on whether menu view is active
    const globalHeader = document.getElementById('global-app-header');
    const mainArea = document.getElementById('main-content-area');

    if (viewName === 'menu') {
      if (globalHeader) globalHeader.classList.add('hidden');
      if (mainArea) {
        mainArea.classList.remove('pt-16');
        mainArea.classList.add('pt-0');
      }
    } else {
      if (globalHeader) globalHeader.classList.remove('hidden');
      if (mainArea) {
        mainArea.classList.add('pt-16');
        mainArea.classList.remove('pt-0');
      }
    }

    // Update bottom nav highlights
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      const navTarget = btn.getAttribute('data-nav');
      const isActive = (navTarget === viewName) 
        || (viewName === 'menu' && navTarget === 'tapau');
      const icon = btn.querySelector('.material-symbols-outlined');

      if (navTarget === 'tapau') {
        const halo = btn.parentElement;
        const mainPaths = btn.querySelectorAll('svg path');
        if (isActive) {
          btn.classList.add('bg-orange-500', 'text-white', 'shadow-[0_6px_25px_rgba(249,115,22,0.5)]', 'scale-105');
          btn.classList.remove('bg-white', 'text-stone-900');
          if (halo) {
            halo.classList.add('bg-orange-100', 'border-orange-400');
            halo.classList.remove('bg-white', 'border-stone-200');
          }
          mainPaths.forEach(p => {
            if (p.getAttribute('fill') === '#ff6600') p.setAttribute('fill', '#ffffff');
            else if (p.getAttribute('fill') === '#ffffff' && p.getAttribute('stroke-width') === '12') p.setAttribute('fill', '#ff6600');
          });
        } else {
          btn.classList.remove('bg-orange-500', 'text-white', 'shadow-[0_6px_25px_rgba(249,115,22,0.5)]', 'scale-105');
          btn.classList.add('bg-white', 'text-stone-900');
          if (halo) {
            halo.classList.remove('bg-orange-100', 'border-orange-400');
            halo.classList.add('bg-white', 'border-stone-200');
          }
          mainPaths.forEach(p => {
            if (p.getAttribute('fill') === '#ffffff' && p.getAttribute('stroke-width') === '16') p.setAttribute('fill', '#ff6600');
            else if (p.getAttribute('fill') === '#ff6600' && p.getAttribute('stroke-width') === '12') p.setAttribute('fill', '#ffffff');
          });
        }
      } else if (isActive) {
        btn.classList.add('text-primary');
        btn.classList.remove('text-stone-400', 'text-gray-400', 'text-on-surface-variant', 'hover:text-stone-900');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      } else {
        btn.classList.remove('text-primary');
        btn.classList.add('text-stone-400', 'hover:text-stone-900');
        btn.classList.remove('text-gray-400', 'text-on-surface-variant');
        if (icon) icon.style.fontVariationSettings = "'FILL' 0";
      }
    });

    // Hide all view containers
    const views = ['discover-view', 'tapau-view', 'menu-view', 'orders-view', 'rewards-view', 'profile-view'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.classList.add('hidden');
    });

    const targetEl = document.getElementById(`${viewName}-view`);
    if (targetEl) {
      targetEl.classList.remove('hidden');
      targetEl.classList.add('animate-fade-in');
    }

    // Specific view rendering routines
    if (viewName === 'discover') { this.renderDiscover(); this.initHeroSwipe(); }
    if (viewName === 'tapau') this.renderTapauView();
    if (viewName === 'menu') this.renderMenu();
    if (viewName === 'orders') {
      this.renderOrders();
      store.fetchCustomerOrdersFromSupabase().catch(() => {});
    }
    if (viewName === 'rewards') this.renderRewards();
    if (viewName === 'profile') this.renderProfile();

    this.initScrollHeader();
    this.updateCartBar();
    this.updateOrdersNavBadge();
  },

  initScrollHeader() {
    const header = document.getElementById('global-app-header');
    if (!header) return;

    // Reset header to visible state whenever view initializes
    header.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');
    header.classList.add('translate-y-0', 'opacity-100');

    // Bind passive scroll direction listener once
    if (this._scrollHeaderBound) return;
    this._scrollHeaderBound = true;

    let lastScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    const threshold = 10;
    const topBoundary = 50;

    window.addEventListener('scroll', () => {
      if (store.currentView === 'menu') return;

      const currentScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
      const deltaY = currentScrollY - lastScrollY;

      if (currentScrollY <= topBoundary) {
        // At or near top of customer page -> Always show top navbar
        header.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');
        header.classList.add('translate-y-0', 'opacity-100');
      } else if (deltaY > threshold && currentScrollY > topBoundary) {
        // Scrolling DOWN on customer screen -> Disappear top navbar
        header.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none');
        header.classList.remove('translate-y-0', 'opacity-100');
      } else if (deltaY < -threshold) {
        // Scrolling UP on customer screen -> Reappear top navbar
        header.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');
        header.classList.add('translate-y-0', 'opacity-100');
      }

      lastScrollY = currentScrollY;
    }, { passive: true });
  },

  openFullTenantsList() {
    AudioEngine.playPop();
    Haptic.trigger(40);

    const header = document.getElementById('global-app-header');
    if (header) {
      header.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');
      header.classList.add('translate-y-0', 'opacity-100');
    }

    if (store.currentView === 'tapau') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const mainArea = document.getElementById('main-content-area');
      if (mainArea) mainArea.scrollTop = 0;
      const tapauView = document.getElementById('tapau-view');
      if (tapauView) tapauView.scrollTop = 0;
    } else {
      this.renderView('tapau');
    }
  },

  isKitchenPaused(merchant) {
    const m = merchant || store.getMerchant();
    return store.isKitchenPaused(m);
  },

  selectMerchantAndOpenMenu(merchantId) {
    AudioEngine.playPop();
    Haptic.trigger(40);
    this.toggleHeroCard(false);
    if (merchantId) {
      store.setMerchant(merchantId);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('merchant', merchantId);
        window.history.replaceState({}, '', url.toString());
      } catch(e) {}
    }
    this.renderView('menu');
  },

  renderTapauView() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainArea = document.getElementById('main-content-area');
    if (mainArea) mainArea.scrollTop = 0;

    const header = document.getElementById('global-app-header');
    if (header) {
      header.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');
      header.classList.add('translate-y-0', 'opacity-100');
    }

    const container = document.getElementById('tapau-merchants-list');
    if (!container) return;

    const baseList = [...APP_DATA.merchants];
    const curMerchantId = localStorage.getItem('tapau_current_merchant_id');
    if (curMerchantId && !baseList.some(m => m.id === curMerchantId)) {
      let sessName = 'My Merchant Store';
      try {
        const sess = JSON.parse(localStorage.getItem('tapau_merchant_session') || '{}');
        if (sess.name) sessName = sess.name;
      } catch(e) {}
      baseList.unshift({
        id: curMerchantId,
        name: sessName,
        tagline: '',
        tags: ['Halal-Friendly', 'Local'],
        rating: 4.9,
        reviewsCount: 1,
        prepTime: '10-15 mins',
        distance: '50m away',
        isOpen: true,
        image: './icons/tapau-logo.png',
        cover: ''
      });
    }

    const sanitizeImg = (url) => {
      if (!url || typeof url !== 'string') return './icons/tapau-logo.png';
      if (url.includes('fbcdn.net') || url.includes('cdninstagram.com')) return './icons/tapau-logo.png';
      return url;
    };

    const merchantsToRender = baseList.map(rawM => {
      const m = store.getMerchant(rawM.id);
      const custom = (m && m.customization) ? m.customization : {};
      const isOpen = (custom && custom.isOpen !== undefined) ? custom.isOpen : ((m && m.isOpen !== undefined) ? m.isOpen : (rawM.isOpen !== undefined ? rawM.isOpen : true));
      const rawImage = (m && m.image) ? m.image : rawM.image;
      const rawCover = (m && m.cover) ? m.cover : rawM.cover;
      return {
        ...rawM,
        ...(m || {}),
        name: (m && m.name) ? m.name : rawM.name,
        tagline: (m && m.tagline) ? m.tagline : (rawM.tagline || rawM.desc || ''),
        image: sanitizeImg(rawImage),
        cover: sanitizeImg(rawCover),
        rating: rawM.rating || null,
        reviewsCount: rawM.reviewsCount || 0,
        prepTime: rawM.prepTime || '10 mins',
        distance: rawM.distance || 'Near You',
        tags: rawM.tags || ['Malaysian', 'Local'],
        isOpen: isOpen
      };
    });

    const featuredContainer = document.getElementById('featured-tenants-list');
    if (featuredContainer) {
      featuredContainer.innerHTML = merchantsToRender.map(m => {
        const isPaused = m.isOpen === false;
        return `
        <div onclick="UI.selectMerchantAndOpenMenu('${m.id}')" class="p-3 bg-stone-50 hover:bg-amber-50/50 rounded-2xl border border-stone-200/60 flex items-center justify-between cursor-pointer transition-all active:scale-95 text-left group ${isPaused ? 'opacity-80' : ''}">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl overflow-hidden bg-stone-200 shrink-0 border border-stone-300/50 shadow-xs">
              <img src="${m.image || './icons/tapau-logo.png'}" alt="${m.name}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='./icons/tapau-logo.png';" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <h4 class="font-extrabold text-xs text-stone-900 group-hover:text-amber-900 truncate">${m.name}</h4>
                <span class="flex items-center gap-0.5 text-[10px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded shrink-0">★ ${m.rating}</span>
              </div>
              <p class="text-[10px] text-stone-500 truncate mt-0.5">${m.tagline || m.desc || ''}</p>
            </div>
          </div>
          <button class="ml-2 px-2.5 py-1.5 rounded-xl bg-stone-950 text-white font-bold text-[11px] shrink-0 group-hover:bg-amber-600 transition-colors flex items-center gap-0.5 shadow-xs">
            <span>${isPaused ? 'Closed' : 'Menu'}</span>
            <span class="material-symbols-outlined text-[13px]">chevron_right</span>
          </button>
        </div>
        `;
      }).join('');
    }

    container.innerHTML = merchantsToRender.map(m => {
      const primaryTag = m.tag || (m.tags && m.tags[0]) || 'Local Delights';
      const isPaused = m.isOpen === false;
      const openBadge = isPaused
        ? `<span class="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 font-extrabold text-[10px] uppercase tracking-wider">CLOSED</span>`
        : `<span class="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-extrabold text-[10px] uppercase tracking-wider">OPEN</span>`;

      const timeDisplay = isPaused
        ? `<span class="flex items-center gap-0.5 text-rose-600 font-bold"><span class="material-symbols-outlined text-[12px]">pause_circle</span> Kitchen Paused</span>`
        : `<span class="flex items-center gap-0.5 text-emerald-700 font-bold"><span class="material-symbols-outlined text-[12px]">schedule</span> ${m.prepTime || m.time || '10 mins'}</span>`;

      const actionBtn = isPaused
        ? `<button class="ml-3 px-3 py-2 rounded-xl bg-stone-200 text-stone-600 font-extrabold text-xs shrink-0 flex items-center gap-1 opacity-90 cursor-pointer"><span>Closed</span></button>`
        : `<button class="ml-3 px-3.5 py-2 rounded-xl bg-primary text-white font-black text-xs shrink-0 group-hover:bg-amber-600 transition-colors flex items-center gap-1 shadow-xs active:scale-95"><span>Menu</span><span class="material-symbols-outlined text-[14px]">chevron_right</span></button>`;

      return `
      <div onclick="UI.selectMerchantAndOpenMenu('${m.id}')" class="p-3.5 bg-surface-container-lowest hover:bg-amber-50/60 rounded-2xl border border-outline-variant/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] shadow-xs group ${isPaused ? 'opacity-80' : ''}">
        <div class="flex items-center gap-3.5 min-w-0 flex-1">
          <div class="w-12 h-12 rounded-2xl overflow-hidden bg-stone-100 shrink-0 border border-stone-200 shadow-xs">
            <img src="${m.image || './icons/tapau-logo.png'}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 ${isPaused ? 'grayscale-[50%]' : ''}" onerror="this.onerror=null; this.src='./icons/tapau-logo.png';" />
          </div>
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center gap-1.5">
              <h4 class="font-extrabold text-xs text-on-surface group-hover:text-amber-900 truncate">${m.name}</h4>
              <span class="flex items-center gap-0.5 text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-md shrink-0">★ ${m.rating}</span>
            </div>
            <p class="text-[11px] text-on-surface-variant truncate">${m.tagline || m.desc || ''}</p>
            <div class="flex items-center gap-1.5 pt-0.5 text-[10px] font-semibold text-stone-500 flex-wrap">
              ${openBadge}
              <span class="px-1.5 py-0.5 rounded bg-stone-100 font-bold text-stone-700">${primaryTag}</span>
              <span>•</span>
              ${timeDisplay}
            </div>
          </div>
        </div>
        ${actionBtn}
      </div>
      `;
    }).join('');
  },

  renderRewards() {
    // Smooth scroll to top when rewards view is loaded
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ==========================================
  // VIEW: DISCOVER HERO SHOWCASE CAROUSEL & SWIPE
  // ==========================================
  heroShowcaseItems: [
    {
      id: 'tapau-mode',
      title: 'Tapau Takeaway',
      price: 'FAST',
      size: 'Skip Queues',
      description: 'Order ahead on your phone and pick up piping hot street food without waiting in line.',
      image: './icons/tapau-terus.png'
    },
    {
      id: 'rewards-mode',
      title: 'TapauRewards VIP',
      price: 'PERKS',
      size: 'Loyalty Points',
      description: 'Earn points on every meal to unlock exclusive hawker discounts and rewards.',
      image: './icons/tapau-rewards.png'
    }
  ],
  currentHeroIndex: 0,
  isHeroAnimating: false,

  nextHero() {
    const cardEl = document.getElementById('home-showcase-card');
    const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
    if (isCardOpen) return;
    const nextIdx = (this.currentHeroIndex + 1) % this.heroShowcaseItems.length;
    this.goToHero(nextIdx, 'left');
  },

  prevHero() {
    const cardEl = document.getElementById('home-showcase-card');
    const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
    if (isCardOpen) return;
    const prevIdx = (this.currentHeroIndex - 1 + this.heroShowcaseItems.length) % this.heroShowcaseItems.length;
    this.goToHero(prevIdx, 'right');
  },

  handleHeroAction(index) {
    if (this.wasSwiped) {
      this.wasSwiped = false;
      return;
    }
    const cardEl = document.getElementById('home-showcase-card');
    const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
    if (isCardOpen) {
      this.toggleHeroCard(false);
      return;
    }

    const idx = index !== undefined ? index : this.currentHeroIndex;
    AudioEngine.playPop();
    Haptic.trigger(40);
    if (idx === 0) {
      store.orderType = 'tapau';
      store.save('tapau_ordertype', 'tapau');
      this.renderView('tapau');
    } else {
      this.renderView('rewards');
    }
  },

  toggleHeroCard(forceState) {
    if (this.wasSwiped && forceState === undefined) {
      this.wasSwiped = false;
      return;
    }

    const cardEl = document.getElementById('home-showcase-card');
    const wrapperEl = document.getElementById('home-showcase-wrapper');
    const hintEl = document.getElementById('home-showcase-tap-hint');
    const prevBtn = document.getElementById('hero-arrow-prev');
    const nextBtn = document.getElementById('hero-arrow-next');
    if (!cardEl || !wrapperEl) return;

    const isHidden = cardEl.classList.contains('hidden') || cardEl.classList.contains('opacity-0');
    const show = forceState !== undefined ? forceState : isHidden;

    if (show) {
      // 1. Picture zooms out into original size (scale 1) and moves up into original top position
      wrapperEl.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      wrapperEl.style.transform = 'translateY(0px) rotate(0deg) scale(1)';

      if (hintEl) {
        hintEl.classList.add('opacity-0', 'scale-75', 'pointer-events-none');
        setTimeout(() => hintEl.classList.add('hidden'), 250);
      }

      // Hide navigation arrows when card opens
      if (prevBtn) prevBtn.classList.add('opacity-0', 'pointer-events-none', 'scale-75');
      if (nextBtn) nextBtn.classList.add('opacity-0', 'pointer-events-none', 'scale-75');

      // 2. Then content pops out into exact slot of badge & webp
      cardEl.classList.remove('hidden');
      setTimeout(() => {
        cardEl.classList.remove('opacity-0', 'pointer-events-none', 'scale-90', 'translate-y-8');
        cardEl.classList.add('opacity-100', 'pointer-events-auto', 'scale-100', 'translate-y-0');
      }, 100);

    } else {
      // 1. Content pops down first
      cardEl.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100', 'translate-y-0');
      cardEl.classList.add('opacity-0', 'pointer-events-none', 'scale-90', 'translate-y-8');
      setTimeout(() => cardEl.classList.add('hidden'), 350);

      // 2. Picture returns to resting centered state & restore arrows and badge
      setTimeout(() => {
        wrapperEl.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        wrapperEl.style.transform = 'translateY(12px) rotate(0deg) scale(1.08)';
        if (hintEl) {
          hintEl.classList.remove('hidden');
          setTimeout(() => {
            hintEl.classList.remove('opacity-0', 'scale-75');
          }, 50);
        }

        // Reappear arrows
        if (prevBtn) {
          prevBtn.classList.remove('opacity-0', 'pointer-events-none', 'scale-75', 'opacity-30');
          prevBtn.classList.add('opacity-100', 'pointer-events-auto');
        }
        if (nextBtn) {
          nextBtn.classList.remove('opacity-0', 'pointer-events-none', 'scale-75', 'opacity-30');
          nextBtn.classList.add('opacity-100', 'pointer-events-auto');
        }
      }, 200);
    }
  },

  goToHero(index, direction) {
    if (this.isHeroAnimating) return;
    if (index === this.currentHeroIndex) return;

    if (!direction) {
      if (index === 0 && this.currentHeroIndex === this.heroShowcaseItems.length - 1) {
        direction = 'left';
      } else if (index === this.heroShowcaseItems.length - 1 && this.currentHeroIndex === 0) {
        direction = 'right';
      } else {
        direction = index > this.currentHeroIndex ? 'left' : 'right';
      }
    }

    this.isHeroAnimating = true;
    this.currentHeroIndex = index;
    const item = this.heroShowcaseItems[index];
    const prevItem = this.heroShowcaseItems[(index - 1 + this.heroShowcaseItems.length) % this.heroShowcaseItems.length];
    const nextItem = this.heroShowcaseItems[(index + 1) % this.heroShowcaseItems.length];

    const imgEl = document.getElementById('home-showcase-img');
    const wrapperEl = document.getElementById('home-showcase-wrapper');
    const cardEl = document.getElementById('home-showcase-card');
    const prevImgEl = document.getElementById('home-showcase-prev-img');
    const nextImgEl = document.getElementById('home-showcase-next-img');

    if (wrapperEl) {
      const flyOutX = direction === 'left' ? -150 : 150;
      const flyOutRotate = direction === 'left' ? -12 : 12;
      wrapperEl.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
      wrapperEl.style.transform = `translateX(${flyOutX}%) rotate(${flyOutRotate}deg) scale(0.88)`;
    }

    setTimeout(() => {
      if (imgEl) {
        imgEl.src = item.image;
        imgEl.alt = item.title;
      }
      if (prevImgEl) prevImgEl.src = prevItem.image;
      if (nextImgEl) nextImgEl.src = nextItem.image;

      if (wrapperEl) {
        const flyInX = direction === 'left' ? 150 : -150;
        const flyInRotate = direction === 'left' ? 12 : -12;
        wrapperEl.style.transition = 'none';
        wrapperEl.style.transform = `translateX(${flyInX}%) rotate(${flyInRotate}deg) scale(0.88)`;
        
        void wrapperEl.offsetWidth;

        const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
        const targetTransform = isCardOpen 
          ? 'translateX(0px) translateY(0px) rotate(0deg) scale(1)'
          : 'translateX(0px) translateY(12px) rotate(0deg) scale(1.08)';
        wrapperEl.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)';
        wrapperEl.style.transform = targetTransform;
      }

      document.querySelectorAll('.hero-dot').forEach((dot, idx) => {
        if (idx === index) {
          dot.classList.add('bg-white', 'w-6');
          dot.classList.remove('bg-white/40', 'w-2');
        } else {
          dot.classList.remove('bg-white', 'w-6');
          dot.classList.add('bg-white/40', 'w-2');
        }
      });

      const prevBtn = document.getElementById('hero-arrow-prev');
      const nextBtn = document.getElementById('hero-arrow-next');
      if (prevBtn) {
        prevBtn.classList.remove('opacity-30', 'pointer-events-none');
        prevBtn.classList.add('opacity-100', 'pointer-events-auto');
      }
      if (nextBtn) {
        nextBtn.classList.remove('opacity-30', 'pointer-events-none');
        nextBtn.classList.add('opacity-100', 'pointer-events-auto');
      }

      setTimeout(() => {
        this.isHeroAnimating = false;
      }, 220);
    }, 180);
  },

  initHeroSwipe() {
    const hero = document.getElementById('hero-showcase-carousel');
    if (!hero || hero.dataset.swipeInitialized) return;
    hero.dataset.swipeInitialized = 'true';

    // Preload hero showcase images into browser memory
    if (this.heroShowcaseItems && Array.isArray(this.heroShowcaseItems)) {
      this.heroShowcaseItems.forEach(item => {
        if (item && item.image) {
          const preImg = new Image();
          preImg.src = item.image;
        }
      });
    }

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isSwiping = false;
    let startTime = 0;

    const resetWrapperPosition = () => {
      const wrapperEl = document.getElementById('home-showcase-wrapper');
      const cardEl = document.getElementById('home-showcase-card');
      if (wrapperEl) {
        const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
        const targetTransform = isCardOpen 
          ? 'translateX(0px) translateY(0px) rotate(0deg) scale(1)'
          : 'translateX(0px) translateY(12px) rotate(0deg) scale(1.08)';
        wrapperEl.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        wrapperEl.style.transform = targetTransform;
      }
    };

    const onTouchStart = (clientX, clientY) => {
      if (this.isHeroAnimating) return;
      const cardEl = document.getElementById('home-showcase-card');
      const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
      if (isCardOpen) return;

      startX = clientX;
      startY = clientY;
      currentX = clientX;
      currentY = clientY;
      startTime = Date.now();
      isSwiping = true;
    };

    const onTouchMove = (clientX, clientY) => {
      if (!isSwiping || this.isHeroAnimating) return;
      currentX = clientX;
      currentY = clientY;
      const dx = currentX - startX;
      const dy = currentY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      
      const wrapperEl = document.getElementById('home-showcase-wrapper');
      const cardEl = document.getElementById('home-showcase-card');
      if (wrapperEl) {
        if (absDx > 5 || absDy > 5) {
          this.wasSwiped = true;
        }
        const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');
        const baseTranslateY = isCardOpen ? 0 : 12;
        const baseScale = isCardOpen ? 1.0 : 1.08;

        if (absDy > absDx * 1.5) {
          // Dominant vertical drag tracking
          const currentYOffset = Math.max(-50, Math.min(80, baseTranslateY + dy));
          wrapperEl.style.transition = 'none';
          wrapperEl.style.transform = `translateX(0px) translateY(${currentYOffset}px) scale(${baseScale})`;
        } else if (absDx > absDy * 1.25 && !isCardOpen) {
          // Dominant horizontal drag tracking ONLY when card is closed
          const rotate = dx * 0.05;
          const currentScale = Math.max(0.9, baseScale - (absDx * 0.0008));
          wrapperEl.style.transition = 'none';
          wrapperEl.style.transform = `translateX(${dx}px) translateY(${baseTranslateY}px) rotate(${rotate}deg) scale(${currentScale})`;
        }
      }
    };

    const onTouchEnd = () => {
      if (!isSwiping) return;
      isSwiping = false;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      const absDx = Math.abs(deltaX);
      const absDy = Math.abs(deltaY);
      const elapsedTime = Date.now() - startTime;

      const cardEl = document.getElementById('home-showcase-card');
      const isCardOpen = cardEl && !cardEl.classList.contains('opacity-0');

      if (absDx > 5 || absDy > 5) {
        this.wasSwiped = true;
        setTimeout(() => { this.wasSwiped = false; }, 200);
      }

      if (absDy > absDx * 2.5 && absDy > 30) {
        // Dominant Vertical Swipe: Toggle Card
        this.wasSwiped = false;
        if (deltaY < -20) {
          this.toggleHeroCard(true);
        } else if (deltaY > 20) {
          this.toggleHeroCard(false);
        } else {
          resetWrapperPosition();
        }
      } else if (absDx > absDy * 1.25 && !isCardOpen && (absDx >= 35 || (absDx > 15 && elapsedTime < 300))) {
        // Dominant Horizontal Swipe: Switch Slides
        if (deltaX < 0) {
          this.nextHero();
        } else if (deltaX > 0) {
          this.prevHero();
        } else {
          resetWrapperPosition();
        }
      } else {
        // Snap back to resting position
        resetWrapperPosition();
      }
    };

    const onCancel = () => {
      if (isSwiping) {
        isSwiping = false;
        resetWrapperPosition();
      }
    };

    // Mobile touch listeners with continuous coordinate tracking
    hero.addEventListener('touchstart', (e) => {
      if (e.target && (e.target.closest('button') || e.target.closest('#featured-tenants-list') || e.target.closest('#home-showcase-card'))) return;
      if (e.touches && e.touches.length > 0) {
        onTouchStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    hero.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        onTouchMove(clientX, clientY);

        if (isSwiping) {
          const dx = Math.abs(clientX - startX);
          const dy = Math.abs(clientY - startY);
          // Only prevent default browser scroll when dragging horizontally on carousel
          if (dx > dy * 1.25 && dx > 8 && e.cancelable) {
            e.preventDefault();
          }
        }
      }
    }, { passive: false });

    hero.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        currentX = e.changedTouches[0].clientX;
        currentY = e.changedTouches[0].clientY;
      }
      onTouchEnd();
    }, { passive: true });

    hero.addEventListener('touchcancel', () => {
      onCancel();
    }, { passive: true });

    // Desktop pointer / mouse listeners (strictly mouse only to prevent touch event duplication)
    hero.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.target && (e.target.closest('button') || e.target.closest('#featured-tenants-list') || e.target.closest('#home-showcase-card'))) return;
      onTouchStart(e.clientX, e.clientY);
    });

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      onTouchMove(e.clientX, e.clientY);
    });

    hero.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      onTouchEnd();
    });

    hero.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      onTouchEnd();
    });
  },

  // ==========================================
  // VIEW: DISCOVER / EXPLORE & TAPAU
  // ==========================================
  renderDiscover() {
    // Populate the featured tenants list inside the hero card
    this.renderTapauView();
    // Ensure carousel images are reset to slide 0 on every visit
    const imgEl = document.getElementById('home-showcase-img');
    const prevImgEl = document.getElementById('home-showcase-prev-img');
    const nextImgEl = document.getElementById('home-showcase-next-img');
    const items = this.heroShowcaseItems;
    if (imgEl && items && items.length > 0) {
      const cur = this.currentHeroIndex;
      imgEl.src = items[cur].image;
      prevImgEl && (prevImgEl.src = items[(cur - 1 + items.length) % items.length].image);
      nextImgEl && (nextImgEl.src = items[(cur + 1) % items.length].image);
    }
    // Sync pagination dots with current slide
    document.querySelectorAll('.hero-dot').forEach((dot, idx) => {
      if (idx === this.currentHeroIndex) {
        dot.classList.add('bg-white', 'w-6');
        dot.classList.remove('bg-white/40', 'w-2');
      } else {
        dot.classList.remove('bg-white', 'w-6');
        dot.classList.add('bg-white/40', 'w-2');
      }
    });
  },

  // ==========================================
  // VIEW: MERCHANT MENU & DISHES
  // ==========================================
  activeMenuCategory: 'All',

  setOrderTypeFromMenu(type) {
    store.orderType = 'tapau';
    store.save('tapau_ordertype', 'tapau');
    this.updateMenuOrderTypeButtons();
    this.updateCartBar();
    AudioEngine.playPop();
    Haptic.trigger(30);
  },

  updateMenuOrderTypeButtons() {
    const btnTapau = document.getElementById('menu-action-btn-tapau');
    if (!btnTapau) return;

    const merchant = store.getMerchant();
    const custom = merchant.customization || {};
    let radius = '9999px';
    if (custom.buttonStyle === 'rounded') radius = '12px';
    else if (custom.buttonStyle === 'square') radius = '4px';

    const atm = custom.atmosphere || 'kopitiam-marble';
    const atmosphereColorMap = {
      'kopitiam-marble':     '#2d6a4f',
      'industrial-terrazzo': '#d97706',
      'warm-woodgrain':      '#b45309',
      'dark-neon':           '#00f2fe'
    };
    const primaryColor = atmosphereColorMap[atm] || atmosphereColorMap['kopitiam-marble'];
    const textColor = atm === 'dark-neon' ? '#000000' : '#ffffff';

    btnTapau.style.borderRadius = radius;
    btnTapau.style.backgroundColor = primaryColor;
    btnTapau.style.color = textColor;
    btnTapau.className = 'w-full py-2.5 px-4 font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 ring-2 ring-white/40';
  },

  menuSearchQuery: '',

  filterMenuDishes(query) {
    this.menuSearchQuery = (query || '').trim().toLowerCase();
    this.renderMenu();
  },

  quickAddToCart(dishId) {
    const merchant = store.getMerchant();
    const custom = merchant ? (merchant.customization || {}) : {};
    if (custom.isOpen === false || (merchant && merchant.isOpen === false)) {
      this.showToast('Kitchen is currently paused. Orders are temporarily disabled.');
      return;
    }
    const dish = merchant ? merchant.menu.find(d => d.id === dishId) : null;
    if (!dish) return;

    store.addToCart({
      dishId: dish.id,
      name: dish.name,
      image: dish.image,
      unitPrice: dish.price,
      quantity: 1,
      variantName: '',
      spiceLevel: '',
      addOns: [],
      notes: ''
    });

    AudioEngine.playPop();
    Haptic.trigger(30);
    this.renderMenu();
    this.updateCartBar();
  },

  quickRemoveFromCart(dishId) {
    const itemIndex = store.cart.findIndex(c => c.dishId === dishId);
    if (itemIndex > -1) {
      if (store.cart[itemIndex].quantity > 1) {
        store.cart[itemIndex].quantity -= 1;
      } else {
        store.cart.splice(itemIndex, 1);
      }
      store.save('tapau_cart', store.cart);
      AudioEngine.playPop();
      Haptic.trigger(20);
      this.renderMenu();
      this.updateCartBar();
    }
  },

  renderMenu() {
    // getMerchant() already merges saved customization from localStorage
    const merchant = store.getMerchant();
    const custom = merchant.customization || {};

    this.applyCustomization(custom);

    const coverBanner = document.getElementById('menu-cover-banner');
    const headerTitle = document.getElementById('menu-merchant-title');
    const headerDesc = document.getElementById('menu-merchant-desc');
    const headerAvatar = document.getElementById('menu-merchant-avatar');

    if (coverBanner) {
      const coverImg = custom.coverUrl || merchant.cover || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200';
      coverBanner.style.backgroundImage = `url('${coverImg}')`;
    }
    if (headerTitle) headerTitle.textContent = custom.storeName || merchant.name;
    if (headerDesc) headerDesc.textContent = custom.tagline || 'Authentic Malaysian street food, delivered fresh & hot.';
    if (headerAvatar) {
      headerAvatar.onerror = function() {
        this.onerror = null;
        this.src = './icons/tapau-logo.png';
      };
      headerAvatar.src = custom.logoUrl || merchant.image || './icons/tapau-logo.png';
    }

    this.updateMenuOrderTypeButtons();

    // Render category chips (All, Starters, Mains, Noodles, Drinks, etc.)
    const catContainer = document.getElementById('menu-category-chips');
    if (catContainer) {
      const uniqueCats = Array.from(new Set(merchant.menu.map(d => d.category).filter(Boolean)));
      const combinedCats = Array.from(new Set([...(merchant.categories || []), ...uniqueCats]));
      const allCategories = ['All', ...combinedCats];
      catContainer.innerHTML = allCategories.map(cat => {
        const isActive = (this.activeMenuCategory || 'All') === cat;
        return `
          <button onclick="UI.selectMenuCategory('${cat}')" style="border-radius: var(--btn-radius, 9999px);" class="whitespace-nowrap px-4 py-2 font-bold text-xs transition-all active:scale-95 shadow-sm ${isActive ? 'bg-primary text-white shadow-md' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}">
            ${cat}
          </button>
        `;
      }).join('');
    }

    // Render menu items grouped or filtered
    const listContainer = document.getElementById('menu-items-container');
    if (!listContainer) return;

    const isGridView = (custom.menuLayout !== 'list');

    let displayedDishes = [...merchant.menu];
    if (this.activeMenuCategory && this.activeMenuCategory !== 'All') {
      displayedDishes = displayedDishes.filter(item => item.category === this.activeMenuCategory);
    }
    if (this.menuSearchQuery) {
      displayedDishes = displayedDishes.filter(item => 
        item.name.toLowerCase().includes(this.menuSearchQuery) || 
        (item.description && item.description.toLowerCase().includes(this.menuSearchQuery))
      );
    }

    // Sort bestsellers first if configured
    if (custom.bestsellersFirst !== false) {
      displayedDishes.sort((a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0));
    }

    if (displayedDishes.length === 0) {
      const isFiltered = !!(this.menuSearchQuery || (this.activeMenuCategory && this.activeMenuCategory !== 'All'));
      const isPaused = this.isKitchenPaused(merchant);
      const pausedBannerHtml = isPaused ? `
        <div class="p-3.5 mb-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 shadow-xs animate-fade-in">
          <span class="material-symbols-outlined text-rose-600 text-2xl shrink-0">pause_circle</span>
          <div>
            <h4 class="font-black text-xs uppercase tracking-wider text-rose-900">Kitchen Paused</h4>
            <p class="text-[11px] text-rose-700 font-medium">This store is currently not taking new orders. You can browse the menu.</p>
          </div>
        </div>
      ` : '';
      listContainer.innerHTML = pausedBannerHtml + `
        <div class="py-12 text-center text-on-surface-variant flex flex-col items-center space-y-2">
          <div class="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-primary mb-1">
            <span class="material-symbols-outlined text-3xl">${isFiltered ? 'search_off' : 'restaurant_menu'}</span>
          </div>
          <p class="font-extrabold text-sm text-on-surface">${isFiltered ? `No dishes match "${this.menuSearchQuery || this.activeMenuCategory}"` : 'Menu Coming Soon'}</p>
          <p class="text-xs text-stone-500 max-w-xs">${isFiltered ? 'Try searching for a different dish name or category.' : 'This merchant has not added menu items yet. Check back soon!'}</p>
        </div>
      `;
      return;
    }

    const isPaused = this.isKitchenPaused(merchant);
    const pausedBannerHtml = isPaused ? `
      <div class="p-3.5 mb-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 shadow-xs animate-fade-in">
        <span class="material-symbols-outlined text-rose-600 text-2xl shrink-0">pause_circle</span>
        <div>
          <h4 class="font-black text-xs uppercase tracking-wider text-rose-900">Kitchen Paused</h4>
          <p class="text-[11px] text-rose-700 font-medium">This store is currently not taking new orders. You can browse the menu.</p>
        </div>
      </div>
    ` : '';

    if (isGridView) {
      listContainer.innerHTML = pausedBannerHtml + `
        <div class="grid grid-cols-2 gap-3 pt-1">
          ${displayedDishes.map(dish => this.renderDishCard(dish, true)).join('')}
        </div>
      `;
    } else {
      listContainer.innerHTML = pausedBannerHtml + `
        <div class="grid grid-cols-1 gap-3.5 pt-1">
          ${displayedDishes.map(dish => this.renderDishCard(dish, false)).join('')}
        </div>
      `;
    }
  },

  selectMenuCategory(cat) {
    this.activeMenuCategory = cat;
    AudioEngine.playPop();
    this.renderMenu();
  },

  renderDishCard(dish, isGridView = true) {
    const isFav = store.favorites.includes(dish.id);
    const isPaused = this.isKitchenPaused();
    const inStock = dish.inStock !== false && !isPaused;
    const cartItems = store.cart.filter(c => c.dishId === dish.id);
    const totalCartQty = cartItems.reduce((s, c) => s + c.quantity, 0);
    const hasVariants = (dish.variants && dish.variants.length > 0) || (dish.addOns && dish.addOns.length > 0);
    const cardOnClick = isPaused
      ? "UI.showToast('Kitchen is currently paused. Orders are temporarily disabled.')"
      : (inStock ? `UI.openCustomizer('${dish.id}')` : '');

    if (isGridView) {
      return `
        <div class="bg-surface-container-lowest rounded-2xl p-2.5 shadow-sm border border-outline-variant/15 flex flex-col justify-between relative overflow-hidden transition-all duration-200 hover:shadow-md ${inStock ? 'cursor-pointer' : 'opacity-65'}" onclick="${cardOnClick}">
          <!-- Dish Image -->
          <div class="w-full h-32 rounded-xl overflow-hidden relative bg-surface-container ${inStock ? '' : 'grayscale'}">
            <img src="${dish.image || './icons/tapau-logo.png'}" alt="${dish.name}" class="w-full h-full object-cover transform hover:scale-105 transition-transform duration-300" onerror="this.onerror=null; this.src='./icons/tapau-logo.png';" />
            <button onclick="event.stopPropagation(); UI.toggleFavDish('${dish.id}')" aria-label="Favorite dish" class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center text-rose-500 active:scale-75 transition-transform">
              <span class="material-symbols-outlined text-[16px] ${isFav ? 'fill' : ''}">favorite</span>
            </button>
            ${!inStock ? `
              <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span class="px-2 py-0.5 rounded bg-error text-white text-[10px] font-black uppercase tracking-wider">${isPaused ? 'Kitchen Paused' : 'Sold Out'}</span>
              </div>
            ` : ''}
          </div>

          <!-- Dish Info -->
          <div class="mt-2.5 flex flex-col flex-1 justify-between gap-2">
            <h3 class="font-bold text-on-surface text-xs leading-snug line-clamp-1">${dish.name}</h3>

            <div class="flex items-center justify-between">
              <span class="font-black text-xs text-primary">RM ${dish.price.toFixed(2)}</span>
              ${isPaused ? `
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800">
                  PAUSED
                </span>
              ` : (inStock ? (
                totalCartQty > 0 ? `
                  <div class="flex items-center gap-1 bg-primary text-white rounded-full px-2 py-0.5 shadow-xs" onclick="event.stopPropagation()">
                    <button onclick="UI.quickRemoveFromCart('${dish.id}')" class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs active:scale-75">-</button>
                    <span class="font-extrabold text-[11px] px-1">${totalCartQty}</span>
                    <button onclick="UI.quickAddToCart('${dish.id}')" class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs active:scale-75">+</button>
                  </div>
                ` : `
                  <button onclick="event.stopPropagation(); ${hasVariants ? `UI.openCustomizer('${dish.id}')` : `UI.quickAddToCart('${dish.id}')`}" class="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-black shadow-xs active:scale-95 flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[13px]">add</span>
                    <span>${hasVariants ? 'Options' : 'Add'}</span>
                  </button>
                `
              ) : `
                <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800">
                  86 OUT
                </span>
              `)}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-surface-container-lowest rounded-2xl p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-outline-variant/15 flex gap-3.5 relative overflow-hidden transition-all duration-200 hover:shadow-md ${inStock ? '' : 'opacity-65'}">
        <!-- Dish Details -->
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-1">
              <h3 class="font-bold text-on-surface text-[15px] leading-snug line-clamp-1">${dish.name}</h3>
              ${dish.bestseller ? `<span class="shrink-0 px-2 py-0.5 bg-secondary-container text-on-secondary-container text-[10px] font-bold rounded-md uppercase tracking-wider">Bestseller</span>` : ''}
              ${isPaused ? `<span class="shrink-0 px-2 py-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-md uppercase tracking-wider">Kitchen Paused</span>` : (!inStock ? `<span class="shrink-0 px-2 py-0.5 bg-error text-white text-[10px] font-bold rounded-md uppercase tracking-wider">Sold Out</span>` : '')}
            </div>
            <p class="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">${dish.description || ''}</p>
          </div>

          <div class="mt-3 flex items-center justify-between">
            <div class="flex items-baseline gap-1">
              <span class="text-xs font-bold text-primary">RM</span>
              <span class="font-bold text-base text-on-surface">${dish.price.toFixed(2)}</span>
            </div>

            ${isPaused ? `
              <button onclick="event.stopPropagation(); UI.showToast('Kitchen is currently paused. Orders are temporarily disabled.');" class="h-9 px-3.5 rounded-full bg-stone-200 text-stone-600 font-bold text-xs flex items-center gap-1.5 opacity-80 cursor-pointer">
                <span>Closed</span>
              </button>
            ` : (inStock ? `
              <button onclick="UI.openCustomizer('${dish.id}')" class="h-9 px-3.5 rounded-full bg-primary text-on-primary font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-90 transition-transform">
                <span>Add</span>
                <span class="material-symbols-outlined text-[16px] font-bold">add</span>
              </button>
            ` : `
              <span class="px-3 py-1 rounded-full bg-error/10 text-error text-xs font-bold">Sold Out</span>
            `)}
          </div>
        </div>

        <!-- Dish Image & Favorite Button -->
        <div class="w-24 h-24 rounded-xl overflow-hidden shrink-0 relative bg-surface-container cursor-pointer ${inStock ? '' : 'grayscale'}" onclick="${cardOnClick}">
          <img src="${dish.image || './icons/tapau-logo.png'}" alt="${dish.name}" class="w-full h-full object-cover transform hover:scale-105 transition-transform duration-300" onerror="this.onerror=null; this.src='./icons/tapau-logo.png';" />
          <button onclick="event.stopPropagation(); UI.toggleFavDish('${dish.id}')" aria-label="Favorite dish" class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center text-rose-500 active:scale-75 transition-transform">
            <span class="material-symbols-outlined text-[16px] ${isFav ? 'fill' : ''}">favorite</span>
          </button>
        </div>
      </div>
    `;
  },

  scrollToCategory(cat) {
    const el = document.getElementById(`cat-section-${cat.replace(/\s+/g, '-')}`);
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 130;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  },

  toggleFavDish(dishId) {
    store.toggleFavorite(dishId);
    this.renderMenu();
  },

  // ==========================================
  // MODAL: ITEM CUSTOMIZER (Modifiers, Spice, Add-ons)
  // ==========================================
  openCustomizer(dishId) {
    const merchant = store.getMerchant();
    if (this.isKitchenPaused(merchant)) {
      this.showToast('Kitchen is currently paused. Orders are temporarily disabled.');
      AudioEngine.playPop();
      return;
    }
    const dish = merchant.menu.find(d => d.id === dishId);
    if (!dish) return;

    this.activeCustomizingDish = dish;
    this.selectedVariantIdx = 0;
    this.selectedSpice = dish.spiceLevels && dish.spiceLevels[0] ? dish.spiceLevels[0] : '';
    this.selectedAddOns.clear();
    this.itemModalQty = 1;

    // Set dish image, title, base price, description
    const imgEl = document.getElementById('customizer-img');
    if (imgEl) {
      imgEl.onerror = function() { this.onerror = null; this.src = './icons/tapau-logo.png'; };
      imgEl.src = (dish.image && dish.image.trim() && dish.image !== 'undefined') ? dish.image : './icons/tapau-logo.png';
      imgEl.alt = dish.name || 'Dish';
    }
    document.getElementById('customizer-title').textContent = dish.name || '';
    
    const descEl = document.getElementById('customizer-desc');
    if (descEl) {
      const hasDesc = dish.description && dish.description.trim() !== '';
      descEl.textContent = hasDesc ? dish.description : 'Freshly prepared to order with quality ingredients.';
      descEl.className = 'text-xs text-on-surface-variant mt-1 leading-relaxed' + (hasDesc ? '' : ' italic opacity-70');
    }

    // Render Variants (e.g. Chicken vs Beef)
    const variantsContainer = document.getElementById('customizer-variants-list');
    if (dish.variants && dish.variants.length > 0) {
      document.getElementById('customizer-variants-section').classList.remove('hidden');
      variantsContainer.innerHTML = dish.variants.map((v, idx) => `
        <label class="flex items-center justify-between p-3 rounded-xl border border-outline-variant/30 cursor-pointer transition-colors hover:bg-surface-container-low has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <div class="flex items-center gap-3">
            <input type="radio" name="variant_opt" value="${idx}" ${idx === 0 ? 'checked' : ''} onchange="UI.selectVariant(${idx})" class="w-4 h-4 text-primary accent-primary" />
            <span class="text-xs font-semibold text-on-surface">${v.name}</span>
          </div>
          <span class="text-xs font-bold ${v.priceDelta > 0 ? 'text-primary' : 'text-on-surface-variant'}">${v.priceDelta > 0 ? '+ RM ' + v.priceDelta.toFixed(2) : 'Included'}</span>
        </label>
      `).join('');
    } else {
      document.getElementById('customizer-variants-section').classList.add('hidden');
    }

    // Render Spice Levels
    const spiceContainer = document.getElementById('customizer-spice-list');
    if (dish.spiceLevels && dish.spiceLevels.length > 0) {
      document.getElementById('customizer-spice-section').classList.remove('hidden');
      spiceContainer.innerHTML = dish.spiceLevels.map((sp, idx) => `
        <button type="button" onclick="UI.selectSpice('${sp}')" class="px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between ${sp === this.selectedSpice ? 'border-primary bg-primary text-white' : 'border-outline-variant/30 bg-surface text-on-surface hover:bg-surface-container-low'}">
          <span>${sp}</span>
          ${sp === this.selectedSpice ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
        </button>
      `).join('');
    } else {
      document.getElementById('customizer-spice-section').classList.add('hidden');
    }

    // Render Add-ons
    const addOnContainer = document.getElementById('customizer-addons-list');
    if (dish.addOns && dish.addOns.length > 0) {
      document.getElementById('customizer-addons-section').classList.remove('hidden');
      addOnContainer.innerHTML = dish.addOns.map(add => `
        <label class="flex items-center justify-between p-3 rounded-xl border border-outline-variant/30 cursor-pointer transition-colors hover:bg-surface-container-low has-[:checked]:border-secondary has-[:checked]:bg-secondary-container/10">
          <div class="flex items-center gap-3">
            <input type="checkbox" onchange="UI.toggleAddOn('${add.id}', ${add.price})" class="w-4 h-4 text-secondary accent-secondary rounded" />
            <span class="text-xs font-semibold text-on-surface">${add.name}</span>
          </div>
          <span class="text-xs font-bold text-secondary">+ RM ${add.price.toFixed(2)}</span>
        </label>
      `).join('');
    } else {
      document.getElementById('customizer-addons-section').classList.add('hidden');
    }

    // Reset notes
    const notesInput = document.getElementById('customizer-notes');
    if (notesInput) notesInput.value = '';

    this.updateCustomizerPrice();

    // Show modal
    const modal = document.getElementById('customizer-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }
  },

  selectVariant(idx) {
    this.selectedVariantIdx = idx;
    this.updateCustomizerPrice();
  },

  selectSpice(spice) {
    this.selectedSpice = spice;
    const dish = this.activeCustomizingDish;
    const spiceContainer = document.getElementById('customizer-spice-list');
    if (dish && spiceContainer) {
      spiceContainer.innerHTML = dish.spiceLevels.map((sp) => `
        <button type="button" onclick="UI.selectSpice('${sp}')" class="px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between ${sp === this.selectedSpice ? 'border-primary bg-primary text-white' : 'border-outline-variant/30 bg-surface text-on-surface hover:bg-surface-container-low'}">
          <span>${sp}</span>
          ${sp === this.selectedSpice ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
        </button>
      `).join('');
    }
    this.updateCustomizerPrice();
  },

  toggleAddOn(addOnId, price) {
    if (this.selectedAddOns.has(addOnId)) {
      this.selectedAddOns.delete(addOnId);
    } else {
      this.selectedAddOns.add(addOnId);
    }
    this.updateCustomizerPrice();
  },

  getCustomizerUnitPrice() {
    if (!this.activeCustomizingDish) return 0;
    let unit = this.activeCustomizingDish.price;
    if (this.activeCustomizingDish.variants && this.activeCustomizingDish.variants[this.selectedVariantIdx]) {
      unit += this.activeCustomizingDish.variants[this.selectedVariantIdx].priceDelta;
    }
    if (this.activeCustomizingDish.addOns) {
      this.activeCustomizingDish.addOns.forEach(add => {
        if (this.selectedAddOns.has(add.id)) {
          unit += add.price;
        }
      });
    }
    return unit;
  },

  updateCustomizerPrice() {
    const unitPrice = this.getCustomizerUnitPrice();
    const totalPrice = unitPrice * this.itemModalQty;

    document.getElementById('customizer-qty-display').textContent = this.itemModalQty;
    document.getElementById('customizer-total-price-text').textContent = `RM ${totalPrice.toFixed(2)}`;
  },

  closeCustomizer() {
    const modal = document.getElementById('customizer-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    this.activeCustomizingDish = null;
  },

  confirmAddToCart() {
    if (this.isKitchenPaused()) {
      this.showToast('Kitchen is currently paused. Orders are temporarily disabled.');
      this.closeCustomizer();
      return;
    }
    if (!this.activeCustomizingDish) return;
    const dish = this.activeCustomizingDish;
    const variantObj = dish.variants ? dish.variants[this.selectedVariantIdx] : null;
    const addOnNames = [];
    if (dish.addOns) {
      dish.addOns.forEach(a => {
        if (this.selectedAddOns.has(a.id)) {
          addOnNames.push(`${a.name} (+RM ${a.price.toFixed(2)})`);
        }
      });
    }

    const notes = document.getElementById('customizer-notes')?.value.trim() || '';

    const cartItem = {
      dishId: dish.id,
      name: dish.name,
      image: dish.image,
      unitPrice: this.getCustomizerUnitPrice(),
      quantity: this.itemModalQty,
      variantName: variantObj ? variantObj.name : '',
      spiceLevel: this.selectedSpice,
      addOns: addOnNames,
      notes
    };

    store.addToCart(cartItem);
    this.triggerFlyingBadge();
    this.closeCustomizer();
    this.updateCartBar();
  },

  triggerFlyingBadge() {
    const bar = document.getElementById('floating-cart-bar');
    if (!bar) return;
    bar.classList.add('scale-105');
    setTimeout(() => bar.classList.remove('scale-105'), 200);
  },

  // ==========================================
  // FLOATING CART BAR & CART DRAWER
  // ==========================================
  updateCartBar() {
    const bar = document.getElementById('floating-cart-bar');
    const countEl = document.getElementById('floating-cart-count');
    const badgeEl = document.getElementById('floating-cart-count-badge');
    const totalEl = document.getElementById('floating-cart-total');
    if (!bar || !countEl || !totalEl) return;

    const count = store.getCartCount();
    const total = store.getCartTotal();

    // Global Header Cart Icon Badge
    const globalCartBadge = document.getElementById('global-cart-count-badge');
    const globalCartTotal = document.getElementById('global-cart-total-text');
    if (globalCartBadge) {
      if (count > 0) {
        globalCartBadge.textContent = count;
        globalCartBadge.classList.remove('hidden');
        globalCartBadge.classList.add('flex');
      } else {
        globalCartBadge.classList.add('hidden');
        globalCartBadge.classList.remove('flex');
      }
    }
    if (globalCartTotal) {
      globalCartTotal.textContent = `RM ${total.toFixed(2)}`;
    }

    if (badgeEl) {
      badgeEl.textContent = count;
    }

    if (count > 0 && store.currentView !== 'orders' && store.currentView !== 'kds') {
      const modeText = 'Takeaway';
      countEl.textContent = `${count} ${count === 1 ? 'Item' : 'Items'} • ${modeText}`;
      totalEl.textContent = `RM ${total.toFixed(2)}`;
      bar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
      bar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    } else {
      bar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
      bar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }
  },

  openCartDrawer() {
    this.renderPaymentOptions();
    this.renderCartItems();
    const drawer = document.getElementById('cart-drawer');
    if (drawer) {
      drawer.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }
  },

  closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    this.updateCartBar();
  },

  togglePromoInput() {
    const wrapper = document.getElementById('promo-input-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('hidden');
      if (!wrapper.classList.contains('hidden')) {
        const input = document.getElementById('promo-input');
        if (input) {
          input.focus();
          setTimeout(() => {
            input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }
      }
    }
  },

  renderPaymentOptions() {
    const container = document.getElementById('checkout-payment-options-container');
    if (!container) return;

    const merchant = store.getMerchant();
    const paySettings = store.load('tapau_payment_settings_' + (merchant ? merchant.id : '')) || store.load('tapau_payment_settings') || {};

    const isEnabled = (key) => {
      if (!paySettings || Object.keys(paySettings).length === 0) return true;
      const aliases = [key, key + '_enabled', 'pay_' + key + '_enable', key + '_duitnow_enabled', 'pay_' + key + '_enabled'];
      for (const a of aliases) {
        if (paySettings[a] !== undefined && paySettings[a] !== null) {
          const val = paySettings[a];
          if (typeof val === 'boolean') return val;
          if (typeof val === 'object') return val.enabled !== false;
        }
      }
      return true;
    };

    let options = [
      { id: 'tng', value: 'Touch \'n Go eWallet', label: 'TnG / DuitNow', sub: 'Instant QR', bg: 'bg-blue-600', icon: 'qr_code_scanner', enabled: isEnabled('tng') },
      { id: 'grab', value: 'GrabPay', label: 'GrabPay', sub: 'Earn points', bg: 'bg-emerald-600', icon: 'wallet', enabled: isEnabled('grab') },
      { id: 'fpx', value: 'FPX Online Banking', label: 'FPX Online', sub: 'Online bank', bg: 'bg-amber-600', icon: 'account_balance', enabled: isEnabled('fpx') },
      { id: 'cash', value: 'Cash at Counter', label: 'Cash / Counter', sub: 'Pay on pickup', bg: 'bg-slate-700', icon: 'payments', enabled: isEnabled('cash') }
    ].filter(o => o.enabled);

    // Fail-safe guarantee: If all are disabled or corrupt, fallback to all 4 options
    if (options.length === 0) {
      options = [
        { id: 'tng', value: 'Touch \'n Go eWallet', label: 'TnG / DuitNow', sub: 'Instant QR', bg: 'bg-blue-600', icon: 'qr_code_scanner' },
        { id: 'grab', value: 'GrabPay', label: 'GrabPay', sub: 'Earn points', bg: 'bg-emerald-600', icon: 'wallet' },
        { id: 'fpx', value: 'FPX Online Banking', label: 'FPX Online', sub: 'Online bank', bg: 'bg-amber-600', icon: 'account_balance' },
        { id: 'cash', value: 'Cash at Counter', label: 'Cash / Counter', sub: 'Pay on pickup', bg: 'bg-slate-700', icon: 'payments' }
      ];
    }

    if (!options.some(o => o.value === store.selectedPaymentMethod)) {
      store.selectedPaymentMethod = options[0].value;
    }
    const currentSelected = store.selectedPaymentMethod;

    container.innerHTML = options.map(opt => {
      const isSelected = opt.value === currentSelected;
      return `
        <button type="button" role="radio" aria-checked="${isSelected}" onclick="UI.selectPayment('${opt.id}')" class="relative p-2.5 rounded-2xl border-2 text-left cursor-pointer transition-all active:scale-[0.96] flex items-center gap-2.5 w-full ${isSelected ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20' : 'border-outline-variant/30 bg-surface-container-low hover:border-outline-variant'}" style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;">
          <div class="w-8 h-8 rounded-xl ${opt.bg} text-white flex items-center justify-center shrink-0 shadow-xs pointer-events-none">
            <span class="material-symbols-outlined text-[18px]">${opt.icon}</span>
          </div>
          <div class="flex-1 min-w-0 pointer-events-none">
            <span class="text-xs font-black text-on-surface block truncate">${opt.label}</span>
            <span class="text-[10px] ${isSelected ? 'text-primary font-bold' : 'text-on-surface-variant font-medium'} block truncate">${opt.sub}</span>
          </div>
          <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 pointer-events-none ${isSelected ? 'border-primary bg-primary' : 'border-outline-variant/50'}">
            ${isSelected ? '<div class="w-1.5 h-1.5 rounded-full bg-white"></div>' : ''}
          </div>
          <input type="radio" name="checkout_payment" value="${opt.value}" ${isSelected ? 'checked' : ''} class="sr-only pointer-events-none" />
        </button>
      `;
    }).join('');
  },

  selectPayment(idOrValue) {
    const paymentMap = {
      tng: 'Touch \'n Go eWallet',
      'touch \'n go ewallet': 'Touch \'n Go eWallet',
      'touch n go ewallet': 'Touch \'n Go eWallet',
      grab: 'GrabPay',
      grabpay: 'GrabPay',
      fpx: 'FPX Online Banking',
      'fpx online banking': 'FPX Online Banking',
      cash: 'Cash at Counter',
      'cash at counter': 'Cash at Counter'
    };
    const key = String(idOrValue || '').trim().toLowerCase();
    store.selectedPaymentMethod = paymentMap[key] || idOrValue || 'Touch \'n Go eWallet';
    AudioEngine.playPop();
    Haptic.trigger(40);
    this.renderPaymentOptions();
  },

  renderCartItems() {
    const container = document.getElementById('cart-items-list');
    const subtotalEl = document.getElementById('cart-subtotal-val');
    const taxEl = document.getElementById('cart-tax-val');
    const packEl = document.getElementById('cart-pack-val');
    const packLabel = document.getElementById('cart-pack-label');
    const discountEl = document.getElementById('cart-discount-row');
    const discountValEl = document.getElementById('cart-discount-val');
    const totalEl = document.getElementById('cart-total-val');
    const totalBanner = document.getElementById('checkout-total-banner');
    const modeBadge = document.getElementById('checkout-badge-mode');
    const profileIndicator = document.getElementById('customer-profile-indicator');

    if (modeBadge) {
      modeBadge.textContent = '🥡 Takeaway';
    }

    if (profileIndicator) {
      const profileJson = localStorage.getItem('tapau_user_profile');
      if (profileJson) {
        const profile = JSON.parse(profileJson);
        profileIndicator.textContent = `Ordering as: ${profile.name || profile.email}`;
        profileIndicator.classList.remove('hidden');
      } else {
        profileIndicator.classList.add('hidden');
      }
    }

    // Always keep payment options in sync
    this.renderPaymentOptions();

    if (!container) return;

    const isPaused = this.isKitchenPaused();
    const confirmBtn = document.getElementById('confirm-pay-btn');
    if (confirmBtn) {
      if (isPaused || !store.cart || store.cart.length === 0) {
        confirmBtn.disabled = true;
        confirmBtn.setAttribute('aria-disabled', 'true');
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      } else {
        confirmBtn.disabled = false;
        confirmBtn.removeAttribute('aria-disabled');
        confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      }
    }

    if (!store.cart || store.cart.length === 0) {
      container.innerHTML = `
        <div class="py-10 flex flex-col items-center justify-center text-center text-on-surface-variant">
          <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-outline-variant mb-2">
            <span class="material-symbols-outlined text-4xl">shopping_basket</span>
          </div>
          <p class="font-black text-sm text-on-surface">Your basket is currently empty</p>
          <p class="text-xs text-outline mt-1 max-w-xs">Explore delicious hawker dishes and add them to your order!</p>
        </div>
      `;
      if (subtotalEl) subtotalEl.textContent = 'RM 0.00';
      if (taxEl) taxEl.textContent = 'RM 0.00';
      if (totalEl) totalEl.textContent = 'RM 0.00';
      if (totalBanner) totalBanner.textContent = 'RM 0.00';
      if (discountEl) discountEl.classList.add('hidden');
      return;
    }

    const cartListHtml = store.cart.map(item => {
      const uPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(item.price || 0);
      const q = Number(item.quantity || 1);
      return `
      <div class="bg-surface-container-low rounded-2xl p-3 flex gap-3 items-center border border-outline-variant/15 shadow-xs">
        <img src="${item.image || './icons/tapau-logo.png'}" alt="${item.name || 'Dish'}" class="w-14 h-14 rounded-xl object-cover shrink-0 bg-surface-container shadow-xs" onerror="this.onerror=null; this.src='./icons/tapau-logo.png';" />
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-1">
            <h4 class="font-black text-xs text-on-surface truncate leading-tight">${item.name}</h4>
            <span class="font-black text-xs text-primary shrink-0">RM ${(uPrice * q).toFixed(2)}</span>
          </div>
          
          <div class="text-[10px] text-on-surface-variant mt-0.5 space-y-0.5">
            ${item.variantName ? `<div>• ${item.variantName}</div>` : ''}
            ${item.spiceLevel ? `<div>• ${item.spiceLevel}</div>` : ''}
            ${item.addOns && item.addOns.length > 0 ? `<div>• ${item.addOns.join(', ')}</div>` : ''}
            ${item.notes ? `<div class="italic text-primary">"${item.notes}"</div>` : ''}
          </div>

          <div class="mt-2 flex items-center justify-between">
            <span class="text-[11px] font-semibold text-on-surface-variant">RM ${uPrice.toFixed(2)}</span>
            <div class="flex items-center gap-2 bg-surface rounded-xl px-2 py-0.5 border border-outline-variant/30 shadow-xs">
              <button onclick="UI.changeItemQty('${item.cartItemId}', -1)" aria-label="Decrease quantity" class="w-6 h-6 flex items-center justify-center text-primary active:scale-75 transition-transform font-black text-sm">-</button>
              <span class="text-xs font-black text-on-surface min-w-[16px] text-center">${q}</span>
              <button onclick="UI.changeItemQty('${item.cartItemId}', 1)" aria-label="Increase quantity" class="w-6 h-6 flex items-center justify-center text-primary active:scale-75 transition-transform font-black text-sm">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
    }).join('');

    container.innerHTML = cartListHtml;

    const subtotal = store.getCartSubtotal();
    const tax = subtotal * 0.06;
    const packaging = 0.60;
    const total = store.getCartTotal();

    if (subtotalEl) subtotalEl.textContent = `RM ${subtotal.toFixed(2)}`;
    if (taxEl) taxEl.textContent = `RM ${tax.toFixed(2)}`;
    if (packEl) packEl.textContent = `RM ${packaging.toFixed(2)}`;
    if (packLabel) packLabel.textContent = 'Takeaway Packaging';

    const discount = store.calculatePromoDiscount();
    if (discount > 0 && discountEl && discountValEl) {
      discountEl.classList.remove('hidden');
      discountValEl.textContent = `- RM ${discount.toFixed(2)} (${store.promoCode})`;
    } else if (discountEl) {
      discountEl.classList.add('hidden');
    }

    if (totalEl) totalEl.textContent = `RM ${total.toFixed(2)}`;
    if (totalBanner) totalBanner.textContent = `RM ${total.toFixed(2)}`;

    // Populate promo input placeholder/value if code active
    const promoInput = document.getElementById('promo-input');
    if (promoInput && store.promoCode && !promoInput.value) {
      promoInput.value = store.promoCode;
    }
  },

  changeItemQty(cartItemId, delta) {
    if (delta > 0 && this.isKitchenPaused()) {
      this.showToast('Kitchen is currently paused. Cannot add more items.');
      return;
    }
    store.updateCartItemQty(cartItemId, delta);
    this.renderCartItems();
    this.updateCartBar();
  },

  applyPromoCode(code) {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    store.promoCode = cleanCode;
    const input = document.getElementById('promo-input');
    if (input) input.value = cleanCode;
    AudioEngine.playPop();
    Haptic.trigger(40);
    this.renderCartItems();
    this.updateCartBar();
    this.showToast(`🎉 Voucher "${cleanCode}" applied!`);
  },

  goToCartStep(step) {
    // Retained for backward compatibility
    this.openCartDrawer();
  },

  notifyCounterArrival(orderId) {
    AudioEngine.playSuccessChime();
    Haptic.pattern([100, 50, 100]);

    const targetId = String(orderId || '').replace('#', '').trim();
    if (store && store.syncChannel) {
      store.syncChannel.postMessage({ type: 'CUSTOMER_ARRIVED', orderId: targetId });
    }

    const order = (store.activeOrders || []).find(o => 
      String(o.orderId || '').replace('#', '').trim() === targetId ||
      (o.dbId && String(o.dbId) === targetId)
    );

    if (order && order.dbId) {
      TapauCloud.emitOrderEvent(order.dbId, 'CUSTOMER_ARRIVED', 'CUSTOMER').catch(() => {});
    }

    this.showToast(`👋 Counter staff has been alerted that you have arrived for Order #${targetId}!`);
  },

  applyPromoFromBanner(code) {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    store.promoCode = cleanCode;
    const discount = store.calculatePromoDiscount();
    AudioEngine.playPop();
    Haptic.trigger(30);

    // Re-render menu to update the banner button to "✓ Applied"
    this.renderMenu();
    this.renderCartItems();
    this.updateCartBar();

    if (discount > 0) {
      this.showToast(`🎉 Voucher "${cleanCode}" applied! You get RM ${discount.toFixed(2)} off.`);
    } else {
      this.showToast(`🎉 Voucher "${cleanCode}" applied!`);
    }
  },

  handleApplyPromo() {
    const input = document.getElementById('promo-input');
    const code = input?.value.trim().toUpperCase();
    if (!code) {
      this.showToast('Please enter a promo code.');
      return;
    }

    store.promoCode = code;
    const discount = store.calculatePromoDiscount();

    if (discount > 0) {
      AudioEngine.playPop();
      Haptic.trigger(30);
      this.showToast(`🎉 Voucher "${code}" applied! You get RM ${discount.toFixed(2)} off.`);
    } else {
      this.showToast('Invalid promo code. Please check and try again.');
      store.promoCode = null;
      store.promoDiscount = 0;
    }

    this.renderMenu();
    this.renderCartItems();
    this.updateCartBar();
  },

  // ==========================================
  // MODAL: CHECKOUT & PAYMENT SIMULATION
  // ==========================================
  openCheckoutModal() {
    this.openCartDrawer();
  },

  closeCheckoutModal() {
    this.closeCartDrawer();
  },

  submitOrder() {
    if (this.isKitchenPaused()) {
      this.showToast('Kitchen is currently paused. Orders cannot be placed at this time.');
      AudioEngine.playPop();
      return;
    }
    if (!store.cart || store.cart.length === 0) {
      this.showToast('Your basket is empty. Please add dishes to order.');
      AudioEngine.playPop();
      return;
    }
    this.processPayment();
  },

  processPayment() {
    if (this.isKitchenPaused()) {
      this.showToast('Kitchen is currently paused. Orders cannot be placed at this time.');
      this.closeCartDrawer();
      return;
    }
    if (!store.cart || store.cart.length === 0) {
      this.showToast('Your basket is empty. Please add dishes to order.');
      AudioEngine.playPop();
      this.renderCartItems();
      return;
    }
    const selectedPayRadio = document.querySelector('input[name="checkout_payment"]:checked');
    const paymentMethod = selectedPayRadio ? selectedPayRadio.value : (store.selectedPaymentMethod || 'Touch \'n Go eWallet');

    const payBtn = document.getElementById('confirm-pay-btn');
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.setAttribute('aria-disabled', 'true');
      payBtn.innerHTML = `
        <div class="w-full flex items-center justify-center gap-2">
          <span class="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
          <span class="font-black text-sm">Processing Fast Payment...</span>
        </div>
      `;
    }

    setTimeout(() => {
      try {
        if (this.isKitchenPaused()) {
          this.showToast('Kitchen is currently paused. Orders cannot be placed at this time.');
          if (payBtn) {
            payBtn.disabled = false;
            this.renderCartItems();
          }
          this.closeCartDrawer();
          return;
        }

        if (!store.cart || store.cart.length === 0) {
          this.showToast('Your basket is empty. Please add dishes to order.');
          if (payBtn) {
            payBtn.disabled = false;
            this.renderCartItems();
          }
          return;
        }

        const newOrder = store.createOrder(paymentMethod);
        AudioEngine.playSuccessChime();
        Haptic.pattern([100, 50, 200]);

        if (payBtn) {
          payBtn.disabled = false;
        }

        this.closeCartDrawer();
        this.renderView('orders');
        this.highlightOrder(newOrder.orderId);
      } catch (err) {
        console.error('[Checkout] Order placement error:', err);
        this.showToast(err.message || 'Kitchen is currently paused. Orders cannot be placed.');
        if (payBtn) {
          payBtn.disabled = false;
          this.renderCartItems();
        }
        this.closeCartDrawer();
      }
    }, 900);
  },

  // ==========================================
  // VIEW: ORDERS & LIVE TRACKING
  // ==========================================
  renderOrders() {
    const container = document.getElementById('orders-list-container');
    if (!container) return;

    if (!store.activeOrders || !Array.isArray(store.activeOrders) || store.activeOrders.length === 0) {
      const reloaded = store.load('tapau_customer_orders');
      if (reloaded && Array.isArray(reloaded) && reloaded.length > 0) {
        store.activeOrders = reloaded;
      }
    }


    if (!store.activeOrders || !Array.isArray(store.activeOrders) || store.activeOrders.length === 0) {
      container.innerHTML = `
        <div class="py-16 text-center text-on-surface-variant flex flex-col items-center">
          <span class="material-symbols-outlined text-6xl text-outline-variant mb-3">receipt_long</span>
          <h3 class="font-bold text-base text-on-surface">No Orders Placed Yet</h3>
          <p class="text-xs text-outline max-w-xs mt-1">Your live order tracking and pickup receipts will show up here.</p>
          <button onclick="UI.renderView('discover')" class="mt-5 px-6 py-2.5 rounded-full bg-primary text-white font-bold text-xs shadow-md active:scale-95">
            Discover Food
          </button>
        </div>
      `;
      this.updateOrdersNavBadge();
      return;
    }

    this.updateOrdersNavBadge();

    const activeList = store.activeOrders.filter(o => o && o.status !== 'completed' && o.status !== 'cancelled');
    const pastList = store.activeOrders.filter(o => o && (o.status === 'completed' || o.status === 'cancelled'));

    let contentHtml = '';
    if (activeList.length > 0) {
      contentHtml += `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              ● Active Takeaway (${activeList.length})
            </span>
          </div>
          ${activeList.map(order => {
            try { return this.renderOrderCard(order); } catch (e) { return ''; }
          }).join('')}
        </div>
      `;
    }

    if (pastList.length > 0) {
      contentHtml += `
        <div class="space-y-3 pt-2">
          <span class="text-xs font-black uppercase tracking-wider text-outline block">
            Past Orders (${pastList.length})
          </span>
          ${pastList.map(order => {
            try { return this.renderOrderCard(order); } catch (e) { return ''; }
          }).join('')}
        </div>
      `;
    }

    container.innerHTML = contentHtml || store.activeOrders.map(order => {
      try {
        return this.renderOrderCard(order);
      } catch (err) {
        return '';
      }
    }).join('');
  },

  renderOrderCard(order) {
    if (!order) return '';
    const safeOrderId = String(order.orderId || '000').replace('#', '').trim();
    const safeStatus = String(order.status || 'received').toLowerCase();
    const isReady = safeStatus === 'ready';
    const isPrep = safeStatus === 'preparing';
    const isReceived = safeStatus === 'received' || safeStatus === 'pending';
    const isDone = safeStatus === 'completed';

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const orderTotal = typeof order.total === 'number' ? order.total : (parseFloat(order.total) || 0);
    const createdAtStr = order.createdAt ? String(order.createdAt) : Date.now().toString();
    const merchantName = order.merchantName || 'Tapau Merchant';
    const prepMins = Number(order.estimatedPrepMins) || 12;

    return `
      <div id="order-card-${safeOrderId}" class="bg-surface-container-lowest rounded-3xl p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] border border-outline-variant/20 flex flex-col gap-4 relative overflow-hidden transition-all duration-300">
        <!-- Glow accent if Ready -->
        ${isReady ? '<div class="absolute -right-12 -top-12 w-40 h-40 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>' : ''}

        <!-- Top Row: Order # & Status Badge -->
        <div class="flex items-start justify-between">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">Order Number</span>
            <span class="text-4xl font-extrabold text-primary tracking-tight">#${safeOrderId}</span>
          </div>

          <div class="text-right">
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
              isReady ? 'bg-secondary-container text-on-secondary-container animate-bounce' :
              isPrep ? 'bg-amber-100 text-amber-900' :
              isDone ? 'bg-slate-100 text-slate-700' :
              'bg-teal-50 text-teal-800'
            }">
              <span class="w-2 h-2 rounded-full ${isReady ? 'bg-secondary' : isPrep ? 'bg-amber-500 animate-ping' : 'bg-primary'}"></span>
              ${isReady ? 'READY FOR PICKUP' : isPrep ? 'Cooking in Wok' : isDone ? 'Completed' : 'Order Received'}
            </span>
            <span class="text-[11px] text-on-surface-variant block mt-1">${merchantName}</span>
          </div>
        </div>

        <!-- 3-Stage Animated Progress Tracker -->
        <div class="bg-surface-container-low rounded-2xl p-4 relative overflow-hidden">
          <div class="flex justify-between items-center relative z-10">
            <!-- Step 1: Received -->
            <div class="flex flex-col items-center gap-1.5 z-20 w-1/3">
              <div class="w-9 h-9 rounded-full ${isReceived || isPrep || isReady || isDone ? 'bg-primary text-white' : 'bg-surface-container-high text-outline'} flex items-center justify-center shadow-sm">
                <span class="material-symbols-outlined text-[18px]">receipt_long</span>
              </div>
              <span class="text-[10px] font-bold text-on-surface">Received</span>
            </div>

            <!-- Step 2: Preparing -->
            <div class="flex flex-col items-center gap-1.5 z-20 w-1/3">
              <div class="w-9 h-9 rounded-full ${isPrep || isReady || isDone ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-outline'} flex items-center justify-center shadow-sm relative">
                ${isPrep ? '<div class="absolute inset-0 bg-secondary-container rounded-full animate-ping opacity-75"></div>' : ''}
                <span class="material-symbols-outlined text-[18px] relative z-10">skillet</span>
              </div>
              <span class="text-[10px] font-bold text-on-surface">Cooking</span>
            </div>

            <!-- Step 3: Ready -->
            <div class="flex flex-col items-center gap-1.5 z-20 w-1/3">
              <div class="w-9 h-9 rounded-full ${isReady || isDone ? 'bg-emerald-600 text-white' : 'bg-surface-container-high text-outline'} flex items-center justify-center shadow-sm">
                <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
              </div>
              <span class="text-[10px] font-bold text-on-surface">Pickup Ready</span>
            </div>
          </div>
        </div>

        <!-- Notification Banner / Instructions -->
        ${isReady ? `
          <div class="bg-secondary-container text-on-secondary-container rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
            <span class="material-symbols-outlined text-2xl animate-spin">notifications_active</span>
            <div class="flex-1 min-w-0">
              <span class="font-bold text-xs block">Please proceed to the stall counter!</span>
              <span class="text-[11px] opacity-90">Show your order number <strong>#${safeOrderId}</strong> or barcode below.</span>
            </div>
          </div>
        ` : isDone ? `
          <div class="bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
            <span class="material-symbols-outlined text-2xl text-emerald-600">check_circle</span>
            <div class="flex-1 min-w-0">
              <span class="font-bold text-xs block">Order Completed & Collected</span>
              <span class="text-[11px] text-emerald-700">Hope you enjoyed your meal! Digital receipt verified.</span>
            </div>
          </div>
        ` : `
          <div class="bg-primary/5 rounded-2xl p-3 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 text-primary font-semibold">
              <span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              <span>Estimated Pickup:</span>
            </div>
            <span class="font-bold text-on-surface">${prepMins} minutes</span>
          </div>
        `}

        <!-- Barcode Simulation for Counter Scanning -->
        <div class="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-outline-variant/30">
          <div class="h-9 w-4/5 barcode-stripes"></div>
          <span class="text-[10px] font-mono tracking-widest text-outline mt-1.5">TAPAU-${safeOrderId}-${createdAtStr.slice(-4)}</span>
        </div>

        <!-- Counter Arrival Handshake Button -->
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/15">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 ${isDone ? 'bg-stone-500' : 'bg-stone-900'} text-white font-black text-xs rounded-xl shadow-xs">Token #${safeOrderId}</span>
            <span class="text-[11px] text-on-surface-variant font-medium">${isDone ? 'Fulfilled at Counter' : 'Takeaway Counter'}</span>
          </div>

          ${!isDone ? `
            <button onclick="UI.notifyCounterArrival('${safeOrderId}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm active:scale-95 flex items-center gap-1 transition-all">
              <span class="material-symbols-outlined text-[15px]">hail</span>
              <span>I'm at Counter</span>
            </button>
          ` : `
            <span class="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">verified</span>
              <span>Collected</span>
            </span>
          `}
        </div>

        <!-- Items Breakdown Accordion -->
        <div class="border-t border-outline-variant/20 pt-3 space-y-1.5">
          <div class="text-xs font-bold text-on-surface flex justify-between">
            <span>Items (${itemsCount})</span>
            <span class="text-primary font-extrabold">RM ${orderTotal.toFixed(2)}</span>
          </div>
          <div class="text-xs text-on-surface-variant space-y-1 pt-1">
            ${items.length > 0 ? items.map(item => {
              const itemPrice = typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0);
              const itemQty = Number(item.quantity) || 1;
              const itemName = item.name || 'Item';
              const itemVariant = item.variant ? ` (${item.variant})` : '';
              return `
                <div class="flex justify-between items-start">
                  <span>${itemQty}x ${itemName}${itemVariant}</span>
                  <span>RM ${itemPrice.toFixed(2)}</span>
                </div>
              `;
            }).join('') : '<div class="text-[11px] italic text-outline">Order items recorded</div>'}
          </div>
        </div>

        <!-- Fast Actions -->
        <div class="flex items-center gap-2 pt-1">
          <button onclick="UI.reorderItems('${safeOrderId}')" class="flex-1 py-2.5 rounded-xl bg-surface-container text-primary font-bold text-xs hover:bg-surface-container-high active:scale-95 transition-transform flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">replay</span>
            <span>Order Again</span>
          </button>
          
          <button onclick="UI.advanceDemoOrder('${safeOrderId}')" class="px-3 py-2.5 rounded-xl bg-secondary-container/20 text-secondary-container font-bold text-xs hover:bg-secondary-container/30 active:scale-95 transition-transform" title="Simulate Kitchen Status">
            ⚡ Advance Status
          </button>
        </div>
      </div>
    `;
  },

  highlightOrder(orderId) {
    setTimeout(() => {
      const el = document.getElementById(`order-card-${orderId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-primary/40');
        setTimeout(() => el.classList.remove('ring-4', 'ring-primary/40'), 2500);
      }
    }, 150);
  },

  reorderItems(orderId) {
    const order = store.activeOrders.find(o => o.orderId === orderId);
    if (!order) return;
    store.clearCart();
    order.items.forEach(item => {
      store.addToCart({
        dishId: 'reorder',
        name: item.name,
        image: './icons/tapau-logo.png',
        unitPrice: item.price / item.quantity,
        quantity: item.quantity,
        variantName: item.variant,
        spiceLevel: item.spice,
        addOns: item.addOns,
        notes: ''
      });
    });
    this.openCartDrawer();
  },

  advanceDemoOrder(orderId) {
    const order = store.activeOrders.find(o => o.orderId === orderId);
    if (!order) return;
    if (order.status === 'received') store.updateOrderStatus(orderId, 'preparing');
    else if (order.status === 'preparing') store.updateOrderStatus(orderId, 'ready');
    else if (order.status === 'ready') store.updateOrderStatus(orderId, 'completed');
    else store.updateOrderStatus(orderId, 'preparing');
    this.renderOrders();
    this.updateOrdersNavBadge();
  },

  updateOrdersNavBadge() {
    const badge = document.getElementById('nav-orders-badge');
    if (!badge) return;
    const activeCount = store.activeOrders.filter(o => o.status !== 'completed').length;
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  startOrderProgressionLoop() {
    // Disabled by default so orders wait for live Merchant KDS updates.
    // Set window.TAPAU_DEMO_AUTO_PROGRESS = true in console to re-enable local simulation timer.
    if (!window.TAPAU_DEMO_AUTO_PROGRESS) return;

    setInterval(() => {
      let changed = false;
      const now = Date.now();
      store.activeOrders.forEach(order => {
        const elapsed = now - order.createdAt;
        if (order.status === 'received' && elapsed > 12000) {
          order.status = 'preparing';
          changed = true;
        } else if (order.status === 'preparing' && elapsed > 45000) {
          order.status = 'ready';
          AudioEngine.playReadyChime();
          Haptic.pattern([100, 50, 100, 50, 200]);
          changed = true;
        }
      });
      if (changed) {
        store.save('tapau_customer_orders', store.activeOrders);
        if (store.currentView === 'orders') this.renderOrders();
        if (store.currentView === 'kds') this.renderKDS();
        this.updateOrdersNavBadge();
      }
    }, 5000);
  },

  // ==========================================
  // VIEW: MERCHANT KDS (Kitchen Display System)
  // ==========================================
  renderKDS() {
    const container = document.getElementById('kds-tickets-container');
    if (!container) return;

    const tickets = store.activeOrders;
    if (tickets.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 text-center text-outline">
          <span class="material-symbols-outlined text-6xl">skillet</span>
          <p class="font-bold text-sm mt-2">Kitchen is all clear! No tickets in queue.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = tickets.map(t => `
      <div class="bg-surface-container-lowest rounded-2xl p-4 shadow-md border-2 ${
        t.status === 'ready' ? 'border-emerald-500' :
        t.status === 'preparing' ? 'border-secondary' :
        t.status === 'completed' ? 'border-outline-variant/30 opacity-60' :
        'border-primary'
      } flex flex-col justify-between">
        <div>
          <!-- Ticket Header -->
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div>
              <span class="text-2xl font-black text-on-surface">#${t.orderId}</span>
              <span class="text-xs font-bold text-primary ml-2 uppercase px-2 py-0.5 rounded bg-primary/10">${t.orderType}</span>
            </div>
            <span class="text-xs font-mono font-bold text-on-surface-variant">
              ${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <!-- Items list -->
          <div class="py-3 space-y-2">
            ${t.items.map(item => `
              <div class="text-xs">
                <div class="flex items-baseline justify-between font-bold text-on-surface">
                  <span>${item.quantity}x ${item.name}</span>
                </div>
                ${item.variant ? `<div class="text-[11px] text-primary font-semibold">• ${item.variant}</div>` : ''}
                ${item.spice ? `<div class="text-[11px] text-amber-600 font-semibold">• ${item.spice}</div>` : ''}
                ${item.addOns && item.addOns.length > 0 ? `<div class="text-[11px] text-outline">• ${item.addOns.join(', ')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Action Status Buttons -->
        <div class="pt-3 border-t border-outline-variant/20 flex gap-2">
          ${t.status === 'received' ? `
            <button onclick="UI.kdsSetStatus('${t.orderId}', 'preparing')" class="w-full py-2 rounded-xl bg-primary text-white font-bold text-xs active:scale-95 transition-transform">
              Start Cooking
            </button>
          ` : t.status === 'preparing' ? `
            <button onclick="UI.kdsSetStatus('${t.orderId}', 'ready')" class="w-full py-2 rounded-xl bg-secondary-container text-on-secondary-container font-bold text-xs active:scale-95 transition-transform">
              Mark Ready & Buzz
            </button>
          ` : t.status === 'ready' ? `
            <button onclick="UI.kdsSetStatus('${t.orderId}', 'completed')" class="w-full py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs active:scale-95 transition-transform">
              Complete / Picked Up
            </button>
          ` : `
            <span class="w-full text-center py-1 text-xs text-outline font-bold">Ticket Completed</span>
          `}
        </div>
      </div>
    `).join('');
  },

  kdsSetStatus(orderId, status) {
    store.updateOrderStatus(orderId, status);
    this.renderKDS();
  },

  // ==========================================
  // VIEW: PROFILE & SETTINGS
  // ==========================================
  renderProfile() {
    // Reload active orders & favorites from storage to ensure desktop and app views match 100%
    store.activeOrders = store.load('tapau_customer_orders') || [];
    store.favorites = store.load('tapau_favorites') || [];

    const favCountEl = document.getElementById('profile-favs-count');
    const orderCountEl = document.getElementById('profile-orders-count');
    if (favCountEl) favCountEl.textContent = store.favorites.length;
    if (orderCountEl) orderCountEl.textContent = store.activeOrders.length;

    // Asynchronously fetch latest cloud orders with force=true to sync any backend orders
    store.fetchCustomerOrdersFromSupabase(true).then(() => {
      const updatedOrderCountEl = document.getElementById('profile-orders-count');
      if (updatedOrderCountEl) updatedOrderCountEl.textContent = store.activeOrders.length;
    }).catch(() => {});

    let profileJson = localStorage.getItem('tapau_user_profile');
    let profile = null;
    try {
      profile = profileJson ? JSON.parse(profileJson) : null;
    } catch (e) {}

    // Purge legacy fake email placeholders if present
    if (profile && profile.email && (profile.email.includes('google@tapautime.my') || profile.email.includes('customer@tapautime.my'))) {
      localStorage.removeItem('tapau_user_profile');
      profile = null;
    }

    // Auto-restore profile with authentic user credentials from Supabase token
    if (!profile || !profile.email) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.includes('auth-token') || k.includes('supabase'))) {
            const val = localStorage.getItem(k);
            if (val && val.startsWith('{')) {
              try {
                const parsed = JSON.parse(val);
                let u = parsed?.user || parsed?.currentSession?.user;
                if (!u && k.includes('auth-token') && !k.endsWith('-user')) {
                  const userVal = localStorage.getItem(k + '-user');
                  if (userVal && userVal.startsWith('{')) {
                    try { u = JSON.parse(userVal); } catch (e) {}
                  }
                }
                if (!u && parsed?.access_token && typeof parsed.access_token === 'string') {
                  try {
                    const parts = parsed.access_token.split('.');
                    if (parts.length >= 2) {
                      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                      if (payload && payload.email) {
                        u = { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} };
                      }
                    }
                  } catch (e) {}
                }
                if (u && u.email) {
                  const realName = u.user_metadata?.full_name || u.user_metadata?.name || u.email.split('@')[0];
                  const realEmail = u.email;
                  profile = { name: realName, email: realEmail };
                  localStorage.setItem('tapau_user_profile', JSON.stringify(profile));
                  break;
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }

    const avatarEl = document.getElementById('profile-avatar');
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const badgeEl = document.getElementById('profile-badge');
    const actionContainer = document.getElementById('profile-auth-action-container');

    if (profile && (profile.name || profile.email)) {
      const displayName = profile.name || (profile.email && typeof profile.email === 'string' ? profile.email.split('@')[0] : 'Customer');
      const initials = displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TT';
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = profile.email || 'Registered Foodie';
      if (badgeEl) {
        badgeEl.textContent = 'Tapau Member';
        badgeEl.className = 'inline-block mt-1 px-2.5 py-0.5 bg-orange-100 text-orange-900 text-[10px] font-bold rounded-md';
      }
      if (actionContainer) {
        actionContainer.innerHTML = `
          <button onclick="UI.logoutUser()" class="w-full py-3 px-4 rounded-2xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs flex items-center justify-center gap-2 border border-rose-200 transition-colors active:scale-95 cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">logout</span>
            <span>Log Out of Account</span>
          </button>
        `;
      }
    } else {
      if (avatarEl) avatarEl.textContent = 'G';
      if (nameEl) nameEl.textContent = 'Guest Foodie';
      if (emailEl) emailEl.textContent = 'Ordering as Guest';
      if (badgeEl) {
        badgeEl.textContent = 'Guest Explorer';
        badgeEl.className = 'inline-block mt-1 px-2.5 py-0.5 bg-stone-100 text-stone-700 text-[10px] font-bold rounded-md';
      }
      if (actionContainer) {
        actionContainer.innerHTML = `
          <button onclick="window.location.href='customer_login.html'" class="w-full py-3 px-4 rounded-2xl bg-primary text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">login</span>
            <span>Sign In / Create Account</span>
          </button>
        `;
      }
    }
  },

  logoutUser() {
    localStorage.removeItem('tapau_user_profile');
    localStorage.removeItem('tapau_guest_session');
    localStorage.removeItem('tapau_logging_in');
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try { supabaseClient.auth.signOut(); } catch(e) {}
    }
    window.location.href = 'customer_login.html?logout=1';
  },

  // ==========================================
  // MODAL: ORDER TYPE & TABLE SELECTOR
  // ==========================================
  openOrderTypeModal() {},
  closeOrderTypeModal() {},
  selectOrderTypeModal() {},
  updateOrderTypeModalUI() {},
  confirmOrderTypeModal() {},

  // ==========================================
  // 5. PWA LIFECYCLE, INSTALL PROMPT & OFFLINE
  // ==========================================
  initPWA() {
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          reg.update();
          console.log('[Tapau Time PWA] Service Worker registered with scope:', reg.scope);
        })
        .catch(err => {
          console.warn('[Tapau Time PWA] Service Worker registration failed:', err);
        });
    }

    // Install prompt banner
    let deferredPrompt = null;
    const installBanner = document.getElementById('pwa-install-banner');
    const installBtn = document.getElementById('pwa-install-btn');
    const dismissBtn = document.getElementById('pwa-dismiss-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBanner) installBanner.classList.remove('hidden');
    });

    installBtn?.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA Install Outcome]', outcome);
        deferredPrompt = null;
        if (installBanner) installBanner.classList.add('hidden');
      } else {
        alert('To install Tapau Time:\n• On iOS Safari: Tap Share -> Add to Home Screen.\n• On Android Chrome: Tap 3 dots -> Install App.');
      }
    });

    dismissBtn?.addEventListener('click', () => {
      if (installBanner) installBanner.classList.add('hidden');
    });

    // Offline / Online network state
    const offlineBanner = document.getElementById('offline-indicator-banner');
    const updateOnlineStatus = () => {
      if (!navigator.onLine) {
        offlineBanner?.classList.remove('hidden');
      } else {
        offlineBanner?.classList.add('hidden');
      }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Push notification permission request
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        Notification.requestPermission();
      }, 8000);
    }
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
});
