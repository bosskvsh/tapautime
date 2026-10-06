import { useState, useEffect, useRef, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../lib/supabase';

export interface UseHeartbeatOptions {
  /**
   * Ping interval in milliseconds. Defaults to 60,000 ms (60 seconds).
   * Edge Function checkout rule: now() - last_seen <= 120 seconds.
   */
  intervalMs?: number;
  /**
   * Optional custom Supabase client.
   */
  client?: SupabaseClient;
  /**
   * Whether heartbeat polling is actively enabled. Defaults to true.
   */
  enabled?: boolean;
  /**
   * Callback when a ping failure occurs.
   */
  onError?: (err: Error) => void;
  /**
   * Callback when a ping successfully updates merchants.last_seen.
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
 * Keeps stall online so Edge Function check (Rule 4: now() - last_seen <= 2m) passes.
 * Automatically pings immediately on window focus/wake and network reconnection.
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

  const isValidUuid = typeof merchantId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantId);

  const pingNow = useCallback(async (): Promise<boolean> => {
    if (!merchantId || !isValidUuid || !enabled) return false;
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
    if (!merchantId || !isValidUuid || !enabled) return;

    // Initial ping on mount or merchant change
    pingNow();

    // 60-second periodic heartbeat
    const intervalId = setInterval(() => {
      pingNow();
    }, intervalMs);

    // Tablet wake / visibility restore handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastPingTimeRef.current;
        if (elapsed > 30_000) {
          pingNow();
        }
      }
    };

    // Reconnection handler
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
