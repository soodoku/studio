
'use client';

/**
 * @fileOverview Provides Text-to-Speech (TTS) functionality using the browser's SpeechSynthesis API.
 */

let utterance: SpeechSynthesisUtterance | null = null;
let currentText = ''; // Stores the text of the currently active (speaking or paused) utterance
let isSpeaking = false;
let isPaused = false;

// Store callbacks to avoid assigning them multiple times if not needed
let onEndCallback: (() => void) | undefined;
let onErrorCallback: ((event: SpeechSynthesisErrorEvent) => void) | undefined;
let onStartCallback: (() => void) | undefined;
let onPauseCallback: (() => void) | undefined;
let onResumeCallback: (() => void) | undefined;

// Flag to differentiate natural end from cancellation due to starting new speech
let stopSpeechCalledPrematurely = false;

/**
 * Gets the text of the currently active (speaking or paused) utterance.
 * Returns an empty string if nothing is active.
 */
export function getCurrentUtteranceText(): string {
    return utterance ? utterance.text : '';
}

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
  if (isPaused && utterance && utterance.text === text) {
    resumeSpeech();
    return;
  }

  // Stop any currently playing/paused speech before starting new
  // Pass true to indicate this stop is premature, preventing the onEnd callback for the old utterance.
  stopSpeech(true);

  currentText = text; // Update currentText only when starting new speech
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
    const wasCancelled = stopSpeechCalledPrematurely || (!isSpeaking && !isPaused && !utterance); // Consider utterance being null as cancelled
    console.log(`Speech finished (wasCancelled: ${wasCancelled})`);

    // Reset state fully only if it wasn't a premature stop
    if (!wasCancelled) {
        isSpeaking = false;
        isPaused = false;
        utterance = null;
        currentText = ''; // Clear current text on natural end or non-premature stop
        onEndCallback?.(); // Call the external onEnd
    }
     // Always reset the premature flag after onend logic
     stopSpeechCalledPrematurely = false;
  };

  utterance.onpause = () => {
    // Ensure state consistency
    if (isSpeaking) {
        isPaused = true;
        isSpeaking = false;
        console.log('Speech paused');
        onPauseCallback?.();
    }
  };

  utterance.onresume = () => {
    // Ensure state consistency
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
     currentText = ''; // Clear current text on error
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


/**
 * Stops the currently speaking or paused utterance immediately.
 * @param premature Indicates if stop is called just before starting a new speech. If true, the external onEnd callback won't be fired.
 */
export function stopSpeech(premature = false): void {
  if (typeof window !== 'undefined' && window.speechSynthesis && utterance && (isSpeaking || isPaused)) {
    console.log(`Speech stop requested (premature: ${premature})`);
    stopSpeechCalledPrematurely = premature; // Set the flag BEFORE cancelling

    // Cancel triggers the 'onend' event listener eventually.
    window.speechSynthesis.cancel();

    // Reset local state immediately for UI responsiveness, onend handles final cleanup
    isSpeaking = false;
    isPaused = false;
    // utterance and currentText are cleared within the onend handler unless it was a premature stop
  } else {
     // Ensure flag is reset if there was nothing to stop
     stopSpeechCalledPrematurely = false;
  }
}


// Removed isSpeechActive, isCurrentlySpeaking, isCurrentlyPaused as state is managed in the component

