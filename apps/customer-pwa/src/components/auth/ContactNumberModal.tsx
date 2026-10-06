import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';

export interface ContactNumberModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess?: (phone: string, updatedUser?: User) => void;
  allowDismiss?: boolean;
}

/**
 * Normalizes Malaysian phone number to E.164 (+601XXXXXXXX) format
 */
export const normalizeMalaysianPhone = (raw: string): { isValid: boolean; formatted: string; error?: string } => {
  const cleaned = raw.replace(/[\s\-\(\)]/g, '');
  if (!cleaned) {
    return { isValid: false, formatted: '', error: 'Please enter your contact number.' };
  }

  let normalized = cleaned;
  if (normalized.startsWith('+60')) {
    // Already has +60
  } else if (normalized.startsWith('60')) {
    normalized = `+${normalized}`;
  } else if (normalized.startsWith('0')) {
    normalized = `+6${normalized}`;
  } else if (normalized.startsWith('1')) {
    normalized = `+60${normalized}`;
  } else {
    return { isValid: false, formatted: '', error: 'Please enter a valid Malaysian phone number (e.g. 012-345 6789).' };
  }

  // Also handle accidental +600... if user typed 0 after prefix
  if (normalized.startsWith('+600')) {
    normalized = `+60${normalized.slice(4)}`;
  }

  // Malaysian mobile numbers: +601 followed by 7-9 digits (total 11 to 13 characters including +60)
  const myPhoneRegex = /^\+60(1[0-9]{8,9}|[3-9][0-9]{7,8})$/;
  if (!myPhoneRegex.test(normalized)) {
    return {
      isValid: false,
      formatted: normalized,
      error: 'Please enter a valid Malaysian phone number (e.g. 012-345 6789 or 011-1234 5678).'
    };
  }

  return { isValid: true, formatted: normalized };
};

