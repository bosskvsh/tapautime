import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface SwipeToConfirmProps {
  /**
   * Action triggered when the swipe reaches the confirmation threshold (>= 75%).
   */
  onConfirm: () => void | Promise<void>;
  /**
   * Primary label displayed in the center of the track (e.g. 'Slide to Reject Order').
   */
  label?: string;
  /**
   * Label displayed once the swipe is successfully completed.
   */
  confirmedLabel?: string;
  /**
   * Color theme variant. Default is 'danger' for destructive actions.
   */
  variant?: 'danger' | 'warning' | 'emerald' | 'primary';
  /**
   * Whether the component is disabled.
   */
  disabled?: boolean;
  /**
   * Shows a loading spinner in the thumb if confirmation triggers an async operation.
   */
  isLoading?: boolean;
  /**
   * Delay in ms before resetting to idle state after confirmation. Pass 0 or null to not auto-reset.
   */
  autoResetDelay?: number;
  /**
   * Custom CSS class names for the outer container.
   */
  className?: string;
}

export const SwipeToConfirm: React.FC<SwipeToConfirmProps> = ({
  onConfirm,
  label = 'SLIDE TO REJECT',
  confirmedLabel = 'CONFIRMED',
  variant = 'danger',
  disabled = false,
  isLoading = false,
  autoResetDelay = 0,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const [dragX, setDragX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [maxDrag, setMaxDrag] = useState<number>(200);

  const startXRef = useRef<number>(0);
  const currentDragXRef = useRef<number>(0);

  // Compute maximum draggable distance based on container & thumb dimensions
  const updateMaxDrag = useCallback(() => {
    if (containerRef.current && thumbRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const thumbWidth = thumbRef.current.clientWidth;
      // Subtract thumb width and padding (8px total: 4px on each side)
      const available = Math.max(0, containerWidth - thumbWidth - 8);
      setMaxDrag(available);
    }
  }, []);

  useEffect(() => {
    updateMaxDrag();
    window.addEventListener('resize', updateMaxDrag);
    return () => window.removeEventListener('resize', updateMaxDrag);
  }, [updateMaxDrag]);

  // Handle auto-reset if configured
  useEffect(() => {
    if (isConfirmed && autoResetDelay > 0) {
      const timer = setTimeout(() => {
        setIsConfirmed(false);
        setDragX(0);
        currentDragXRef.current = 0;
      }, autoResetDelay);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, autoResetDelay]);

  // If isLoading changes from true to false and was confirmed without autoReset, reset if needed
  useEffect(() => {
    if (!isLoading && !isConfirmed) {
      setDragX(0);
      currentDragXRef.current = 0;
    }
  }, [isLoading, isConfirmed]);

  const handleStart = (clientX: number) => {
    if (disabled || isLoading || isConfirmed) return;
    setIsDragging(true);
    startXRef.current = clientX - currentDragXRef.current;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || disabled || isLoading || isConfirmed) return;
    const rawX = clientX - startXRef.current;
    const clampedX = Math.min(Math.max(0, rawX), maxDrag);
    currentDragXRef.current = clampedX;
    setDragX(clampedX);
  };

  const handleEnd = async () => {
    if (!isDragging || disabled || isLoading || isConfirmed) return;
    setIsDragging(false);

    // 75% threshold to confirm
    const threshold = maxDrag * 0.75;
    if (currentDragXRef.current >= threshold) {
      // Snap to full right
      setDragX(maxDrag);
      currentDragXRef.current = maxDrag;
      setIsConfirmed(true);

      // Trigger tactile vibration on mobile devices
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(60);
        } catch (_) {
          // Ignore vibration API errors on unsupported browsers
        }
      }

      try {
        await onConfirm();
      } catch (err) {
        // In case of error in async handler, reset
        setIsConfirmed(false);
        setDragX(0);
        currentDragXRef.current = 0;
      }
    } else {
      // Snap back to starting position
      setDragX(0);
      currentDragXRef.current = 0;
    }
  };

  // Mouse drag listeners attached to window for smooth dragging even if pointer leaves track
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
    const onMouseUp = () => {
      if (isDragging) handleEnd();
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, maxDrag]);

  // Touch event handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) handleStart(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) handleMove(e.touches[0].clientX);
  };

  const onTouchEnd = () => {
    handleEnd();
  };

  // Calculate drag progress (0 to 1) for visual styling & fading
  const progress = maxDrag > 0 ? Math.min(1, Math.max(0, dragX / maxDrag)) : 0;
  const labelOpacity = Math.max(0, 1 - progress * 1.5);

  // Variant design tokens (minimum height h-16 / 64px for Auntie-Proof touch ergonomics)
  const variantStyles = {
    danger: {
      trackBg: 'bg-rose-950/40 border-rose-900/60',
      fillBg: 'bg-rose-600',
      thumbBg: 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-rose-900/50',
      labelColor: 'text-rose-300',
      confirmedBg: 'bg-rose-700 text-white border-rose-600',
    },
    warning: {
      trackBg: 'bg-amber-950/40 border-amber-900/60',
      fillBg: 'bg-amber-600',
      thumbBg: 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-stone-950 shadow-amber-900/50',
      labelColor: 'text-amber-300',
      confirmedBg: 'bg-amber-600 text-stone-950 border-amber-500',
    },
    emerald: {
      trackBg: 'bg-emerald-950/40 border-emerald-900/60',
      fillBg: 'bg-emerald-600',
      thumbBg: 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-emerald-900/50',
      labelColor: 'text-emerald-300',
      confirmedBg: 'bg-emerald-600 text-white border-emerald-500',
    },
    primary: {
      trackBg: 'bg-orange-950/40 border-orange-900/60',
      fillBg: 'bg-orange-600',
      thumbBg: 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white shadow-orange-900/50',
      labelColor: 'text-orange-300',
      confirmedBg: 'bg-orange-600 text-white border-orange-500',
    },
  }[variant];

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className={`relative w-full h-16 min-h-[4rem] rounded-2xl border-2 overflow-hidden select-none touch-none transition-colors ${
        isConfirmed ? variantStyles.confirmedBg : variantStyles.trackBg
      } ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {/* Background Fill Progress Bar */}
      {!isConfirmed && (
        <div
          className={`absolute top-0 left-0 bottom-0 ${variantStyles.fillBg} opacity-20 pointer-events-none`}
          style={{ width: `${dragX + (thumbRef.current?.clientWidth || 56) / 2}px` }}
        />
      )}

      {/* Centered Instructions Label */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity px-16"
        style={{ opacity: isConfirmed ? 0 : labelOpacity }}
      >
        <span
          className={`text-xs sm:text-sm font-black tracking-wider uppercase flex items-center gap-2 animate-pulse ${variantStyles.labelColor}`}
        >
          <span>{label}</span>
          <svg
            className="w-4 h-4 translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="3"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </span>
      </div>

      {/* Confirmed State Label */}
      {isConfirmed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-fadeIn">
          <span className="text-sm font-black tracking-wider uppercase flex items-center gap-2">
            <svg
              className="w-5 h-5 text-current animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{confirmedLabel}</span>
          </span>
        </div>
      )}

      {/* Draggable Thumb / Handle (Massive 56px touch target inside 64px container) */}
      {!isConfirmed && (
        <div
          ref={thumbRef}
          onMouseDown={(e) => handleStart(e.clientX)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className={`absolute top-1 bottom-1 w-14 h-14 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg select-none transition-shadow ${
            variantStyles.thumbBg
          } ${isDragging ? 'scale-105 shadow-2xl' : ''}`}
          style={{
            transform: `translateX(${dragX}px)`,
            transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
            left: '4px',
          }}
        >
          {isLoading ? (
            <svg
              className="animate-spin h-6 w-6 text-current"
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
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            <svg
              className="w-6 h-6 text-current pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
};
