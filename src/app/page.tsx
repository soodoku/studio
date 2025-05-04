
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db, auth, storage } from '@/lib/firebase/clientApp'; // Import Storage too
import { collection, addDoc, query, where, getDocs, doc, onSnapshot, orderBy, deleteDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Firestore functions
import { deleteObject, ref } from 'firebase/storage'; // Storage delete function
import { FileUpload, type FileUploadMetadata } from '@/components/feature/file-upload'; // Import updated type
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Book, Play, Pause, Square, Loader2, Lightbulb, HelpCircle, ArrowLeft, Check, X, LogOut, Trash2, LogIn, Headphones, AudioLines } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
// Import Browser TTS functions
import { speakText, pauseSpeech, resumeSpeech, stopSpeech, getCurrentUtteranceText } from '@/services/tts';
import { summarizeAudiobookChapter, type SummarizeAudiobookChapterOutput } from '@/ai/flows/summarize-audiobook-chapter';
import { generateQuizQuestions, type GenerateQuizQuestionsOutput, type GenerateQuizQuestionsInput, type Question } from '@/ai/flows/generate-quiz-questions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { signOut } from 'firebase/auth';
import { convertFileToText } from '@/services/file-conversion'; // Keep for extracting text on demand
// Remove direct import of ai-instance to prevent bundling server-side code on client
// import { ai, isAiInitialized, aiInitializationError } from '@/ai/ai-instance';


// Define a type for a book including its content and Firestore ID
interface BookItem {
  id: string; // Firestore document ID
  userId: string; // Firebase Auth User ID
  name: string; // Original filename
  contentType: string; // MIME type
  size: number; // File size
  storageUrl: string; // URL in Firebase Storage
  textContent?: string; // Extracted text content (optional, loaded on demand)
  createdAt: Timestamp; // Firestore Timestamp
  audioStorageUrl?: string; // URL for generated audio file in Storage
}

// Define types for AI generated content
type SummaryState = { loading: boolean; data: SummarizeAudiobookChapterOutput | null; error: string | null };
type QuizState = { loading: boolean; data: GenerateQuizQuestionsOutput | null; error: string | null };
type UserAnswers = { [questionIndex: number]: string };
type AudioGenerationState = { loading: boolean; error: string | null; audioUrl?: string | null };
type TextExtractionState = { loading: boolean; error: string | null };


