import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category?: string;
  imageUrl?: string;
  badges?: string[];
  is_available?: boolean;
  available_quantity?: number | null;
  has_modifiers?: boolean;
  bestseller?: boolean;
  requires_preorder?: boolean;
  lead_time_days?: number;
  daily_capacity?: number | null;
}

export interface MenuItemCardProps {
  item: MenuItem;
  inCartCount?: number;
  onSelect: (item: MenuItem) => void;
  isStallClosed?: boolean;
  hideBestSellerBadge?: boolean;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  inCartCount = 0,
  onSelect,
  isStallClosed = false,
  hideBestSellerBadge = false,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const hasValidPhoto = Boolean(item.imageUrl) && !imageError;
  const isOutOfStock =
    item.is_available === false ||
    (item.available_quantity !== undefined && item.available_quantity !== null && item.available_quantity <= 0);
  const isPreorderPaused = Boolean(item.requires_preorder);
  const isActionDisabled = isOutOfStock || isStallClosed || isPreorderPaused;

  // Tactile Spring Press Physics (Auntie-Proof Feedback)
  useEffect(() => {
    const el = cardRef.current;
    if (!el || isActionDisabled) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handlePointerDown = () => {
      gsap.to(el, {
        scale: 0.978,
        duration: 0.1,
        ease: 'power1.out',
      });
    };

    const handlePointerRelease = () => {
      gsap.to(el, {
        scale: 1,
        duration: 0.22,
        ease: 'back.out(2)',
      });
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerRelease);
    el.addEventListener('pointerleave', handlePointerRelease);
    el.addEventListener('pointercancel', handlePointerRelease);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerRelease);
      el.removeEventListener('pointerleave', handlePointerRelease);
      el.removeEventListener('pointercancel', handlePointerRelease);
    };
  }, [isActionDisabled]);

  const handleClick = () => {
    if (!isActionDisabled) {
      onSelect(item);
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      role="button"
      tabIndex={isActionDisabled ? -1 : 0}
      aria-label={`${item.name}, RM ${item.price.toFixed(2)}${isStallClosed ? ' (Stall Closed)' : isOutOfStock ? ' (Sold Out)' : ''}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isActionDisabled) {
          e.preventDefault();
          onSelect(item);
        }
      }}
      className={`group relative bg-white rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 flex gap-3.5 sm:gap-4 items-start ${
        isActionDisabled
          ? 'opacity-70 border-stone-200/80 bg-stone-50/80 cursor-not-allowed'
          : 'border-stone-200/70 shadow-[0_4px_20px_-4px_rgba(28,25,23,0.06),0_2px_6px_-2px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_24px_-4px_rgba(28,25,23,0.12)] hover:border-brand-orange/40 cursor-pointer active:shadow-sm'
      }`}
    >
      {/* Best Seller Badge */}
      {item.bestseller && !hideBestSellerBadge && (
        <span className="absolute -top-2.5 -left-2.5 text-[22px] drop-shadow-sm z-10 pointer-events-none">
          🔥
        </span>
      )}
      {/* Food Details Column */}
      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
        <div>
          {/* Header Badges Row */}
          {(isOutOfStock || item.requires_preorder) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {isOutOfStock && (
                <span className="inline-flex items-center text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 shrink-0">
                  Sold Out
                </span>
              )}
              {item.requires_preorder && (
                <span className="inline-flex items-center text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                  Tapau Ahead • Paused
                </span>
              )}
            </div>
          )}

          {/* Dish Name */}
          <h3 className="font-black text-stone-900 text-base leading-snug tracking-tight group-hover:text-brand-orange transition-colors">
            {item.name}
          </h3>

          {/* Description */}
          {item.description ? (
            <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed mt-1">
              {item.description}
            </p>
          ) : null}
        </div>

        {/* Price & Action Row */}
        <div className="mt-3 flex items-center justify-between pt-1">
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-extrabold text-stone-400">RM</span>
            <span className="text-lg font-black text-stone-900 tabular-nums tracking-tight">
              {item.price.toFixed(2)}
            </span>
          </div>

          {/* Mobile Auntie-Proof Tap Action */}
          {isStallClosed ? null : !isOutOfStock ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={`Add ${item.name} to cart`}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-150 shadow-sm ${
                  inCartCount > 0
                    ? 'bg-brand-orange text-white shadow-brand-orange/30 shadow-md scale-105'
                    : 'bg-stone-900 text-white group-hover:bg-brand-orange active:scale-90'
                }`}
              >
                {inCartCount > 0 ? (
                  <span className="text-xs font-black">+{inCartCount}</span>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 stroke-[3]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              {item.requires_preorder ? 'Paused' : isStallClosed ? 'Stall Closed' : 'Unavailable'}
            </span>
          )}
        </div>
      </div>

      {/* Food Photo Container - Only rendered when dish has an attached photo */}
      {hasValidPhoto && (
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 bg-stone-100 border border-stone-200/60 shadow-inner">
          <img
            src={item.imageUrl}
            alt={item.name}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              isActionDisabled ? 'grayscale contrast-75' : ''
            }`}
            loading="lazy"
            onError={() => setImageError(true)}
          />

          {/* In-Cart Live Counter Badge on Photo */}
          {inCartCount > 0 && !isStallClosed && (
            <div className="absolute top-1.5 right-1.5 bg-brand-orange text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-0.5 border border-white/40">
              <span className="material-symbols-outlined text-[11px]">shopping_bag</span>
              <span>{inCartCount}</span>
            </div>
          )}

          {/* Closed or Sold-out overlay */}
          {isStallClosed ? (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-1 text-center">
            </div>
          ) : isOutOfStock ? (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-1 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-white bg-black/70 px-2 py-0.5 rounded-md border border-white/20">
                Sold Out
              </span>
            </div>
          ) : item.requires_preorder ? (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-1 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-black/75 px-2 py-0.5 rounded-md border border-amber-400/30">
                Paused
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
