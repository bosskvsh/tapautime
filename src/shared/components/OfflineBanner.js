import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
export const OfflineBanner = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    if (!isOffline)
        return null;
    return (_jsxs("div", { role: "alert", className: "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-50 flex items-center gap-3 bg-stone-900 text-stone-100 border border-stone-700 px-4 py-3 rounded-2xl shadow-2xl animate-bounce", children: [_jsx("div", { className: "w-3 h-3 rounded-full bg-amber-500 animate-ping flex-shrink-0" }), _jsxs("div", { className: "text-xs sm:text-sm font-medium", children: [_jsx("span", { className: "font-bold text-amber-400", children: "Offline Mode:" }), " You are currently offline. Cached menus remain viewable."] })] }));
};