// Moved HomeContent outside to access useSidebar and useAuth hooks
function HomeContent() {
  const { isMobile } = useSidebar();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [books, setBooks] = useState<BookItem[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  // State for Browser TTS
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [isPausedState, setIsPausedState] = useState(false);
  const [currentSpeakingText, setCurrentSpeakingText] = useState<string | null>(null); // Track the text being spoken/paused

  const [summaryState, setSummaryState] = useState<SummaryState>({ loading: false, data: null, error: null });
  const [quizState, setQuizState] = useState<QuizState>({ loading: false, data: null, error: null });
  // Initialize audioState with the audioUrl from the selected book if available
  const [audioState, setAudioState] = useState<AudioGenerationState>({ loading: false, error: null, audioUrl: selectedBook?.audioStorageUrl || null });
  const [textExtractionState, setTextExtractionState] = useState<TextExtractionState>({ loading: false, error: null });
  const [viewMode, setViewMode] = useState<'library' | 'reader'>('library');
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);


  // Fetch books from Firestore for the logged-in user
   useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (user && db) {
      setBooksLoading(true);
      console.log(`[Firestore] Setting up listener for books with userId: ${user.uid}`);
      const booksCollection = collection(db, 'books');
      const q = query(booksCollection, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

      unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userBooks = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // textContent is loaded on demand, don't expect it from snapshot initially
          textContent: undefined, // Explicitly undefined until loaded
          audioStorageUrl: doc.data().audioStorageUrl || undefined, // Get audio URL
          createdAt: doc.data().createdAt || serverTimestamp(),
        })) as BookItem[];
        console.log(`[Firestore] Snapshot received. ${querySnapshot.docs.length} books found.`);
        setBooks(userBooks);
        setBooksLoading(false);
      }, (error) => {
        console.error("[Firestore] Error fetching books:", error);
        toast({ variant: "destructive", title: "Error Loading Books", description: "Could not fetch your bookshelf. Check Firestore rules or connection." });
        setBooksLoading(false);
      });
    } else if (!db && user) {
        console.error("[Firestore] Firestore instance (db) is not available. Cannot fetch books.");
        toast({ variant: "destructive", title: "Database Error", description: "Could not connect to the database to fetch books." });
        setBooksLoading(false);
    } else {
      // No user or db, clear books and stop loading
      setBooks([]);
      setBooksLoading(false);
      if (!user && !authLoading) {
         console.log("[Auth] No user logged in, clearing books.");
      }
    }

    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
         console.log("[Firestore] Unsubscribed from book updates.");
      }
    };
   }, [user, authLoading, toast]); // Added authLoading dependency


    const addBook = useCallback(async (metadata: FileUploadMetadata) => {
        if (!user) {
            toast({ variant: "destructive", title: "Not Logged In", description: "You must be logged in to add books." });
            console.error("[addBook] User not logged in.");
            return; // Return here to prevent further execution
        }
         if (!db) {
            console.error("[Firestore] Firestore instance (db) is not available. Cannot add book.");
            toast({ variant: "destructive", title: "Database Error", description: "Could not connect to the database to save the book." });
            return; // Return here
         }

        try {
            console.log("[addBook] Preparing to add book metadata:", metadata); // <-- Add log
            const booksCollection = collection(db, 'books');
            // Prepare data for Firestore, using metadata from storage upload
            // textContent is NOT included here, it's loaded on demand
            const newBookData = {
                userId: user.uid,
                name: metadata.fileName,
                contentType: metadata.contentType,
                size: metadata.size,
                storageUrl: metadata.storageUrl,
                createdAt: serverTimestamp(), // Use Firestore server timestamp
                audioStorageUrl: null, // Initialize audio URL field explicitly
            };
            console.log("[addBook] Calling addDoc..."); // <-- Add log
            const docRef = await addDoc(booksCollection, newBookData);
            console.log("[Firestore] Book added to Firestore with ID: ", docRef.id); // <-- Add log
            toast({ // Move toast here to confirm DB entry
                title: "Book Added",
                description: `"${metadata.fileName}" added to your library.`,
            });
            // No need to manually add to state, onSnapshot will handle it
        } catch (e) {
            console.error("[Firestore] Error adding book metadata to Firestore: ", e);
            toast({
                variant: "destructive",
                title: "Error Saving Book",
                description: "Could not save the book metadata to your library.",
            });
            // Consider deleting the uploaded file from storage if DB entry fails?
            // await deleteFileFromStorage(metadata.storageUrl); // Requires implementation
        }
    }, [user, toast]);


    const deleteBook = async (bookToDelete: BookItem) => {
        if (!user || !db || !storage) {
             toast({ variant: "destructive", title: "Deletion Failed", description: "Required services unavailable." });
             return;
        }

        // If the book being deleted is currently selected, reset the view
        if (selectedBook?.id === bookToDelete.id) {
             handleGoBackToLibrary();
        }

        console.log(`Attempting to delete book: ${bookToDelete.name} (ID: ${bookToDelete.id})`);
        console.log(`Main file URL: ${bookToDelete.storageUrl}`);
        console.log(`Audio file URL: ${bookToDelete.audioStorageUrl}`);

        try {
            // 1. Delete Firestore document
            // Security rule `request.auth.uid == resource.data.userId` should handle authorization
            await deleteDoc(doc(db, "books", bookToDelete.id));
            toast({
                title: "Book Metadata Deleted",
                description: `"${bookToDelete.name}" metadata removed.`,
            });

             // 2. Delete the main file from Firebase Storage
             try {
                 const fileRef = ref(storage, bookToDelete.storageUrl); // Use the storage URL
                 await deleteObject(fileRef);
                 console.log(`[Storage] Successfully deleted main file: ${bookToDelete.storageUrl}`);
                 toast({ title: "Main File Deleted", description: `Main file for "${bookToDelete.name}" deleted.` });
             } catch (storageError: any) {
                 console.error(`[Storage] Error deleting main file ${bookToDelete.storageUrl}:`, storageError);
                  // If file not found, it might have been deleted already or URL was wrong
                 if (storageError.code !== 'storage/object-not-found') {
                      toast({ variant: "destructive", title: "Storage Deletion Failed", description: `Could not delete the main file for "${bookToDelete.name}". Manual cleanup may be needed.` });
                 } else {
                     console.warn(`[Storage] Main file not found (may have been deleted already): ${bookToDelete.storageUrl}`);
                 }
             }

            // 3. Delete the associated audio file from storage if it exists
            if (bookToDelete.audioStorageUrl) {
                 try {
                     const audioRef = ref(storage, bookToDelete.audioStorageUrl);
                     await deleteObject(audioRef);
                     console.log(`[Storage] Successfully deleted audio file: ${bookToDelete.audioStorageUrl}`);
                     toast({ title: "Audio File Deleted", description: `Audio file for "${bookToDelete.name}" deleted.` });
                 } catch (audioStorageError: any) {
                     console.error(`[Storage] Error deleting audio file ${bookToDelete.audioStorageUrl}:`, audioStorageError);
                     if (audioStorageError.code !== 'storage/object-not-found') {
                          toast({ variant: "destructive", title: "Audio Deletion Failed", description: `Could not delete the audio file for "${bookToDelete.name}".` });
                     } else {
                          console.warn(`[Storage] Audio file not found (may have been deleted already): ${bookToDelete.audioStorageUrl}`);
                     }
                 }
            }

            // onSnapshot will update the local state automatically after Firestore delete

        } catch (error) {
            console.error("Error deleting book:", error);
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: `Could not delete "${bookToDelete.name}" metadata. Check Firestore rules or connection.`,
            });
        }
    };


  const handleSelectBook = (book: BookItem) => {
    if (selectedBook?.id !== book.id) {
        // Explicitly stop any ongoing speech before switching books
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            console.log("Stopping speech due to book selection change.");
            stopSpeech(); // Ensure stopSpeech resets state correctly
        }
         // Stop any playing audio file
         if (audioPlayerRef.current) {
             audioPlayerRef.current.pause();
             audioPlayerRef.current.currentTime = 0; // Reset playback position
             console.log("Paused and reset audio file player.");
         }


        // Reset all reader-specific states
        setIsSpeakingState(false); // Reset these immediately
        setIsPausedState(false);
        setCurrentSpeakingText(null);
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        // Set audio state based on the newly selected book's audio URL
        setAudioState({ loading: false, error: null, audioUrl: book.audioStorageUrl || null });
        setTextExtractionState({ loading: false, error: null });
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);

        // Set the new book (textContent might be loaded later)
        // Clear existing textContent when selecting a *new* book
        setSelectedBook({ ...book, textContent: undefined });
        console.log("Selected new book:", book.name, "ID:", book.id, "Audio URL:", book.audioStorageUrl);
    } else if (viewMode !== 'reader') {
        // If same book is clicked again but we are in library view, switch to reader
        // No need to stop speech as it shouldn't be playing in library view
         console.log("Re-selecting book to enter reader mode:", book.name);
         // Stop any playing audio file if re-entering
         if (audioPlayerRef.current) {
             audioPlayerRef.current.pause();
             audioPlayerRef.current.currentTime = 0;
             console.log("Paused and reset audio file player on re-entry.");
         }
        setIsSpeakingState(false); // Reset just in case
        setIsPausedState(false);
        setCurrentSpeakingText(null);
        // Ensure other states are also reset if re-entering reader
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        // Set audio state based on the re-selected book's audio URL
        setAudioState({ loading: false, error: null, audioUrl: book.audioStorageUrl || null });
        setTextExtractionState({ loading: false, error: null });
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
         // Clear text content if re-entering reader, forces reload check
         setSelectedBook(prev => prev ? { ...prev, textContent: undefined } : null);
    }

    setViewMode('reader'); // Ensure we are in reader view
  };

   // Function to fetch and update text content for a book
   const loadTextContent = useCallback(async (book: BookItem) => {
       if (!book) {
            console.log("[Text Load] Skipping: No book selected.");
            return;
       }
       // If textContent is already loaded and valid (not an error message), skip.
       if (book.textContent && !book.textContent.startsWith('Error loading text:')) {
            console.log(`[Text Load] Skipping: Text already loaded for ${book.name}.`);
            return;
       }
       if (textExtractionState.loading) {
            console.log("[Text Load] Skipping: Text extraction already in progress.");
            return;
       }
       if (book.contentType !== 'application/pdf') {
           toast({ variant: "default", title: "Text Extraction Not Supported", description: `Text extraction is currently only supported for PDF files, not ${book.contentType}.` });
           // Set textContent to a message indicating it's not supported
           setSelectedBook(prev => prev?.id === book.id ? { ...prev, textContent: `Text extraction not supported for ${book.contentType}.` } : prev);
           return;
       }


       console.log(`[Text Load] Starting text extraction for book: ${book.name}, ID: ${book.id}`);
       setTextExtractionState({ loading: true, error: null });
       try {
           // Fetch the file from storage URL
           console.log(`[Text Load] Fetching PDF from URL: ${book.storageUrl}`);
           const response = await fetch(book.storageUrl);
           if (!response.ok) {
               throw new Error(`Failed to fetch PDF file from storage (status: ${response.status})`);
           }
           const blob = await response.blob();
           const file = new File([blob], book.name, { type: book.contentType });
           console.log(`[Text Load] PDF fetched successfully (size: ${file.size} bytes). Starting extraction...`);


           // Extract text using the service
           const extractedText = await convertFileToText(file);
           console.log(`[Text Load] Text extraction successful for ${book.id}, length: ${extractedText.length}`);


            // Update the selected book state locally ONLY if the current selected book hasn't changed
           setSelectedBook(prev => {
               if (prev && prev.id === book.id) {
                   console.log(`[Text Load] Updating selected book state with text content for ID: ${book.id}`);
                   return { ...prev, textContent: extractedText };
               }
               console.log(`[Text Load] Selected book changed during text extraction (Current: ${prev?.id}, Extracted: ${book.id}). Not updating state.`);
               return prev; // Don't update if the selected book has changed
           });


            // Optional: Update Firestore with the extracted text for future caching
            // Be mindful of the 1MB document limit! Only do this if text is typically small.
            /*
            if (db && user && book.id && extractedText.length < 800000) { // Example limit check
                 const bookRef = doc(db, "books", book.id);
                 try {
                     await updateDoc(bookRef, { textContent: extractedText });
                     console.log(`[Firestore] Cached extracted text for book ${book.id}`);
                 } catch (updateError) {
                      console.error(`[Firestore] Failed to cache text content for book ${book.id}:`, updateError);
                      // Non-critical error, don't need to bother user
                 }
            }
            */

           setTextExtractionState({ loading: false, error: null });
           toast({ title: "Text Ready", description: "Book content is ready for reading and processing." });

       } catch (error) {
           console.error("[Text Load] Error loading/extracting text content:", error);
           const errorMsg = error instanceof Error ? error.message : "Unknown error during text extraction.";
           setTextExtractionState({ loading: false, error: errorMsg });
           toast({ variant: "destructive", title: "Text Extraction Failed", description: errorMsg });
            // Update state to show error in text area
           setSelectedBook(prev => {
               if (prev && prev.id === book.id) {
                    console.log(`[Text Load] Updating selected book state with error message for ID: ${book.id}`);
                   return { ...prev, textContent: `Error loading text: ${errorMsg}` };
               }
                console.log(`[Text Load] Selected book changed during error handling. Not updating state.`);
               return prev;
           });
       }
   }, [toast, textExtractionState.loading]); // Dependencies


    // Trigger text loading when entering reader mode or when selectedBook changes IF text not present
    useEffect(() => {
        if (viewMode === 'reader' && selectedBook && !selectedBook.textContent && !textExtractionState.loading) {
            console.log(`[Effect] Trigger: Load text for selected book ${selectedBook.name}`);
            loadTextContent(selectedBook);
        }
         else if (viewMode === 'reader' && selectedBook && selectedBook.textContent) {
             console.log(`[Effect] Text content already available for ${selectedBook.name}`);
             // Also ensure audio state is synced if text is already loaded
             if (audioState.audioUrl !== selectedBook.audioStorageUrl) {
                 console.log(`[Effect] Syncing audio state for ${selectedBook.name}. Current: ${audioState.audioUrl}, Book: ${selectedBook.audioStorageUrl}`);
                 setAudioState(prev => ({ ...prev, audioUrl: selectedBook.audioStorageUrl || null }));
             }
         }
         else if (viewMode === 'reader' && !selectedBook) {
             console.log("[Effect] In reader mode but no book selected.");
         } else if (viewMode === 'library') {
              console.log("[Effect] In library mode.");
         }
    }, [viewMode, selectedBook, textExtractionState.loading, loadTextContent, audioState.audioUrl]);


  const handleGoBackToLibrary = () => {
     // Explicitly stop speech when going back
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        console.log("Stopping speech due to navigating back to library.");
        stopSpeech(); // Ensure stopSpeech resets state correctly
     }
      // Stop any playing audio file
      if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0; // Reset playback position
          console.log("Paused and reset audio file player when going back to library.");
      }

     // Reset all reader-specific states
    setSelectedBook(null);
    setViewMode('library');
     setIsSpeakingState(false); // Reset these immediately
     setIsPausedState(false);
     setCurrentSpeakingText(null);
     setSummaryState({ loading: false, data: null, error: null });
     setQuizState({ loading: false, data: null, error: null });
     setAudioState({ loading: false, error: null, audioUrl: null });
     setTextExtractionState({ loading: false, error: null });
     setUserAnswers({});
     setQuizSubmitted(false);
     setQuizScore(null);
     console.log("Navigated back to library, state reset.");
  };

  // --- TTS Controls ---
  const handlePlayPause = () => {
    if (!selectedBook?.textContent || selectedBook.textContent.startsWith('Error loading text:')) {
      toast({ variant: "default", title: "No Text Available", description: "Text content not loaded or is unavailable for playback." });
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast({ variant: "destructive", title: "TTS Not Supported", description: "Text-to-speech is not available in your browser." });
      return;
    }

    const currentBookText = selectedBook.textContent;
    const currentlySpeaking = isSpeakingState;
    const currentlyPaused = isPausedState;
    const activeUtteranceText = getCurrentUtteranceText(); // Get text from active utterance


    console.log("Play/Pause Clicked. State - Speaking:", currentlySpeaking, "Paused:", currentlyPaused);
    console.log("Current Book Text (start):", currentBookText?.substring(0, 50) + "...");
    console.log("Active Utterance Text (start):", activeUtteranceText?.substring(0, 50) + "...");

    if (currentlySpeaking) {
      console.log("[TTS] Requesting pause.");
      pauseSpeech();
      // State updates handled by onPause callback
    } else {
      // If paused AND the active utterance text matches the current book text, resume
      if (currentlyPaused && activeUtteranceText === currentBookText) {
        console.log("[TTS] Requesting resume.");
        resumeSpeech();
        // State updates handled by onResume callback
      } else {
        // Otherwise, start speaking the *current* selected book's text from the beginning
        console.log("[TTS] Requesting play for book:", selectedBook.name);
        setCurrentSpeakingText(currentBookText); // Track the text we are INTENDING to speak
        speakText(
          currentBookText, // Use the currently selected book's text
          () => { // onEnd
            console.log("[TTS Callback] Playback finished naturally (onEnd).");
            setIsSpeakingState(false);
            setIsPausedState(false);
             setCurrentSpeakingText(null); // Clear tracked text only on natural end from this flow
          },
          (errorEvent) => { // onError
            console.log("[TTS Callback] Speech error event received.", errorEvent); // Log event for debugging
            // Error type might not always be populated, check message too
             const errorMsg = errorEvent.error || (errorEvent as any).message || 'Unknown TTS Error';
             console.log(`[TTS Callback] Error details: ${errorMsg}`);


             // Ignore "interrupted" or "canceled" error, as it's expected when stopping/starting new speech
            if (errorMsg !== 'interrupted' && errorMsg !== 'canceled') {
                 console.error(`[TTS Callback] Unexpected speech error: ${errorMsg}`);
                 toast({
                     variant: "destructive",
                     title: "Speech Error",
                     description: `Could not play audio. Error: ${errorMsg}. Check console for details.`
                 });
             } else {
                 console.log(`[TTS Callback] Ignoring expected error: '${errorMsg}'.`);
             }
            // Reset state regardless of error type, consistent with tts service logic
            setIsSpeakingState(false);
            setIsPausedState(false);
            setCurrentSpeakingText(null); // Clear tracked text on any error/stop
          },
          () => { // onStart
            console.log('[TTS Callback] Playback started (onStart).');
            setIsSpeakingState(true);
            setIsPausedState(false);
          },
          () => { // onPause
            console.log('[TTS Callback] Playback paused (onPause).');
            // Only update state if it was previously speaking
            if (isSpeakingState) { // Check internal react state
                setIsSpeakingState(false);
                setIsPausedState(true);
            }
          },
          () => { // onResume
            console.log('[TTS Callback] Playback resumed (onResume).');
             // Only update state if it was previously paused
            if (isPausedState) { // Check internal react state
                setIsSpeakingState(true);
                setIsPausedState(false);
            }
          }
        );
      }
    }
  };

   const handleStop = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
          console.log("Stop button clicked. Requesting stop.");
          stopSpeech(); // This should trigger onend or onerror('interrupted'/'canceled')
          // Immediately update UI state for responsiveness
          setIsSpeakingState(false);
          setIsPausedState(false);
           // Explicitly clear tracked text immediately on user stop action
           setCurrentSpeakingText(null);
      }
  };


  // Update UI state based on TTS events (handled by callbacks passed to speakText)
  // These are now mostly for logging or specific UI tweaks if needed outside the buttons.

 // --- Genkit Flow Handlers ---

 const handleSummarize = async () => {
    if (!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:')) {
        toast({ variant: "default", title: "No Text Available", description: "Load or finish loading valid text content before generating summary." });
        return;
    }
    if (!user) { // Check for user authentication
        toast({ variant: "destructive", title: "Authentication Required", description: "Please log in to use AI features." });
        return;
    }
    // Remove check for isAiInitialized/aiInitializationError as ai-instance is not imported here
    // if (!isAiInitialized || !ai) { // Use Genkit status flags
    //     toast({ variant: "destructive", title: "AI Service Error", description: aiInitializationError || "AI service is not initialized. Check server logs and API key." });
    //     return;
    // }


    setSummaryState({ loading: true, data: null, error: null });
    try {
      const result = await summarizeAudiobookChapter({ chapterText: selectedBook.textContent });
      setSummaryState({ loading: false, data: result, error: null });
      toast({
        title: "Summary Generated",
        description: "Chapter summary created successfully.",
      });
    } catch (error) {
      console.error("Error generating summary (client-side):", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      let userFriendlyMessage = `Failed to generate summary. ${errorMessage}`;
       // Refine user message based on common error types caught by the flow
       if (errorMessage.includes('API key not valid') ||
           // errorMessage.includes('AI service not initialized') || // Removed this check
           errorMessage.includes('server error') ||
           errorMessage.includes('Failed to fetch') ||
           errorMessage.includes('network error') ||
           errorMessage.includes('Invalid input') ||
           errorMessage.includes('Billing account not configured')) {
          userFriendlyMessage = errorMessage; // Use the more specific message from the flow
      } else {
          userFriendlyMessage = "Failed to generate summary due to an unexpected error."; // Generic fallback
      }
      setSummaryState({ loading: false, data: null, error: userFriendlyMessage });
      toast({ variant: "destructive", title: "Summarization Failed", description: userFriendlyMessage });
    }
  };


  const handleGenerateQuiz = async () => {
     if (!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:')) {
        toast({ variant: "default", title: "No Text Available", description: "Load or finish loading valid text content before generating quiz." });
        return;
    }
     if (!user) { // Check for user authentication
        toast({ variant: "destructive", title: "Authentication Required", description: "Please log in to use AI features." });
        return;
    }
     // Remove check for isAiInitialized/aiInitializationError
    // if (!isAiInitialized || !ai) { // Use Genkit status flags
    //     toast({ variant: "destructive", title: "AI Service Error", description: aiInitializationError || "AI service is not initialized. Check server logs and API key." });
    //     return;
    // }


    setQuizState({ loading: true, data: null, error: null });
    setUserAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    try {
        const input: GenerateQuizQuestionsInput = { text: selectedBook.textContent, numQuestions: 5 };
        console.log("[Quiz] Requesting quiz generation with input length:", input.text.length);
        const result = await generateQuizQuestions(input);
        console.log("[Quiz] Quiz generation result:", result);
        setQuizState({ loading: false, data: result, error: null });
        toast({ title: "Quiz Generated", description: "Quiz questions created successfully." });
    } catch (error: any) {
        console.error("[Quiz] Error generating quiz (client-side catch):", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        let userFriendlyMessage = `Failed to generate quiz: ${errorMessage}`;

        // Refine message based on common flow errors
        if (errorMessage.includes('API key not valid') ||
            // errorMessage.includes('AI service not initialized') || // Removed check
            errorMessage.includes('invalid quiz data format') ||
            errorMessage.includes('Network error:') ||
            errorMessage.includes('rate limit exceeded') ||
            errorMessage.includes('Invalid input') ||
            errorMessage.includes('Billing account not configured')) {
            userFriendlyMessage = errorMessage; // Use specific message
        } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('server error') || errorMessage.includes('network error')) {
             userFriendlyMessage = "Failed to generate quiz: Could not reach the AI server.";
        } else if (error?.digest) { // Check for Server Component specific errors
             userFriendlyMessage = `Failed to generate quiz due to a server component error (Digest: ${error.digest}). Check server logs.`;
             console.error("[Quiz] Server Component Error Digest:", error.digest);
        } else {
             userFriendlyMessage = "Failed to generate quiz due to an unexpected error."; // Generic fallback
        }

        setQuizState({ loading: false, data: null, error: userFriendlyMessage });
        toast({ variant: "destructive", title: "Quiz Generation Failed", description: userFriendlyMessage });
    }
  };

 // --- Audio Generation Handler ---
 const handleGenerateAudio = async () => {
     if (!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:')) {
         toast({ variant: "default", title: "No Text Available", description: "Load or finish loading valid text content before generating audio file." });
         return;
     }
     if (!selectedBook.id || !user || !db || !storage || !auth) {
         toast({ variant: "destructive", title: "Error", description: "Required services unavailable for audio generation." });
         return;
     }

     setAudioState({ loading: true, error: null, audioUrl: null });
     toast({ title: "Starting Audio Generation", description: "Sending text to server..." });

     try {
         // Get the Firebase Auth ID token for the current user
         const idToken = await user.getIdToken();

         console.log(`[Client] Sending audio generation request for bookId: ${selectedBook.id}, text length: ${selectedBook.textContent.length}`);

         // Call the API route
         const response = await fetch('/api/generate-audio', {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${idToken}`, // Include the auth token
             },
             body: JSON.stringify({
                 text: selectedBook.textContent,
                 bookId: selectedBook.id,
             }),
         });

         console.log(`[Client] API response status: ${response.status}`);

         if (!response.ok) {
              let errorData = { error: 'Unknown error from server' };
              try {
                   errorData = await response.json();
                   // Log the detailed error from the server if available
                   console.error(`[Client] Server Error Response (${response.status}):`, errorData);
              } catch (parseError) {
                   console.error("[Client] Failed to parse error response JSON:", parseError);
                   // Get raw text if JSON parsing fails
                   const rawErrorText = await response.text();
                   console.error("[Client] Raw Server Error Response Text:", rawErrorText);
                   errorData.error = `Server error ${response.status}. Response body could not be parsed.`;
              }
              // Throw a new error including the status and message from the server if available
             throw new Error(`Server responded with ${response.status}: ${errorData.error || 'Failed to generate audio'}`);
         }

         const data = await response.json();
         const generatedAudioUrl = data.audioUrl;

         if (!generatedAudioUrl) {
              console.error("[Client] API response missing audioUrl:", data);
             throw new Error("Server did not return a valid audio URL.");
         }

         console.log(`[Client] Received audio URL: ${generatedAudioUrl}`);

         // Update Firestore with the new audio storage URL
         const bookRef = doc(db, "books", selectedBook.id);
         // Client-side ownership check (redundant if rules are correct, but good practice)
         if (selectedBook.userId !== user.uid) {
             throw new Error("Permission denied: You do not own this book.");
         }

         try {
             await updateDoc(bookRef, { audioStorageUrl: generatedAudioUrl });
             console.log(`[Firestore] Updated audioStorageUrl for book ${selectedBook.id}`);

             // Update local state immediately for responsiveness
             setSelectedBook(prev => {
                 if (prev && prev.id === selectedBook.id) {
                     return { ...prev, audioStorageUrl: generatedAudioUrl };
                 }
                 return prev; // Don't update if selection changed
             });
             setAudioState({ loading: false, error: null, audioUrl: generatedAudioUrl });
             toast({
                 title: "Audio Generated",
                 description: `Audio file created and saved.`,
             });

         } catch (updateError) {
             console.error("[Firestore] update failed for audio URL:", updateError);
              if (updateError instanceof Error && updateError.message.includes('permission-denied')) {
                   throw new Error("Permission denied: Failed to update book data. Check Firestore rules.");
              }
             throw new Error("Failed to save audio file reference to the database.");
         }

     } catch (error) {
         console.error("[Audio Gen] Error generating audio (client-side):", error);
         const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during audio generation.";
         setAudioState({ loading: false, error: errorMessage, audioUrl: null });
         toast({
             variant: "destructive",
             title: "Audio Generation Failed",
             description: errorMessage,
         });
     }
 };


  // --- Quiz Interaction Handlers ---

  const handleAnswerChange = (questionIndex: number, selectedOption: string) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: selectedOption }));
  };

  const handleQuizSubmit = () => {
    if (!quizState.data) return;
    let correctCount = 0;
    quizState.data.questions.forEach((q, index) => {
      if (userAnswers[index] === q.answer) correctCount++;
    });
    const score = (correctCount / quizState.data.questions.length) * 100;
    setQuizScore(score);
    setQuizSubmitted(true);
    toast({ title: "Quiz Submitted", description: `You scored ${score.toFixed(0)}% (${correctCount}/${quizState.data.questions.length}).` });
  };

  // --- Logout Handler ---
  const handleLogout = async () => {
    try {
        if (!auth) {
            console.error("Logout failed: Auth instance is not available.");
            toast({ variant: 'destructive', title: 'Logout Failed', description: 'Authentication service unavailable.' });
            return;
        }
        await signOut(auth);
        toast({ title: 'Logged Out', description: 'You have been logged out successfully.' });
        // Reset all application state on logout
        handleGoBackToLibrary(); // Reset reader view first
        setBooks([]); // Clear books list
        router.push('/auth'); // Redirect to auth page after logout
    } catch (error) {
        console.error("Logout failed:", error);
        toast({ variant: 'destructive', title: 'Logout Failed', description: 'Could not log you out.' });
    }
  };


   // Cleanup TTS on component unmount or when viewMode changes
   useEffect(() => {
      return () => {
         if (typeof window !== 'undefined' && window.speechSynthesis) {
            console.log("Stopping speech due to component unmount or view change.");
            stopSpeech();
         }
          // Stop audio player on unmount/view change
          if (audioPlayerRef.current) {
              audioPlayerRef.current.pause();
          }
      };
   }, [viewMode]); // Re-run cleanup if viewMode changes

  useEffect(() => { setMounted(true); }, []);

  // Render Loading state or Authentication error centrally
  if (authLoading || !mounted) {
       // Still determining auth state or not yet mounted on client
      return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }
   if (!user) {
       // Auth state resolved, but no user. AuthProvider handles redirect, but we can render null or minimal layout here.
       // This helps prevent flashing the main UI before redirect completes.
       return null; // Or a simple placeholder/message
   }


  return (
    <>
      {/* Sidebar */}
       <SidebarProvider>
          <Sidebar collapsible="icon">
             <SidebarHeader className="items-center border-b border-sidebar-border">
               <div className="flex items-center gap-2">
                  <AudioLines className="h-6 w-6 text-primary" />
                  <h1 className="text-xl font-semibold text-foreground group-data-[collapsible=icon]:hidden">AudioBook Buddy</h1>
               </div>
               {mounted && isMobile && <div className="ml-auto"><SidebarTrigger /></div>}
             </SidebarHeader>
             <SidebarContent className="p-0 flex flex-col">
                 <div className="p-4 flex-grow overflow-hidden">
                     <p className="mb-2 font-medium text-foreground group-data-[collapsible=icon]:hidden">Your Library</p>
                      {booksLoading ? (
                        <div className="mt-4 space-y-2 group-data-[collapsible=icon]:hidden">
                             {[...Array(3)].map((_, i) => (
                                 <div key={i} className="flex items-center space-x-2 p-2 rounded bg-muted/50 animate-pulse">
                                     <Book className="h-4 w-4 text-muted-foreground/50" />
                                     <div className="h-4 bg-muted-foreground/30 rounded w-3/4"></div>
                                 </div>
                             ))}
                        </div>
                      ) : books.length === 0 ? (
                          <div className="mt-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">Upload a PDF file.</div>
                      ) : (
                          <ScrollArea className="h-[calc(100vh-280px)] group-data-[collapsible=icon]:h-auto">
                              <ul className="space-y-1 pr-4 group-data-[collapsible=icon]:pr-0">
                              {books.map((book) => (
                                <li key={book.id} className="group/book-item relative">
                                  <Button
                                    variant={selectedBook?.id === book.id && viewMode === 'reader' ? "secondary" : "ghost"}
                                    className={cn(
                                        `w-full justify-start text-left h-auto py-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:size-10`,
                                        selectedBook?.id === book.id && viewMode === 'reader' && 'font-semibold'
                                    )}
                                    onClick={() => handleSelectBook(book)}
                                    title={book.name}
                                  >
                                    <Book className="h-4 w-4 mr-2 flex-shrink-0 group-data-[collapsible=icon]:mr-0" />
                                    {/* Make sure span is visible in expanded mode */}
                                    <span className="truncate flex-grow ml-1 group-data-[collapsible=icon]:hidden">{book.name}</span>
                                    {book.audioStorageUrl && ( // Check for generated audio URL
                                         <Headphones className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0 group-data-[collapsible=icon]:hidden" title="Generated audio available"/>
                                    )}
                                  </Button>
                                   <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-1/2 -translate-y-1/2 mr-1 h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover/book-item:opacity-100 focus:opacity-100 group-data-[collapsible=icon]:hidden"
                                                aria-label={`Delete book ${book.name}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. This will permanently delete "{book.name}" {book.audioStorageUrl ? 'and its associated audio file ' : ''}from Firestore and Storage.
                                            </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteBook(book)} className={buttonVariants({ variant: "destructive" })}>
                                                Delete
                                            </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>

                                </li>
                              ))}
                            </ul>
                          </ScrollArea>
                      )}
                </div>

                 <div className="border-t border-sidebar-border p-4 mt-auto group-data-[collapsible=icon]:p-2">
                     {/* Pass the updated addBook function */}
                    <FileUpload onUploadSuccess={addBook} />
                </div>

                 <div className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:p-2">
                     <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                         <div className="flex-grow truncate group-data-[collapsible=icon]:hidden">
                            <p className="text-sm font-medium text-foreground truncate" title={user?.email || 'User'}>{user?.email || 'User'}</p>
                        </div>
                         <Button variant="ghost" size="icon" onClick={handleLogout} className="ml-auto group-data-[collapsible=icon]:ml-0" title="Logout">
                            <LogOut className="h-4 w-4" />
                         </Button>
                     </div>
                 </div>
             </SidebarContent>
           </Sidebar>
      </SidebarProvider>

      {/* Main Content Area */}
      <SidebarInset className="flex flex-col">
         {mounted && isMobile && (
             <header className="flex h-14 items-center gap-2 border-b bg-card px-4 sticky top-0 z-10">
                 {/* Always show SidebarTrigger on mobile */}
                 <SidebarTrigger />
                 {/* Conditionally show Back button *next* to trigger */}
                 {viewMode === 'reader' && (
                     <Button variant="ghost" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library" className="ml-1">
                         <ArrowLeft className="h-5 w-5" />
                     </Button>
                 )}
                 <div className="flex items-center gap-2 flex-grow justify-center">
                     <AudioLines className="h-6 w-6 text-primary" />
                     <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
                 </div>
                 <div className="w-8">
                     {!user && !authLoading && (
                         <Button variant="ghost" size="icon" onClick={() => router.push('/auth')} title="Login">
                             <LogIn className="h-5 w-5" />
                         </Button>
                     )}
                 </div>
             </header>
         )}
        <main className="flex flex-1 flex-col items-stretch p-4 md:p-6 overflow-hidden">
          {viewMode === 'library' && (
             <div className="flex flex-1 flex-col items-center justify-center text-center">
                 <AudioLines size={48} className="text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Welcome, {user?.email || 'User'}!</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  {books.length > 0 ? "Select a book from your library." : "Upload a PDF file to begin."}
                </p>
                 {books.length === 0 && !booksLoading && (<p className="text-sm text-primary animate-pulse">Use 'Upload File' in the sidebar.</p>)}
             </div>
          )}

          {viewMode === 'reader' && selectedBook && (
            <div className="flex flex-1 flex-col lg:flex-row gap-4 md:gap-6 max-w-7xl mx-auto w-full overflow-hidden">
                {mounted && !isMobile && (
                    <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20">
                         <Button variant="outline" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library"><ArrowLeft className="h-5 w-5" /></Button>
                     </div>
                 )}

              {/* Book Content Area */}
              <Card className="flex flex-col flex-1 lg:w-2/3 shadow-md relative pt-10 md:pt-0">
                 <CardHeader className="border-b pt-4 pb-4 md:pt-6 md:pb-6 sticky top-0 bg-card z-10">
                     <CardTitle className="truncate pr-10">{selectedBook.name}</CardTitle>
                 </CardHeader>
                 <CardContent className="flex-1 p-4 overflow-auto">
                    {/* Text Content Display */}
                     {textExtractionState.loading && (
                         <div className="flex items-center justify-center h-full">
                             <Loader2 className="h-8 w-8 animate-spin text-primary" />
                             <p className="ml-2 text-muted-foreground">Loading text...</p>
                         </div>
                     )}
                     {textExtractionState.error && (
                         <p className="text-sm text-destructive p-4 text-center">{textExtractionState.error}</p>
                     )}
                     {!textExtractionState.loading && !textExtractionState.error && selectedBook.textContent && (
                         <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                             {selectedBook.textContent}
                         </p>
                     )}
                      {!textExtractionState.loading && !textExtractionState.error && !selectedBook.textContent && selectedBook.contentType !== 'application/pdf' && (
                          <p className="text-sm text-muted-foreground p-4 text-center">Text extraction is not supported for this file type ({selectedBook.contentType}).</p>
                      )}
                       {!textExtractionState.loading && !textExtractionState.error && !selectedBook.textContent && selectedBook.contentType === 'application/pdf' && (
                          <p className="text-sm text-muted-foreground p-4 text-center">Click 'Load Text' or enable automatic loading.</p> // Fallback message
                      )}
                </CardContent>
              </Card>

              {/* AI Features & Audio Area */}
              <Card className="flex flex-col lg:w-1/3 shadow-md overflow-hidden">
                <CardHeader className="border-b sticky top-0 bg-card z-10"><CardTitle>Processing & Insights</CardTitle></CardHeader>
                <CardContent className="flex-1 p-4 overflow-auto">
                    <Accordion type="single" collapsible className="w-full" defaultValue="audio">

                      {/* Audio Playback Section (Browser TTS) */}
                      <AccordionItem value="audio">
                          <AccordionTrigger><div className="flex items-center gap-2 w-full"><Headphones className="h-5 w-5 flex-shrink-0" /><span className="flex-grow text-left">Listen (Browser TTS)</span></div></AccordionTrigger>
                          <AccordionContent>
                              <div className="flex items-center justify-center gap-4 py-4">
                                  <Button onClick={handlePlayPause} size="icon" variant="outline" disabled={!selectedBook?.textContent || textExtractionState.loading || !!textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:')} aria-label={isSpeakingState ? "Pause" : "Play"}>
                                      {isSpeakingState ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                                  </Button>
                                  <Button onClick={handleStop} size="icon" variant="outline" disabled={!isSpeakingState && !isPausedState} aria-label="Stop"><Square className="h-5 w-5" /></Button>
                                  {/* Add Speed Controls if desired */}
                                  {/* <select onChange={handleSpeedChange} defaultValue="1">...</select> */}
                              </div>
                               {(!selectedBook?.textContent || !!textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:')) && !textExtractionState.loading && <p className="text-sm text-muted-foreground text-center">Load valid text content first.</p>}
                               {textExtractionState.loading && <p className="text-sm text-muted-foreground text-center">Loading text...</p>}
                               { typeof window !== 'undefined' && !window.speechSynthesis && (<p className="text-sm text-destructive text-center mt-2">TTS not supported.</p>)}
                          </AccordionContent>
                      </AccordionItem>

                      {/* Audio Generation Section */}
                      <AccordionItem value="generate-audio">
                        <AccordionTrigger>
                           <div className="flex items-center gap-2 w-full">
                             <AudioLines className="h-5 w-5 flex-shrink-0" />
                             <span className="flex-grow text-left">Generated Audio File</span>
                              {audioState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                           </div>
                        </AccordionTrigger>
                        <AccordionContent>
                           {audioState.error && <p className="text-sm text-destructive break-words">{audioState.error}</p>}
                           {/* Check audioState.audioUrl or selectedBook.audioStorageUrl */}
                           {(audioState.audioUrl || selectedBook?.audioStorageUrl) && !audioState.loading && (
                                <div className="text-sm text-center py-2 space-y-2">
                                    <p>Audio file available.</p>
                                     {/* Provide a link or embedded player */}
                                     <audio controls src={audioState.audioUrl || selectedBook?.audioStorageUrl || ''} ref={audioPlayerRef} className="w-full mt-2">
                                         Your browser does not support the audio element.
                                         <a href={audioState.audioUrl || selectedBook?.audioStorageUrl || ''} target="_blank" rel="noopener noreferrer">Download Audio</a>
                                     </audio>
                                    <p className="text-xs text-muted-foreground mt-1">(File stored in Firebase Storage)</p>
                                </div>
                           )}
                           {!audioState.loading && (
                             <Button onClick={handleGenerateAudio} size="sm" className="w-full mt-2" disabled={!selectedBook?.textContent || audioState.loading || textExtractionState.loading || !!textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:') || !user}>
                               {audioState.loading ? 'Generating...' : ((audioState.audioUrl || selectedBook?.audioStorageUrl) ? 'Regenerate Audio File' : 'Generate Audio File')}
                             </Button>
                           )}
                            <p className="text-xs text-muted-foreground mt-2 text-center">Note: Generates an audio file using server-side TTS. Requires loaded text content.</p>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Summary Section */}
                      <AccordionItem value="summary">
                        <AccordionTrigger><div className="flex items-center gap-2 w-full"><Lightbulb className="h-5 w-5 flex-shrink-0" /><span className="flex-grow text-left">Chapter Summary</span>{summaryState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}</div></AccordionTrigger>
                        <AccordionContent>
                          {summaryState.error && <p className="text-sm text-destructive">{summaryState.error}</p>}
                          {summaryState.data && <p className="text-sm">{summaryState.data.summary}</p>}
                          <Button onClick={handleSummarize} size="sm" className="w-full mt-2" disabled={!selectedBook?.textContent || summaryState.loading || textExtractionState.loading || !!textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:') || !user}>
                            {summaryState.loading ? 'Generating...' : (summaryState.data ? 'Regenerate' : 'Generate Summary')}
                          </Button>
                           {/* Remove UI feedback about AI service status based on removed imports */}
                           {/* {(!isAiInitialized) && (<p className="text-xs text-destructive mt-2 text-center">{aiInitializationError || "AI Service not ready."}</p>)} */}
                        </AccordionContent>
                      </AccordionItem>

                      {/* Quiz Section */}
                      <AccordionItem value="quiz">
                        <AccordionTrigger><div className="flex items-center gap-2 w-full"><HelpCircle className="h-5 w-5 flex-shrink-0" /><span className="flex-grow text-left">Quick Quiz</span>{quizState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}</div></AccordionTrigger>
                        <AccordionContent>
                          {quizState.error && <p className="text-sm text-destructive break-words">{quizState.error}</p>}
                          {quizState.data && quizState.data.questions.length > 0 && (
                            <div className="space-y-6">
                                {quizSubmitted && quizScore !== null && (
                                  <div className="p-3 bg-muted rounded-md text-center">
                                      <p className="text-lg font-semibold">Score: {quizScore.toFixed(0)}%</p>
                                      <p className="text-sm text-muted-foreground">({(quizScore / 100 * quizState.data.questions.length).toFixed(0)}/{quizState.data.questions.length} correct)</p>
                                  </div>
                                )}
                              {quizState.data.questions.map((q, index) => (
                                <div key={index} className="text-sm border-b pb-4 last:border-b-0">
                                  <p className="font-medium mb-2">{index + 1}. {q.question}</p>
                                  <RadioGroup value={userAnswers[index]} onValueChange={(value) => handleAnswerChange(index, value)} disabled={quizSubmitted} className="space-y-2">
                                    {q.options.map((opt, i) => {
                                        const isCorrect = opt === q.answer;
                                        const isSelected = userAnswers[index] === opt;
                                        const showResultStyle = quizSubmitted;
                                        return (
                                            <div key={i} className={cn("flex items-center space-x-2 p-2 rounded-md transition-colors", showResultStyle && isCorrect && "bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700", showResultStyle && !isCorrect && isSelected && "bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700")}>
                                                <RadioGroupItem value={opt} id={`q${index}-opt${i}`} />
                                                <Label htmlFor={`q${index}-opt${i}`} className="flex-1 cursor-pointer">{opt}</Label>
                                                {showResultStyle && (isCorrect ? <Check className="h-4 w-4 text-green-600" /> : isSelected ? <X className="h-4 w-4 text-red-600" /> : null)}
                                            </div>
                                        );
                                     })}
                                  </RadioGroup>
                                </div>
                              ))}
                               {!quizSubmitted && (<Button onClick={handleQuizSubmit} size="sm" className="w-full mt-4" disabled={quizState.loading || Object.keys(userAnswers).length !== quizState.data.questions.length}>Submit Quiz</Button>)}
                                 <Button onClick={handleGenerateQuiz} size="sm" variant={quizSubmitted || quizState.data ? "outline" : "default"} className="w-full mt-2" disabled={!selectedBook?.textContent || quizState.loading || textExtractionState.loading || !!textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:') || !user}>
                                   {quizState.loading ? 'Generating...' : 'Generate New Quiz'}
                                 </Button>
                            </div>
                          )}
                           {quizState.data && quizState.data.questions.length === 0 && !quizState.loading &&(<p className="text-sm text-muted-foreground">No quiz questions generated.</p>)}
                          {!quizState.data && !quizState.error && !quizState.loading && ( // Show generate button only if no data, no error, and not loading
                            <Button onClick={handleGenerateQuiz} size="sm" className="w-full" disabled={!selectedBook?.textContent || quizState.loading || textExtractionState.loading || !!textExtractionState.error || selectedBook.textContent.startsWith('Error loading text:') || !user}>
                               {quizState.loading ? 'Generating...' : 'Generate Quiz'}
                             </Button>
                          )}
                           {/* Remove UI feedback about AI service status */}
                           {/* {(!isAiInitialized) && (<p className="text-xs text-destructive mt-2 text-center">{aiInitializationError || "AI Service not ready."}</p>)} */}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </SidebarInset>
    </>
  );
}


// Wrap HomeContent with Providers if needed (Auth is now in layout)
export default function Home() {
  return (
      // AuthProvider is in RootLayout now
      <SidebarProvider>
          <HomeContent />
      </SidebarProvider>
  );
}


