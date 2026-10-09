import React, { useState, useRef, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, SUPABASE_ANON_KEY, CHECKOUT_EDGE_FUNCTION_URL } from '../lib/supabase';
import { useCartStore } from '../stores/useCartStore';
import { useCustomerOrderStore, CustomerOrder } from '../stores/useCustomerOrderStore';
import { useAuthStore } from '../stores/useAuthStore';
import { AuthModal } from '../components/auth/AuthModal';
import { ContactNumberModal } from '../components/auth/ContactNumberModal';
import { PullToRefresh } from '../components/PullToRefresh';

export interface CheckoutScreenProps {
  onOrderPlaced?: (pickupPin: string, orderDisplayId: string) => void;
  onBackToCart?: () => void;
}

export type PromoQuote = {
  code: string;
  promoCodeId: string | null;
  discountType: 'fixed' | 'percentage' | 'legacy_total';
  discountValue: number;
  discountAmount: number;
  finalTotal: number;
  isLegacy: boolean;
  durationType: 'expiration' | 'usage_limit' | null;
  expirationDate: string | null;
  maxUses: number | null;
  remainingUses: number | null;
};

type PackagingFeeType = 'per_order' | 'per_item' | 'none';

export type PaymentMethodType =
  | 'ewallet'
  | 'fpx';

/**
 * Generates Razorpay / Curlec custom display blocks to bypass the generic modal selector
 * and launch directly into the customer's selected payment instrument.
 */
const getRazorpayConfig = (method: PaymentMethodType) => {
  switch (method) {
    case 'ewallet':
      return {
        display: {
          blocks: {
            selected_method: {
              name: 'Pay with E-Wallet',
              instruments: [
                {
                  method: 'wallet',
                },
              ],
            },
          },
          sequence: ['block.selected_method'],
          preferences: {
            show_default_blocks: false,
          },
        },
      };
    case 'fpx':
      return {
        display: {
          blocks: {
            selected_method: {
              name: 'Online Banking (FPX)',
              instruments: [
                {
                  method: 'fpx',
                },
              ],
            },
          },
          sequence: ['block.selected_method'],
          preferences: {
            show_default_blocks: false,
          },
        },
      };
    default:
      return undefined;
  }
};

/**
 * Dynamically loads the Curlec / Razorpay Standard Checkout SDK
 */
const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('[Checkout] Failed to load Curlec / Razorpay SDK script');
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

