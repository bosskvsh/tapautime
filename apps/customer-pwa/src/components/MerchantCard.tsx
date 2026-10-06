import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

export interface MerchantMerchant {
  id: string;
  business_name: string;
  cuisine_type?: string;
  pickup_address?: string;
  is_open: boolean;
  distance_km?: number;
  current_prep_delay?: number;
  rating?: number;
  image_url?: string;
  profile_url?: string;
  popular_item?: string;
  has_active_promo?: boolean;
}

export interface MerchantCardProps {
  merchant: MerchantMerchant;
  onSelect: (merchantId: string) => void;
  priority?: boolean;
}

export const MerchantCard: React.FC<MerchantCardProps> = ({
  merchant,
  onSelect,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // GSAP Tactile Card Bounce Feedback on Press (Auntie-Proof tactile feel)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handlePointerDown = () => {
      gsap.to(el, {
        scale: 0.975,
        duration: 0.1,
        ease: 'power1.out',
      });
    };

    const handlePointerRelease = () => {
      gsap.to(el, {
        scale: 1,
        duration: 0.24,
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
  }, []);

  const isOpen = merchant.is_open ?? true;
  const prepTime = merchant.current_prep_delay ?? 10;
  const distance = merchant.distance_km ? `${merchant.distance_km}km` : 'Near You';
  const cuisine = merchant.cuisine_type || 'Local Delights';

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={`View menu for ${merchant.business_name}, ${cuisine}, ${isOpen ? 'Open now' : 'Closed'}`}
      onClick={() => onSelect(merchant.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(merchant.id);
        }
      }}
      className={`group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white border border-stone-200/70 shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_16px_-6px_rgba(0,0,0,0.05)] hover:border-orange-200 hover:shadow-md transition-all duration-200 cursor-pointer touch-manipulation select-none ${
        !isOpen ? 'opacity-80 bg-stone-50/70' : ''
      }`}
    >
      {/* Left Column: Image + Details */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Stall Thumbnail with Soft Border & Smooth Zoom */}
        <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 overflow-hidden rounded-2xl bg-stone-100 border border-stone-200/60 shadow-2xs">
          <img
            src={
              merchant.profile_url ||
              merchant.image_url ||
              'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=200&h=200&q=80'
            }
            alt={merchant.business_name}
            className={`h-full w-full object-cover group-hover:scale-105 transition-transform duration-300 ${
              !isOpen ? 'grayscale-[40%]' : ''
            }`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/icons/tapau-logo.png';
            }}
          />

          {/* Tapau Deal badge inside merchant picture */}
          {merchant.has_active_promo && (
            <div className="absolute top-1.5 left-1.5 z-10">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 px-1.5 py-0.5 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-white shadow-md select-none backdrop-blur-[0.5px]"
                title="Active promo code available at this stall"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-2.5 w-2.5 text-amber-200 shrink-0"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.527.82-1.124 1.954-1.742 3.09C7.45 7.873 6.55 9.4 6 10.608V11a5 5 0 0010 0v-.392c0-1.208-.9-2.735-2.382-4.465-.618-1.136-1.215-2.27-1.742-3.09a3.844 3.844 0 00-.481-.5zM8 12a2 2 0 104 0 2 2 0 00-4 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Tapau Deal
              </span>
            </div>
          )}

          {/* Quick status pill when closed */}
          {!isOpen && (
            <div className="absolute inset-0 z-20 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
              <span className="text-[9px] font-black text-white uppercase tracking-wider bg-rose-600/90 px-1.5 py-0.5 rounded shadow-sm">
                Closed
              </span>
            </div>
          )}
        </div>

        {/* Info Hierarchy Column */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Row 1: Stall Name + Badges */}
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-sm sm:text-base font-extrabold text-stone-900 truncate tracking-tight group-hover:text-[#FF6600] transition-colors">
              {merchant.business_name}
            </h3>
            {!isOpen && (
              <span className="text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                Closed
              </span>
            )}
          </div>

          {/* Row 2: Cuisine / Category */}
          <p className="text-[11px] sm:text-xs text-stone-500 font-medium truncate">
            {cuisine}
          </p>

          {/* Row 3: Metadata Badges (Prep Time • Distance) */}
          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold text-stone-600 flex-wrap">
            <span className="inline-flex items-center gap-0.5 text-stone-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3 text-stone-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{prepTime} mins</span>
            </span>

            <span className="text-stone-300">•</span>

            <span className="text-stone-500 font-medium">
              {distance}
            </span>

            {merchant.pickup_address && (
              <>
                <span className="text-stone-300">•</span>
                <span
                  className="text-stone-500 font-medium inline-flex items-center gap-0.5 min-w-0"
                  title={`Self pick-up: ${merchant.pickup_address}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 text-stone-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <span className="truncate">{merchant.pickup_address}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Tactile Chevron Indicator (Replaces repetitive loud "Menu >" button) */}
      <div className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-50 text-stone-400 group-hover:bg-orange-50 group-hover:text-[#FF6600] group-hover:translate-x-0.5 transition-all">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};
