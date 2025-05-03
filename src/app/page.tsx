
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext'; // Import AuthProvider
import { db, auth } from '@/lib/firebase/clientApp'; // Import Firestore DB and Auth
import { collection, addDoc, query, where, getDocs, doc, onSnapshot, orderBy, deleteDoc } from 'firebase/firestore'; // Firestore functions
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
import { Book, Play, Pause, Square, Loader2, Lightbulb, HelpCircle, ArrowLeft, Check, X, LogOut, Trash2, LogIn } from 'lucide-react';
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


// Define a type for a book including its content and Firestore ID
interface BookItem {
  id: string; // Firestore document ID
  userId: string; // Firebase Auth User ID
  name: string;
  content: string; // Full text content
  createdAt: Date; // Timestamp for ordering
}

// Define types for AI generated content
type SummaryState = { loading: boolean; data: SummarizeAudiobookChapterOutput | null; error: string | null };
type QuizState = { loading: boolean; data: GenerateQuizQuestionsOutput | null; error: string | null };
type UserAnswers = { [questionIndex: number]: string };

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
    if (user) {
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
    } else {
      setBooks([]); // Clear books if no user
      setBooksLoading(false); // Not loading if no user
    }
  }, [user, toast]); // Rerun when user changes


   const addBook = useCallback(async (fileName: string, textContent: string) => {
        if (!user) {
            toast({ variant: "destructive", title: "Not Logged In", description: "You must be logged in to add books." });
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
            };
            const docRef = await addDoc(booksCollection, newBookData);
            console.log("Book added with ID: ", docRef.id);
            toast({
                title: "Book Added",
                description: `${fileName} added to your library.`,
            });
            // No need to manually update state, onSnapshot will handle it
            // setViewMode('library'); // Stay in library view -- Removed, let user stay if they were in reader
            // Reset player state if a book was playing irrelevant to the added book
            if (isPlaying || isPausedState) {
                stopSpeech();
                setIsPlaying(false);
                setIsPausedState(false);
            }
        } catch (e) {
            console.error("Error adding document: ", e);
            toast({
                variant: "destructive",
                title: "Error Adding Book",
                description: "Could not save the book to your library.",
            });
        }
    }, [user, books, isPlaying, isPausedState, toast]); // Include books in dependencies for duplicate check

    const deleteBook = async (bookId: string, bookName: string) => {
        if (!user) return; // Should not happen if button is shown correctly

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
     // Reset AI states when going back to library explicitly
     setSummaryState({ loading: false, data: null, error: null });
     setQuizState({ loading: false, data: null, error: null });
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
      // setIsPlaying(true); // Let callback handle this
      // setIsPausedState(false);
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
       // setIsPlaying(false); // Let callback handle this
       // setIsPausedState(true);
    }
  };

  const handleStop = () => {
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech();
        // State update relies on onEnd listener triggered by cancel()
        // setIsPlaying(false); // Let callback handle this
        // setIsPausedState(false);
     }
  };

 // --- Genkit Flow Handlers ---

 const handleSummarize = async () => {
    if (!selectedBook?.content) return;

    setSummaryState({ loading: true, data: null, error: null });
    try {
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

      // Provide more specific hints for common issues (already handled in summarize flow)
       // Check if the server provided a more specific message
      if (errorMessage.includes('API key not valid') || errorMessage.includes('server error') || errorMessage.includes('Failed to fetch') || errorMessage.includes('network error') || errorMessage.includes('Invalid input')) {
          userFriendlyMessage = errorMessage; // Use the specific error from the server
      } else {
          // Generic fallback if the server error wasn't specific enough or it was a client-side issue
          userFriendlyMessage = "Failed to generate summary due to an unexpected error. Please check the console for details.";
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
      const result = await generateQuizQuestions(input); // Pass structured input
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

        // Check if the error message provides specific details from the server
        if (errorMessage.includes('API key not valid') ||
            errorMessage.includes('invalid quiz data format') ||
            errorMessage.includes('Network error:') ||
            errorMessage.includes('rate limit exceeded') ||
            errorMessage.includes('Invalid input')) {
            userFriendlyMessage = errorMessage; // Use the specific error message from the flow
        } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('server error') || errorMessage.includes('network error')) {
             // More generic network/server error if specific details aren't available
             userFriendlyMessage = "Failed to generate quiz: Could not reach the AI server. Ensure the Genkit development server ('npm run genkit:dev') is running and there are no network issues.";
        } else if (error?.digest) {
             // If there's a digest, mention it for server-side debugging
             userFriendlyMessage = `Failed to generate quiz due to a server component error (Digest: ${error.digest}). Check server logs for details.`;
             console.error("Server Component Error Digest:", error.digest);
        }
        else {
             // Fallback for truly unexpected errors
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
        await signOut(auth);
        toast({ title: 'Logged Out', description: 'You have been logged out successfully.' });
        // AuthProvider will handle redirect via the useEffect hook
        setSelectedBook(null); // Clear selected book on logout
        setViewMode('library'); // Go to library view
        // Clear other states if necessary
        setBooks([]);
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
        setUserAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
        setIsPlaying(false);
        setIsPausedState(false);
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
  if (authLoading || !user) {
      // You can return a full-page loader here if preferred
      return (
           <div className="flex items-center justify-center min-h-screen">
               <Loader2 className="h-16 w-16 animate-spin text-primary" />
           </div>
      );
  }

  // Don't render the main UI until mounted to avoid hydration mismatches related to isMobile
  if (!mounted || isMobile === undefined) {
     // Or a loading indicator matching the theme
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
              <Book className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold text-foreground group-data-[collapsible=icon]:hidden">AudioBook Buddy</h1>
           </div>
            {/* Only show trigger on mobile */}
           {mounted && isMobile && (
              <div className="ml-auto">
                <SidebarTrigger />
              </div>
           )}
         </SidebarHeader>
         <SidebarContent className="p-0 flex flex-col">
             {/* Bookshelf */}
             <div className="p-4 flex-grow overflow-hidden">
                 <p className="mb-2 font-medium text-foreground group-data-[collapsible=icon]:hidden">Your Bookshelf</p>
                  {booksLoading ? (
                    <div className="mt-4 space-y-2 group-data-[collapsible=icon]:hidden">
                         {/* Skeleton Loader for books */}
                         {[...Array(3)].map((_, i) => (
                             <div key={i} className="flex items-center space-x-2 p-2 rounded bg-muted/50 animate-pulse">
                                 <Book className="h-4 w-4 text-muted-foreground/50" />
                                 <div className="h-4 bg-muted-foreground/30 rounded w-3/4"></div>
                             </div>
                         ))}
                    </div>
                  ) : books.length === 0 ? (
                      <div className="mt-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                         Upload a file to start.
                      </div>
                  ) : (
                      <ScrollArea className="h-[calc(100vh-280px)] group-data-[collapsible=icon]:h-auto"> {/* Adjust height */}
                          <ul className="space-y-1 pr-4 group-data-[collapsible=icon]:pr-0">
                          {books.map((book) => (
                            <li key={book.id} className="group/book-item relative">
                              <Button
                                variant={selectedBook?.id === book.id && viewMode === 'reader' ? "secondary" : "ghost"}
                                className={`w-full justify-start text-left h-auto py-2 px-2 ${selectedBook?.id === book.id && viewMode === 'reader' ? 'font-semibold' : ''} group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:size-10`}
                                onClick={() => handleSelectBook(book)}
                                title={book.name} // Show full name on hover
                              >
                                <Book className="h-4 w-4 mr-2 flex-shrink-0 group-data-[collapsible=icon]:mr-0" />
                                <span className="truncate flex-grow group-data-[collapsible=icon]:hidden">{book.name}</span>
                              </Button>
                               {/* Delete Button - Show on hover (desktop) or always (mobile, if needed) */}
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
                                            This action cannot be undone. This will permanently delete "{book.name}" from your library.
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

             {/* File Upload - Moved below bookshelf */}
             <div className="border-t border-sidebar-border p-4 mt-auto group-data-[collapsible=icon]:p-2">
                <FileUpload onUploadSuccess={addBook} />
            </div>

              {/* User Info & Logout */}
             <div className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:p-2">
                 <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                     {/* Placeholder for Avatar - can add later */}
                     {/* <Avatar className="h-8 w-8 group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6">
                         <AvatarFallback>{user?.email?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                     </Avatar> */}
                     <div className="flex-grow truncate group-data-[collapsible=icon]:hidden">
                        <p className="text-sm font-medium text-foreground truncate" title={user?.email || 'User'}>{user?.email || 'User'}</p>
                        {/* <p className="text-xs text-muted-foreground">User ID: {user?.uid}</p> */}
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
         {/* <SidebarFooter className="border-t border-sidebar-border p-4">
            <FileUpload onUploadSuccess={addBook} />
         </SidebarFooter> */}
       </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="flex flex-col">
         {/* Mobile Header */}
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
                   <Book className="h-6 w-6 text-primary" />
                   <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
                </div>
                 {/* Add a spacer or adjust layout if Logout needs to be here */}
                  <div className="w-8"> {/* Placeholder for alignment if needed */}
                      {!user && ( // Show login icon if no user (shouldn't happen due to redirect, but for safety)
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
                <Book size={48} className="text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Welcome, {user?.email || 'User'}!</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  {books.length > 0
                    ? "Select a book from your bookshelf to start reading and get AI insights."
                    : "Upload a PDF or ePUB file using the button in the sidebar to begin."}
                </p>
                 {books.length === 0 && !booksLoading && ( // Show upload hint if library is empty and not loading
                     <p className="text-sm text-primary animate-pulse">Use the 'Upload File' button in the sidebar.</p>
                 )}
             </div>
          )}

          {viewMode === 'reader' && selectedBook && (
            <div className="flex flex-1 flex-col lg:flex-row gap-4 md:gap-6 max-w-7xl mx-auto w-full overflow-hidden">
               {/* Back Button (Desktop) */}
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
                  {/* <ScrollArea className="h-full pr-4"> */} {/* Remove ScrollArea if CardContent handles scroll */}
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words"> {/* Added break-words */}
                      {selectedBook.content || "No content available."}
                    </p>
                  {/* </ScrollArea> */}
                </CardContent>
                <CardFooter className="border-t p-4 flex items-center justify-center gap-4 bg-muted/50 sticky bottom-0 z-10">
                  <Button
                    onClick={isPlaying ? handlePause : handlePlay}
                    size="icon"
                    variant="outline"
                    disabled={!selectedBook?.content}
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
                </CardFooter>
              </Card>

              {/* AI Features Area */}
              <Card className="flex flex-col lg:w-1/3 shadow-md overflow-hidden">
                <CardHeader className="border-b sticky top-0 bg-card z-10">
                  <CardTitle>AI Insights</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-auto"> {/* Changed overflow-hidden to overflow-auto */}
                  {/* <ScrollArea className="h-full pr-4"> */} {/* Remove ScrollArea */}
                    <Accordion type="single" collapsible className="w-full" defaultValue="summary">
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
                          {!summaryState.loading && !summaryState.data && !summaryState.error && (
                            <Button onClick={handleSummarize} size="sm" className="w-full" disabled={!selectedBook?.content}>
                              Generate Summary
                            </Button>
                          )}
                           {summaryState.data && !summaryState.loading && (
                              <Button onClick={handleSummarize} size="sm" variant="outline" className="w-full mt-2" disabled={!selectedBook?.content}>
                                Regenerate Summary
                              </Button>
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
                          {quizState.error && <p className="text-sm text-destructive break-words">{quizState.error}</p>} {/* Added break-words */}
                          {quizState.data && quizState.data.questions.length > 0 && (
                            <div className="space-y-6">
                                {/* Display Score after submission */}
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
                                    disabled={quizSubmitted} // Disable after submission
                                    className="space-y-2"
                                  >
                                    {q.options.map((opt, i) => {
                                        const isCorrect = opt === q.answer;
                                        const isSelected = userAnswers[index] === opt;
                                        const showResultStyle = quizSubmitted; // Only show styles after submit

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

                               {/* Submit/Regenerate Buttons */}
                               {!quizSubmitted && (
                                    <Button onClick={handleQuizSubmit} size="sm" className="w-full mt-4" disabled={quizState.loading || Object.keys(userAnswers).length !== quizState.data.questions.length}>
                                        Submit Quiz
                                    </Button>
                                )}

                                {quizSubmitted && (
                                    <Button onClick={handleGenerateQuiz} size="sm" variant="outline" className="w-full mt-4" disabled={quizState.loading || !selectedBook?.content}>
                                        Generate New Quiz
                                    </Button>
                                )}
                            </div>
                          )}
                           {quizState.data && quizState.data.questions.length === 0 && !quizState.loading &&(
                               <p className="text-sm text-muted-foreground">No quiz questions generated.</p>
                           )}
                          {!quizState.loading && !quizState.data && !quizState.error && (
                            <Button onClick={handleGenerateQuiz} size="sm" className="w-full" disabled={!selectedBook?.content}>
                              Generate Quiz
                            </Button>
                          )}
                           {/* Add Regenerate button when quiz exists but is not submitted yet */}
                           {quizState.data && !quizSubmitted && !quizState.loading && (
                              <Button onClick={handleGenerateQuiz} size="sm" variant="outline" className="w-full mt-2" disabled={!selectedBook?.content}>
                                Regenerate Quiz
                              </Button>
                            )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  {/* </ScrollArea> */}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </SidebarInset>
    </>
  );
}


// Wrap HomeContent with SidebarProvider
export default function Home() {
  return (
    <AuthProvider> {/* Ensure AuthProvider wraps SidebarProvider or vice-versa consistently */}
        <SidebarProvider>
            <HomeContent />
        </SidebarProvider>
    </AuthProvider>
  );
}
