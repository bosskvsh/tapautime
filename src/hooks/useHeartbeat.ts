import { useState, useEffect, useRef, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../lib/supabase';

export interface UseHeartbeatOptions {
  /**
   * Ping interval in milliseconds. Defaults to 60,000 ms (60 seconds).
   * Edge Function enforces: now() - last_seen <= 120 seconds.
   */
  intervalMs?: number;
  /**
   * Optional custom Supabase client. Defaults to standard singleton client.
   */
  client?: SupabaseClient;
  /**
   * Whether heartbeat polling is actively enabled. Defaults to true.
   */
  enabled?: boolean;
  /**
   * Optional callback when a heartbeat error occurs.
   */
  onError?: (err: Error) => void;
  /**
   * Optional callback when a heartbeat ping successfully completes.
   */
  onSuccess?: (timestamp: string) => void;
}

export interface UseHeartbeatResult {
  isOnline: boolean;
  lastSeen: Date | null;
  isPinging: boolean;
  error: Error | null;
  consecutiveFailures: number;
  pingNow: () => Promise<boolean>;
}

/**
 * Periodically updates `merchants.last_seen` in Supabase every 60 seconds.
 * Defends against Edge Function checkout rejection (Rule 4: now() - last_seen <= 2m).
 * Automatically fires immediate pings on tab visibility recovery and network reconnection.
 */
export function useHeartbeat(
  merchantId: string | null | undefined,
  options: UseHeartbeatOptions = {}
): UseHeartbeatResult {
  const {
    intervalMs = 60_000,
    client = defaultClient,
    enabled = true,
    onError,
    onSuccess,
  } = options;

  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);

  const lastPingTimeRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const pingNow = useCallback(async (): Promise<boolean> => {
    if (!merchantId || !enabled) return false;
    if (inFlightRef.current) return false;

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
    } catch (err: any) {
      const pingErr = err instanceof Error ? err : new Error(String(err));
      setError(pingErr);
      setConsecutiveFailures((prev) => prev + 1);
      onError?.(pingErr);
      console.warn(`[useHeartbeat] Ping error for merchant ${merchantId}:`, pingErr.message);
      return false;
    } finally {
      inFlightRef.current = false;
      setIsPinging(false);
    }
  }, [merchantId, enabled, client, onError, onSuccess]);

  useEffect(() => {
    if (!merchantId || !enabled) return;

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
        if (elapsed > 30_000) {
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
    ? Date.now() - lastSeen.getTime() <= 120_000 && consecutiveFailures < 3
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
