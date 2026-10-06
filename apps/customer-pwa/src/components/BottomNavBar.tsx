import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

export type NavTab = 'home' | 'tapau_ahead' | 'orders' | 'rewards' | 'profile';

export interface BottomNavBarProps {
  currentTab: NavTab | string;
  onTabChange: (tab: NavTab) => void;
  onCartClick: () => void;
  cartCount?: number;
  hasActiveOrder?: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentTab,
  onTabChange,
  onCartClick,
  cartCount = 0,
  hasActiveOrder = false,
}) => {
  const fabRef = useRef<HTMLButtonElement | null>(null);

  const isHome = ['home', 'menu'].includes(currentTab);
  const isTapauAhead = currentTab === 'tapau_ahead';
  const isOrders = ['orders', 'rewards', 'status'].includes(currentTab);
  const isProfile = currentTab === 'profile';

  // GSAP micro-interaction: Pop animation for FAB on click or cart count change
  const handleFabClick = () => {
    if (fabRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        gsap.fromTo(
          fabRef.current,
          { scale: 0.88 },
          { scale: 1, duration: 0.28, ease: 'back.out(2.5)' }
        );
      }
    }
    onCartClick();
  };

  // Subtle bounce on cart count change
  useEffect(() => {
    if (cartCount > 0 && fabRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        gsap.fromTo(
          fabRef.current,
          { scale: 1.08 },
          { scale: 1, duration: 0.22, ease: 'power2.out' }
        );
      }
    }
  }, [cartCount]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full bg-white/95 backdrop-blur-xl border-t border-stone-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      aria-label="Bottom Navigation"
    >
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4 sm:h-[68px] sm:px-6">

          {/* 1. Home Tab */}
          <button
            type="button"
            onClick={() => onTabChange('home')}
            aria-label="Home"
            aria-selected={isHome}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors active:scale-95 touch-manipulation ${
              isHome ? 'text-[#FF6600]' : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-active:scale-90"
                fill={isHome ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={isHome ? 0 : 2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </div>
            <span
              className={`text-[10px] tracking-tight transition-all ${
                isHome ? 'font-extrabold text-[#FF6600]' : 'font-semibold text-stone-500'
              }`}
            >
              Home
            </span>
            {/* Active Indicator Dot */}
            <span
              className={`h-1 w-1 rounded-full transition-all ${
                isHome ? 'bg-[#FF6600] opacity-100' : 'bg-transparent opacity-0'
              }`}
              aria-hidden="true"
            />
          </button>

          {/* 2. Tapau Ahead Tab (Replaces Orders in Tab 2) */}
          <button
            type="button"
            onClick={() => onTabChange('tapau_ahead')}
            aria-label="Tapau Ahead"
            aria-selected={isTapauAhead}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors active:scale-95 touch-manipulation ${
              isTapauAhead ? 'text-[#FF6600]' : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <img
                src="/icons/tapau-ahead.png"
                alt="Tapau Ahead"
                className={`h-5 w-5 sm:h-6 sm:w-6 object-contain transition-all duration-200 pointer-events-none select-none group-active:scale-90 ${
                  isTapauAhead
                    ? 'scale-110 drop-shadow-[0_2px_4px_rgba(255,102,0,0.3)]'
                    : 'opacity-60 grayscale-[40%] hover:opacity-90 hover:grayscale-0'
                }`}
              />
            </div>
            <span
              className={`text-[10px] tracking-tight whitespace-nowrap transition-all ${
                isTapauAhead ? 'font-extrabold text-[#FF6600]' : 'font-semibold text-stone-500'
              }`}
            >
              Tapau Ahead
            </span>
            {/* Active Indicator Dot */}
            <span
              className={`h-1 w-1 rounded-full transition-all ${
                isTapauAhead ? 'bg-[#FF6600] opacity-100' : 'bg-transparent opacity-0'
              }`}
              aria-hidden="true"
            />
          </button>

          {/* 3. Center Elevated FAB */}
          <div className="relative -top-4 sm:-top-5 shrink-0 px-1">
            <button
              ref={fabRef}
              type="button"
              onClick={handleFabClick}
              aria-label={`View Cart, ${cartCount} items`}
              className="relative flex h-14 w-14 sm:h-[58px] sm:w-[58px] items-center justify-center rounded-full border-4 border-white bg-gradient-to-tr from-[#FF6600] via-orange-500 to-amber-500 text-white shadow-[0_8px_22px_-4px_rgba(255,102,0,0.45)] transition-transform duration-200 active:scale-90 hover:scale-105 touch-manipulation focus:outline-none cursor-pointer"
            >
              <img
                src="/icons/tapau-box.png"
                alt="Tapau Cart"
                className="h-8 w-8 sm:h-9 sm:w-9 object-contain pointer-events-none drop-shadow-xs"
              />

              {/* Cart Count Badge */}
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-stone-900 text-[10px] font-black text-white shadow-xs">
                  {cartCount}
                </span>
              )}
            </button>
          </div>

          {/* 4. Orders Tab (Moved from Tab 2 to Tab 4) */}
          <button
            type="button"
            onClick={() => onTabChange('orders')}
            aria-label="Orders"
            aria-selected={isOrders}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors active:scale-95 touch-manipulation ${
              isOrders ? 'text-[#FF6600]' : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-active:scale-90"
                fill={isOrders ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={isOrders ? 0 : 2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            </div>
            <span
              className={`text-[10px] tracking-tight transition-all ${
                isOrders ? 'font-extrabold text-[#FF6600]' : 'font-semibold text-stone-500'
              }`}
            >
              Orders
            </span>
            {/* Active Indicator Dot */}
            <span
              className={`h-1 w-1 rounded-full transition-all ${
                isOrders ? 'bg-[#FF6600] opacity-100' : 'bg-transparent opacity-0'
              }`}
              aria-hidden="true"
            />
          </button>

          {/* 5. Profile Tab */}
          <button
            type="button"
            onClick={() => onTabChange('profile')}
            aria-label="Profile"
            aria-selected={isProfile}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors active:scale-95 touch-manipulation ${
              isProfile ? 'text-[#FF6600]' : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-active:scale-90"
                fill={isProfile ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={isProfile ? 0 : 2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <span
              className={`text-[10px] tracking-tight transition-all ${
                isProfile ? 'font-extrabold text-[#FF6600]' : 'font-semibold text-stone-500'
              }`}
            >
              Profile
            </span>
            {/* Active Indicator Dot */}
            <span
              className={`h-1 w-1 rounded-full transition-all ${
                isProfile ? 'bg-[#FF6600] opacity-100' : 'bg-transparent opacity-0'
              }`}
              aria-hidden="true"
            />
          </button>

      </div>
    </nav>
  );
};
