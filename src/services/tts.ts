
'use client';

/**
 * @fileOverview Provides Text-to-Speech (TTS) functionality using the browser's SpeechSynthesis API.
 */

let utterance: SpeechSynthesisUtterance | null = null;
let currentText = '';
let isSpeaking = false;
let isPaused = false;

/**
 * Speaks the given text using the browser's TTS engine.
 * @param text The text to speak.
 * @param onEnd Callback function executed when speech ends.
 * @param onError Callback function executed on speech error.
 */
export function speakText(
  text: string,
  onEnd?: () => void,
  onError?: (event: SpeechSynthesisErrorEvent) => void
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.error('Speech Synthesis API is not supported in this browser.');
    onError?.(new SpeechSynthesisErrorEvent('error', { error: 'Browser not supported' }));
    return;
  }

  // If called with the same text and it's paused, resume.
  if (isPaused && text === currentText) {
    resumeSpeech();
    return;
  }

  // Stop any currently playing speech before starting new
  stopSpeech();

  currentText = text;
  utterance = new SpeechSynthesisUtterance(text);

  utterance.onstart = () => {
    isSpeaking = true;
    isPaused = false;
    console.log('Speech started');
  };

  utterance.onend = () => {
    isSpeaking = false;
    isPaused = false;
    utterance = null;
    currentText = '';
    console.log('Speech finished');
    onEnd?.();
  };

  utterance.onpause = () => {
    isPaused = true;
    isSpeaking = false;
    console.log('Speech paused');
  };

  utterance.onresume = () => {
    isPaused = false;
    isSpeaking = true;
    console.log('Speech resumed');
  };

  utterance.onerror = (event) => {
    isSpeaking = false;
    isPaused = false;
    console.error('Speech Synthesis Error:', event);
    onError?.(event);
     utterance = null;
     currentText = '';
  };

  // Optional: Configure voice, rate, pitch if needed
  // const voices = window.speechSynthesis.getVoices();
  // utterance.voice = voices[0]; // Example: Set a specific voice
  // utterance.rate = 1; // From 0.1 to 10
  // utterance.pitch = 1; // From 0 to 2

  window.speechSynthesis.speak(utterance);
}

/**
 * Pauses the currently speaking utterance.
 */
export function pauseSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis && isSpeaking && !isPaused) {
    window.speechSynthesis.pause();
  }
}

/**
 * Resumes the paused utterance.
 */
export function resumeSpeech(): void {
   if (typeof window !== 'undefined' && window.speechSynthesis && isPaused) {
    window.speechSynthesis.resume();
  }
}

/**
 * Stops the currently speaking or paused utterance immediately.
 */
export function stopSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis && (isSpeaking || isPaused)) {
    window.speechSynthesis.cancel(); // cancel() also triggers onend event
    isSpeaking = false;
    isPaused = false;
    utterance = null;
    currentText = '';
    console.log('Speech stopped');
  }
}

/**
 * Checks if speech is currently active (speaking or paused).
 */
export function isSpeechActive(): boolean {
    return isSpeaking || isPaused;
}

/**
 * Checks if speech is currently playing.
 */
export function isCurrentlySpeaking(): boolean {
    return isSpeaking;
}

/**
 * Checks if speech is currently paused.
 */
export function isCurrentlyPaused(): boolean {
    return isPaused;
}
