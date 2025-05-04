
'use client';

/**
 * @fileOverview Provides Text-to-Speech (TTS) functionality using the browser's SpeechSynthesis API.
 */

let utterance: SpeechSynthesisUtterance | null = null;
let currentText = ''; // Stores the text of the currently active (speaking or paused) utterance
let isSpeakingInternal = false; // Internal tracking
let isPausedInternal = false; // Internal tracking

// Store callbacks to avoid assigning them multiple times if not needed
let onEndCallback: (() => void) | undefined;
let onErrorCallback: ((event: SpeechSynthesisErrorEvent) => void) | undefined;
let onStartCallback: (() => void) | undefined;
let onPauseCallback: (() => void) | undefined;
let onResumeCallback: (() => void) | undefined;

// Flag to differentiate natural end from cancellation due to starting new speech or explicit stop
let wasCancelledPrematurely = false;

/**
 * Gets the text of the currently active (speaking or paused) utterance.
 * Returns an empty string if nothing is active.
 */
export function getCurrentUtteranceText(): string {
    // Return the text associated with the *current* utterance object, if it exists
    return utterance ? utterance.text : '';
}

/**
 * Speaks the given text using the browser's TTS engine.
 * @param text The text to speak.
 * @param onEnd Callback function executed when speech ends naturally or is stopped explicitly.
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

  const synth = window.speechSynthesis;

  // If called with the same text and it's paused, resume.
  if (isPausedInternal && utterance && utterance.text === text) {
    console.log("Resuming existing paused speech for the same text.");
    resumeSpeech();
    return;
  }

  // If speaking or paused (even if different text), stop before starting new
  if (synth.speaking || synth.paused) {
     console.log("Speech active, stopping before starting new.");
     stopSpeech(true); // Mark as premature cancellation
  } else {
     // If nothing is active, ensure cancellation flag is reset
     wasCancelledPrematurely = false;
  }


  currentText = text; // Update currentText ONLY when starting NEW speech
  utterance = new SpeechSynthesisUtterance(text);

  // Assign callbacks
  onEndCallback = onEnd;
  onErrorCallback = onError;
  onStartCallback = onStart;
  onPauseCallback = onPause;
  onResumeCallback = onResume;


  utterance.onstart = () => {
    isSpeakingInternal = true;
    isPausedInternal = false;
    wasCancelledPrematurely = false; // Reset flag on successful start
    console.log('Speech started');
    onStartCallback?.();
  };

  utterance.onend = () => {
     // Determine if this 'onend' is due to natural completion or cancellation
     const isNaturalEnd = isSpeakingInternal && !isPausedInternal && !wasCancelledPrematurely;
     const isExplicitStop = !isSpeakingInternal && !isPausedInternal && !wasCancelledPrematurely; // Stopped via stopSpeech(false) -> cancel()
     const isPrematureCancel = wasCancelledPrematurely;

     console.log(`Speech onend event. NaturalEnd: ${isNaturalEnd}, ExplicitStop: ${isExplicitStop}, PrematureCancel: ${isPrematureCancel}`);

    // Reset internal state regardless of reason for 'onend'
    isSpeakingInternal = false;
    isPausedInternal = false;
    const endedUtterance = utterance; // Capture utterance before nulling
    utterance = null; // Clear the reference

    // Only call the external onEnd callback if it wasn't a premature cancellation
    if (!isPrematureCancel) {
      console.log("Firing external onEnd callback.");
      onEndCallback?.();
    } else {
      console.log("Skipping external onEnd callback due to premature cancellation.");
    }

     // Clear currentText only if the ended utterance matches the stored text
     // (prevents clearing if a new utterance started quickly)
     if (endedUtterance && currentText === endedUtterance.text) {
         currentText = '';
         console.log("Cleared currentText.");
     }


    // Always reset the premature flag after processing 'onend'
    wasCancelledPrematurely = false;
  };

  utterance.onpause = () => {
    // Ensure state consistency: only trigger if we were actually speaking
    if (isSpeakingInternal) {
        isPausedInternal = true;
        isSpeakingInternal = false;
        console.log('Speech paused');
        onPauseCallback?.();
    } else {
        console.log("onpause event ignored, wasn't speaking.");
    }
  };

  utterance.onresume = () => {
    // Ensure state consistency: only trigger if we were actually paused
    if (isPausedInternal) {
        isPausedInternal = false;
        isSpeakingInternal = true;
        console.log('Speech resumed');
        onResumeCallback?.();
    } else {
        console.log("onresume event ignored, wasn't paused.");
    }
  };

  utterance.onerror = (event) => {
    console.error('Speech Synthesis Error:', event);
    const erroredUtterance = utterance; // Capture utterance before nulling

    // Reset internal state on error
    isSpeakingInternal = false;
    isPausedInternal = false;
    utterance = null;
    wasCancelledPrematurely = false; // Reset flag

    // Call external error callback
    onErrorCallback?.(event);

     // Clear currentText only if the errored utterance matches the stored text
     if (erroredUtterance && currentText === erroredUtterance.text) {
         currentText = '';
          console.log("Cleared currentText due to error.");
     }
  };

  // Optional: Configure voice, rate, pitch if needed
  // const voices = synth.getVoices();
  // utterance.voice = voices[0]; // Example: Set a specific voice
  // utterance.rate = 1; // From 0.1 to 10
  // utterance.pitch = 1; // From 0 to 2

  console.log("Calling synth.speak() with text:", text.substring(0, 50)+"...");
  synth.speak(utterance);
}

/**
 * Pauses the currently speaking utterance.
 */
export function pauseSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
     const synth = window.speechSynthesis;
     // Only pause if it's actually speaking
     if (synth.speaking && !synth.paused && isSpeakingInternal) {
         console.log("Requesting synth.pause().");
         synth.pause();
         // State update relies on the onpause listener
     } else {
         console.log("Ignoring pause request: not speaking or already paused.");
     }
  }
}

/**
 * Resumes the paused utterance.
 */
export function resumeSpeech(): void {
   if (typeof window !== 'undefined' && window.speechSynthesis) {
      const synth = window.speechSynthesis;
      // Only resume if it's actually paused
      if (synth.paused && isPausedInternal) {
          console.log("Requesting synth.resume().");
          synth.resume();
          // State update relies on the onresume listener
      } else {
           console.log("Ignoring resume request: not paused.");
      }
  }
}


/**
 * Stops the currently speaking or paused utterance immediately.
 * @param premature If true, indicates stop is called just before starting a new speech, suppressing the external onEnd callback for this utterance.
 */
export function stopSpeech(premature = false): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
     const synth = window.speechSynthesis;
     if (synth.speaking || synth.paused) {
         console.log(`Requesting synth.cancel() (premature: ${premature})`);
         wasCancelledPrematurely = premature; // Set flag *before* cancelling

         // Cancel effectively stops speech and triggers the 'onend' event listener eventually.
         synth.cancel();

         // Immediately reset internal state for responsiveness, 'onend' handles final cleanup and external callback logic
         isSpeakingInternal = false;
         isPausedInternal = false;
         // We don't nullify 'utterance' here immediately; 'onend' handles that.
     } else {
          // If nothing was active, ensure the flag is reset.
          wasCancelledPrematurely = false;
          console.log("Ignoring stop request: nothing active.");
     }
  } else {
     wasCancelledPrematurely = false; // Ensure flag is reset if synth unavailable
  }
}

    