export const ContactNumberModal: React.FC<ContactNumberModalProps> = ({
  isOpen,
  user,
  onClose,
  onSuccess,
  allowDismiss = true,
}) => {
  const [phoneNumber, setPhoneNumber] = useState(
    user?.phone || user?.user_metadata?.phone || ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gesture drag-to-dismiss references
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Keep phone number synchronized with user changes when modal opens
  React.useEffect(() => {
    if (isOpen && user) {
      setPhoneNumber(user.phone || user.user_metadata?.phone || '');
      setErrorMessage(null);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const { isValid, formatted, error } = normalizeMalaysianPhone(phoneNumber);
    if (!isValid) {
      setErrorMessage(error || 'Invalid phone number format.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Update user metadata in Supabase Auth
      const { data: updateRes, error: authError } = await supabase.auth.updateUser({
        data: {
          phone: formatted,
        },
      });

      if (authError) {
        throw authError;
      }

      // 2. Persist to public.users table for merchant order querying
      const resolvedName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'Customer';

      const nowIso = new Date().toISOString();

      // Attempt UPDATE first so existing rows never fail on INSERT-only RLS gates
      const { data: updateData, error: dbUpdateError } = await supabase
        .from('users')
        .update({
          phone: formatted,
          name: resolvedName,
          updated_at: nowIso,
        })
        .eq('id', user.id)
        .select();

      // If no existing row was updated or error occurred, execute fallback upsert
      if (dbUpdateError || !updateData || updateData.length === 0) {
        const { error: dbInsertError } = await supabase.from('users').upsert(
          {
            id: user.id,
            phone: formatted,
            name: resolvedName,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );

        if (dbInsertError) {
          console.error('[ContactNumberModal] Failed syncing to public.users:', dbInsertError);
          throw dbInsertError;
        }
      }

      // 3. Propagate updated contact info to customer orders for immediate merchant KDS display
      try {
        const { error: ordersUpdateErr } = await supabase
          .from('orders')
          .update({
            customer_phone: formatted,
            customer_name: resolvedName,
          })
          .eq('customer_id', user.id);

        if (ordersUpdateErr) {
          console.warn('[ContactNumberModal] Notice updating customer_phone on orders:', ordersUpdateErr);
        }
      } catch (ordersSyncErr) {
        console.warn('[ContactNumberModal] Failed to sync phone to orders table:', ordersSyncErr);
      }

      // 4. Update reactive state in useAuthStore immediately
      const nextUser: User = {
        ...(updateRes?.user || user),
        phone: formatted,
        user_metadata: {
          ...(updateRes?.user?.user_metadata || user.user_metadata),
          phone: formatted,
        },
      };
      useAuthStore.getState().setUser(nextUser);

      // 5. Mark phone verified in this session to avoid re-triggering
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`contact_verified_${user.id}`, 'true');
      }

      if (onSuccess) {
        onSuccess(formatted, nextUser);
      }
      onClose();
    } catch (err: any) {
      console.error('[ContactNumberModal] Error saving contact number:', err);
      setErrorMessage(err.message || 'Failed to save contact number. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined' && user) {
      sessionStorage.setItem(`dismissed_contact_modal_${user.id}`, 'true');
    }
    onClose();
  };

  /**
   * GSAP Drag-to-Dismiss Gesture Engine
   * Enables smooth 1-to-1 touch tracking, flick dismissal, and spring snap-back.
   */
  const handleDragStart = (clientY: number) => {
    if (!allowDismiss) return;
    touchStartY.current = clientY;
    touchStartTime.current = Date.now();
    isDragging.current = true;

    if (modalPanelRef.current) {
      gsap.killTweensOf(modalPanelRef.current);
      modalPanelRef.current.style.transition = 'none';
    }
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging.current || !modalPanelRef.current || !allowDismiss) return;
    const deltaY = clientY - touchStartY.current;

    if (deltaY > 0) {
      // Downward drag: 1-to-1 tracking
      gsap.set(modalPanelRef.current, { y: deltaY });

      // Ambient backdrop fade
      if (backdropRef.current) {
        const progress = Math.min(1, deltaY / 240);
        backdropRef.current.style.opacity = String(Math.max(0.1, 1 - progress * 0.9));
      }
    } else {
      // Upward drag: subtle rubber-band resistance
      const rubberBand = -Math.pow(Math.abs(deltaY), 0.55) * 2;
      gsap.set(modalPanelRef.current, { y: rubberBand });
    }
  };

  const handleDragEnd = (clientY: number) => {
    if (!isDragging.current || !modalPanelRef.current || !allowDismiss) return;
    isDragging.current = false;

    const deltaY = clientY - touchStartY.current;
    const deltaTime = Math.max(1, Date.now() - touchStartTime.current);
    const velocity = deltaY / deltaTime; // px per ms

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Dismiss condition: dragged down > 80px OR flicked with velocity > 0.4 px/ms and moved > 25px
    if (deltaY > 80 || (velocity > 0.4 && deltaY > 25)) {
      gsap.to(modalPanelRef.current, {
        y: '100%',
        duration: prefersReducedMotion ? 0.15 : 0.24,
        ease: 'power2.in',
        onComplete: () => {
          handleDismiss();
          if (modalPanelRef.current) {
            modalPanelRef.current.style.transition = '';
            gsap.set(modalPanelRef.current, { clearProps: 'all' });
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
      gsap.to(modalPanelRef.current, {
        y: 0,
        duration: prefersReducedMotion ? 0.2 : 0.35,
        ease: prefersReducedMotion ? 'power1.out' : 'back.out(1.4)',
        onComplete: () => {
          if (modalPanelRef.current) {
            modalPanelRef.current.style.transition = '';
            gsap.set(modalPanelRef.current, { clearProps: 'all' });
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

  // Pointer Event Listeners (desktop / mouse / pointer emulation)
  const onPointerDownHandler = (e: React.PointerEvent) => {
    if (e.button === 0) {
      handleDragStart(e.clientY);
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMoveHandler = (e: React.PointerEvent) => {
    if (isDragging.current) {
      handleDragMove(e.clientY);
    }
  };

  const onPointerUpHandler = (e: React.PointerEvent) => {
    if (isDragging.current) {
      handleDragEnd(e.clientY);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
    >
      {/* Frosted Backdrop */}
      <div
        ref={backdropRef}
        onClick={allowDismiss ? handleDismiss : undefined}
        className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        ref={modalPanelRef}
        className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl border border-stone-100 overflow-hidden z-10 max-h-[92dvh] flex flex-col transform transition-all duration-300"
      >
        {/* Mobile Pull Handle Drag Zone (Touch-Responsive for Drag-to-Dismiss) */}
        <div
          onTouchStart={allowDismiss ? onTouchStartHandler : undefined}
          onTouchMove={allowDismiss ? onTouchMoveHandler : undefined}
          onTouchEnd={allowDismiss ? onTouchEndHandler : undefined}
          onTouchCancel={allowDismiss ? onTouchEndHandler : undefined}
          onPointerDown={allowDismiss ? onPointerDownHandler : undefined}
          onPointerMove={allowDismiss ? onPointerMoveHandler : undefined}
          onPointerUp={allowDismiss ? onPointerUpHandler : undefined}
          onPointerCancel={allowDismiss ? onPointerUpHandler : undefined}
          onClick={allowDismiss ? handleDismiss : undefined}
          className={`py-3.5 min-h-[44px] flex flex-col items-center justify-center shrink-0 select-none sm:hidden ${
            allowDismiss ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-default'
          }`}
          aria-label={allowDismiss ? 'Drag handle to dismiss modal' : undefined}
          role={allowDismiss ? 'button' : undefined}
        >
          <div className="w-12 h-1.5 bg-stone-300 rounded-full hover:bg-stone-400 active:scale-95 transition-all" />
        </div>

        {/* Close Button if dismissible */}
        {allowDismiss && (
          <button
            onClick={handleDismiss}
            type="button"
            aria-label="Close contact modal"
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <div className="p-6 sm:p-8 overflow-y-auto">
          {/* Header Icon & Title */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#f97316] flex items-center justify-center mx-auto mb-3.5 shadow-inner">
              <svg
                className="w-7 h-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <h2 id="contact-modal-title" className="text-2xl font-black text-stone-900 tracking-tight">
              Add Your Contact Number
            </h2>
            <p className="text-xs text-stone-500 font-semibold mt-2 px-2 leading-relaxed">
              Merchants need your contact number to reach you if an ingredient runs out or to notify you immediately when your food is ready.
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl flex items-start gap-2.5 animate-fadeIn">
              <svg
                className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Malaysian Mobile Number
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center gap-1.5 pointer-events-none text-stone-500 font-bold text-sm">
                  <span>🇲🇾</span>
                  <span>+60</span>
                  <span className="text-stone-300">|</span>
                </div>
                <input
                  type="tel"
                  required
                  autoFocus
                  value={phoneNumber.replace(/^\+?60/, '')}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/[^0-9]/g, '');
                    const stripped = rawVal.replace(/^(\+?60|0)/, '');
                    setPhoneNumber(stripped ? `+60${stripped}` : '');
                  }}
                  placeholder="12 345 6789"
                  className="w-full pl-20 pr-4 py-3.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-black text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/10 transition-all"
                />
              </div>
              <p className="text-[11px] text-stone-400 font-medium mt-1.5 px-1">
                e.g. 012-345 6789 or 011-1234 5678
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 px-6 bg-[#f97316] hover:bg-orange-600 active:scale-[0.98] text-white font-black text-sm rounded-2xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving Contact...</span>
                  </>
                ) : (
                  <span>Save Contact Number</span>
                )}
              </button>

              {allowDismiss && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={isLoading}
                  className="w-full py-3 text-xs font-bold text-stone-400 hover:text-stone-600 transition-colors"
                >
                  I'll do this later
                </button>
              )}
            </div>
          </form>

          {/* Privacy Note */}
          <div className="mt-4 text-center">
            <p className="text-[11px] font-semibold text-stone-400">
              🔒 Your contact number is only shared with merchants preparing your active orders.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
