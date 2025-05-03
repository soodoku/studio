
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { db, auth } from '@/lib/firebase/clientApp'; // Import Firestore DB and Auth
import { collection, addDoc, query, where, getDocs, doc, onSnapshot, orderBy, deleteDoc, updateDoc } from 'firebase/firestore'; // Firestore functions
import { FileUpload } from '@/components/feature/file-upload';
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
import { Book, Play, Pause, Square, Loader2, Lightbulb, HelpCircle, ArrowLeft, Check, X, LogOut, Trash2, LogIn, Headphones, AudioLines } from 'lucide-react'; // Added Headphones, AudioLines icons
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { speakText, pauseSpeech, resumeSpeech, stopSpeech } from '@/services/tts';
import { summarizeAudiobookChapter, type SummarizeAudiobookChapterOutput } from '@/ai/flows/summarize-audiobook-chapter';
import { generateQuizQuestions, type GenerateQuizQuestionsOutput, type GenerateQuizQuestionsInput, type Question } from '@/ai/flows/generate-quiz-questions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { signOut } from 'firebase/auth';
// Removed direct import of AI status flags to avoid pulling server-side code into client component
// import { isAiInitialized, aiInitializationError } from '@/ai/ai-instance';


// Define a type for a book including its content and Firestore ID
interface BookItem {
  id: string; // Firestore document ID
  userId: string; // Firebase Auth User ID
  name: string;
  content: string; // Full text content
  createdAt: Date; // Timestamp for ordering
  audioFileName?: string; // Optional: Store the name/path of the generated audio file
}

// Define types for AI generated content
type SummaryState = { loading: boolean; data: SummarizeAudiobookChapterOutput | null; error: string | null };
type QuizState = { loading: boolean; data: GenerateQuizQuestionsOutput | null; error: string | null };
type UserAnswers = { [questionIndex: number]: string };
type AudioGenerationState = { loading: boolean; error: string | null; audioUrl?: string | null };


