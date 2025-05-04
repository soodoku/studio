
'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
// Import TTS functions
import { speakText, pauseSpeech, resumeSpeech, stopSpeech, getCurrentUtteranceText } from '@/services/tts';
import { summarizeAudiobookChapter, type SummarizeAudiobookChapterOutput } from '@/ai/flows/summarize-audiobook-chapter';
import { generateQuizQuestions, type GenerateQuizQuestionsOutput, type GenerateQuizQuestionsInput, type Question } from '@/ai/flows/generate-quiz-questions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { signOut } from 'firebase/auth';
import { convertFileToText } from '@/services/file-conversion'; // Keep for extracting text on demand


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

  const [summaryState, setSummaryState] = useState<SummaryState>({ loading: false, data: null, error: null });
  const [quizState, setQuizState] = useState<QuizState>({ loading: false, data: null, error: null });
  const [audioState, setAudioState] = useState<AudioGenerationState>({ loading: false, error: null, audioUrl: null });
  const [textExtractionState, setTextExtractionState] = useState<TextExtractionState>({ loading: false, error: null });
  const [viewMode, setViewMode] = useState<'library' | 'reader'>('library');
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);


  // Redirect to auth page if not logged in and auth is resolved
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

   // Fetch books from Firestore for the logged-in user
   useEffect(() => {
    if (user && db) {
      setBooksLoading(true);
      const booksCollection = collection(db, 'books');
      const q = query(booksCollection, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userBooks = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // textContent might not be stored, ensure it defaults safely
          textContent: doc.data().textContent || undefined,
          createdAt: doc.data().createdAt || serverTimestamp(), // Ensure createdAt exists
        })) as BookItem[];
        setBooks(userBooks);
        setBooksLoading(false);
        console.log("Books loaded/updated:", userBooks.length);
      }, (error) => {
        console.error("Error fetching books:", error);
        toast({ variant: "destructive", title: "Error Loading Books", description: "Could not fetch your bookshelf. Check Firestore rules or connection." });
        setBooksLoading(false);
      });

      return () => unsubscribe();
    } else if (!db && user) {
        console.error("Firestore instance (db) is not available. Cannot fetch books.");
        toast({ variant: "destructive", title: "Database Error", description: "Could not connect to the database to fetch books." });
        setBooksLoading(false);
    } else {
      setBooks([]);
      setBooksLoading(false);
    }
  }, [user, toast]);


   const addBook = useCallback(async (metadata: FileUploadMetadata) => {
        if (!user) {
            toast({ variant: "destructive", title: "Not Logged In", description: "You must be logged in to add books." });
            return;
        }
         if (!db) {
            console.error("Firestore instance (db) is not available. Cannot add book.");
            toast({ variant: "destructive", title: "Database Error", description: "Could not connect to the database to save the book." });
            return;
         }

        // Basic check for duplicates based on name and user
        if (books.some(book => book.name === metadata.fileName && book.userId === user.uid)) {
            toast({
            variant: "default",
            title: "Duplicate File",
            description: `${metadata.fileName} already exists in your library.`,
            });
            // Even if duplicate, allow refresh logic to run if metadata is different (e.g., new text extracted)
            // But don't add a new Firestore document. Consider updating existing if needed.
            // For now, just prevent adding a new doc.
            return;
        }

        try {
            const booksCollection = collection(db, 'books');
            // Prepare data for Firestore, using metadata from storage upload
            const newBookData = {
                userId: user.uid,
                name: metadata.fileName,
                contentType: metadata.contentType,
                size: metadata.size,
                storageUrl: metadata.storageUrl,
                textContent: metadata.textContent || null, // Store extracted text if available, otherwise null
                createdAt: serverTimestamp(), // Use Firestore server timestamp
                audioStorageUrl: null, // Initialize audio URL field
            };
            const docRef = await addDoc(booksCollection, newBookData);
            console.log("Book added to Firestore with ID: ", docRef.id);
            // toast already shown in FileUpload component
            // No need to manually add to state, onSnapshot will handle it
        } catch (e) {
            console.error("Error adding book metadata to Firestore: ", e);
            toast({
                variant: "destructive",
                title: "Error Saving Book",
                description: "Could not save the book metadata to your library.",
            });
            // Consider deleting the uploaded file from storage if DB entry fails?
            // await deleteFileFromStorage(metadata.storageUrl); // Requires implementation
        }
    }, [user, books, toast]); // Removed setBooks from dependencies


    const deleteBook = async (bookToDelete: BookItem) => {
        if (!user || !db || !storage) {
             toast({ variant: "destructive", title: "Deletion Failed", description: "Required services unavailable." });
             return;
        }

        // If the book being deleted is currently selected, reset the view
        if (selectedBook?.id === bookToDelete.id) {
             handleGoBackToLibrary();
        }

        try {
            // 1. Delete Firestore document
            // Security rule `request.auth.uid == resource.data.userId` should handle authorization
            await deleteDoc(doc(db, "books", bookToDelete.id));
            toast({
                title: "Book Deleted",
                description: `"${bookToDelete.name}" removed from your library metadata.`,
            });

             // 2. Delete the main file from Firebase Storage
             try {
                 const fileRef = ref(storage, bookToDelete.storageUrl); // Use the storage URL
                 await deleteObject(fileRef);
                 console.log(`[Storage] Deleted file: ${bookToDelete.storageUrl}`);
                 toast({ title: "File Deleted", description: `Main file for "${bookToDelete.name}" deleted from storage.` });
             } catch (storageError: any) {
                 console.error(`[Storage] Error deleting main file ${bookToDelete.storageUrl}:`, storageError);
                  // If file not found, it might have been deleted already or URL was wrong
                 if (storageError.code !== 'storage/object-not-found') {
                      toast({ variant: "destructive", title: "Storage Deletion Failed", description: `Could not delete the main file for "${bookToDelete.name}". It might need manual cleanup.` });
                 }
             }

            // 3. Delete the associated audio file from storage if it exists
            if (bookToDelete.audioStorageUrl) {
                 try {
                     const audioRef = ref(storage, bookToDelete.audioStorageUrl);
                     await deleteObject(audioRef);
                     console.log(`[Storage] Deleted audio file: ${bookToDelete.audioStorageUrl}`);
                     toast({ title: "Audio File Deleted", description: `Audio file for "${bookToDelete.name}" deleted from storage.` });
                 } catch (audioStorageError: any) {
                     console.error(`[Storage] Error deleting audio file ${bookToDelete.audioStorageUrl}:`, audioStorageError);
                     if (audioStorageError.code !== 'storage/object-not-found') {
                          toast({ variant: "destructive", title: "Audio Deletion Failed", description: `Could not delete the audio file for "${bookToDelete.name}".` });
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

        // Reset all reader-specific states
        setIsSpeakingState(false); // Reset these immediately
        setIsPausedState(false);
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        setAudioState({ loading: false, error: null, audioUrl: book.audioStorageUrl || null });
        setTextExtractionState({ loading: false, error: null });
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);

        // Set the new book (textContent might be loaded later)
        setSelectedBook(book);
        console.log("Selected new book:", book.name, "ID:", book.id);
    } else if (viewMode !== 'reader') {
        // If same book is clicked again but we are in library view, switch to reader
        // No need to stop speech as it shouldn't be playing in library view
        console.log("Re-selecting book to enter reader mode:", book.name);
        setIsSpeakingState(false); // Reset just in case
        setIsPausedState(false);
        // Ensure other states are also reset if re-entering reader
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        setAudioState({ loading: false, error: null, audioUrl: book.audioStorageUrl || null });
        setTextExtractionState({ loading: false, error: null });
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
    }

    setViewMode('reader'); // Ensure we are in reader view
  };

   // Function to fetch and update text content for a book
   const loadTextContent = useCallback(async (book: BookItem) => {
       if (!book || book.textContent) {
            console.log("Skipping text load: Already loaded or no book.");
            return; // Already loaded or no book selected
       }
       if (book.contentType !== 'application/pdf') {
           toast({ variant: "default", title: "Text Extraction", description: "Text extraction is currently only supported for PDF files." });
           // Set textContent to a message indicating it's not supported
           setSelectedBook(prev => prev ? { ...prev, textContent: `Text extraction not supported for ${book.contentType}.` } : null);
           return;
       }
       if (textExtractionState.loading) {
            console.log("Skipping text load: Already loading.");
            return; // Already loading
       }


       console.log("Starting text load for book:", book.name, "ID:", book.id);
       setTextExtractionState({ loading: true, error: null });
       try {
           // Fetch the file from storage URL
           const response = await fetch(book.storageUrl);
           if (!response.ok) {
               throw new Error(`Failed to fetch PDF file from storage (status: ${response.status})`);
           }
           const blob = await response.blob();
           const file = new File([blob], book.name, { type: book.contentType });

           // Extract text using the service
           const extractedText = await convertFileToText(file);
           console.log("Text extraction successful, length:", extractedText.length, "Book ID:", book.id);


            // Update the selected book state locally ONLY if the current selected book hasn't changed
           setSelectedBook(prev => {
               if (prev && prev.id === book.id) {
                   console.log("Updating selected book state with text content for ID:", book.id);
                   return { ...prev, textContent: extractedText };
               }
               console.log("Selected book changed during text extraction, not updating state. Current ID:", prev?.id, "Extraction ID:", book.id);
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
           console.error("Error loading/extracting text content:", error);
           const errorMsg = error instanceof Error ? error.message : "Unknown error during text extraction.";
           setTextExtractionState({ loading: false, error: errorMsg });
           toast({ variant: "destructive", title: "Text Extraction Failed", description: errorMsg });
            // Update state to show error in text area
           setSelectedBook(prev => {
               if (prev && prev.id === book.id) {
                   return { ...prev, textContent: `Error loading text: ${errorMsg}` };
               }
               return prev;
           });
       }
   }, [toast, textExtractionState.loading]); // Removed user, db dependencies (should be stable)


    // Trigger text loading when entering reader mode or when selectedBook changes
    useEffect(() => {
        if (viewMode === 'reader' && selectedBook && !selectedBook.textContent && !textExtractionState.loading) {
            console.log("Effect triggered: Load text for selected book", selectedBook.name);
            loadTextContent(selectedBook);
        }
         else if (viewMode === 'reader' && selectedBook && selectedBook.textContent) {
             console.log("Effect triggered: Text content already available for", selectedBook.name);
         }
         else if (viewMode === 'reader' && !selectedBook) {
             console.log("Effect triggered: In reader mode but no book selected.");
         } else if (viewMode === 'library') {
              console.log("Effect triggered: In library mode.");
         }
    }, [viewMode, selectedBook, textExtractionState.loading, loadTextContent]);


  const handleGoBackToLibrary = () => {
     // Explicitly stop speech when going back
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        console.log("Stopping speech due to navigating back to library.");
        stopSpeech(); // Ensure stopSpeech resets state correctly
     }

     // Reset all reader-specific states
    setSelectedBook(null);
    setViewMode('library');
     setIsSpeakingState(false); // Reset these immediately
     setIsPausedState(false);
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
    if (!selectedBook?.textContent) {
      toast({ variant: "default", title: "No Text", description: "Text content not loaded or available for playback." });
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast({ variant: "destructive", title: "TTS Not Supported", description: "Text-to-speech is not available in your browser." });
      return;
    }

    const currentActiveUtteranceText = getCurrentUtteranceText(); // Text of the utterance currently managed by TTS service
    const currentBookText = selectedBook.textContent;

    console.log("Play/Pause Clicked. isSpeaking:", isSpeakingState, "isPaused:", isPausedState);
    console.log("Current Book Text (start):", currentBookText?.substring(0, 50) + "...");
    console.log("Current Utterance Text:", currentActiveUtteranceText?.substring(0, 50) + "...");


    if (isSpeakingState) {
      console.log("Requesting pause.");
      pauseSpeech();
      // State updates handled by onPause callback
    } else {
      // If paused AND the utterance text matches the current book text, resume
      if (isPausedState && currentActiveUtteranceText === currentBookText) {
        console.log("Requesting resume.");
        resumeSpeech();
        // State updates handled by onResume callback
      } else {
        // Otherwise, start speaking the *current* selected book's text from the beginning
        console.log("Requesting play for book:", selectedBook.name);
        speakText(
          currentBookText, // Use the currently selected book's text
          () => { // onEnd
            console.log("Playback finished naturally (onEnd callback).");
            setIsSpeakingState(false);
            setIsPausedState(false);
            // No need to clear currentText here, tts service handles it
          },
          (error) => { // onError
            console.error("Speech error (onError callback):", error);
            toast({ variant: "destructive", title: "Speech Error", description: `Could not play audio. Error: ${error.error || 'Unknown'}` });
            setIsSpeakingState(false);
            setIsPausedState(false);
          },
          () => { // onStart
            console.log('Playback started (onStart callback).');
            setIsSpeakingState(true);
            setIsPausedState(false);
          },
          () => { // onPause
            console.log('Playback paused (onPause callback).');
            // Only update state if it was previously speaking
            if (isSpeakingState) {
                setIsSpeakingState(false);
                setIsPausedState(true);
            }
          },
          () => { // onResume
            console.log('Playback resumed (onResume callback).');
             // Only update state if it was previously paused
            if (isPausedState) {
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
          stopSpeech(); // This should trigger onend eventually
          // Immediately update UI state for responsiveness
          setIsSpeakingState(false);
          setIsPausedState(false);
          // Note: The onEnd callback in speakText handles the final state reset
      }
  };


  // Update UI state based on TTS events (handled by callbacks passed to speakText)
  // These are now mostly for logging or specific UI tweaks if needed outside the buttons.

 // --- Genkit Flow Handlers ---

 const handleSummarize = async () => {
    if (!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error) {
        toast({ variant: "default", title: "No Text Available", description: "Load or finish loading text content before generating summary." });
        return;
    }
    if (!user) { // Check for user authentication
        toast({ variant: "destructive", title: "Authentication Required", description: "Please log in to use AI features." });
        return;
    }


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
       if (errorMessage.includes('API key not valid') ||
           errorMessage.includes('AI service not initialized') ||
           errorMessage.includes('server error') ||
           errorMessage.includes('Failed to fetch') ||
           errorMessage.includes('network error') ||
           errorMessage.includes('Invalid input') ||
           errorMessage.includes('Billing account not configured')) {
          userFriendlyMessage = errorMessage;
      } else {
          userFriendlyMessage = "Failed to generate summary due to an unexpected error.";
      }
      setSummaryState({ loading: false, data: null, error: userFriendlyMessage });
      toast({ variant: "destructive", title: "Summarization Failed", description: userFriendlyMessage });
    }
  };


  const handleGenerateQuiz = async () => {
     if (!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error) {
        toast({ variant: "default", title: "No Text Available", description: "Load or finish loading text content before generating quiz." });
        return;
    }
     if (!user) { // Check for user authentication
        toast({ variant: "destructive", title: "Authentication Required", description: "Please log in to use AI features." });
        return;
    }


    setQuizState({ loading: true, data: null, error: null });
    setUserAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    try {
        const input: GenerateQuizQuestionsInput = { text: selectedBook.textContent, numQuestions: 5 };
        console.log("Requesting quiz generation with input length:", input.text.length);
        const result = await generateQuizQuestions(input);
        console.log("Quiz generation result:", result);
        setQuizState({ loading: false, data: result, error: null });
        toast({ title: "Quiz Generated", description: "Quiz questions created successfully." });
    } catch (error: any) {
        console.error("Error generating quiz (client-side catch):", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        let userFriendlyMessage = `Failed to generate quiz: ${errorMessage}`;

        if (errorMessage.includes('API key not valid') ||
            errorMessage.includes('AI service not initialized') ||
            errorMessage.includes('invalid quiz data format') ||
            errorMessage.includes('Network error:') ||
            errorMessage.includes('rate limit exceeded') ||
            errorMessage.includes('Invalid input') ||
            errorMessage.includes('Billing account not configured')) {
            userFriendlyMessage = errorMessage;
        } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('server error') || errorMessage.includes('network error')) {
             userFriendlyMessage = "Failed to generate quiz: Could not reach the AI server.";
        } else if (error?.digest) {
             userFriendlyMessage = `Failed to generate quiz due to a server component error (Digest: ${error.digest}). Check server logs.`;
             console.error("Server Component Error Digest:", error.digest);
        } else {
             userFriendlyMessage = "Failed to generate quiz due to an unexpected error.";
        }

        setQuizState({ loading: false, data: null, error: userFriendlyMessage });
        toast({ variant: "destructive", title: "Quiz Generation Failed", description: userFriendlyMessage });
    }
  };

 // --- Audio Generation Handler ---
const handleGenerateAudio = async () => {
     if (!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error) {
        toast({ variant: "default", title: "No Text Available", description: "Load or finish loading text content before generating audio file." });
        return;
    }
    if (!selectedBook.id || !user || !db || !storage) {
        toast({ variant: "destructive", title: "Error", description: "Required services unavailable for audio generation." });
        return;
    }


    setAudioState({ loading: true, error: null, audioUrl: null });
    toast({ title: "Starting Audio Generation", description: "Preparing audio file..." });

    try {
        // Placeholder for actual server-side audio file generation
        // This should ideally be a Cloud Function or a dedicated backend service
        // that takes the text, uses a server-side TTS (like Google Cloud TTS),
        // uploads the result to storage, and returns the URL.
        console.log(`Simulating server-side audio generation for book ID: ${selectedBook.id}`);
        await new Promise(resolve => setTimeout(resolve, 4000)); // Simulate generation time

        // Assume server generates and uploads to a path like: audiobooks_generated/{userId}/{bookId}.mp3
        // IMPORTANT: Ensure storage rules allow writing to this path by authenticated users.
        const generatedAudioFileName = `${selectedBook.id}_audio.mp3`;
        const audioStoragePath = `audiobooks_generated/${user.uid}/${generatedAudioFileName}`;

        // Simulate getting a download URL (server would return this after upload)
        // For simulation, we create a plausible storage URL structure.
        const simulatedAudioUrl = `https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(audioStoragePath)}?alt=media`;
        console.log(`Simulated audio URL: ${simulatedAudioUrl}`);

        // Update Firestore with the new audio storage URL
        const bookRef = doc(db, "books", selectedBook.id);
        // Client-side ownership check (redundant if rules are correct, but good practice)
        if (selectedBook.userId !== user.uid) {
            throw new Error("Permission denied: You do not own this book.");
        }

        try {
            await updateDoc(bookRef, { audioStorageUrl: simulatedAudioUrl });
            console.log(`[Firestore] Updated audioStorageUrl for book ${selectedBook.id}`);

            // Update local state immediately for responsiveness
            setSelectedBook(prev => {
                if (prev && prev.id === selectedBook.id) {
                    return { ...prev, audioStorageUrl: simulatedAudioUrl };
                }
                return prev; // Don't update if selection changed
            });

            setAudioState({ loading: false, error: null, audioUrl: simulatedAudioUrl });
            toast({
                title: "Audio Generated (Simulation)",
                description: `Audio file reference saved.`,
            });

        } catch (updateError) {
            console.error("Firestore update failed for audio URL:", updateError);
             if (updateError instanceof Error && updateError.message.includes('permission-denied')) {
                  throw new Error("Permission denied: Failed to update book data. Check Firestore rules.");
             }
            throw new Error("Failed to save audio file reference to the database.");
        }

    } catch (error) {
        console.error("Error generating audio (client-side simulation):", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during audio generation simulation.";
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
      };
   }, [viewMode]); // Re-run cleanup if viewMode changes

  useEffect(() => { setMounted(true); }, []);

  if (authLoading) {
      return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }
  if (!mounted || isMobile === undefined || !user) {
     // Show loading or placeholder during initial SSR/hydration or if not logged in
     return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
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
             <header className="flex h-14 items-center gap-4 border-b bg-card px-4 sticky top-0 z-10">
                {viewMode === 'reader' ? (
                     <Button variant="ghost" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library"><ArrowLeft className="h-5 w-5" /></Button>
                 ) : ( mounted && <SidebarTrigger /> )}
                <div className="flex items-center gap-2 flex-grow justify-center">
                   <AudioLines className="h-6 w-6 text-primary" />
                   <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
                </div>
                  <div className="w-8">{!user && !authLoading && (<Button variant="ghost" size="icon" onClick={() => router.push('/auth')} title="Login"><LogIn className="h-5 w-5" /></Button>)}</div>
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
                          <p className="text-sm text-muted-foreground p-4 text-center">Could not load text content.</p> // Fallback message
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
                                  <Button onClick={handlePlayPause} size="icon" variant="outline" disabled={!selectedBook?.textContent || textExtractionState.loading || textExtractionState.error} aria-label={isSpeakingState ? "Pause" : "Play"}>
                                      {isSpeakingState ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                                  </Button>
                                  <Button onClick={handleStop} size="icon" variant="outline" disabled={!isSpeakingState && !isPausedState} aria-label="Stop"><Square className="h-5 w-5" /></Button>
                                  {/* Add Speed Controls if desired */}
                                  {/* <select onChange={handleSpeedChange} defaultValue="1">...</select> */}
                              </div>
                               {(!selectedBook?.textContent || textExtractionState.error) && !textExtractionState.loading && <p className="text-sm text-muted-foreground text-center">Load text content first.</p>}
                               {textExtractionState.loading && <p className="text-sm text-muted-foreground text-center">Loading text...</p>}
                               { typeof window !== 'undefined' && !window.speechSynthesis && (<p className="text-sm text-destructive text-center mt-2">TTS not supported.</p>)}
                          </AccordionContent>
                      </AccordionItem>

                      {/* Audio Generation Section */}
                      <AccordionItem value="generate-audio">
                        <AccordionTrigger>
                           <div className="flex items-center gap-2 w-full">
                             <AudioLines className="h-5 w-5 flex-shrink-0" />
                             <span className="flex-grow text-left">Generate Audio File</span>
                              {audioState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                           </div>
                        </AccordionTrigger>
                        <AccordionContent>
                           {audioState.error && <p className="text-sm text-destructive break-words">{audioState.error}</p>}
                           {selectedBook.audioStorageUrl && !audioState.loading && ( // Check for generated URL
                                <div className="text-sm text-center py-2 space-y-2">
                                    <p>Audio file generated.</p>
                                     {/* Provide a link or embedded player */}
                                     <audio controls src={selectedBook.audioStorageUrl} className="w-full mt-2">
                                         Your browser does not support the audio element.
                                         <a href={selectedBook.audioStorageUrl} target="_blank" rel="noopener noreferrer">Download Audio</a>
                                     </audio>
                                    <p className="text-xs text-muted-foreground mt-1">(File stored in Firebase Storage)</p>
                                </div>
                           )}
                           {!audioState.loading && (
                             <Button onClick={handleGenerateAudio} size="sm" className="w-full mt-2" disabled={!selectedBook?.textContent || audioState.loading || textExtractionState.loading || !!textExtractionState.error}>
                               {audioState.loading ? 'Generating...' : (selectedBook.audioStorageUrl ? 'Regenerate Audio File' : 'Generate Audio File')}
                             </Button>
                           )}
                            <p className="text-xs text-muted-foreground mt-2 text-center">Note: Generates an audio file via server (simulation). Requires loaded text content.</p>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Summary Section */}
                      <AccordionItem value="summary">
                        <AccordionTrigger><div className="flex items-center gap-2 w-full"><Lightbulb className="h-5 w-5 flex-shrink-0" /><span className="flex-grow text-left">Chapter Summary</span>{summaryState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}</div></AccordionTrigger>
                        <AccordionContent>
                          {summaryState.error && <p className="text-sm text-destructive">{summaryState.error}</p>}
                          {summaryState.data && <p className="text-sm">{summaryState.data.summary}</p>}
                          <Button onClick={handleSummarize} size="sm" className="w-full mt-2" disabled={!selectedBook?.textContent || summaryState.loading || textExtractionState.loading || !!textExtractionState.error}>
                            {summaryState.loading ? 'Generating...' : (summaryState.data ? 'Regenerate' : 'Generate Summary')}
                          </Button>
                           {summaryState.error && summaryState.error.includes('AI service not initialized') && (<p className="text-xs text-destructive mt-2 text-center">{summaryState.error}</p>)}
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
                                 <Button onClick={handleGenerateQuiz} size="sm" variant={quizSubmitted || quizState.data ? "outline" : "default"} className="w-full mt-2" disabled={!selectedBook?.textContent || quizState.loading || textExtractionState.loading || !!textExtractionState.error}>
                                   {quizState.loading ? 'Generating...' : 'Generate New Quiz'}
                                 </Button>
                            </div>
                          )}
                           {quizState.data && quizState.data.questions.length === 0 && !quizState.loading &&(<p className="text-sm text-muted-foreground">No quiz questions generated.</p>)}
                          {!quizState.data && !quizState.error && (
                            <Button onClick={handleGenerateQuiz} size="sm" className="w-full" disabled={!selectedBook?.textContent || quizState.loading || textExtractionState.loading || !!textExtractionState.error}>
                               {quizState.loading ? 'Generating...' : 'Generate Quiz'}
                             </Button>
                          )}
                           {quizState.error && quizState.error.includes('AI service not initialized') && (<p className="text-xs text-destructive mt-2 text-center">{quizState.error}</p>)}
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


// Wrap HomeContent with Providers
export default function Home() {
  return (
      // AuthProvider is in RootLayout now
      <SidebarProvider>
          <HomeContent />
      </SidebarProvider>
  );
}

    