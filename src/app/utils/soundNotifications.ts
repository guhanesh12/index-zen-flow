// ⚡⚡⚡ SOUND NOTIFICATIONS FOR TRADING EVENTS ⚡⚡⚡

// Create audio context for sound generation
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

// ============ SOUND GENERATION FUNCTIONS ============

/**
 * Play a beep sound with specified frequency and duration
 */
const playBeep = (frequency: number, duration: number, volume: number = 0.3): void => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (error) {
    console.error('Error playing beep:', error);
  }
};

/**
 * Play multiple beeps in sequence
 */
const playBeepSequence = (
  beeps: Array<{ frequency: number; duration: number; delay: number }>,
  volume: number = 0.3
): void => {
  let totalDelay = 0;
  beeps.forEach((beep) => {
    setTimeout(() => {
      playBeep(beep.frequency, beep.duration, volume);
    }, totalDelay);
    totalDelay += beep.delay;
  });
};

// ============ TRADING EVENT SOUNDS ============

/**
 * 🔔 SIGNAL GENERATED SOUND
 * Plays when AI generates a trading signal (BUY_CALL or BUY_PUT)
 * Sound: Rising chime (optimistic, attention-grabbing)
 */
export const playSignalGeneratedSound = (): void => {
  console.log('🔔 Playing SIGNAL GENERATED sound...');
  playBeepSequence([
    { frequency: 523.25, duration: 0.15, delay: 0 },    // C5
    { frequency: 659.25, duration: 0.15, delay: 150 },  // E5
    { frequency: 783.99, duration: 0.3, delay: 150 }    // G5 (longer)
  ], 0.4);
};

/**
 * ⚠️ PRE-SIGNAL WARNING SOUND (20 seconds before signal)
 * Plays 20 seconds before candle close to alert user
 * Sound: Double beep (warning tone)
 */
export const playPreSignalWarningSound = (): void => {
  console.log('⚠️ Playing PRE-SIGNAL WARNING sound (20s before signal)...');
  playBeepSequence([
    { frequency: 440, duration: 0.2, delay: 0 },     // A4
    { frequency: 440, duration: 0.2, delay: 300 }    // A4 again
  ], 0.35);
};

/**
 * ✅ ORDER PLACED SOUND
 * Plays when order is successfully executed
 * Sound: Success chime (3 ascending notes)
 */
export const playOrderPlacedSound = (): void => {
  console.log('✅ Playing ORDER PLACED sound...');
  playBeepSequence([
    { frequency: 659.25, duration: 0.1, delay: 0 },    // E5
    { frequency: 783.99, duration: 0.1, delay: 100 },  // G5
    { frequency: 1046.50, duration: 0.25, delay: 100 } // C6 (longer, triumphant)
  ], 0.45);
};

/**
 * 🚪 AUTO-EXIT SOUND
 * Plays when position exits automatically (target/SL/AI signal)
 * Sound: Descending notes (closing tone)
 */
export const playAutoExitSound = (): void => {
  console.log('🚪 Playing AUTO-EXIT sound...');
  playBeepSequence([
    { frequency: 783.99, duration: 0.15, delay: 0 },   // G5
    { frequency: 659.25, duration: 0.15, delay: 150 }, // E5
    { frequency: 523.25, duration: 0.3, delay: 150 }   // C5 (longer)
  ], 0.4);
};

/**
 * 🖱️ MANUAL EXIT SOUND
 * Plays when user manually clicks EXIT button
 * Sound: Quick double beep (acknowledgment)
 */
export const playManualExitSound = (): void => {
  console.log('🖱️ Playing MANUAL EXIT sound...');
  playBeepSequence([
    { frequency: 523.25, duration: 0.1, delay: 0 },
    { frequency: 523.25, duration: 0.1, delay: 120 }
  ], 0.35);
};

/**
 * ❌ ORDER FAILED SOUND
 * Plays when order execution fails
 * Sound: Low warning tone
 */
export const playOrderFailedSound = (): void => {
  console.log('❌ Playing ORDER FAILED sound...');
  playBeepSequence([
    { frequency: 220, duration: 0.3, delay: 0 },    // A3 (low warning)
    { frequency: 196, duration: 0.4, delay: 200 }   // G3 (lower, longer)
  ], 0.4);
};

/**
 * 🚀 ENGINE START SOUND
 * Plays when trading engine starts
 * Sound: Power-up chime
 */
export const playEngineStartSound = (): void => {
  console.log('🚀 Playing ENGINE START sound...');
  playBeepSequence([
    { frequency: 392, duration: 0.1, delay: 0 },      // G4
    { frequency: 523.25, duration: 0.1, delay: 100 }, // C5
    { frequency: 659.25, duration: 0.2, delay: 100 }  // E5
  ], 0.35);
};

/**
 * ⏸️ ENGINE STOP SOUND
 * Plays when trading engine stops
 * Sound: Power-down tone
 */
export const playEngineStopSound = (): void => {
  console.log('⏸️ Playing ENGINE STOP sound...');
  playBeepSequence([
    { frequency: 523.25, duration: 0.1, delay: 0 },  // C5
    { frequency: 392, duration: 0.2, delay: 100 }    // G4 (lower, longer)
  ], 0.3);
};

// ============ SOUND PREFERENCES ============

const SOUND_ENABLED_KEY = 'trading_sounds_enabled';

/**
 * Check if sounds are enabled (default: true)
 */
export const areSoundsEnabled = (): boolean => {
  const saved = localStorage.getItem(SOUND_ENABLED_KEY);
  return saved === null ? true : saved === 'true';
};

/**
 * Enable or disable sounds
 */
export const setSoundsEnabled = (enabled: boolean): void => {
  localStorage.setItem(SOUND_ENABLED_KEY, enabled.toString());
  console.log(`🔊 Trading sounds ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

/**
 * Toggle sounds on/off
 */
export const toggleSounds = (): boolean => {
  const newState = !areSoundsEnabled();
  setSoundsEnabled(newState);
  return newState;
};

// ============ WRAPPER FUNCTIONS (Check if enabled) ============

export const notifySignalGenerated = (): void => {
  if (areSoundsEnabled()) playSignalGeneratedSound();
};

export const notifyPreSignalWarning = (): void => {
  if (areSoundsEnabled()) playPreSignalWarningSound();
};

export const notifyOrderPlaced = (): void => {
  if (areSoundsEnabled()) playOrderPlacedSound();
};

export const notifyAutoExit = (): void => {
  if (areSoundsEnabled()) playAutoExitSound();
};

export const notifyManualExit = (): void => {
  if (areSoundsEnabled()) playManualExitSound();
};

export const notifyOrderFailed = (): void => {
  if (areSoundsEnabled()) playOrderFailedSound();
};

export const notifyEngineStart = (): void => {
  if (areSoundsEnabled()) playEngineStartSound();
};

export const notifyEngineStop = (): void => {
  if (areSoundsEnabled()) playEngineStopSound();
};
