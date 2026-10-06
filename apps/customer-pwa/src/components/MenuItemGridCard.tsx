import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { MenuItem, MenuItemCardProps } from './MenuItemCard';

/**
 * Merchant-customizable grid tile colours (persisted on public.merchants).
 */
export interface GridTileColors {
  cardBg: string;
  nameColor: string;
  priceColor: string;
}

export const DEFAULT_GRID_TILE_COLORS: GridTileColors = {
  cardBg: '#FFFFFF',
  nameColor: '#1C1917',
  priceColor: '#E86A1C',
};

/**
 * Square, photo-first menu tile used by the customer PWA's grid layout.
 * Behaves identically to the list row (tap opens the modifier modal) so the
 * cart flow is unchanged between views.
 */
export const MenuItemGridCard: React.FC<MenuItemCardProps & { tileColors?: GridTileColors }> = ({
  item,
  inCartCount = 0,
  onSelect,
  isStallClosed = false,
  tileColors = DEFAULT_GRID_TILE_COLORS,
  hideBestSellerBadge = false,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const hasValidPhoto = Boolean(item.imageUrl) && !imageError;
  const isOutOfStock =
    item.is_available === false ||
    (item.available_quantity !== undefined && item.available_quantity !== null && item.available_quantity <= 0);
  const isActionDisabled = isOutOfStock || isStallClosed;

  // Tactile Spring Press Physics (Auntie-Proof Feedback) — mirrors MenuItemCard
  useEffect(() => {
    const el = cardRef.current;
    if (!el || isActionDisabled) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handlePointerDown = () => {
      gsap.to(el, { scale: 0.97, duration: 0.1, ease: 'power1.out' });
    };
    const handlePointerRelease = () => {
      gsap.to(el, { scale: 1, duration: 0.22, ease: 'back.out(2)' });
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
      className={`group relative flex flex-col rounded-2xl border transition-all duration-200 ${
        isActionDisabled
          ? 'opacity-70 border-stone-200/80 bg-stone-50/80 cursor-not-allowed'
          : 'border-black/10 shadow-[0_4px_20px_-4px_rgba(28,25,23,0.06),0_2px_6px_-2px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_24px_-4px_rgba(28,25,23,0.12)] hover:border-brand-orange/40 cursor-pointer active:shadow-sm'
      }`}
      style={isActionDisabled ? undefined : { backgroundColor: tileColors.cardBg }}
    >
      {/* Best Seller Badge */}
      {item.bestseller && !hideBestSellerBadge && (
        <div className="absolute -top-2.5 -left-2.5 text-[22px] drop-shadow-sm z-10 pointer-events-none">
          🔥
        </div>
      )}

      {/* Square Photo */}
      <div className="relative aspect-square bg-stone-100 overflow-hidden rounded-t-2xl">
        {hasValidPhoto ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              isActionDisabled ? 'grayscale contrast-75' : ''
            }`}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-stone-200/70">
            <span className="material-symbols-outlined text-4xl text-stone-400">restaurant</span>
          </div>
        )}



        {/* In-Cart Live Counter Badge */}
        {inCartCount > 0 && !isStallClosed && (
          <div className="absolute top-1.5 right-1.5 bg-brand-orange text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5 border border-white/40">
            <span className="material-symbols-outlined text-[11px]">shopping_bag</span>
            <span>{inCartCount}</span>
          </div>
        )}

        {/* Closed or Sold-out overlay */}
        {isStallClosed ? (
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
          </div>
        ) : isOutOfStock ? (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-white bg-black/70 px-2 py-0.5 rounded-md border border-white/20">
              Sold Out
            </span>
          </div>
        ) : null}
      </div>

      {/* Caption */}
      <div className="flex flex-col gap-0.5 px-2 py-2 rounded-b-2xl" style={{ backgroundColor: tileColors.cardBg }}>
        <span className="text-[11px] font-extrabold leading-tight line-clamp-2 h-[26px] overflow-hidden" style={{ color: tileColors.nameColor }}>
          {item.name}
        </span>
        <span className="text-[11px] font-black tabular-nums" style={{ color: tileColors.priceColor }}>
          RM {item.price.toFixed(2)}
        </span>
      </div>
    </div>
  );
};
