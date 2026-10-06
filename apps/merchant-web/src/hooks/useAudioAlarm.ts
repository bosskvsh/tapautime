import { useCallback } from 'react';
import { useAudioAlarm as useSharedAudioAlarm, audioAlarmController } from '@tapautime/shared-ui';
export type { AudioAlarmState } from '@tapautime/shared-ui';

/** Primary sound file path for newly received incoming orders */
export const NEW_ORDER_SOUND_PATH = '/sounds/tapautime.mp3';

/** Fallback audio path in case of root routing differences */
export const FALLBACK_SOUND_PATH = '/tapautime.mp3';

let newOrderAudioInstance: HTMLAudioElement | null = null;
let repeatTimeoutIds: ReturnType<typeof setTimeout>[] = [];

/**
 * Returns or instantiates the singleton HTMLAudioElement configured for incoming order alerts.
 */
export const getNewOrderAudio = (): HTMLAudioElement | null => {
  if (typeof window === 'undefined') return null;

  if (!newOrderAudioInstance) {
    newOrderAudioInstance = new Audio(NEW_ORDER_SOUND_PATH);
    newOrderAudioInstance.preload = 'auto';

    // Fallback listener in case /sounds/ path encounters HTTP 404 or routing differences
    newOrderAudioInstance.addEventListener(
      'error',
      () => {
        console.warn('[useAudioAlarm] Primary sound path failed, falling back to:', FALLBACK_SOUND_PATH);
        if (newOrderAudioInstance) {
          newOrderAudioInstance.src = FALLBACK_SOUND_PATH;
          newOrderAudioInstance.load();
        }
      },
      { once: true }
    );
  }

  return newOrderAudioInstance;
};

/**
 * Primes and unlocks the HTML5 Audio element during a user interaction gesture
 * (e.g. clicking "Start Shift") to comply with browser autoplay policies.
 */
export const unlockNewOrderAudio = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    const audio = getNewOrderAudio();
    if (!audio) return false;

    audio.volume = 0;
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1.0;
    }
    return true;
  } catch (err) {
    console.warn('[useAudioAlarm] Pre-unlocking tapautime.mp3 caught error:', err);
    return false;
  }
};

/**
 * Stops any actively playing tapautime.mp3 and clears pending repeating interval timeouts.
 */
export const stopNewOrderSound = (): void => {
  repeatTimeoutIds.forEach((id) => clearTimeout(id));
  repeatTimeoutIds = [];

  if (newOrderAudioInstance) {
    try {
      newOrderAudioInstance.pause();
      newOrderAudioInstance.currentTime = 0;
    } catch (_) {}
  }
};

/**
 * Plays the incoming order alert sound (tapautime.mp3).
 * Plays 3 times in 3 seconds intervals by default.
 */
export const playNewOrderSound = (times = 3, intervalMs = 3000): void => {
  if (typeof window === 'undefined') return;

  // Clear any existing scheduled repeats before scheduling a fresh sequence
  stopNewOrderSound();

  const playSingle = () => {
    try {
      const audio = getNewOrderAudio();
      if (!audio) return;

      audio.volume = 1.0;
      audio.currentTime = 0;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err: unknown) => {
          console.warn('[useAudioAlarm] Playback blocked by browser policy:', err);
        });
      }
    } catch (err: unknown) {
      console.warn('[useAudioAlarm] Failed to play incoming order sound:', err);
    }
  };

  // 1st playback immediately
  playSingle();

  // Schedule subsequent repeats at intervalMs
  for (let i = 1; i < times; i++) {
    const timeoutId = setTimeout(() => {
      playSingle();
    }, i * intervalMs);
    repeatTimeoutIds.push(timeoutId);
  }
};

/**
 * React hook consuming the singleton audio alarm with incoming new order sound playback.
 */
export function useAudioAlarm() {
  const sharedAlarm = useSharedAudioAlarm();

  const handlePlayNewOrderSound = useCallback((times = 3, intervalMs = 3000) => {
    playNewOrderSound(times, intervalMs);
  }, []);

  const handleAcknowledgeAlarm = useCallback(() => {
    stopNewOrderSound();
    sharedAlarm.acknowledgeAlarm();
  }, [sharedAlarm]);

  return {
    ...sharedAlarm,
    playNewOrderSound: handlePlayNewOrderSound,
    stopNewOrderSound,
    acknowledgeAlarm: handleAcknowledgeAlarm,
  };
}

export { audioAlarmController };


