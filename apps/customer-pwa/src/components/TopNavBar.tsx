import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

export interface TopNavBarProps {
  onLogoClick?: () => void;
  onOpenCart?: () => void;
  cartCount?: number;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onLogoClick,
  onOpenCart,
  cartCount = 0,
}) => {
  const badgeRef = useRef<HTMLSpanElement | null>(null);

  // Subtle pop animation when cart count changes
  useEffect(() => {
    if (cartCount > 0 && badgeRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        gsap.fromTo(
          badgeRef.current,
          { scale: 0.6, opacity: 0.8 },
          { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
        );
      }
    }
  }, [cartCount]);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-100 transition-colors">
      <div className="max-w-lg mx-auto px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] flex items-center justify-between">
        {/* Brand Logo (Tapping navigates to Home) */}
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="TapauTime Home"
          className="flex items-center -ml-1 p-1 rounded-xl focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:outline-none transition-transform active:scale-95 cursor-pointer"
        >
          <img
            src="/icons/tapau-brand-logo.png"
            alt="TapauTime"
            className="h-10 w-auto object-contain select-none pointer-events-none"
            onError={(e) => {
              e.currentTarget.src = '/icons/tapau-logo.png';
            }}
          />
        </button>

        {/* Shopping Bag Button with Notification Badge */}
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={cartCount > 0 ? `View shopping bag, ${cartCount} items` : 'View shopping bag'}
          className="w-11 h-11 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-stone-200/80 flex items-center justify-center text-stone-900 hover:border-brand-orange hover:text-brand-orange transition-all relative active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 fill-none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          {cartCount > 0 && (
            <span
              ref={badgeRef}
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-brand-orange text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm"
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
