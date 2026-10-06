import React, { useState, useRef, useCallback, useEffect } from 'react';

export interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  pullingText?: string;
  releaseText?: string;
  refreshingText?: string;
  completeText?: string;
}

type RefreshStatus = 'idle' | 'pulling' | 'canRelease' | 'refreshing' | 'complete';

const THRESHOLD = 65; // Pull distance in pixels required to trigger refresh
const MAX_PULL = 95;   // Maximum damped pull distance

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  disabled = false,
  className = '',
  pullingText = 'Pull to refresh',
  releaseText = 'Release to refresh',
  refreshingText = 'Refreshing...',
  completeText = 'Updated!',
}) => {
  const [status, setStatus] = useState<RefreshStatus>('idle');
  const [pullDistance, setPullDistance] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const isEligibleRef = useRef(false);
  const hapticTriggeredRef = useRef(false);

  // Check if page/container is scrolled to top
  const isScrolledToTop = useCallback(() => {
    if (typeof window === 'undefined') return true;
    const windowScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (windowScrollTop > 2) return false;

    if (containerRef.current) {
      const containerScrollTop = containerRef.current.scrollTop;
      if (containerScrollTop > 2) return false;
    }
    return true;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (disabled || status === 'refreshing' || status === 'complete') return;

      if (!isScrolledToTop()) {
        isEligibleRef.current = false;
        return;
      }

      const touch = e.touches[0];
      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      isEligibleRef.current = true;
      isPullingRef.current = false;
      hapticTriggeredRef.current = false;
    },
    [disabled, status, isScrolledToTop]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isEligibleRef.current || disabled || status === 'refreshing' || status === 'complete') return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - startYRef.current;
      const deltaX = touch.clientX - startXRef.current;

      // Ignore horizontal swipes or upward scrolls
      if (!isPullingRef.current) {
        if (Math.abs(deltaX) > Math.abs(deltaY) || deltaY <= 0) {
          isEligibleRef.current = false;
          return;
        }

        // Must still be at top
        if (!isScrolledToTop()) {
          isEligibleRef.current = false;
          return;
        }

        isPullingRef.current = true;
      }

      if (deltaY > 0) {
        // Damping formula: logarithmic rubber-banding
        const damped = Math.min(MAX_PULL, Math.pow(deltaY, 0.85) * 1.5);
        setPullDistance(damped);

        if (damped >= THRESHOLD) {
          if (!hapticTriggeredRef.current) {
            hapticTriggeredRef.current = true;
            if (typeof window !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate(12);
              } catch (_) {}
            }
          }
          setStatus('canRelease');
        } else {
          hapticTriggeredRef.current = false;
          setStatus('pulling');
        }

        // Prevent native overscroll when we are actively pulling
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    },
    [disabled, status, isScrolledToTop]
  );

  const triggerRefresh = useCallback(async () => {
    setStatus('refreshing');
    setPullDistance(56); // Rest at comfortable indicator height during loading

    const startTime = Date.now();
    try {
      await Promise.resolve(onRefresh());
    } catch (err) {
      console.error('[PullToRefresh] onRefresh error:', err);
    } finally {
      // Ensure spinner stays visible for at least 450ms for satisfying tactile feedback
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, 450 - elapsed);

      setTimeout(() => {
        setStatus('complete');
        // Brief success feedback before retraction
        setTimeout(() => {
          setStatus('idle');
          setPullDistance(0);
        }, 350);
      }, remainingDelay);
    }
  }, [onRefresh]);

  const handleTouchEnd = useCallback(() => {
    if (!isEligibleRef.current && !isPullingRef.current) return;
    isEligibleRef.current = false;
    isPullingRef.current = false;

    if (status === 'canRelease') {
      triggerRefresh();
    } else if (status !== 'refreshing' && status !== 'complete') {
      setStatus('idle');
      setPullDistance(0);
    }
  }, [status, triggerRefresh]);

  // Clean reset when disabled changes
  useEffect(() => {
    if (disabled && status !== 'idle') {
      setStatus('idle');
      setPullDistance(0);
    }
  }, [disabled, status]);

  // Dynamic progress fraction (0 to 1)
  const progress = Math.min(1, pullDistance / THRESHOLD);
  const arrowRotation = Math.min(180, progress * 180);

  const isVisible = pullDistance > 4 || status === 'refreshing' || status === 'complete';

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-x-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Floating Refresh Indicator Badge */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-30 flex justify-center transition-opacity duration-200"
        style={{
          top: 0,
          transform: `translate3d(0, ${Math.max(0, pullDistance - 44)}px, 0)`,
          opacity: isVisible ? 1 : 0,
          transition: status === 'idle' ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s' : 'opacity 0.2s',
        }}
        aria-live="polite"
        role="status"
      >
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-stone-200/80 shadow-lg text-stone-800">
          {/* Animated Status Icon */}
          <div className="w-6 h-6 flex items-center justify-center shrink-0">
            {status === 'refreshing' ? (
              <svg
                className="w-4 h-4 animate-spin text-orange-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-90"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                />
              </svg>
            ) : status === 'complete' ? (
              <svg
                className="w-4 h-4 text-emerald-600 animate-bounce"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-orange-600 transition-transform duration-150"
                style={{ transform: `rotate(${arrowRotation}deg)` }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>

          {/* Indicator Text Label */}
          <span className="text-[11px] font-extrabold tracking-tight text-stone-700 select-none">
            {status === 'pulling' && pullingText}
            {status === 'canRelease' && releaseText}
            {status === 'refreshing' && refreshingText}
            {status === 'complete' && completeText}
            {status === 'idle' && pullingText}
          </span>
        </div>
      </div>

      {/* Content Area with Tactile Spring Offset */}
      <div
        style={{
          transform: pullDistance > 0 ? `translate3d(0, ${pullDistance}px, 0)` : undefined,
          transition:
            status === 'idle' || status === 'refreshing'
              ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              : 'none',
          willChange: isVisible ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
};