// Moved HomeContent outside to access useSidebar and useAuth hooks
function HomeContent() {
  const { isMobile } = useSidebar(); // Access isMobile state from context
  const { user, loading: authLoading } = useAuth(); // Access user and loading state from AuthContext
  const router = useRouter();

  const [books, setBooks] = useState<BookItem[]>([]);
  const [booksLoading, setBooksLoading] = useState(true); // Separate loading state for books
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPausedState, setIsPausedState] = useState(false);
  const [summaryState, setSummaryState] = useState<SummaryState>({ loading: false, data: null, error: null });
  const [quizState, setQuizState] = useState<QuizState>({ loading: false, data: null, error: null });
  const [audioState, setAudioState] = useState<AudioGenerationState>({ loading: false, error: null, audioUrl: null });
  const [viewMode, setViewMode] = useState<'library' | 'reader'>('library'); // 'library' or 'reader'
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
    if (user && db) { // Ensure user and db are available
      setBooksLoading(true); // Start loading books
      const booksCollection = collection(db, 'books');
      const q = query(booksCollection, where('userId', '==', user.uid), orderBy('createdAt', 'desc')); // Order by creation time

      // Use onSnapshot for real-time updates
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userBooks = querySnapshot.docs.map(doc => ({
          id: doc.id,
          userId: doc.data().userId,
          name: doc.data().name,
          content: doc.data().content,
          createdAt: doc.data().createdAt.toDate(), // Convert Firestore Timestamp to Date
          audioFileName: doc.data().audioFileName, // Fetch audio file name
        })) as BookItem[];
        setBooks(userBooks);
        setBooksLoading(false); // Finish loading books
        console.log("Books loaded:", userBooks.length);
      }, (error) => {
        console.error("Error fetching books:", error);
        toast({ variant: "destructive", title: "Error Loading Books", description: "Could not fetch your bookshelf." });
        setBooksLoading(false); // Finish loading even on error
      });

      // Cleanup listener on unmount or user change
      return () => unsubscribe();
    } else if (!db && user) {
        // Handle case where user is loaded but db failed init
        console.error("Firestore instance (db) is not available. Cannot fetch books.");
        toast({ variant: "destructive", title: "Database Error", description: "Could not connect to the database to fetch books." });
        setBooksLoading(false);
    }
    else {
      setBooks([]); // Clear books if no user
      setBooksLoading(false); // Not loading if no user
    }
  }, [user, toast]); // Rerun when user or db changes


   const addBook = useCallback(async (fileName: string, textContent: string) => {
        if (!user) {
            toast({ variant: "destructive", title: "Not Logged In", description: "You must be logged in to add books." });
            return;
        }
         // Ensure Firestore instance 'db' is valid before adding
         if (!db) {
            console.error("Firestore instance (db) is not available. Cannot add book.");
            toast({ variant: "destructive", title: "Database Error", description: "Could not connect to the database to save the book." });
            return;
         }

        // Basic check for duplicates (can be improved)
        if (books.some(book => book.name === fileName && book.userId === user.uid)) {
            toast({
            variant: "default",
            title: "Duplicate File",
            description: `${fileName} already exists in your library.`,
            });
            return;
        }

        try {
            const booksCollection = collection(db, 'books');
            const newBookData = {
                userId: user.uid,
                name: fileName,
                content: textContent,
                createdAt: new Date(), // Use JS Date, Firestore converts it
                audioFileName: null, // Initialize audio field
            };
            const docRef = await addDoc(booksCollection, newBookData);
            console.log("Book added with ID: ", docRef.id);
            toast({
                title: "Book Added",
                description: `${fileName} added to your library.`,
            });
            // onSnapshot will handle updating the state, no manual update needed
        } catch (e) {
            console.error("Error adding document: ", e);
            toast({
                variant: "destructive",
                title: "Error Adding Book",
                description: "Could not save the book to your library.",
            });
        }
    }, [user, books, toast]); // Removed isPlaying, isPausedState as adding a book shouldn't stop unrelated playback


    const deleteBook = async (bookId: string, bookName: string) => {
        if (!user || !db) return; // Should not happen if button is shown correctly, also check db

        // If the book being deleted is currently selected, reset the view
        if (selectedBook?.id === bookId) {
             handleGoBackToLibrary(); // Reset view and stop speech
        }

        try {
            await deleteDoc(doc(db, "books", bookId));
            toast({
                title: "Book Deleted",
                description: `"${bookName}" removed from your library.`,
            });
            // onSnapshot will update the local state
            // TODO: Delete associated audio file from storage if implemented
        } catch (error) {
            console.error("Error deleting book:", error);
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: `Could not delete "${bookName}".`,
            });
        }
    };


  const handleSelectBook = (book: BookItem) => {
    if (selectedBook?.id !== book.id) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech(); // Stop speech if changing books
      }
       // Reset states only if it's a *different* book being selected for reading
        setIsPlaying(false);
        setIsPausedState(false);
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        setAudioState({ loading: false, error: null, audioUrl: null }); // Reset audio state
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
    }
    setSelectedBook(book);
    setViewMode('reader'); // Switch to reader view when a book is selected
  };

  const handleGoBackToLibrary = () => {
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech(); // Stop speech when leaving reader
     }
    setSelectedBook(null); // Deselect book
    setViewMode('library'); // Switch back to library view
     setIsPlaying(false);
     setIsPausedState(false);
     // Reset AI and audio states when going back to library explicitly
     setSummaryState({ loading: false, data: null, error: null });
     setQuizState({ loading: false, data: null, error: null });
     setAudioState({ loading: false, error: null, audioUrl: null });
     setUserAnswers({});
     setQuizSubmitted(false);
     setQuizScore(null);
  };


  const handlePlay = () => {
    if (!selectedBook?.content) return;

     if (typeof window === 'undefined' || !window.speechSynthesis) {
         toast({
            variant: "destructive",
            title: "TTS Not Supported",
            description: "Text-to-speech is not available in your browser.",
         });
        return;
    }

    if (isPausedState) {
      resumeSpeech();
      // State update handled by onResume listener in tts.ts
    } else if (!isPlaying) {
       // Start speaking
       speakText(
         selectedBook.content,
         () => { // onEnd callback
           setIsPlaying(false);
           setIsPausedState(false);
           console.log("Playback finished naturally.");
         },
         (error) => { // onError callback
           console.error("Speech error:", error);
           setIsPlaying(false);
           setIsPausedState(false);
           toast({
              variant: "destructive",
              title: "Speech Error",
              description: "Could not play audio. Please try again.",
            });
         },
         () => { // onStart callback
              setIsPlaying(true);
              setIsPausedState(false);
              console.log('Playback started via callback');
         },
          () => { // onPause callback
             setIsPlaying(false);
             setIsPausedState(true);
             console.log('Playback paused via callback');
          },
          () => { // onResume callback
              setIsPlaying(true);
              setIsPausedState(false);
              console.log('Playback resumed via callback');
          }
       );
    }
  };

  const handlePause = () => {
    if (isPlaying && typeof window !== 'undefined' && window.speechSynthesis) {
      pauseSpeech();
      // State update relies on onPause listener in tts.ts
    }
  };

  const handleStop = () => {
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech();
        // State update relies on onEnd listener triggered by cancel()
     }
  };

 // --- Genkit Flow Handlers ---

 const handleSummarize = async () => {
    if (!selectedBook?.content) return;
    // Removed check for isAiInitialized as error handling is in the catch block

    setSummaryState({ loading: true, data: null, error: null });
    try {
      // Call the server action (flow)
      const result = await summarizeAudiobookChapter({ chapterText: selectedBook.content });
      setSummaryState({ loading: false, data: result, error: null });
      toast({
        title: "Summary Generated",
        description: "Chapter summary created successfully.",
      });
    } catch (error) {
      console.error("Error generating summary (client-side):", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      let userFriendlyMessage = `Failed to generate summary. ${errorMessage}`;

      // Check for specific error messages (including API key issues) from the server action
       if (errorMessage.includes('API key not valid') ||
           errorMessage.includes('AI service not initialized') ||
           errorMessage.includes('server error') ||
           errorMessage.includes('Failed to fetch') ||
           errorMessage.includes('network error') ||
           errorMessage.includes('Invalid input') ||
           errorMessage.includes('Billing account not configured')) {
          userFriendlyMessage = errorMessage; // Use the specific error from the server
      } else {
          // Generic fallback
          userFriendlyMessage = "Failed to generate summary due to an unexpected error. Please check the console or Genkit server logs for details.";
      }

      setSummaryState({ loading: false, data: null, error: userFriendlyMessage });
      toast({
        variant: "destructive",
        title: "Summarization Failed",
        description: userFriendlyMessage,
      });
    }
  };


  const handleGenerateQuiz = async () => {
    if (!selectedBook?.content) return;
    // Removed check for isAiInitialized

    setQuizState({ loading: true, data: null, error: null });
    setUserAnswers({}); // Reset answers
    setQuizSubmitted(false); // Reset submission status
    setQuizScore(null); // Reset score
    try {
        // Define input for the flow
        const input: GenerateQuizQuestionsInput = {
            text: selectedBook.content,
            numQuestions: 5 // Generate 5 questions
        };
      console.log("Requesting quiz generation with input:", input);
      // Call the server action (flow)
      const result = await generateQuizQuestions(input);
      console.log("Quiz generation result:", result);
      setQuizState({ loading: false, data: result, error: null });
       toast({
         title: "Quiz Generated",
         description: "Quiz questions created successfully.",
       });
    } catch (error: any) { // Catch 'any' to access digest if present
        console.error("Error generating quiz (client-side catch):", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        let userFriendlyMessage = `Failed to generate quiz: ${errorMessage}`; // Default to the raw error message

        // Check for specific error messages (including API key issues) from the server action
        if (errorMessage.includes('API key not valid') ||
            errorMessage.includes('AI service not initialized') ||
            errorMessage.includes('invalid quiz data format') ||
            errorMessage.includes('Network error:') ||
            errorMessage.includes('rate limit exceeded') ||
            errorMessage.includes('Invalid input') ||
            errorMessage.includes('Billing account not configured')) {
            userFriendlyMessage = errorMessage; // Use the specific error message from the flow
        } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('server error') || errorMessage.includes('network error')) {
             userFriendlyMessage = "Failed to generate quiz: Could not reach the AI server. Ensure the Genkit development server ('npm run genkit:dev') is running and there are no network issues.";
        } else if (error?.digest) {
             userFriendlyMessage = `Failed to generate quiz due to a server component error (Digest: ${error.digest}). Check server logs for details.`;
             console.error("Server Component Error Digest:", error.digest);
        }
        else {
             userFriendlyMessage = "Failed to generate quiz due to an unexpected error. Please check the application logs.";
        }


      setQuizState({ loading: false, data: null, error: userFriendlyMessage });
      toast({
        variant: "destructive",
        title: "Quiz Generation Failed",
        description: userFriendlyMessage,
      });
    }
  };

 // --- Audio Generation Handler ---
const handleGenerateAudio = async () => {
    if (!selectedBook?.content || !selectedBook.id || !user) return;
     // Basic check if TTS is supported, although we're not directly using speakText here
     if (typeof window === 'undefined' || !window.speechSynthesis) {
         toast({ variant: "destructive", title: "TTS Not Supported", description: "Audio generation relies on browser features that may not be fully supported." });
         return;
     }

    setAudioState({ loading: true, error: null, audioUrl: null });
    toast({ title: "Starting Audio Generation", description: "Preparing audio file..." });

    try {
        // Placeholder for actual audio file generation and storage
        // In a real app, this would involve:
        // 1. Calling a server-side function/API endpoint.
        // 2. The server using a TTS service (like Google Cloud Text-to-Speech, not browser's SpeechSynthesis) to generate an MP3/WAV.
        // 3. Uploading the generated audio file to Firebase Storage (or similar).
        // 4. Storing the file reference (URL or path) in the Firestore document for the book.
        // 5. Returning the file URL/path to the client.

        console.log(`Simulating audio generation for book ID: ${selectedBook.id}`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate network delay + generation time

        const generatedAudioFileName = `${selectedBook.id}_audio.mp3`; // Example file name

        // Update Firestore - this would happen on the server in reality after file upload
        if (db && user) {
            const bookRef = doc(db, "books", selectedBook.id);
             // Check if the user owns the book before updating
            // This check should ideally be handled by Firestore rules on the server
            // but we add a client-side check for immediate feedback / prevention
             if (selectedBook.userId !== user.uid) {
                throw new Error("Permission denied: You do not own this book.");
             }

            try {
                await updateDoc(bookRef, { audioFileName: generatedAudioFileName });
                console.log(`Firestore updated: Set audioFileName to ${generatedAudioFileName} for book ${selectedBook.id}`);
                // No need to manually update local state, onSnapshot will trigger update
            } catch (updateError) {
                console.error("Firestore update failed:", updateError);
                 // Check if it's a permissions error
                 if (updateError instanceof Error && updateError.message.includes('permission-denied')) {
                      throw new Error("Permission denied: Failed to update book data. Check Firestore rules.");
                 }
                throw new Error("Failed to save audio file reference to the database.");
            }

        } else {
             throw new Error("Firestore database connection or user authentication not available.");
        }


        // Simulate getting a downloadable URL (in reality, from Firebase Storage)
        const simulatedAudioUrl = `/placeholder-audio/${generatedAudioFileName}`; // This won't actually play
        console.log(`Simulated audio URL: ${simulatedAudioUrl}`);

        setAudioState({ loading: false, error: null, audioUrl: simulatedAudioUrl });
        toast({
            title: "Audio Generated (Simulation)",
            description: `Audio file "${generatedAudioFileName}" is ready (simulated).`,
        });

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
    setUserAnswers(prev => ({
      ...prev,
      [questionIndex]: selectedOption
    }));
  };

  const handleQuizSubmit = () => {
    if (!quizState.data) return;

    let correctCount = 0;
    quizState.data.questions.forEach((q, index) => {
      if (userAnswers[index] === q.answer) {
        correctCount++;
      }
    });

    const score = (correctCount / quizState.data.questions.length) * 100;
    setQuizScore(score);
    setQuizSubmitted(true);

    toast({
      title: "Quiz Submitted",
      description: `You scored ${score.toFixed(0)}% (${correctCount} out of ${quizState.data.questions.length}).`,
    });
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
        // AuthProvider should redirect, but clear local state just in case
        setSelectedBook(null);
        setViewMode('library');
        setBooks([]);
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        setAudioState({ loading: false, error: null, audioUrl: null });
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
        setIsPlaying(false);
        setIsPausedState(false);
         if (typeof window !== 'undefined' && window.speechSynthesis) {
             stopSpeech(); // Ensure speech stops on logout
         }
    } catch (error) {
        console.error("Logout failed:", error);
        toast({ variant: 'destructive', title: 'Logout Failed', description: 'Could not log you out. Please try again.' });
    }
  };


  // Effect to handle component unmount or view change
  useEffect(() => {
    return () => {
      // Only stop speech if TTS is available
      if (typeof window !== 'undefined' && window.speechSynthesis) {
          stopSpeech();
      }
    };
  }, [viewMode]); // Stop speech if view changes (and potentially on unmount)

  useEffect(() => {
      setMounted(true);
  }, []);


  // Show loading indicator while auth is loading or user is null (before redirect)
  // Also show loading if db init failed while auth check is still processing
  if (authLoading || !user || (user && !db && booksLoading)) {
      return (
           <div className="flex items-center justify-center min-h-screen">
               <Loader2 className="h-16 w-16 animate-spin text-primary" />
           </div>
      );
  }

  // Don't render the main UI until mounted to avoid hydration mismatches related to isMobile
  if (!mounted || isMobile === undefined) {
     return (
          <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </div>
     );
  }


  return (
    <>
      {/* Sidebar */}
       <Sidebar collapsible="icon">
         <SidebarHeader className="items-center border-b border-sidebar-border">
           <div className="flex items-center gap-2">
              <AudioLines className="h-6 w-6 text-primary" /> {/* Changed icon */}
              <h1 className="text-xl font-semibold text-foreground group-data-[collapsible=icon]:hidden">AudioBook Buddy</h1>
           </div>
           {mounted && isMobile && (
              <div className="ml-auto">
                <SidebarTrigger />
              </div>
           )}
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
                      <div className="mt-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                         Upload a PDF file to start.
                      </div>
                  ) : (
                      <ScrollArea className="h-[calc(100vh-280px)] group-data-[collapsible=icon]:h-auto"> {/* Adjust height */}
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
                                title={book.name} // Show full name on hover
                              >
                                <Book className="h-4 w-4 mr-2 flex-shrink-0 group-data-[collapsible=icon]:mr-0" />
                                <span className="truncate flex-grow ml-1 group-data-[collapsible=icon]:hidden">{book.name}</span>
                                {book.audioFileName && ( // Show audio icon if audio exists
                                     <Headphones className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0 group-data-[collapsible=icon]:hidden" title="Audio available"/>
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
                                            This action cannot be undone. This will permanently delete "{book.name}" {book.audioFileName ? 'and its audio file ' : ''}from your library.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteBook(book.id, book.name)} className={buttonVariants({ variant: "destructive" })}>
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
                <FileUpload onUploadSuccess={addBook} />
            </div>

             <div className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:p-2">
                 <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                     <div className="flex-grow truncate group-data-[collapsible=icon]:hidden">
                        <p className="text-sm font-medium text-foreground truncate" title={user?.email || 'User'}>{user?.email || 'User'}</p>
                    </div>
                     <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogout}
                        className="ml-auto group-data-[collapsible=icon]:ml-0"
                        title="Logout"
                      >
                        <LogOut className="h-4 w-4" />
                     </Button>
                 </div>
             </div>
         </SidebarContent>
       </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="flex flex-col">
         {mounted && isMobile && (
             <header className="flex h-14 items-center gap-4 border-b bg-card px-4 sticky top-0 z-10">
                {viewMode === 'reader' ? (
                     <Button variant="ghost" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library">
                         <ArrowLeft className="h-5 w-5" />
                     </Button>
                 ) : (
                      mounted && <SidebarTrigger /> // Only show trigger if mounted
                 )}
                <div className="flex items-center gap-2 flex-grow justify-center">
                   <AudioLines className="h-6 w-6 text-primary" /> {/* Changed icon */}
                   <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
                </div>
                  <div className="w-8"> {/* Placeholder for alignment if needed */}
                      {!user && (
                          <Button variant="ghost" size="icon" onClick={() => router.push('/auth')} title="Login">
                             <LogIn className="h-5 w-5" />
                          </Button>
                       )}
                   </div>

             </header>
         )}
        <main className="flex flex-1 flex-col items-stretch p-4 md:p-6 overflow-hidden">
          {/* Conditional Rendering based on viewMode */}
          {viewMode === 'library' && (
             <div className="flex flex-1 flex-col items-center justify-center text-center">
                 <AudioLines size={48} className="text-muted-foreground mb-4" /> {/* Changed icon */}
                <h2 className="text-2xl font-semibold mb-2">Welcome, {user?.email || 'User'}!</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  {books.length > 0
                    ? "Select a book from your library to start reading and listening."
                    : "Upload a PDF file using the button in the sidebar to begin."}
                </p>
                 {books.length === 0 && !booksLoading && (
                     <p className="text-sm text-primary animate-pulse">Use the 'Upload File' button in the sidebar.</p>
                 )}
             </div>
          )}

          {viewMode === 'reader' && selectedBook && (
            <div className="flex flex-1 flex-col lg:flex-row gap-4 md:gap-6 max-w-7xl mx-auto w-full overflow-hidden">
                {mounted && !isMobile && (
                    <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20">
                         <Button variant="outline" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library">
                             <ArrowLeft className="h-5 w-5" />
                         </Button>
                     </div>
                 )}

              {/* Book Content Area */}
              <Card className="flex flex-col flex-1 lg:w-2/3 shadow-md relative pt-10 md:pt-0"> {/* Add padding top for mobile header/button space */}
                 <CardHeader className="border-b pt-4 pb-4 md:pt-6 md:pb-6 sticky top-0 bg-card z-10"> {/* Make header sticky */}
                     <CardTitle className="truncate pr-10">{selectedBook.name}</CardTitle> {/* Add padding for potential back button */}
                 </CardHeader>
                 <CardContent className="flex-1 p-4 overflow-auto"> {/* Changed overflow-hidden to overflow-auto */}
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words"> {/* Added break-words */}
                      {selectedBook.content || "No content available."}
                    </p>
                </CardContent>
              </Card>

              {/* AI Features & Audio Area */}
              <Card className="flex flex-col lg:w-1/3 shadow-md overflow-hidden">
                <CardHeader className="border-b sticky top-0 bg-card z-10">
                  <CardTitle>Processing & Insights</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-auto"> {/* Changed overflow-hidden to overflow-auto */}
                    <Accordion type="single" collapsible className="w-full" defaultValue="audio"> {/* Default to audio open */}

                      {/* Audio Playback Section (Browser TTS) */}
                      <AccordionItem value="audio">
                          <AccordionTrigger>
                            <div className="flex items-center gap-2 w-full">
                                <Headphones className="h-5 w-5 flex-shrink-0" />
                                <span className="flex-grow text-left">Listen (Browser TTS)</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                              <div className="flex items-center justify-center gap-4 py-4">
                                  <Button
                                      onClick={isPlaying ? handlePause : handlePlay}
                                      size="icon"
                                      variant="outline"
                                      disabled={!selectedBook?.content || (!isPlaying && !isPausedState && typeof window !== 'undefined' && window.speechSynthesis?.speaking)}
                                      aria-label={isPlaying ? "Pause" : "Play"}
                                  >
                                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                                  </Button>
                                  <Button
                                      onClick={handleStop}
                                      size="icon"
                                      variant="outline"
                                      disabled={!isPlaying && !isPausedState}
                                      aria-label="Stop"
                                  >
                                      <Square className="h-5 w-5" />
                                  </Button>
                              </div>
                               {!selectedBook?.content && <p className="text-sm text-muted-foreground text-center">No content loaded for playback.</p>}
                               { typeof window !== 'undefined' && !window.speechSynthesis && (
                                   <p className="text-sm text-destructive text-center mt-2">Text-to-Speech is not supported by your browser.</p>
                               )}
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
                           {selectedBook.audioFileName && !audioState.loading && (
                                <div className="text-sm text-center py-2">
                                    <p>Audio file available:</p>
                                    <p className="font-mono text-xs text-muted-foreground break-all">{selectedBook.audioFileName}</p>
                                    {/* Placeholder for actual player or download link */}
                                    {/* <audio controls src={audioState.audioUrl || '#'} className="w-full mt-2" /> */}
                                    <p className="text-xs text-muted-foreground mt-1">(Audio playback/download not yet implemented)</p>
                                </div>
                           )}
                           {!audioState.loading && ( // Show button if not loading
                             <Button
                               onClick={handleGenerateAudio}
                               size="sm"
                               className="w-full mt-2"
                               disabled={!selectedBook?.content || audioState.loading} // Disable if no content or already loading
                             >
                               {selectedBook.audioFileName ? 'Regenerate Audio File' : 'Generate Audio File'}
                             </Button>
                           )}
                            <p className="text-xs text-muted-foreground mt-2 text-center">Note: This generates an audio file (simulation). Use "Listen" for instant browser playback.</p>
                        </AccordionContent>
                      </AccordionItem>


                      {/* Summary Section */}
                      <AccordionItem value="summary">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2 w-full">
                            <Lightbulb className="h-5 w-5 flex-shrink-0" />
                            <span className="flex-grow text-left">Chapter Summary</span>
                            {summaryState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          {summaryState.error && <p className="text-sm text-destructive">{summaryState.error}</p>}
                          {summaryState.data && <p className="text-sm">{summaryState.data.summary}</p>}
                          <Button
                            onClick={handleSummarize}
                            size="sm"
                            className="w-full mt-2"
                            disabled={!selectedBook?.content || summaryState.loading}
                          >
                            {summaryState.loading ? 'Generating...' : (summaryState.data ? 'Regenerate Summary' : 'Generate Summary')}
                          </Button>
                          {/* Display potential AI initialization errors here */}
                           {summaryState.error && summaryState.error.includes('AI service not initialized') && (
                                <p className="text-xs text-destructive mt-2 text-center">{summaryState.error}</p>
                           )}
                        </AccordionContent>
                      </AccordionItem>

                      {/* Quiz Section */}
                      <AccordionItem value="quiz">
                        <AccordionTrigger>
                           <div className="flex items-center gap-2 w-full">
                            <HelpCircle className="h-5 w-5 flex-shrink-0" />
                            <span className="flex-grow text-left">Quick Quiz</span>
                            {quizState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          {quizState.error && <p className="text-sm text-destructive break-words">{quizState.error}</p>}
                          {quizState.data && quizState.data.questions.length > 0 && (
                            <div className="space-y-6">
                                {quizSubmitted && quizScore !== null && (
                                  <div className="p-3 bg-muted rounded-md text-center">
                                      <p className="text-lg font-semibold">Your Score: {quizScore.toFixed(0)}%</p>
                                      <p className="text-sm text-muted-foreground">
                                        ({(quizScore / 100 * quizState.data.questions.length).toFixed(0)} out of {quizState.data.questions.length} correct)
                                      </p>
                                  </div>
                                )}

                              {quizState.data.questions.map((q, index) => (
                                <div key={index} className="text-sm border-b pb-4 last:border-b-0">
                                  <p className="font-medium mb-2">{index + 1}. {q.question}</p>
                                  <RadioGroup
                                    value={userAnswers[index]}
                                    onValueChange={(value) => handleAnswerChange(index, value)}
                                    disabled={quizSubmitted}
                                    className="space-y-2"
                                  >
                                    {q.options.map((opt, i) => {
                                        const isCorrect = opt === q.answer;
                                        const isSelected = userAnswers[index] === opt;
                                        const showResultStyle = quizSubmitted;

                                        return (
                                            <div key={i} className={cn(
                                                "flex items-center space-x-2 p-2 rounded-md transition-colors",
                                                showResultStyle && isCorrect && "bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700",
                                                showResultStyle && !isCorrect && isSelected && "bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700"

                                            )}>
                                                <RadioGroupItem value={opt} id={`q${index}-opt${i}`} />
                                                <Label htmlFor={`q${index}-opt${i}`} className="flex-1 cursor-pointer">
                                                    {opt}
                                                </Label>
                                                {showResultStyle && (
                                                    isCorrect ? <Check className="h-4 w-4 text-green-600" />
                                                    : isSelected ? <X className="h-4 w-4 text-red-600" /> : null
                                                )}
                                            </div>
                                        );
                                     })}
                                  </RadioGroup>
                                </div>
                              ))}

                               {!quizSubmitted && (
                                    <Button onClick={handleQuizSubmit} size="sm" className="w-full mt-4" disabled={quizState.loading || Object.keys(userAnswers).length !== quizState.data.questions.length}>
                                        Submit Quiz
                                    </Button>
                                )}

                                 <Button
                                   onClick={handleGenerateQuiz}
                                   size="sm"
                                   variant={quizSubmitted || quizState.data ? "outline" : "default"}
                                   className="w-full mt-2"
                                   disabled={!selectedBook?.content || quizState.loading}
                                 >
                                   {quizState.loading ? 'Generating...' : 'Generate New Quiz'}
                                 </Button>
                            </div>
                          )}
                           {quizState.data && quizState.data.questions.length === 0 && !quizState.loading &&(
                               <p className="text-sm text-muted-foreground">No quiz questions generated.</p>
                           )}
                          {!quizState.data && !quizState.error && (
                            <Button
                               onClick={handleGenerateQuiz}
                               size="sm"
                               className="w-full"
                               disabled={!selectedBook?.content || quizState.loading}
                             >
                               {quizState.loading ? 'Generating...' : 'Generate Quiz'}
                             </Button>
                          )}
                            {/* Display potential AI initialization errors here */}
                           {quizState.error && quizState.error.includes('AI service not initialized') && (
                                <p className="text-xs text-destructive mt-2 text-center">{quizState.error}</p>
                           )}
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
      // Removed AuthProvider wrapper here as it's in RootLayout
      <SidebarProvider>
          <HomeContent />
      </SidebarProvider>
  );
}
