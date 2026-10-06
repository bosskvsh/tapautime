import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

export interface HeroCardProps {
  isTakeaway?: boolean;
  onToggleMode?: (isTakeaway: boolean) => void;
  title?: string;
  tagline?: string;
}

export const HeroCard: React.FC<HeroCardProps> = ({
  title = 'Ready to Tapau?',
  tagline = 'Skip long merchant queues. Order on your phone, pick up piping hot!',
}) => {
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  const mascotRef = useRef<HTMLImageElement | null>(null);

  // 1. Ambient Floating GSAP Animation for Kopi Mascot
  useEffect(() => {
    if (!mascotRef.current) return;

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.to(mascotRef.current, {
        y: -6,
        rotation: 1.8,
        duration: 2.2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="space-y-3 px-4">
      {/* Visual Hero Container with Multi-Stop Dawn Gradient & Glass Shimmer */}
      <div
        ref={heroCardRef}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-amber-500 via-[#FF6600] to-[#E64A00] p-6 text-white shadow-[0_14px_35px_-8px_rgba(249,115,22,0.38)]"
      >
        {/* Soft Radial Ambient Glow in background */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-black/10 blur-xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
          {/* Text Content Area */}
          <div className="flex-1 space-y-2">
            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
              {title}
            </h1>

            {/* Tagline */}
            <p className="max-w-[210px] text-xs leading-relaxed text-orange-50/95 font-medium">
              {tagline}
            </p>
          </div>

          {/* Kopi Mascot Illustration - Breaks out organically with drop shadow */}
          <div className="relative shrink-0 flex items-center justify-center w-24 h-28 sm:w-28 sm:h-32 -mr-2">
            <img
              ref={mascotRef}
              src="/icons/tapau_vector.png"
              alt="Tapau Kopi Ikat Tepi"
              className="h-28 w-28 sm:h-32 sm:w-32 object-contain filter drop-shadow-[0_12px_18px_rgba(0,0,0,0.3)] pointer-events-none select-none will-change-transform"
              onError={(e) => {
                // Fallback to logo if vector missing
                e.currentTarget.src = '/icons/tapau-hero.png';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
