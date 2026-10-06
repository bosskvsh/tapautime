import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface PWAUpdateToastProps {
  /** Optional custom title override */
  title?: string;
  /** Optional custom button action label override */
  actionLabel?: string;
  /** Optional callback fired when the reload action is clicked */
  onUpdateTriggered?: () => void;
  /** Position on screen: 'top' | 'bottom'. Default: 'bottom' */
  position?: 'top' | 'bottom';
}

/**
 * PWAUpdateToast
 * 
 * Implements the Service Worker skipWaiting flow.
 * When VitePWA detects a new deployment in waiting state,
 * this component displays an unmissable "Update Available - Click to Reload" toast
 * that posts SKIP_WAITING to the waiting service worker and reloads the window.
 */
export function PWAUpdateToast({
  title = 'Update Available',
  actionLabel = 'Click to Reload',
  onUpdateTriggered,
  position = 'bottom',
}: PWAUpdateToastProps): React.ReactElement | null {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (typeof window !== 'undefined' && registration) {
        console.log('[PWA] Service Worker registered with scope:', registration.scope);
        // Periodic check for new service worker every 60 minutes
        setInterval(() => {
          registration.update().catch((err) => {
            console.warn('[PWA] Periodic SW update check failed:', err);
          });
        }, 60 * 60 * 1000);

        // Check for updates when the tab becomes visible or gains focus
        const checkUpdate = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch((err) => {
              console.warn('[PWA] Visibility SW update check failed:', err);
            });
          }
        };
        document.addEventListener('visibilitychange', checkUpdate);
        window.addEventListener('focus', checkUpdate);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] Service Worker registration failed:', error);
    },
  });

  // Automatically trigger updateServiceWorker(true) when an update is detected
  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true).catch((err) => {
        console.error('[PWA] Auto updateServiceWorker failed:', err);
      });
    }
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) {
    return null;
  }

  const handleReload = () => {
    if (onUpdateTriggered) {
      onUpdateTriggered();
    }
    // updateServiceWorker(true) executes skipWaiting and reloads window
    updateServiceWorker(true).catch((err) => {
      console.error('[PWA] Error updating service worker:', err);
      window.location.reload();
    });
  };

  const positionClasses =
    position === 'top'
      ? 'top-4 inset-x-4 sm:top-6'
      : 'bottom-4 inset-x-4 sm:bottom-6';

  return (
    <aside
      role="alert"
      aria-live="assertive"
      aria-label="Update Available - Click to Reload"
      className={`fixed ${positionClasses} z-[9999] mx-auto max-w-md w-[calc(100%-2rem)] bg-stone-900/95 text-stone-100 border-2 border-orange-500 rounded-2xl shadow-2xl p-4 backdrop-blur-md transition-all duration-300 transform translate-y-0 select-none`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-orange-600/20 text-orange-500 flex-shrink-0">
            <span className="absolute w-3 h-3 rounded-full bg-orange-500 animate-ping opacity-75" />
            <svg
              className="w-5 h-5 relative z-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-black tracking-tight text-white leading-tight">
              {title}
            </h4>
            <p className="text-xs text-stone-300 font-medium">
              A newer version is ready.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReload}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {actionLabel}
        </button>
      </div>
    </aside>
  );
};
