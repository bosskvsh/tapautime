const fs = require('fs');
const sampleRate = 22050; // 22.05kHz compact 0.6s chime (<25KB base64)
const duration = 0.6;
const numSamples = Math.floor(sampleRate * duration);
const buffer = Buffer.alloc(44 + numSamples * 2);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 2, 40);

// Two-tone bell harmonic (C6 1046.5Hz -> G6 1567.98Hz)
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let tone = 0;
  if (t < 0.18) {
    const env = Math.exp(-t * 9.0);
    tone = (Math.sin(2 * Math.PI * 1046.5 * t) * 0.7 + Math.sin(2 * Math.PI * 2093.0 * t) * 0.3) * env;
  } else {
    const t2 = t - 0.18;
    const env = Math.exp(-t2 * 6.5);
    tone = (Math.sin(2 * Math.PI * 1567.98 * t2) * 0.7 + Math.sin(2 * Math.PI * 3135.96 * t2) * 0.3) * env;
  }
  const sample = Math.max(-32767, Math.min(32767, Math.floor(tone * 28000)));
  buffer.writeInt16LE(sample, 44 + i * 2);
}

const base64 = buffer.toString('base64');
const dataUri = 'data:audio/wav;base64,' + base64;

const fileContent = `/**
 * Kitchen Display System (KDS) Realtime Audio Alert Engine
 * Provides a standalone, pleasant notification chime in Base64
 * to avoid external MP3 asset dependencies or network 404 hazards.
 */

export const CHIME_DATA_URI =
  '` + dataUri + `';

/**
 * Placeholder path for optional local static audio file
 */
export const CHIME_FALLBACK_FILE = '/assets/chime.mp3';

let sharedAudio: HTMLAudioElement | null = null;

/**
 * Creates or retrieves the singleton HTMLAudioElement configured for order alerts
 */
export function getChimeAudio(volume = 1.0): HTMLAudioElement {
  if (!sharedAudio && typeof window !== 'undefined') {
    sharedAudio = new Audio(CHIME_DATA_URI);
    sharedAudio.preload = 'auto';
  }

  if (sharedAudio) {
    sharedAudio.volume = Math.max(0, Math.min(1, volume));
  }

  return sharedAudio!;
}

/**
 * Unlocks the Web Audio / HTML5 Audio context during a user interaction gesture.
 * Plays the chime at volume 0 to prime browser autoplay policies.
 */
export async function unlockAudioContext(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const audio = getChimeAudio(0);
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
    console.warn('[audio.ts] Audio unlock failed:', err);
    return false;
  }
}

/**
 * Plays the incoming order notification chime.
 * Automatically catches and logs any browser autoplay restrictions.
 */
export async function playOrderChime(volume = 1.0): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const audio = getChimeAudio(volume);
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, volume));
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (err) {
    console.warn('[audio.ts] Order chime blocked by browser policy (user interaction required):', err);
  }
}
`;

fs.writeFileSync('apps/merchant-web/src/lib/audio.ts', fileContent, 'utf-8');
console.log('Successfully written apps/merchant-web/src/lib/audio.ts');
