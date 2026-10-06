import { useState, useEffect, useCallback } from 'react';
/**
 * Singleton AudioAlarmController using the Web Audio API.
 * Guarantees:
 * 1. Single AudioContext across the entire web application.
 * 2. Dynamics compressor stage preventing clipping and speaker distortion.
 * 3. Idempotent triggers: 50 concurrent orders will NEVER stack, phase-cancel, or clip.
 * 4. Looping audible alert that repeats until explicitly acknowledged.
 */
class AudioAlarmController {
    constructor() {
        this.audioCtx = null;
        this.masterGain = null;
        this.compressor = null;
        this.isAlarming = false;
        this.pendingOrders = new Set();
        this.loopIntervalId = null;
        this.activeNodes = [];
        this.subscribers = new Set();
        // AudioContext will be initialized lazily upon first user interaction or trigger
    }
    static getInstance() {
        if (!AudioAlarmController.instance) {
            AudioAlarmController.instance = new AudioAlarmController();
        }
        return AudioAlarmController.instance;
    }
    /**
     * Lazily initializes and unlocks the Web Audio graph with a hard brickwall compressor.
     */
    initAudio() {
        if (typeof window === 'undefined')
            return false;
        if (!this.audioCtx) {
            const AudioCtxClass = window.AudioContext ||
                window.webkitAudioContext;
            if (!AudioCtxClass) {
                console.warn('[useAudioAlarm] Web Audio API is not supported in this browser.');
                return false;
            }
            this.audioCtx = new AudioCtxClass();
            // Dynamics compressor acts as a protective limiter against digital clipping (0 dBFS)
            this.compressor = this.audioCtx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-12, this.audioCtx.currentTime);
            this.compressor.knee.setValueAtTime(10, this.audioCtx.currentTime);
            this.compressor.ratio.setValueAtTime(12, this.audioCtx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
            this.compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);
            // Master volume stage
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.setValueAtTime(0.45, this.audioCtx.currentTime);
            // Graph: Node -> MasterGain -> Compressor -> Destination
            this.masterGain.connect(this.compressor);
            this.compressor.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch((err) => {
                console.warn('[useAudioAlarm] AudioContext resume failed (waiting for user gesture):', err);
            });
        }
        return true;
    }
    /**
     * Plays a single high-visibility 3-tone chime sequence: Bb5 (932Hz) -> Eb6 (1245Hz) -> G6 (1568Hz).
     * Crafted with exponential gain envelopes to eliminate speaker pop/click artifacts.
     */
    playChimeSequence() {
        if (!this.initAudio() || !this.audioCtx || !this.masterGain)
            return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const notes = [
            { freq: 932.33, start: now + 0.0, dur: 0.16 }, // Bb5
            { freq: 1244.51, start: now + 0.18, dur: 0.2 }, // Eb6
            { freq: 1567.98, start: now + 0.4, dur: 0.35 }, // G6
        ];
        notes.forEach(({ freq, start, dur }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            // Clean exponential attack & decay to prevent audio clicks
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.8, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(start);
            osc.stop(start + dur + 0.05);
            const nodeRecord = { osc, gain };
            this.activeNodes.push(nodeRecord);
            osc.onended = () => {
                try {
                    osc.disconnect();
                    gain.disconnect();
                }
                catch (_) { }
                this.activeNodes = this.activeNodes.filter((n) => n !== nodeRecord);
            };
        });
    }
    /**
     * Triggers the alarm. Idempotent: multiple simultaneous orders will increment
     * the order tally without stacking audio oscillators or causing distortion.
     * Passing options.silent = true records pending order state and notifies
     * subscribers without sounding the default Web Audio chime (e.g. when custom MP3 audio plays).
     */
    triggerAlarm(orderId, options) {
        if (orderId) {
            this.pendingOrders.add(orderId);
        }
        else {
            this.pendingOrders.add(`manual-${Date.now()}`);
        }
        const wasAlarming = this.isAlarming;
        this.isAlarming = true;
        this.notifySubscribers();
        // If alarm is already looping, do not spin up another timer or duplicate playback
        if (wasAlarming) {
            return;
        }
        if (!options?.silent) {
            // Play immediate first chime
            this.playChimeSequence();
            // Repeat every 2.4 seconds until acknowledged
            if (this.loopIntervalId)
                clearInterval(this.loopIntervalId);
            this.loopIntervalId = setInterval(() => {
                if (this.isAlarming) {
                    this.playChimeSequence();
                }
            }, 2400);
        }
    }
    /**
     * Acknowledges and silences the active alarm loop.
     */
    acknowledgeAlarm() {
        if (this.loopIntervalId) {
            clearInterval(this.loopIntervalId);
            this.loopIntervalId = null;
        }
        // Smoothly fade out currently ringing notes to eliminate sudden cut-off pops
        if (this.audioCtx && this.masterGain) {
            const now = this.audioCtx.currentTime;
            this.activeNodes.forEach(({ gain, osc }) => {
                try {
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(gain.gain.value, now);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
                    osc.stop(now + 0.06);
                }
                catch (_) { }
            });
        }
        this.activeNodes = [];
        this.isAlarming = false;
        this.pendingOrders.clear();
        this.notifySubscribers();
    }
    /**
     * Plays a single test chime without entering repeating loop mode.
     */
    testChime() {
        this.playChimeSequence();
    }
    getState() {
        return {
            isAlarming: this.isAlarming,
            pendingOrdersCount: this.pendingOrders.size,
        };
    }
    subscribe(callback) {
        this.subscribers.add(callback);
        callback(this.getState());
        return () => {
            this.subscribers.delete(callback);
        };
    }
    notifySubscribers() {
        const state = this.getState();
        this.subscribers.forEach((cb) => cb(state));
    }
}
export const audioAlarmController = AudioAlarmController.getInstance();
/**
 * React hook to consume and control the singleton kitchen audio alarm.
 */
export function useAudioAlarm() {
    const [alarmState, setAlarmState] = useState(() => audioAlarmController.getState());
    useEffect(() => {
        const unsubscribe = audioAlarmController.subscribe((state) => {
            setAlarmState(state);
        });
        return () => unsubscribe();
    }, []);
    const triggerAlarm = useCallback((orderId, options) => {
        audioAlarmController.triggerAlarm(orderId, options);
    }, []);
    const acknowledgeAlarm = useCallback(() => {
        audioAlarmController.acknowledgeAlarm();
    }, []);
    const testAlarm = useCallback(() => {
        audioAlarmController.testChime();
    }, []);
    return {
        isAlarming: alarmState.isAlarming,
        pendingOrdersCount: alarmState.pendingOrdersCount,
        triggerAlarm,
        acknowledgeAlarm,
        testAlarm,
    };
}
