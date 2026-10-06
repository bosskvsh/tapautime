import React from 'react';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  badges?: string[];
  is_available?: boolean;
  stock_quantity?: number;
  has_modifiers?: boolean;
}

export interface MenuItemCardProps {
  item: MenuItem;
  inCartCount?: number;
  onSelect: (item: MenuItem) => void;
  onQuickAdd?: (item: MenuItem, e: React.MouseEvent) => void;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  inCartCount = 0,
  onSelect,
  onQuickAdd,
}) => {
  const isOutOfStock =
    item.is_available === false ||
    (item.stock_quantity !== undefined && item.stock_quantity <= 0);

  const handleClick = () => {
    if (!isOutOfStock) {
      onSelect(item);
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    if (item.has_modifiers) {
      onSelect(item);
    } else if (onQuickAdd) {
      onQuickAdd(item, e);
    } else {
      onSelect(item);
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={isOutOfStock ? -1 : 0}
      aria-label={`${item.name}, RM ${item.price.toFixed(2)}${isOutOfStock ? ' (Sold Out)' : ''}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isOutOfStock) {
          e.preventDefault();
          onSelect(item);
        }
      }}
      className={`group relative bg-white rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 flex gap-3.5 sm:gap-4 items-start ${
        isOutOfStock
          ? 'opacity-60 border-stone-200/80 bg-stone-50 cursor-not-allowed'
          : 'border-stone-200/70 shadow-[0_4px_20px_-4px_rgba(28,25,23,0.06),0_2px_6px_-2px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_24px_-4px_rgba(28,25,23,0.12)] hover:border-brand-orange/40 cursor-pointer active:scale-[0.98]'
      }`}
    >
      {/* Food Details Column */}
      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
        <div>
          {/* Header Badges Row */}
          {isOutOfStock ? (
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="inline-flex items-center text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 shrink-0">
                Sold Out
              </span>
            </div>
          ) : item.badges && item.badges.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {item.badges.map((badge, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-100 text-brand-orange shrink-0"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

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

          {/* Touch Action Button */}
          {!isOutOfStock ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleButtonClick}
                aria-label={`Add ${item.name} to cart`}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-150 shadow-sm cursor-pointer ${
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
              Unavailable
            </span>
          )}
        </div>
      </div>

      {/* Food Photo Container */}
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 bg-stone-100 border border-stone-200/60 shadow-inner">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              isOutOfStock ? 'grayscale contrast-75' : ''
            }`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const fallback = parent.querySelector('.fallback-placeholder');
                if (fallback) (fallback as HTMLElement).style.display = 'flex';
              }
            }}
          />
        ) : null}

        {/* Fallback Food Illustration */}
        <div
          className={`fallback-placeholder w-full h-full flex flex-col items-center justify-center text-stone-300 bg-gradient-to-br from-stone-50 to-stone-100 ${
            item.imageUrl ? 'hidden' : 'flex'
          }`}
        >
          <span className="material-symbols-outlined text-3xl text-stone-300">restaurant</span>
        </div>

        {/* In-Cart Live Counter Badge on Photo */}
        {inCartCount > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-brand-orange text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-0.5 border border-white/40">
            <span className="material-symbols-outlined text-[11px]">shopping_bag</span>
            <span>{inCartCount}</span>
          </div>
        )}

        {/* Sold-out dark overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-1 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-white bg-black/70 px-2 py-0.5 rounded-md border border-white/20">
              Sold Out
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