export const CheckoutScreen: React.FC<CheckoutScreenProps> = ({
  onOrderPlaced,
  onBackToCart,
}) => {
  const {
    items,
    merchantId,
    getSubtotal,
    getConvenienceFee,
    getServiceFee,
    getOrderBalanceFee,
    getPlatformFee,
    getTotalAmount,
    clearCart,
    scheduledPickupDate,
    scheduledPickupTime
  } = useCartStore();
  const { setActiveOrder } = useCustomerOrderStore();

  // Pre-order derived state
  const isPreorder = items.some((item) => item.requiresPreorder);
  const maxLeadTimeDays = isPreorder
    ? Math.max(...items.map((item) => item.leadTimeDays || 0))
    : 0;

  const [localScheduledPickupDate, setLocalScheduledPickupDate] = useState<string>(scheduledPickupDate || '');

  useEffect(() => {
    if (isPreorder && !localScheduledPickupDate) {
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + maxLeadTimeDays);
      setLocalScheduledPickupDate(minDate.toISOString().split('T')[0]);
    }
  }, [isPreorder, maxLeadTimeDays, localScheduledPickupDate]);

  // Promo Code State
  const [promoInput, setPromoInput] = useState('');
  const [promoQuote, setPromoQuote] = useState<PromoQuote | null>(null);
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('ewallet');
  const [isOrderReviewOpen, setIsOrderReviewOpen] = useState<boolean>(true);

  // Optimistic UI lock state & Auth Gate Modal State
  const isSubmittingRef = useRef<boolean>(false);
  const authoritativeFinalTotalRef = useRef<number | null>(null);
  const authoritativeDiscountRef = useRef<number | null>(null);
  const [isLockingInventory, setIsLockingInventory] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);

  // Stall status check (closed / open)
  const [isMerchantOpen, setIsMerchantOpen] = useState<boolean>(true);
  const [merchantName, setMerchantName] = useState<string>('Stall');
  // Self pick-up address (merchants.location.address) shown at checkout
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [packagingFeeType, setPackagingFeeType] = useState<PackagingFeeType>('none');
  const [packagingFeeAmount, setPackagingFeeAmount] = useState(0);
  const [isLoadingMerchantStatus, setIsLoadingMerchantStatus] = useState<boolean>(true);

  // Verify stall operating status in real-time
  useEffect(() => {
    let isMounted = true;
    if (!merchantId) {
      setIsLoadingMerchantStatus(false);
      return;
    }

    const checkMerchantStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('merchants')
          .select('is_open, business_name, location, packaging_fee_type, packaging_fee_amount')
          .eq('id', merchantId)
          .maybeSingle();

        if (!error && data && isMounted) {
          setIsMerchantOpen(data.is_open !== false);
          if (data.business_name) {
            setMerchantName(data.business_name);
          }
          const addr = typeof data.location?.address === 'string' ? data.location.address.trim() : '';
          setPickupAddress(addr);
          if (data.packaging_fee_type) setPackagingFeeType(data.packaging_fee_type as PackagingFeeType);
          if (data.packaging_fee_amount !== null && data.packaging_fee_amount !== undefined) {
            setPackagingFeeAmount(Number(data.packaging_fee_amount) || 0);
          }
        }
      } catch (err) {
        console.warn('[Checkout] Failed to verify merchant status:', err);
      } finally {
        if (isMounted) {
          setIsLoadingMerchantStatus(false);
        }
      }
    };

    checkMerchantStatus();

    const channel = supabase
      .channel(`checkout-merchant-status-${merchantId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'merchants', filter: `id=eq.${merchantId}` },
        (payload: any) => {
          if (payload.new && isMounted) {
            setIsMerchantOpen(payload.new.is_open !== false);
            if (payload.new.business_name) {
              setMerchantName(payload.new.business_name);
            }
            if (payload.new.packaging_fee_type) {
              setPackagingFeeType(payload.new.packaging_fee_type as PackagingFeeType);
            }
            if (payload.new.packaging_fee_amount !== undefined) {
              setPackagingFeeAmount(Number(payload.new.packaging_fee_amount) || 0);
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [merchantId]);

  const subtotal = getSubtotal();
  const convenienceFee = getConvenienceFee();
  const serviceFee = getServiceFee();
  const orderBalanceFee = getOrderBalanceFee();
  const otherFees = Number((convenienceFee + serviceFee + orderBalanceFee).toFixed(2));
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const packagingFee =
    packagingFeeType === 'per_order'
      ? packagingFeeAmount
      : packagingFeeType === 'per_item'
        ? packagingFeeAmount * itemCount
        : 0;
  const grossTotal = Number(
    (subtotal + packagingFee + convenienceFee + serviceFee + orderBalanceFee).toFixed(2)
  );
  const discount = promoQuote?.discountAmount ?? 0;
  const merchantDiscount = promoQuote?.isLegacy
    ? Math.max(0, subtotal - (promoQuote.finalTotal ?? 1))
    : discount;
  const finalTotal = Number((promoQuote?.finalTotal ?? grossTotal).toFixed(2));

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code || isApplyingPromo) return;
    if (!merchantId || items.length === 0) {
      setPromoError('Add an item before applying a promo code.');
      return;
    }

    setIsApplyingPromo(true);
    setPromoError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(CHECKOUT_EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${sessionData.session?.access_token ?? SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'validate_promo_code',
          promo_code: code,
          merchant_id: merchantId,
          subtotal: subtotal,
          gross_total: grossTotal,
          order_type: 'takeaway',
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success || !result?.promo) {
        setPromoQuote(null);
        setPromoError(result?.message || 'This promo code is not active for this stall.');
        return;
      }
      const promo = result.promo as {
        code: string;
        promo_code_id: string | null;
        discount_type: PromoQuote['discountType'];
        discount_value: number | string;
        discount_amount: number | string;
        final_total: number | string;
        is_legacy: boolean;
        duration_type: PromoQuote['durationType'];
        expiration_date: string | null;
        max_uses: number | string | null;
        remaining_uses: number | string | null;
      };
      setPromoQuote({
        code: promo.code,
        promoCodeId: promo.promo_code_id,
        discountType: promo.discount_type,
        discountValue: Number(promo.discount_value),
        discountAmount: Number(promo.discount_amount),
        finalTotal: Number(promo.final_total),
        isLegacy: promo.is_legacy,
        durationType: promo.duration_type ?? null,
        expirationDate: promo.expiration_date ?? null,
        maxUses: promo.max_uses === null ? null : Number(promo.max_uses),
        remainingUses:
          promo.remaining_uses === null || promo.remaining_uses === undefined
            ? null
            : Number(promo.remaining_uses),
      });
    } catch (error) {
      console.error('[Checkout] Failed to validate promo code:', error);
      setPromoQuote(null);
      setPromoError('Unable to validate this promo code. Please try again.');
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const clearPromo = () => {
    setPromoQuote(null);
    setPromoInput('');
    setPromoError('');
  };

  // A quote is tied to the current cart totals. Clear it when the cart changes
  // so the customer must revalidate rather than seeing a stale discount.
  useEffect(() => {
    if (promoQuote) {
      setPromoQuote(null);
      setPromoError('Your cart changed. Please apply the promo code again.');
    }
  }, [subtotal, packagingFee, convenienceFee, serviceFee, orderBalanceFee]);

  // Resume order execution immediately when user completes authentication
  const handleAuthSuccess = (authenticatedUser: User) => {
    setIsAuthModalOpen(false);
    const userPhone = authenticatedUser.phone || authenticatedUser.user_metadata?.phone;
    if (!userPhone || typeof userPhone !== 'string' || userPhone.trim().length === 0) {
      setIsContactModalOpen(true);
    } else {
      handlePlaceOrder(authenticatedUser);
    }
  };

  // Primary Order Execution Handler
  const handlePlaceOrder = async (overrideUser?: User) => {
    // 0. Strict Closure Gate: Prevent order submission if stall is closed
    if (!isMerchantOpen) {
      setCheckoutError(`${merchantName} is currently closed and not accepting orders.`);
      return;
    }

    // Double check current merchant open status from database prior to initiating payment lock
    try {
      const { data: merchantCheck } = await supabase
        .from('merchants')
        .select('is_open, business_name')
        .eq('id', merchantId)
        .maybeSingle();

      if (merchantCheck && merchantCheck.is_open === false) {
        setIsMerchantOpen(false);
        setCheckoutError(`${merchantCheck.business_name || 'This stall'} is currently closed and cannot accept orders.`);
        return;
      }
    } catch (checkErr) {
      console.warn('[Checkout] Could not check merchant status prior to submission:', checkErr);
    }
    // 0. Strict Authentication Gate: User must be authenticated to submit an order
    const currentUser = overrideUser || useAuthStore.getState().user;
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    // Require contact number so merchants can reach customers
    const userPhone = currentUser.phone || currentUser.user_metadata?.phone;
    if (!userPhone || typeof userPhone !== 'string' || userPhone.trim().length === 0) {
      setIsContactModalOpen(true);
      return;
    }

    if (items.length === 0) {
      setCheckoutError('Your bag is empty.');
      return;
    }

    if (!merchantId) {
      setCheckoutError('No stall selected. Please select items from an active stall.');
      return;
    }

    if (isPreorder) {
      setCheckoutError('Tapau Ahead pre-orders are currently paused. Please remove pre-order items from your cart to proceed.');
      return;
    }

    // Double-tap & concurrency lock
    if (isSubmittingRef.current || isLockingInventory) return;
    isSubmittingRef.current = true;
    authoritativeFinalTotalRef.current = null;
    authoritativeDiscountRef.current = null;

    // 1. Synchronous Optimistic UI Block triggered immediately on click
    setIsLockingInventory(true);
    setCheckoutError(null);

    // Pre-load Curlec / Razorpay checkout script
    const isScriptReady = await loadRazorpayScript();
    if (!isScriptReady) {
      isSubmittingRef.current = false;
      setIsLockingInventory(false);
      setCheckoutError('Unable to load Curlec payment gateway. Please check your internet connection and try again.');
      return;
    }

    // 2. Generate client-side fresh UUID idempotency key
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {

      // 3. Transform Cart Items with Modifier Snapshot (dual-field contract for 100% interoperability)
      const cartItemsForEdge = items.map((cartItem) => ({
        item_id: cartItem.id,
        menu_item_id: cartItem.id,
        name: cartItem.name,
        quantity: cartItem.quantity,
        unit_price: cartItem.unitPriceWithModifiers,
        price: cartItem.unitPriceWithModifiers,
        modifiers: (cartItem.selectedModifiers || []).map((mod) => ({
          modifier_id: mod.id,
          id: mod.id,
          option_name: mod.option_name,
          name: mod.option_name,
          additional_price: mod.additional_price,
          price: mod.additional_price,
        })),
        special_instructions: cartItem.specialInstructions || '',
      }));

      // 4. Payload Execution: Pure Takeaway
      const normalizedPaymentMethod = 'online';
      const normalizedPaymentStatus = 'paid';

      const { data: { session } } = await supabase.auth.getSession();
      const customerId = currentUser.id;
      const customerEmail = currentUser.email || '';
      const customerName = currentUser.user_metadata?.full_name || customerEmail.split('@')[0] || 'Customer';
      const customerPhone = currentUser.phone || currentUser.user_metadata?.phone || '';
      const accessToken = session?.access_token ?? SUPABASE_ANON_KEY;
      const resolvedMerchantId = merchantId;
      let generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      const orderDisplayId = `#TT-${Math.floor(1000 + Math.random() * 9000)}`;

      let orderSavedSuccess = false;
      let masterTxId: string = `master_${Date.now()}`;
      let curlecOrderId: string | null = null;
      let curlecOrderAmount: number | null = null;

      try {
        const response = await fetch(CHECKOUT_EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-idempotency-key': idempotencyKey,
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            idempotency_key: idempotencyKey,
            customer_id: customerId,
            user_id: customerId,
            customer_email: customerEmail,
            hub_id: null,
            payment_method: 'gateway',
            receipt_url: null,
            items: cartItemsForEdge,
            order_type: 'takeaway',
            table_number: null,
            payment_status: 'pending',
            customer_name: customerName,
            customer_phone: customerPhone,
            promo_code: promoQuote?.code ?? '',
            packaging_fee_type: packagingFeeType,
            packaging_fee_amount: packagingFeeAmount,
            order_balance_fee: orderBalanceFee,
            is_preorder: isPreorder,
            scheduled_pickup_date: isPreorder ? localScheduledPickupDate : null,
            scheduled_pickup_time: isPreorder ? scheduledPickupTime : null,
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          orderSavedSuccess = true;
          if (result.pickup_pin) {
            generatedPin = result.pickup_pin;
          }
          if (result.master_transaction_id) {
            masterTxId = result.master_transaction_id;
          }
          if (result.curlec_order_id) {
            curlecOrderId = result.curlec_order_id;
          }
          if (result.curlec_order?.amount) {
            curlecOrderAmount = result.curlec_order.amount;
          } else if (result.total_amount_cents) {
            curlecOrderAmount = result.total_amount_cents;
          }
          if (typeof result.final_total === 'number') {
            authoritativeFinalTotalRef.current = result.final_total;
          }
          if (typeof result.discount === 'number') {
            authoritativeDiscountRef.current = result.discount;
          }
          // Defensively ensure customer_phone and customer_name are synced to newly created orders
          if (customerPhone && result.orders && Array.isArray(result.orders) && result.orders.length > 0) {
            const subOrderIds = result.orders.map((o: any) => o.id).filter(Boolean);
            if (subOrderIds.length > 0) {
              void (async () => {
                try {
                  await supabase
                    .from('orders')
                    .update({ customer_phone: customerPhone, customer_name: customerName })
                    .in('id', subOrderIds);
                } catch (e) {
                  console.warn('[Checkout] Background phone sync note:', e);
                }
              })();
            }
          }
        } else {
          // If the backend returned a closure or validation error, abort immediately and DO NOT fall back to direct insert
          if (
            result?.error === 'MERCHANT_CLOSED' ||
            result?.error === 'MERCHANT_INACTIVE' ||
            response.status === 400 ||
            response.status === 403 ||
            response.status === 409
          ) {
            isSubmittingRef.current = false;
            setIsLockingInventory(false);
            if (result?.error === 'MERCHANT_CLOSED') {
              setIsMerchantOpen(false);
            }
            setCheckoutError(result?.message || 'This stall is currently closed and not accepting orders.');
            return;
          }
          console.warn('[Checkout] Edge Function returned non-success, falling back to direct Supabase insert:', result);
        }
      } catch (edgeErr) {
        console.warn('[Checkout] Edge function unreachable, performing direct Supabase database insert:', edgeErr);
      }

      // If Edge function was unreachable or didn't complete, perform atomic direct Supabase insert
      if (!orderSavedSuccess) {
        if (promoQuote) {
          isSubmittingRef.current = false;
          setIsLockingInventory(false);
          setCheckoutError('Unable to verify your promo code securely. Please check your connection and try again.');
          return;
        }

        // Defensive check: verify merchant is still open before creating order directly
        const { data: fallbackMerchantCheck } = await supabase
          .from('merchants')
          .select('is_open')
          .eq('id', resolvedMerchantId)
          .maybeSingle();

        if (fallbackMerchantCheck && fallbackMerchantCheck.is_open === false) {
          isSubmittingRef.current = false;
          setIsLockingInventory(false);
          setIsMerchantOpen(false);
          setCheckoutError('This stall is currently closed and not accepting orders.');
          return;
        }
        const directStatus = 'pending_payment';
        const directPaymentStatus = 'pending';
        const directPaymentMethod = 'gateway';

        const { data: directOrder, error: directOrderErr } = await supabase
          .from('orders')
          .insert({
            customer_id: customerId,
            merchant_id: resolvedMerchantId,
            display_id: orderDisplayId,
            idempotency_key: idempotencyKey,
            pickup_pin: generatedPin,
            order_status: directStatus,
            status: directStatus,
            order_type: 'takeaway',
            table_number: null,
            payment_method: directPaymentMethod,
            payment_status: directPaymentStatus,
            total_amount: finalTotal,
            convenience_fee: convenienceFee,
            service_fee: serviceFee,
            platform_fee: Number((convenienceFee + serviceFee + orderBalanceFee).toFixed(2)),
            merchant_cut: Number(Math.max(0, subtotal - merchantDiscount).toFixed(2)),
            promo_code: null,
            promo_code_id: null,
            discount_amount: 0,
            payout_status: 'pending',
            packaging_fee_charged: packagingFee,
            is_preorder: isPreorder,
            scheduled_pickup_date: isPreorder ? localScheduledPickupDate : null,
            scheduled_pickup_time: isPreorder ? scheduledPickupTime : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (directOrderErr) {
          console.error('[Checkout] Direct Supabase order insertion error:', directOrderErr);
          throw new Error(directOrderErr.message || 'Failed to record order in database.');
        }

        masterTxId = directOrder.id;

        // Ensure order_items are inserted in fallback so Merchant KDS has ticket line items
        const orderItemsFallback = items.map((cartItem) => ({
          order_id: directOrder.id,
          item_id: cartItem.id,
          item_name: cartItem.name,
          quantity: cartItem.quantity,
          price_at_time_of_order: cartItem.unitPriceWithModifiers,
          selected_modifiers: (cartItem.selectedModifiers || []).map((mod) => ({
            id: mod.id,
            name: mod.option_name,
            price: mod.additional_price,
          })),
          special_instructions: cartItem.specialInstructions || null,
        }));

        const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsFallback);
        if (itemsErr) {
          console.warn('[Checkout] Fallback order_items insert warning:', itemsErr);
        }
      }

      // 5. Mount the Curlec / Razorpay Checkout Modal
      const curlecKeyId = import.meta.env.VITE_CURLEC_KEY_ID || 'rzp_test_TZaBMAY6chZcZ1';
      const gatewayConfig = getRazorpayConfig(paymentMethod);

      const callbackUrl = `${window.location.origin}${window.location.pathname}?curlec_callback=1&tx_id=${masterTxId}&pin=${generatedPin}&display_id=${encodeURIComponent(orderDisplayId)}&merchant_id=${resolvedMerchantId}`;

      const paymentAmount = curlecOrderAmount ?? Math.round((authoritativeFinalTotalRef.current ?? finalTotal) * 100);
      const authoritativeFinalTotal = authoritativeFinalTotalRef.current ?? finalTotal;
      const razorpayOptions: any = {
        key: curlecKeyId,
        amount: paymentAmount, // Authoritative amount in sen
        currency: 'MYR',
        name: 'TapauTime Kopitiam',
        description: `Order ${orderDisplayId}`,
        order_id: curlecOrderId || undefined,
        prefill: {
          name: customerName,
          contact: customerPhone,
          email: customerEmail,
        },
        notes: {
          order_id: masterTxId,
          master_transaction_id: masterTxId,
          subtotal: `RM ${subtotal.toFixed(2)}`,
          convenience_fee: `RM ${convenienceFee.toFixed(2)}`,
          service_fee: `RM ${serviceFee.toFixed(2)}`,
          order_balance_fee: orderBalanceFee > 0 ? `RM ${orderBalanceFee.toFixed(2)}` : 'RM 0.00',
          tapautime_fee: `RM ${(convenienceFee + serviceFee + orderBalanceFee).toFixed(2)}`,
          merchant_cut: `RM ${Math.max(0, subtotal - merchantDiscount).toFixed(2)}`,
          table_number: null,
          pickup_pin: generatedPin,
          display_id: orderDisplayId,
          order_type: 'takeaway',
          selected_instrument: paymentMethod,
        },
        theme: {
          color: '#f97316', // Brand orange
        },
        callback_url: callbackUrl,
        callback_method: 'get',
        redirect: true,
        ...(gatewayConfig ? { config: gatewayConfig } : {}),
        handler: async function (response: any) {
          console.log('[Curlec Checkout] Payment authorized & captured:', response);
          const paymentId = response.razorpay_payment_id;

          try {
            // Authoritative payment capture via SECURITY DEFINER RPC
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('confirm_dine_in_payment', {
              p_transaction_id: masterTxId,
              p_curlec_payment_id: paymentId,
              p_curlec_order_id: response.razorpay_order_id || curlecOrderId || null,
              p_pickup_pin: generatedPin,
            });

            if (rpcErr) {
              console.error('[Checkout] confirm_dine_in_payment RPC error:', rpcErr);
              // Fallback defensive direct update to orders table if RPC had any issue
              await supabase
                .from('orders')
                .update({
                  payment_status: 'captured',
                  status: 'accepted',
                  order_status: 'accepted',
                  curlec_payment_id: paymentId,
                  updated_at: new Date().toISOString(),
                })
                .or(`transaction_id.eq.${masterTxId},id.eq.${masterTxId},display_id.eq.${orderDisplayId}`);
            } else {
              console.log('[Checkout] Order payment captured and synced via RPC:', rpcRes);
            }
          } catch (postPayErr) {
            console.warn('[Checkout] Post-payment DB update notice:', postPayErr);
          }

          completeOrderSuccess(paymentId);
        },
        modal: {
          ondismiss: async function () {
            // Check if payment was actually completed before declaring cancellation
            let isCaptured = await verifyGatewayStatus();
            if (!isCaptured && !hasCompleted) {
              await new Promise((r) => setTimeout(r, 1200));
              isCaptured = await verifyGatewayStatus();
            }
            if (isCaptured || hasCompleted) {
              return;
            }

            cleanupListeners();
            isSubmittingRef.current = false;
            setIsLockingInventory(false);
            setCheckoutError('Curlec payment cancelled. Your cart items have been kept intact.');
            // Defensively mark the uncompleted gateway order as cancelled in the database via authoritative RPC
            if (masterTxId) {
              try {
                const { error: cancelErr } = await supabase.rpc('mark_payment_failed', {
                  p_transaction_id: masterTxId,
                  p_reason: 'Curlec checkout dismissed by user',
                });
                if (cancelErr) {
                  console.warn('[Checkout] Failed to mark abandoned order as cancelled via RPC:', cancelErr);
                }
              } catch (cancelErr) {
                console.warn('[Checkout] Failed to mark abandoned order as cancelled:', cancelErr);
              }
            }
          },
        },
      };

      let hasCompleted = false;
      const completeOrderSuccess = (paymentId: string) => {
        if (hasCompleted) return;
        hasCompleted = true;
        cleanupListeners();

        // Handoff to Order Status Screen
        const completedOrder: CustomerOrder = {
          id: masterTxId,
          display_id: orderDisplayId,
          merchant_id: resolvedMerchantId,
          order_status: 'accepted',
          payment_status: 'captured',
          payment_method: 'online',
          order_type: 'takeaway',
          table_number: null,
          pickup_pin: generatedPin,
          receipt_url: null,
          idempotency_key: idempotencyKey,
          total_amount: authoritativeFinalTotal,
           promo_code: promoQuote?.code || null,
           promo_code_id: promoQuote?.promoCodeId || null,
           discount_amount: authoritativeDiscountRef.current ?? discount,
          estimated_prep_minutes: 15,
          created_at: new Date().toISOString(),
        };

        setActiveOrder(completedOrder);
        clearCart();
        isSubmittingRef.current = false;
        setIsLockingInventory(false);
        onOrderPlaced?.(generatedPin, orderDisplayId);
      };

      // Active verification polling while waiting for gateway (especially FPX redirects/popups)
      let pollInterval: any = null;
      const verifyGatewayStatus = async (): Promise<boolean> => {
        if (hasCompleted) return true;
        try {
          const verifyRes = await fetch(CHECKOUT_EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              action: 'verify_payment',
              master_transaction_id: masterTxId,
              curlec_order_id: curlecOrderId,
              pickup_pin: generatedPin,
            }),
          });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.success && verifyData.payment_status === 'captured') {
              console.log('[Checkout Polling] Gateway payment captured via verification API:', verifyData);
              completeOrderSuccess(verifyData.curlec_payment_id || 'captured');
              try {
                if (typeof rzp !== 'undefined' && rzp.close) {
                  rzp.close();
                }
              } catch (_) {}
              return true;
            }
          }
        } catch (e) {
          console.warn('[Checkout Polling] Verification error:', e);
        }
        return false;
      };

      pollInterval = setInterval(verifyGatewayStatus, 3000);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && !hasCompleted) {
          verifyGatewayStatus();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleVisibilityChange);

      const cleanupListeners = () => {
        if (pollInterval) clearInterval(pollInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleVisibilityChange);
      };

      const rzp = new (window as any).Razorpay(razorpayOptions);
      rzp.on('payment.failed', async function (resp: any) {
        isSubmittingRef.current = false;
        setIsLockingInventory(false);
        const reason = resp.error?.description || 'Curlec payment failed';
        setCheckoutError(
          `${reason}. Please try again or select another payment option.`
        );
        if (masterTxId) {
          try {
            const { error: failErr } = await supabase.rpc('mark_payment_failed', {
              p_transaction_id: masterTxId,
              p_reason: reason,
            });
            if (failErr) {
              console.warn('[Checkout] Failed to mark order failed via RPC:', failErr);
            }
          } catch (err) {
            console.warn('[Checkout] mark_payment_failed RPC exception:', err);
          }
        }
      });

      // Dismiss the full screen optimistic overlay to let user view the native Curlec modal
      setIsLockingInventory(false);
      rzp.open();
    } catch (err: any) {
      console.error('[Checkout] Execution error:', err);
      isSubmittingRef.current = false;
      setIsLockingInventory(false);
      setCheckoutError(err.message || 'Payment processing failed. Please try again.');
    }
  };

  const handleRefreshCheckout = async () => {
    setCheckoutError(null);
    await new Promise((res) => setTimeout(res, 350));
  };

  return (
    <PullToRefresh
      onRefresh={handleRefreshCheckout}
      disabled={isLockingInventory}
      pullingText="Pull to refresh review..."
      refreshingText="Verifying bag items..."
      completeText="Order verified!"
    >
      <div className="p-4 space-y-5 max-w-lg mx-auto pb-36 select-none">
      {/* 1. Full-Screen Optimistic Loading Overlay */}
      {isLockingInventory && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn"
        >
          <div className="max-w-xs space-y-6">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-24 h-24 rounded-3xl bg-orange-600/20 border-2 border-orange-500 flex items-center justify-center text-4xl animate-pulse">
                🔒
              </div>
              <span className="absolute -bottom-2 -right-2 text-2xl animate-bounce">
                🍜
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white tracking-tight">
                Securing Your Order
              </h2>
              <p className="text-xs text-stone-300 font-bold leading-relaxed">
                Atomically reserving kitchen inventory &amp; verifying merchant heartbeat...
              </p>
            </div>

            <div className="flex justify-center items-center gap-1.5 pt-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-orange animate-ping" />
              <span className="text-[11px] font-mono text-amber-400 font-bold">
                Idempotent Lock Active
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Agency-Grade Header */}
      <header className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#F9FAF9]/90 backdrop-blur-md border-b border-stone-200/80 mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToCart}
          aria-label="Back to Cart"
          className="w-10 h-10 rounded-full bg-white border border-stone-200/90 shadow-xs flex items-center justify-center text-stone-700 hover:text-stone-950 hover:bg-stone-50 active:scale-90 transition-all cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>

        <div className="text-center">
          <h1 className="text-base font-black text-stone-900 tracking-tight">Checkout</h1>
          <p className="text-[11px] font-bold text-stone-400 -mt-0.5">Review &amp; Pay</p>
        </div>

        <div className="w-10" />
      </header>

      {/* Closed Stall Warning Banner */}
      {!isMerchantOpen && (
        <div className="p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl text-rose-900 shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 font-black text-sm shadow-xs">
            ✕
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider text-rose-950">
              Stall is Currently Closed
            </h4>
            <p className="text-xs font-semibold text-rose-800 mt-0.5 leading-relaxed">
              {merchantName} is not accepting new orders at this time. Please return to the menu or try again once the stall reopens.
            </p>
            {onBackToCart && (
              <button
                type="button"
                onClick={onBackToCart}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-black text-rose-900 bg-rose-200/70 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                ← Return to Stall Menu
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {checkoutError && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl text-rose-800 text-xs font-bold flex items-start gap-3 animate-shake">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <div className="font-black text-rose-900">Payment Notice</div>
            <div className="mt-0.5">{checkoutError}</div>
          </div>
        </div>
      )}


      {/* 2. Itemized Order Review Accordion */}
      <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsOrderReviewOpen(!isOrderReviewOpen)}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between bg-stone-50/70 hover:bg-stone-100/70 transition-colors text-left cursor-pointer"
          aria-expanded={isOrderReviewOpen}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-brand-orange shrink-0">
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-black text-stone-900 block leading-tight">
                Order Review
              </span>
              <span className="text-[11px] font-bold text-stone-400">
                {items.reduce((s, i) => s + i.quantity, 0)} {items.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-black text-stone-900 tabular-nums">
              RM {subtotal.toFixed(2)}
            </span>
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-stone-400 transition-transform duration-200 ${
                isOrderReviewOpen ? 'rotate-180 text-stone-700' : ''
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </button>

        {isOrderReviewOpen && (
          <div className="p-4 divide-y divide-stone-100 space-y-3">
            {items.map((item) => (
              <div key={item.cartItemId} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-orange-100/70 text-brand-orange text-[11px] font-black flex items-center justify-center shrink-0">
                      {item.quantity}×
                    </span>
                    <h4 className="text-xs sm:text-sm font-black text-stone-900 truncate">
                      {item.name}
                    </h4>
                  </div>

                  {/* Modifiers List */}
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 pl-7">
                      {item.selectedModifiers.map((mod) => (
                        <span
                          key={mod.id}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200/50"
                        >
                          {mod.option_name}
                          {mod.additional_price > 0 && ` (+RM${mod.additional_price.toFixed(2)})`}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Special Instructions */}
                  {item.specialInstructions && (
                    <div className="mt-1.5 ml-7 flex items-start gap-1 text-[11px] text-amber-800 bg-amber-50/80 px-2 py-1 rounded-md border border-amber-200/60 font-medium">
                      <svg className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                      <span className="italic">"{item.specialInstructions}"</span>
                    </div>
                  )}
                </div>

                <div className="text-xs font-black text-stone-900 tabular-nums shrink-0 pt-0.5">
                  RM {(item.unitPriceWithModifiers * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}

            <div className="pt-3 flex justify-between items-center text-xs">
              <span className="text-[11px] font-bold text-stone-400">Need to make adjustments?</span>
              <button
                type="button"
                onClick={onBackToCart}
                className="font-black text-brand-orange hover:text-orange-600 flex items-center gap-1 py-1 px-2.5 rounded-lg bg-orange-50 hover:bg-orange-100/70 active:scale-95 transition-all cursor-pointer"
              >
                <span>Edit Bag</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2b. Self Pick-up Address (merchant-configured collection point) */}
      <div className="rounded-2xl border border-stone-200/70 bg-white p-4 flex items-start gap-3 shadow-xs">
        <div className="w-10 h-10 rounded-xl bg-orange-50 text-brand-orange flex items-center justify-center shrink-0 border border-orange-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Self Pick-up</h3>
          <p className="text-sm font-bold text-stone-900 mt-0.5 break-words">
            {pickupAddress || `Collect at the ${merchantName} counter`}
          </p>
          <p className="text-[11px] text-stone-500 font-medium mt-0.5 leading-relaxed">
            Collect your order in person — show your 4-digit PIN at the pick-up point.
          </p>
        </div>
      </div>

      {/* 2c. Pre-order Date Picker */}
      {isPreorder && (
        <div className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-brand-orange flex items-center justify-center shrink-0 border border-orange-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Scheduled Pick-up</h3>
              <p className="text-sm font-bold text-stone-900 mt-0.5">Select a date</p>
            </div>
          </div>
          <p className="text-[11px] text-stone-500 font-medium mb-3">
            This order contains Tapau Ahead items that require {maxLeadTimeDays} {maxLeadTimeDays === 1 ? 'day' : 'days'} lead time.
          </p>
          <input
            type="date"
            className="w-full h-12 px-4 text-sm font-medium text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange"
            value={localScheduledPickupDate}
            min={
              (() => {
                const d = new Date();
                d.setDate(d.getDate() + maxLeadTimeDays);
                return d.toISOString().split('T')[0];
              })()
            }
            onChange={(e) => setLocalScheduledPickupDate(e.target.value)}
          />
        </div>
      )}

      {/* 3. Agency-Grade Payment Method Selection with Seamless Instrument Bypass */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">
            Select Payment Method
          </h3>
        </div>

        {/* 1. E-Wallets (Recommended & Highlighted) */}
        <div
          onClick={() => setPaymentMethod('ewallet')}
          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 relative ${
            paymentMethod === 'ewallet'
              ? 'bg-blue-50/80 border-[#005BAC] shadow-md shadow-blue-500/10 ring-2 ring-[#005BAC]/20'
              : 'bg-white border-stone-200 hover:border-stone-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#005BAC] flex items-center justify-center text-white shadow-sm shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                </svg>
              </div>
              <div>
                <div className="font-black text-sm text-stone-900 flex items-center gap-2">
                  <span>E-Wallets</span>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#005BAC] text-white shadow-xs">
                    RECOMMENDED
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                paymentMethod === 'ewallet'
                  ? 'border-[#005BAC] bg-[#005BAC] text-white'
                  : 'border-stone-300 bg-white'
              }`}
            >
              {paymentMethod === 'ewallet' && (
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              )}
            </div>
          </div>
        </div>

        {/* 3. Online Banking (FPX) */}
        <div
          onClick={() => setPaymentMethod('fpx')}
          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 ${
            paymentMethod === 'fpx'
              ? 'bg-sky-50/70 border-sky-600 shadow-sm ring-2 ring-sky-500/20'
              : 'bg-white border-stone-200 hover:border-stone-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.5m-15 10.5V10.5" />
                </svg>
              </div>
              <div>
                <div className="font-black text-sm text-stone-900 flex items-center gap-2">
                  <span>Online Banking (FPX)</span>
                </div>
              </div>
            </div>

            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                paymentMethod === 'fpx'
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : 'border-stone-300 bg-white'
              }`}
            >
              {paymentMethod === 'fpx' && (
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Promo Code Input */}
      <div className="rounded-2xl border border-stone-200/70 bg-white p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => {
                if (promoQuote) clearPromo();
                if (promoError) setPromoError('');
                setPromoInput(e.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleApplyPromo();
                }
              }}
              placeholder="Enter Promo Code"
              className="w-full h-12 px-4 pr-12 text-sm font-medium uppercase tracking-wide text-stone-900 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange placeholder:normal-case placeholder:tracking-normal placeholder:text-stone-400"
            />
            {promoQuote && (
              <svg className="w-5 h-5 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>
          {promoQuote ? (
            <button
              type="button"
              onClick={clearPromo}
              className="h-12 shrink-0 px-4 text-sm font-semibold text-stone-600 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleApplyPromo()}
              disabled={isApplyingPromo || !promoInput.trim()}
              className="h-12 shrink-0 px-5 text-sm font-semibold text-white bg-brand-orange rounded-xl hover:bg-orange-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplyingPromo ? 'Checking…' : 'Apply'}
            </button>
          )}
        </div>
        {promoError && (
          <p className="mt-2 text-xs text-red-600 font-medium">{promoError}</p>
        )}
        {promoQuote && (
          <p className="mt-2 text-xs text-emerald-600 font-medium">
            Promo code applied.
          </p>
        )}
      </div>

      {/* 4. Itemized Price Breakdown Card */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-2.5 shadow-xs text-xs">
        <h4 className="font-black text-stone-900 text-sm tracking-tight pb-1 border-b border-stone-100">
          Payment Summary
        </h4>

        <div className="flex justify-between text-stone-600 font-medium">
          <span>Subtotal</span>
          <span className="font-bold text-stone-900 tabular-nums">
            RM {subtotal.toFixed(2)}
          </span>
        </div>

        {packagingFee > 0 && (
          <div className="flex justify-between text-stone-600 font-medium">
            <span>Packaging Fee</span>
            <span className="font-bold text-stone-900 tabular-nums">
              RM {packagingFee.toFixed(2)}
            </span>
          </div>
        )}

        {otherFees > 0 && (
          <div className="flex justify-between items-start text-stone-600 font-medium">
            <div className="pr-2">
              <span>Total Service Fee</span>
              <p className="text-[10px] text-stone-500 italic font-normal leading-tight mt-0.5">
                (Covers processing, service and order balance fee)
              </p>
            </div>
            <span className="font-bold text-stone-900 tabular-nums shrink-0">
              RM {otherFees.toFixed(2)}
            </span>
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-red-600 font-medium">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 9.75l-6-6m0 0L3.75 9.75m6-6.75V21" />
              </svg>
              <span>Discount ({promoQuote?.code || 'Promo code'})</span>
            </span>
            <span className="font-bold text-red-600 tabular-nums">
              -RM {discount.toFixed(2)}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-stone-100 flex justify-between items-baseline">
          <span className="font-black text-sm text-stone-900">Total</span>
          <span className="text-xl font-black text-brand-orange tabular-nums tracking-tight">
            RM {finalTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 5. Sticky Docked 'Place Order' Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-xl border-t border-stone-200/90 z-30 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => handlePlaceOrder()}
            disabled={isLockingInventory || !isMerchantOpen}
            className={`w-full h-14 min-h-[3.5rem] px-5 text-white font-black text-base rounded-2xl shadow-lg flex items-center justify-between transition-all ${
              !isMerchantOpen
                ? 'bg-stone-300 text-stone-500 cursor-not-allowed shadow-none'
                : 'cursor-pointer active:scale-[0.98] bg-brand-orange hover:bg-orange-500 shadow-orange-500/25'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <span className="font-black text-sm sm:text-base tracking-tight">
                {!isMerchantOpen
                  ? 'Stall Closed • Cannot Order'
                  : paymentMethod === 'ewallet'
                  ? 'Pay with E-Wallet'
                  : 'Pay with FPX'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black tabular-nums tracking-tight">
                RM {finalTotal.toFixed(2)}
              </span>
              {isMerchantOpen && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>

      </div>

      {/* Strict Authentication Bottom Sheet / Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Required Contact Number Modal */}
      <ContactNumberModal
        isOpen={isContactModalOpen}
        user={useAuthStore.getState().user}
        onClose={() => setIsContactModalOpen(false)}
        onSuccess={(_phone, updatedUser) => {
          setIsContactModalOpen(false);
          handlePlaceOrder(updatedUser);
        }}
        allowDismiss={true}
      />
    </PullToRefresh>
  );
};
