export type PaymentMethodType = 'ewallet' | 'fpx';

/**
 * Generates Razorpay / Curlec custom display blocks to bypass the generic modal selector
 * and launch directly into the customer's selected payment instrument.
 */
export const getRazorpayConfig = (method: PaymentMethodType) => {
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
export const loadRazorpayScript = (): Promise<boolean> => {
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

/**
 * Generates a clean random idempotency key for guest dine-in orders
 */
export const generateGuestIdempotencyKey = (tableNumber: string): string => {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  return `guest_t${tableNumber}_${Date.now()}_${randomPart}`;
};
