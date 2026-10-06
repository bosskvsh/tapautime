import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase as defaultClient } from '../lib/supabase';
/**
 * Periodically updates `merchants.last_seen` in Supabase every 60 seconds.
 * Defends against Edge Function checkout rejection (Rule 4: now() - last_seen <= 2m).
 * Automatically fires immediate pings on tab visibility recovery and network reconnection.
 */
export function useHeartbeat(merchantId, options = {}) {
    const { intervalMs = 60000, client = defaultClient, enabled = true, onError, onSuccess, } = options;
    const [lastSeen, setLastSeen] = useState(null);
    const [isPinging, setIsPinging] = useState(false);
    const [error, setError] = useState(null);
    const [consecutiveFailures, setConsecutiveFailures] = useState(0);
    const lastPingTimeRef = useRef(0);
    const inFlightRef = useRef(false);
    const pingNow = useCallback(async () => {
        if (!merchantId || !enabled)
            return false;
        if (inFlightRef.current)
            return false;
        inFlightRef.current = true;
        setIsPinging(true);
        try {
            const nowIso = new Date().toISOString();
            const { error: updateError } = await client
                .from('merchants')
                .update({ last_seen: nowIso })
                .eq('id', merchantId);
            if (updateError) {
                throw new Error(`Heartbeat failed: ${updateError.message}`);
            }
            const confirmedDate = new Date(nowIso);
            setLastSeen(confirmedDate);
            lastPingTimeRef.current = Date.now();
            setError(null);
            setConsecutiveFailures(0);
            onSuccess?.(nowIso);
            return true;
        }
        catch (err) {
            const pingErr = err instanceof Error ? err : new Error(String(err));
            setError(pingErr);
            setConsecutiveFailures((prev) => prev + 1);
            onError?.(pingErr);
            console.warn(`[useHeartbeat] Ping error for merchant ${merchantId}:`, pingErr.message);
            return false;
        }
        finally {
            inFlightRef.current = false;
            setIsPinging(false);
        }
    }, [merchantId, enabled, client, onError, onSuccess]);
    useEffect(() => {
        if (!merchantId || !enabled)
            return;
        // 1. Fire initial heartbeat ping immediately on mount or merchant switch
        pingNow();
        // 2. Setup periodic interval (default 60s)
        const intervalId = setInterval(() => {
            pingNow();
        }, intervalMs);
        // 3. Tab visibility listener: when merchant wakes tablet or switches back to tab,
        // immediately ping if more than 30 seconds have elapsed since last ping.
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const elapsed = Date.now() - lastPingTimeRef.current;
                if (elapsed > 30000) {
                    pingNow();
                }
            }
        };
        // 4. Online listener: if tablet Wi-Fi drops and reconnects, immediately ping
        const handleOnline = () => {
            pingNow();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
        };
    }, [merchantId, enabled, intervalMs, pingNow]);
    // Considered online if last seen is within 120 seconds (the checkout threshold)
    const isOnline = lastSeen
        ? Date.now() - lastSeen.getTime() <= 120000 && consecutiveFailures < 3
        : false;
    return {
        isOnline,
        lastSeen,
        isPinging,
        error,
        consecutiveFailures,
        pingNow,
    };
}
