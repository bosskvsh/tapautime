import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { useCartStore, CartItem } from '../stores/useCartStore';
import { supabase } from '../lib/supabase';

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout: () => void;
}

interface SwipeableCartItemProps {
  item: CartItem;
  isPendingDelete?: boolean;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRequestDelete: (item: CartItem) => void;
}

/**
 * Premium Zero-Dependency Inline SVGs
 * Completely eliminates Google Material Symbol ligature font leaks
 * (e.g. literal "close", "delete_outl", "shopping_cart_checkout" text bugs)
 */
const CloseIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const EditNoteIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const CartBagCheckoutIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
    <polyline points="10 15 12 17 15 14" strokeWidth="2.4" />
  </svg>
);

const ArrowRightIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const MapPinIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);

const TakeawayBoxIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 8l8-4 8 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
    <path d="M4 8l8 4 8-4" />
    <line x1="12" y1="12" x2="12" y2="22" />
  </svg>
);

const MinusIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SwipeableCartItem: React.FC<SwipeableCartItemProps> = ({
  item,
  isPendingDelete = false,
  onUpdateQuantity,
  onRequestDelete,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartXRef = useRef(0);
  const currentOffsetXRef = useRef(0);

  // When cancellation occurs or isPendingDelete resets, snap card smoothly back to 0
  useEffect(() => {
    if (!isPendingDelete && offsetX !== 0 && !isSwiping) {
      setOffsetX(0);
      currentOffsetXRef.current = 0;
    }
  }, [isPendingDelete, offsetX, isSwiping]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    currentOffsetXRef.current = offsetX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    // Only allow swiping left (negative offsetX)
    if (deltaX < 0) {
      // Rubber-band resistance past -90px
      const clamped = Math.max(deltaX, -110);
      setOffsetX(clamped);
      currentOffsetXRef.current = clamped;
    } else {
      setOffsetX(0);
      currentOffsetXRef.current = 0;
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (currentOffsetXRef.current <= -75) {
      // Swiped past threshold -> snap to revealed delete button and trigger confirm deletion notification
      setOffsetX(-90);
      currentOffsetXRef.current = -90;
      onRequestDelete(item);
    } else {
      // Snap back smoothly
      setOffsetX(0);
      currentOffsetXRef.current = 0;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-stone-100/70 select-none">
      {/* Red Delete Backdrop (Clickable button when swiped open) */}
      <button
        type="button"
        onClick={() => onRequestDelete(item)}
        aria-label={`Confirm delete ${item.name}`}
        className="absolute inset-y-0 right-0 w-28 bg-rose-600 flex items-center justify-end px-5 text-white font-black text-xs gap-1.5 transition-opacity cursor-pointer active:bg-rose-700"
        style={{ opacity: offsetX < 0 ? 1 : 0 }}
      >
        <TrashIcon className="w-4 h-4 text-white" />
        <span>Delete</span>
      </button>

      {/* Front Item Card Surface with clean neutral border & diffused ambient shadow */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
        className="relative bg-white p-4 border border-stone-200/90 rounded-2xl flex flex-col gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:border-stone-300 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-stone-900 text-sm leading-snug tracking-tight">
              {item.name}
            </h3>

            {/* Modifiers List */}
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <ul className="text-xs text-stone-500 mt-1 space-y-0.5 font-medium">
                {item.selectedModifiers.map((mod) => (
                  <li key={mod.id} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0" />
                    <span className="truncate">{mod.option_name}</span>
                    {mod.additional_price > 0 && (
                      <span className="text-stone-400 font-bold shrink-0">
                        (+RM {mod.additional_price.toFixed(2)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Special Instructions Pill */}
            {item.specialInstructions && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50/90 px-2.5 py-1 rounded-lg border border-amber-200/70 font-medium max-w-full">
                <EditNoteIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate italic">"{item.specialInstructions}"</span>
              </div>
            )}
          </div>

          {/* Explicit Trash Icon Button (Auntie-Proof Direct Tap with Confirmation) */}
          <button
            type="button"
            onClick={() => onRequestDelete(item)}
            aria-label={`Remove ${item.name} from bag`}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all shrink-0 cursor-pointer"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Price & Tactile 44px Stepper Action Row */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <div className="text-sm font-black text-brand-orange tabular-nums">
            RM {(item.unitPriceWithModifiers * item.quantity).toFixed(2)}
            <span className="text-[10px] text-stone-400 font-bold ml-1.5">
              (RM {item.unitPriceWithModifiers.toFixed(2)} ea)
            </span>
          </div>

          {/* Tactile 44px Stepper Pill for Auntie-Friendly Tap Accuracy */}
          <div className="flex items-center gap-1 bg-stone-100/90 rounded-2xl p-1 shrink-0 border border-stone-200/70 shadow-xs">
            <button
              type="button"
              onClick={() => {
                if (item.quantity <= 1) {
                  onRequestDelete(item);
                } else {
                  onUpdateQuantity(item.cartItemId, item.quantity - 1);
                }
              }}
              aria-label="Decrease quantity"
              className="w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl bg-white text-stone-700 font-black shadow-xs hover:bg-stone-50 active:scale-90 transition-transform cursor-pointer"
            >
              <MinusIcon className="w-3.5 h-3.5" />
            </button>
            <span className="font-extrabold w-7 text-center text-sm text-stone-900 tabular-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
              aria-label="Increase quantity"
              className="w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl bg-brand-orange text-white font-black shadow-xs hover:bg-orange-600 active:scale-90 transition-transform cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  onProceedToCheckout,
}) => {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getTotalCount,
    getSubtotal,
    getConvenienceFee,
    getServiceFee,
    getOrderBalanceFee,
    getTotalAmount,
  } = useCartStore();

  const [confirmClear, setConfirmClear] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<CartItem | null>(null);
  const [deleteToastMessage, setDeleteToastMessage] = useState<string | null>(null);
  const deleteToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const merchantId = useCartStore((s) => s.merchantId);
  const [isMerchantOpen, setIsMerchantOpen] = useState<boolean>(true);

  // Self pick-up address confirmation modal (gates entry to checkout)
  const [showPickupConfirm, setShowPickupConfirm] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [merchantBusinessName, setMerchantBusinessName] = useState('');
  const [isPickupAddressLoading, setIsPickupAddressLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !merchantId) return;
    const checkOpen = async () => {
      try {
        const { data, error } = await supabase
          .from('merchants')
          .select('is_open, business_name, location')
          .eq('id', merchantId)
          .maybeSingle();
        if (error) {
          console.error('Failed to verify merchant open status in cart:', error);
          return;
        }
        if (data) {
          setIsMerchantOpen(data.is_open !== false);
          if (data.business_name) {
            setMerchantBusinessName(data.business_name);
          }
          if (typeof data.location?.address === 'string') {
            setPickupAddress(data.location.address.trim());
          }
        }
      } catch (err) {
        console.warn('Failed to verify merchant open status in cart:', err);
      }
    };
    checkOpen();
  }, [isOpen, merchantId]);

  // GSAP Drag-to-Dismiss Refs
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const glassShieldRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isDraggingRef = useRef(false);

  // Synchronous DOM Scroll Lock (bypasses React batching to freeze compositor thread at T0)
  const preventDefaultTouchMove = useRef((e: TouchEvent) => {
    if (isDraggingRef.current && e.cancelable) {
      e.preventDefault();
    }
  });

  const lockScrollSynchronously = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflow = 'hidden';
      scrollContainerRef.current.style.touchAction = 'none';
      scrollContainerRef.current.style.pointerEvents = 'none';
      scrollContainerRef.current.style.userSelect = 'none';
    }
    if (glassShieldRef.current) {
      glassShieldRef.current.style.display = 'block';
    }
    window.addEventListener('touchmove', preventDefaultTouchMove.current, { passive: false });
  };

  const unlockScrollSynchronously = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflow = '';
      scrollContainerRef.current.style.touchAction = '';
      scrollContainerRef.current.style.pointerEvents = '';
      scrollContainerRef.current.style.userSelect = '';
    }
    if (glassShieldRef.current) {
      glassShieldRef.current.style.display = 'none';
    }
    window.removeEventListener('touchmove', preventDefaultTouchMove.current);
  };

  useEffect(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    unlockScrollSynchronously();

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setConfirmClear(false);
      setShowPickupConfirm(false);
      setItemPendingDelete(null);
      setDeleteToastMessage(null);
      if (drawerPanelRef.current) {
        gsap.killTweensOf(drawerPanelRef.current);
        gsap.set(drawerPanelRef.current, { clearProps: 'all' });
        drawerPanelRef.current.style.transition = '';
      }
      if (backdropRef.current) {
        gsap.killTweensOf(backdropRef.current);
        gsap.set(backdropRef.current, { clearProps: 'all' });
      }
    } else {
      document.body.style.overflow = '';
      setShowPickupConfirm(false);
      setItemPendingDelete(null);
      setDeleteToastMessage(null);
      if (drawerPanelRef.current) {
        gsap.killTweensOf(drawerPanelRef.current);
        gsap.set(drawerPanelRef.current, { clearProps: 'all' });
        drawerPanelRef.current.style.transition = '';
      }
      if (backdropRef.current) {
        gsap.killTweensOf(backdropRef.current);
        gsap.set(backdropRef.current, { clearProps: 'all' });
      }
    }
    return () => {
      document.body.style.overflow = '';
      isDraggingRef.current = false;
      unlockScrollSynchronously();
      if (deleteToastTimeoutRef.current) {
        clearTimeout(deleteToastTimeoutRef.current);
      }
    };
  }, [isOpen]);

  // Dismiss confirm modals if user hits Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (itemPendingDelete) {
        e.stopPropagation();
        setItemPendingDelete(null);
        return;
      }
      if (showPickupConfirm) {
        e.stopPropagation();
        setShowPickupConfirm(false);
      }
    };
    if (itemPendingDelete || showPickupConfirm) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemPendingDelete, showPickupConfirm]);

  // Gate checkout behind an explicit confirmation of the self pick-up address:
  // fresh-fetch the merchant's address, show the alert dialog, and only after
  // the customer confirms do we close the drawer and enter the checkout page.
  const handleProceedToCheckoutClick = async () => {
    setShowPickupConfirm(true);
    if (!merchantId) return;
    setIsPickupAddressLoading(true);
    try {
      const { data, error } = await supabase
        .from('merchants')
        .select('business_name, location')
        .eq('id', merchantId)
        .maybeSingle();
      if (error) {
        console.error('Failed to load pick-up address for confirmation:', error);
        return;
      }
      if (data) {
        if (data.business_name) {
          setMerchantBusinessName(data.business_name);
        }
        const addr = typeof data.location?.address === 'string' ? data.location.address.trim() : '';
        setPickupAddress(addr);
      }
    } catch (err) {
      console.warn('Failed to load pick-up address for confirmation:', err);
    } finally {
      setIsPickupAddressLoading(false);
    }
  };

  const handleConfirmPickupAddress = () => {
    setShowPickupConfirm(false);
    onClose();
    onProceedToCheckout();
  };

  const handleConfirmDelete = () => {
    if (!itemPendingDelete) return;
    const removedName = itemPendingDelete.name;
    removeItem(itemPendingDelete.cartItemId);
    setItemPendingDelete(null);

    // Show temporary feedback toast notification
    if (deleteToastTimeoutRef.current) {
      clearTimeout(deleteToastTimeoutRef.current);
    }
    setDeleteToastMessage(`"${removedName}" removed from your bag`);
    deleteToastTimeoutRef.current = setTimeout(() => {
      setDeleteToastMessage(null);
    }, 2800);
  };

  /**
   * GSAP Drag-to-Dismiss Gesture Engine
   * Scoped to top grab handle, drawer header, and empty-state canvas.
   * Keeps the inner list natively scrollable without interference.
   */
  const handleDragStart = (clientY: number) => {
    touchStartY.current = clientY;
    touchStartTime.current = Date.now();
    isDraggingRef.current = true;
    setIsDragging(true);

    // Synchronously display invisible glass shield immediately at T0 to block all child touches
    if (glassShieldRef.current) {
      glassShieldRef.current.style.display = 'block';
    }
    lockScrollSynchronously();

    if (drawerPanelRef.current) {
      gsap.killTweensOf(drawerPanelRef.current);
      drawerPanelRef.current.style.transition = 'none';
    }
  };

  const handleDragMove = (clientY: number) => {
    if (!isDraggingRef.current || !drawerPanelRef.current) return;
    const deltaY = clientY - touchStartY.current;

    if (deltaY > 0) {
      // Downward drag: 1-to-1 tracking
      gsap.set(drawerPanelRef.current, { y: deltaY });

      // Ambient backdrop fade
      if (backdropRef.current) {
        const progress = Math.min(1, deltaY / 280);
        backdropRef.current.style.opacity = String(Math.max(0.1, 1 - progress * 0.9));
      }
    } else {
      // Upward drag: subtle rubber-band resistance
      const rubberBand = -Math.pow(Math.abs(deltaY), 0.55) * 2;
      gsap.set(drawerPanelRef.current, { y: rubberBand });
    }
  };

  const handleDragEnd = (clientY: number) => {
    if (!isDraggingRef.current || !drawerPanelRef.current) return;
    isDraggingRef.current = false;

    const deltaY = clientY - touchStartY.current;
    const deltaTime = Math.max(1, Date.now() - touchStartTime.current);
    const velocity = deltaY / deltaTime; // px per ms

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Dismiss condition: dragged down > 100px OR flicked with velocity > 0.45 px/ms
    if (deltaY > 100 || (velocity > 0.45 && deltaY > 30)) {
      gsap.to(drawerPanelRef.current, {
        y: '100%',
        duration: prefersReducedMotion ? 0.15 : 0.24,
        ease: 'power2.in',
        onComplete: () => {
          unlockScrollSynchronously();
          if (glassShieldRef.current) {
            glassShieldRef.current.style.display = 'none';
          }
          setIsDragging(false);
          onClose();
          if (drawerPanelRef.current) {
            drawerPanelRef.current.style.transition = '';
            // Clear all GSAP inline transforms so Tailwind's translate-y-full takes over
            gsap.set(drawerPanelRef.current, { clearProps: 'all' });
          }
          if (backdropRef.current) {
            gsap.set(backdropRef.current, { clearProps: 'all' });
          }
        },
      });

      if (backdropRef.current) {
        gsap.to(backdropRef.current, {
          opacity: 0,
          duration: prefersReducedMotion ? 0.15 : 0.24,
        });
      }
    } else {
      // Snap back with tactile spring
      gsap.to(drawerPanelRef.current, {
        y: 0,
        duration: prefersReducedMotion ? 0.2 : 0.38,
        ease: prefersReducedMotion ? 'power1.out' : 'back.out(1.4)',
        onComplete: () => {
          unlockScrollSynchronously();
          if (glassShieldRef.current) {
            glassShieldRef.current.style.display = 'none';
          }
          setIsDragging(false);
          if (drawerPanelRef.current) {
            drawerPanelRef.current.style.transition = '';
            // Clear all GSAP inline transforms so Tailwind's translate-y-0 is active cleanly
            gsap.set(drawerPanelRef.current, { clearProps: 'all' });
          }
          if (backdropRef.current) {
            gsap.set(backdropRef.current, { clearProps: 'all' });
          }
        },
      });

      if (backdropRef.current) {
        gsap.to(backdropRef.current, {
          opacity: 1,
          duration: 0.2,
        });
      }
    }
  };

  // Touch Event Listeners
  const onTouchStartHandler = (e: React.TouchEvent) => {
    if (e.touches.length >= 1) {
      handleDragStart(e.touches[0].clientY);
    }
  };

  const onTouchMoveHandler = (e: React.TouchEvent) => {
    if (e.touches.length >= 1) {
      if (e.cancelable) e.preventDefault();
      handleDragMove(e.touches[0].clientY);
    }
  };

  const onTouchEndHandler = (e: React.TouchEvent) => {
    if (e.changedTouches.length >= 1) {
      handleDragEnd(e.changedTouches[0].clientY);
    }
  };

  // Pointer Event Listeners (desktop mouse / pointer emulation)
  const onPointerDownHandler = (e: React.PointerEvent) => {
    if (e.button === 0) {
      handleDragStart(e.clientY);
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMoveHandler = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      handleDragMove(e.clientY);
    }
  };

  const onPointerUpHandler = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      handleDragEnd(e.clientY);
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  const totalCount = getTotalCount();
  const subtotal = getSubtotal();
  const totalAmount = getTotalAmount();

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[90] bg-stone-950/60 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Bottom Sheet Panel */}
      <div
        ref={drawerPanelRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-labelledby="cart-drawer-title"
        className={`fixed inset-x-0 bottom-0 z-[100] bg-white rounded-t-[32px] max-h-[92dvh] flex flex-col transform transition-transform duration-300 ease-out overflow-hidden ${
          isOpen
            ? 'translate-y-0 pointer-events-auto shadow-[0_-12px_40px_rgba(0,0,0,0.22)]'
            : 'translate-y-full pointer-events-none shadow-none'
        }`}
      >
        {/* Invisible Glass Shield: Physically blocks touch events from reaching scrollable list during drag gesture */}
        <div ref={glassShieldRef} className="absolute inset-0 z-[60] hidden touch-none" />

        {/* Top Grab Handle Drag Zone (Touch-Responsive for Drag-to-Dismiss) */}
        <div
          onTouchStart={onTouchStartHandler}
          onTouchMove={onTouchMoveHandler}
          onTouchEnd={onTouchEndHandler}
          onTouchCancel={onTouchEndHandler}
          onPointerDown={onPointerDownHandler}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
          onPointerCancel={onPointerUpHandler}
          className="py-3.5 min-h-[48px] flex flex-col items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
          aria-label="Drag handle to dismiss cart drawer"
        >
          <div className="w-12 h-1.5 bg-stone-300 rounded-full hover:bg-stone-400 active:scale-95 transition-all" />
        </div>

        {/* Drawer Header Drag Zone */}
        <div
          onTouchStart={onTouchStartHandler}
          onTouchMove={onTouchMoveHandler}
          onTouchEnd={onTouchEndHandler}
          onTouchCancel={onTouchEndHandler}
          onPointerDown={onPointerDownHandler}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
          onPointerCancel={onPointerUpHandler}
          className="px-5 py-3 border-b border-stone-100 flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 id="cart-drawer-title" className="text-lg font-extrabold text-stone-900 tracking-tight">
                Your Bag
              </h2>
              {totalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-brand-orange text-white text-xs font-black tabular-nums shadow-xs">
                  {totalCount}
                </span>
              )}
            </div>
            <span className="text-[11px] text-stone-400 font-bold block">
              Review your customized orders
            </span>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirmClear) {
                    clearCart();
                    setConfirmClear(false);
                  } else {
                    setConfirmClear(true);
                  }
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={`text-xs font-extrabold px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                  confirmClear
                    ? 'bg-rose-100 text-rose-700 animate-pulse font-black'
                    : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
                }`}
              >
                {confirmClear ? 'Confirm Clear?' : 'Clear Bag'}
              </button>
            )}

            {/* Zero-Dependency Close Icon */}
            <button
              onClick={onClose}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close bag drawer"
              type="button"
              className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 active:scale-90 transition-all cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Cart Items Body */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overscroll-y-contain px-5 py-3 space-y-3 ${
            isDragging
              ? 'overflow-hidden touch-none pointer-events-none select-none'
              : 'overflow-y-auto'
          }`}
        >
          {items.length === 0 ? (
            <div
              onTouchStart={onTouchStartHandler}
              onTouchMove={onTouchMoveHandler}
              onTouchEnd={onTouchEndHandler}
              onTouchCancel={onTouchEndHandler}
              onPointerDown={onPointerDownHandler}
              onPointerMove={onPointerMoveHandler}
              onPointerUp={onPointerUpHandler}
              onPointerCancel={onPointerUpHandler}
              className="py-14 text-center flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none"
            >
              <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-brand-orange mb-3">
                <TakeawayBoxIcon className="w-8 h-8" />
              </div>
              <h3 className="font-extrabold text-base text-stone-800">Your bag is empty</h3>
              <p className="text-xs text-stone-400 mt-1 max-w-[220px]">
                Explore the menu and add your favourite dishes with customized add-ons!
              </p>
              <button
                type="button"
                onClick={onClose}
                onTouchStart={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="mt-5 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-black active:scale-95 transition-transform cursor-pointer"
              >
                Browse Merchant Menu
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] text-stone-400 font-bold uppercase tracking-wider px-1">
                <span>Items ({totalCount})</span>
                <span className="text-stone-400 font-normal normal-case">
                  Swipe left to delete
                </span>
              </div>

              {items.map((item) => (
                <SwipeableCartItem
                  key={item.cartItemId}
                  item={item}
                  isPendingDelete={itemPendingDelete?.cartItemId === item.cartItemId}
                  onUpdateQuantity={updateQuantity}
                  onRequestDelete={(targetItem) => setItemPendingDelete(targetItem)}
                />
              ))}
            </>
          )}
        </div>

        {/* Bottom Transparent Fee Ledger & Checkout Action */}
        {items.length > 0 && (
          <div className="p-5 border-t border-stone-200/80 bg-stone-50/80 shrink-0 space-y-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            {/* Transparent Cost Breakdown */}
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200/80 space-y-2 text-xs shadow-xs">
              <div className="flex justify-between text-stone-600 font-medium">
                <span>Dishes Subtotal ({totalCount} items)</span>
                <span className="font-extrabold text-stone-900 tabular-nums">
                  RM {subtotal.toFixed(2)}
                </span>
              </div>


              <div className="flex justify-between text-stone-600 font-medium">
                <span>Processing Fee</span>
                <span className="font-extrabold text-stone-900 tabular-nums">
                  {getConvenienceFee() === 0 ? 'RM 0.00 (Waived)' : `RM ${getConvenienceFee().toFixed(2)}`}
                </span>
              </div>

              <div className="flex justify-between text-stone-600 font-medium">
                <span>Service Fee (3.8%)</span>
                <span className="font-extrabold text-stone-900 tabular-nums">
                  {getServiceFee() === 0 ? 'RM 0.00 (Waived)' : `RM ${getServiceFee().toFixed(2)}`}
                </span>
              </div>

              {getOrderBalanceFee() > 0 && (
                <div className="flex justify-between text-stone-600 font-medium">
                  <span>Order Balance Fee</span>
                  <span className="font-extrabold text-stone-900 tabular-nums">
                    RM {getOrderBalanceFee().toFixed(2)}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-stone-100 flex justify-between items-baseline">
                <span className="font-black text-sm text-stone-900">Total Payable</span>
                <span className="text-lg font-black text-brand-orange tabular-nums tracking-tight">
                  RM {totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {!isMerchantOpen && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center gap-2">
                <span className="text-rose-600 text-sm">⚠️</span>
                <span>This stall is currently closed. Ordering is temporarily unavailable.</span>
              </div>
            )}

            {/* Sticky Auntie-Proof Checkout Button: Rigid Flex Row with Vertical Divider */}
            {!isMerchantOpen ? (
              <div className="w-full min-h-[56px] py-3.5 px-5 bg-stone-200 text-stone-500 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center cursor-not-allowed">
                <span>Stall Closed • Cannot Checkout</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleProceedToCheckoutClick}
                className="w-full min-h-[56px] py-3.5 px-5 bg-brand-orange hover:bg-orange-600 text-white rounded-2xl font-black text-sm sm:text-base shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer"
              >
                {/* Left Action Title */}
                <div className="flex items-center gap-2.5 min-w-0 pr-3">
                  <CartBagCheckoutIcon className="w-5 h-5 shrink-0 text-white" />
                  <span className="whitespace-nowrap tracking-tight font-black text-base">
                    Proceed to Checkout
                  </span>
                </div>

                {/* Right Total & Arrow separated by crisp vertical divider */}
                <div className="flex items-center pl-3.5 border-l border-white/30 shrink-0 gap-2">
                  <span className="text-base sm:text-lg font-black tabular-nums tracking-tight whitespace-nowrap">
                    RM {totalAmount.toFixed(2)}
                  </span>
                  <ArrowRightIcon className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )}
          </div>
        )}

        {/* Confirm to Delete Notification Modal Dialog */}
        {itemPendingDelete && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            aria-describedby="confirm-delete-desc"
            className="absolute inset-0 z-[110] bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-5 animate-in fade-in duration-200"
            onClick={() => setItemPendingDelete(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-stone-200/90 flex flex-col gap-4 animate-in zoom-in-95 duration-200"
            >
              {/* Icon & Title */}
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0 shadow-xs">
                  <TrashIcon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="confirm-delete-title" className="text-base font-extrabold text-stone-900 tracking-tight">
                    Confirm to Delete?
                  </h3>
                  <p id="confirm-delete-desc" className="text-xs text-stone-500 font-medium mt-0.5 leading-relaxed">
                    Are you sure you want to remove this dish from your bag?
                  </p>
                </div>
              </div>

              {/* Item Summary Card */}
              <div className="bg-stone-50 rounded-2xl p-3 border border-stone-200/70 text-xs">
                <div className="flex items-center justify-between font-extrabold text-stone-800">
                  <span className="truncate pr-2">{itemPendingDelete.name}</span>
                  <span className="tabular-nums text-brand-orange shrink-0">
                    RM {(itemPendingDelete.unitPriceWithModifiers * itemPendingDelete.quantity).toFixed(2)}
                  </span>
                </div>
                {itemPendingDelete.selectedModifiers && itemPendingDelete.selectedModifiers.length > 0 && (
                  <p className="text-[11px] text-stone-400 mt-1 truncate">
                    {itemPendingDelete.selectedModifiers.map((m) => m.option_name).join(', ')}
                  </p>
                )}
                {itemPendingDelete.specialInstructions && (
                  <p className="text-[10px] text-amber-700 italic mt-0.5 truncate">
                    "{itemPendingDelete.specialInstructions}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setItemPendingDelete(null)}
                  className="w-full py-3 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 font-extrabold text-xs transition-all cursor-pointer"
                >
                  Keep Item
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  <TrashIcon className="w-3.5 h-3.5 text-white" />
                  <span>Delete Item</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Self Pick-up Address Alert Dialog (gates checkout entry) */}
        {showPickupConfirm && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-pickup-title"
            aria-describedby="confirm-pickup-desc"
            className="absolute inset-0 z-[120] bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-5 animate-in fade-in duration-200"
            onClick={() => setShowPickupConfirm(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-stone-200/90 flex flex-col gap-4 animate-in zoom-in-95 duration-200"
            >
              {/* Icon & Title */}
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-brand-orange shrink-0 shadow-xs">
                  <MapPinIcon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="confirm-pickup-title" className="text-base font-extrabold text-stone-900 tracking-tight">
                    Confirm Self Pick-up Address
                  </h3>
                  <p id="confirm-pickup-desc" className="text-xs text-stone-500 font-medium mt-0.5 leading-relaxed">
                    Please confirm your collection point before proceeding to checkout.
                  </p>
                </div>
              </div>

              {/* Pick-up Address Card */}
              <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-200/80 flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-brand-orange shrink-0 shadow-xs">
                  <MapPinIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">
                    Self Pick-up Address
                  </span>
                  {isPickupAddressLoading ? (
                    <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5 mt-1">
                      <span className="w-3 h-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                      Loading address...
                    </span>
                  ) : (
                    <span className="text-sm font-extrabold text-stone-900 block break-words mt-0.5">
                      {pickupAddress || `${merchantBusinessName || 'Stall'} counter`}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
                Your order will be prepared for <span className="font-black text-stone-700">self pick-up only</span>. Show your 4-digit PIN at this address when collecting.
              </p>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPickupConfirm(false)}
                  className="w-full py-3 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 font-extrabold text-xs transition-all cursor-pointer"
                >
                  Back to Cart
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPickupAddress}
                  disabled={isPickupAddressLoading}
                  className="w-full py-3 px-4 rounded-xl bg-brand-orange hover:bg-orange-600 disabled:opacity-60 active:scale-95 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 cursor-pointer"
                >
                  <span>Confirm &amp; Continue</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Deletion Feedback Toast Notification */}
        {deleteToastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-16 inset-x-5 z-[105] pointer-events-none flex justify-center animate-in fade-in slide-in-from-top-3 duration-200"
          >
            <div className="bg-stone-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg backdrop-blur-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>{deleteToastMessage}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(drawerContent, document.body);
};
