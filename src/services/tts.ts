
'use client';

/**
 * @fileOverview Provides Text-to-Speech (TTS) functionality using the browser's SpeechSynthesis API.
 */

let utterance: SpeechSynthesisUtterance | null = null;
let currentText = '';
let isSpeaking = false;
let isPaused = false;

// Store callbacks to avoid assigning them multiple times if not needed
let onEndCallback: (() => void) | undefined;
let onErrorCallback: ((event: SpeechSynthesisErrorEvent) => void) | undefined;
let onStartCallback: (() => void) | undefined;
let onPauseCallback: (() => void) | undefined;
let onResumeCallback: (() => void) | undefined;

/**
 * Speaks the given text using the browser's TTS engine.
 * @param text The text to speak.
 * @param onEnd Callback function executed when speech ends naturally or is cancelled.
 * @param onError Callback function executed on speech error.
 * @param onStart Callback function executed when speech begins.
 * @param onPause Callback function executed when speech is paused.
 * @param onResume Callback function executed when speech resumes from pause.
 */
export function speakText(
  text: string,
  onEnd?: () => void,
  onError?: (event: SpeechSynthesisErrorEvent) => void,
  onStart?: () => void,
  onPause?: () => void,
  onResume?: () => void
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.error('Speech Synthesis API is not supported in this browser.');
    onError?.(new SpeechSynthesisErrorEvent('error', { error: 'Browser not supported' }));
    return;
  }

  // If called with the same text and it's paused, resume.
  if (isPaused && text === currentText && utterance) {
    resumeSpeech();
    return;
  }

  // Stop any currently playing speech before starting new
  // This will also trigger the onEnd listener of the previous utterance if any.
  stopSpeech(true); // Pass true to prevent double-firing onEnd if called rapidly

  currentText = text;
  utterance = new SpeechSynthesisUtterance(text);

  // Assign callbacks
  onEndCallback = onEnd;
  onErrorCallback = onError;
  onStartCallback = onStart;
  onPauseCallback = onPause;
  onResumeCallback = onResume;


  utterance.onstart = () => {
    isSpeaking = true;
    isPaused = false;
    console.log('Speech started');
    onStartCallback?.();
  };

  utterance.onend = () => {
    // Check if it ended naturally or was cancelled prematurely
    const wasCancelled = !isSpeaking && !isPaused;
    console.log(`Speech finished (wasCancelled: ${wasCancelled})`);

    isSpeaking = false;
    isPaused = false;
    // Only clear currentText and utterance if it finished or was explicitly stopped
    // Allows resuming if paused and speakText is called again quickly
    if (!isPaused) {
         utterance = null;
         currentText = '';
    }

    // Only call the external onEnd if it wasn't a premature stop caused by a new speakText call
    if (!wasCancelled || !stopSpeechCalledPrematurely) {
         onEndCallback?.();
    }
     stopSpeechCalledPrematurely = false; // Reset flag
  };

  utterance.onpause = () => {
    // Double check it's not already paused to avoid redundant calls
    if (isSpeaking) {
        isPaused = true;
        isSpeaking = false;
        console.log('Speech paused');
        onPauseCallback?.();
    }
  };

  utterance.onresume = () => {
     // Double check it's not already speaking to avoid redundant calls
    if (isPaused) {
        isPaused = false;
        isSpeaking = true;
        console.log('Speech resumed');
        onResumeCallback?.();
    }
  };

  utterance.onerror = (event) => {
    isSpeaking = false;
    isPaused = false;
    console.error('Speech Synthesis Error:', event);
    onErrorCallback?.(event);
     utterance = null;
     currentText = '';
      stopSpeechCalledPrematurely = false; // Reset flag on error
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
  if (typeof window !== 'undefined' && window.speechSynthesis && utterance && isSpeaking && !isPaused) {
    window.speechSynthesis.pause();
    // State update relies on the onpause listener
  }
}

/**
 * Resumes the paused utterance.
 */
export function resumeSpeech(): void {
   if (typeof window !== 'undefined' && window.speechSynthesis && utterance && isPaused) {
    window.speechSynthesis.resume();
    // State update relies on the onresume listener
  }
}

let stopSpeechCalledPrematurely = false;

/**
 * Stops the currently speaking or paused utterance immediately.
 * @param premature Indicates if stop is called just before starting a new speech.
 */
export function stopSpeech(premature = false): void {
  if (typeof window !== 'undefined' && window.speechSynthesis && utterance && (isSpeaking || isPaused)) {
    stopSpeechCalledPrematurely = premature;
    // Cancel triggers the 'onend' event listener.
    window.speechSynthesis.cancel();
     // Reset state immediately for responsiveness, onend might have a slight delay
    isSpeaking = false;
    isPaused = false;
    // Don't nullify utterance here if premature, allow onend to handle cleanup
    if (!premature) {
        utterance = null;
        currentText = '';
    }
    console.log('Speech stop requested');
  } else {
     // Ensure flag is reset if there was nothing to stop
     stopSpeechCalledPrematurely = false;
  }
}


// Removed isSpeechActive, isCurrentlySpeaking, isCurrentlyPaused as state is managed in the component
