
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileUpload } from '@/components/feature/file-upload';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar // Import useSidebar hook
} from '@/components/ui/sidebar';
import { Book, Play, Pause, Square, Loader2, Lightbulb, HelpCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { speakText, pauseSpeech, resumeSpeech, stopSpeech } from '@/services/tts';
import { summarizeAudiobookChapter, type SummarizeAudiobookChapterOutput } from '@/ai/flows/summarize-audiobook-chapter';
import { generateQuizQuestions, type GenerateQuizQuestionsOutput } from '@/ai/flows/generate-quiz-questions';
import { useToast } from '@/hooks/use-toast';

// Define a type for a book including its content
interface BookItem {
  id: string;
  name: string;
  content: string; // Full text content
}

// Define types for AI generated content
type SummaryState = { loading: boolean; data: SummarizeAudiobookChapterOutput | null; error: string | null };
type QuizState = { loading: boolean; data: GenerateQuizQuestionsOutput | null; error: string | null };


// Moved HomeContent outside to access useSidebar hook
function HomeContent() {
  const { isMobile } = useSidebar(); // Access isMobile state from context

  const [books, setBooks] = useState<BookItem[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPausedState, setIsPausedState] = useState(false);
  const [summaryState, setSummaryState] = useState<SummaryState>({ loading: false, data: null, error: null });
  const [quizState, setQuizState] = useState<QuizState>({ loading: false, data: null, error: null });
  const [viewMode, setViewMode] = useState<'library' | 'reader'>('library'); // 'library' or 'reader'
  const { toast } = useToast();

 const addBook = useCallback((fileName: string, textContent: string) => {
    const newBook: BookItem = {
      id: Date.now().toString(),
      name: fileName,
      content: textContent,
    };
    setBooks((prevBooks) => {
      // Prevent adding duplicates based on name and content length (basic check)
      if (prevBooks.some(book => book.name === fileName && book.content.length === textContent.length)) {
        toast({
          variant: "default",
          title: "Duplicate File",
          description: `${fileName} already exists in your library.`,
        });
        return prevBooks;
      }
      const updatedBooks = [...prevBooks, newBook];
       toast({
          title: "Book Added",
          description: `${fileName} added to your library.`,
        });
      return updatedBooks;
    });
     // Stay in library view after adding
     setViewMode('library');
     // Ensure states are reset properly when adding a new book, regardless of current view
     setIsPlaying(false);
     setIsPausedState(false);
     // Don't reset summary/quiz if user is already viewing another book's AI results
     // setSummaryState({ loading: false, data: null, error: null });
     // setQuizState({ loading: false, data: null, error: null });
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech(); // Stop any ongoing speech only if TTS is available
     }
  }, [toast]);


  const handleSelectBook = (book: BookItem) => {
    if (selectedBook?.id !== book.id) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech(); // Stop speech if changing books
      }
    }
    setSelectedBook(book);
    setViewMode('reader'); // Switch to reader view when a book is selected
    // Reset states only if it's a *different* book being selected for reading
    if (selectedBook?.id !== book.id) {
        setIsPlaying(false);
        setIsPausedState(false);
        setSummaryState({ loading: false, data: null, error: null });
        setQuizState({ loading: false, data: null, error: null });
    }
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
      // State update handled by resumeSpeech's internal logic (if onresume fires reliably)
      // Or optimistically:
      setIsPlaying(true);
      setIsPausedState(false);
    } else if (!isPlaying) {
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
        // onStart callback
        () => {
             setIsPlaying(true);
             setIsPausedState(false);
             console.log('Playback started via callback');
        },
         // onPause callback (optional, can rely on handlePause)
         () => {
            setIsPlaying(false);
            setIsPausedState(true);
            console.log('Playback paused via callback');
         },
         // onResume callback (optional, can rely on handlePlay/resumeSpeech)
         () => {
             setIsPlaying(true);
             setIsPausedState(false);
             console.log('Playback resumed via callback');
         }

      );
      // Optimistic update (consider relying solely on onStart if needed)
      // setIsPlaying(true);
      // setIsPausedState(false);
    }
  };

  const handlePause = () => {
    if (isPlaying && typeof window !== 'undefined' && window.speechSynthesis) {
      pauseSpeech();
       // Optimistic update (consider relying on onPause callback)
       setIsPlaying(false);
       setIsPausedState(true);
    }
  };

  const handleStop = () => {
     if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopSpeech();
        // TTS stopSpeech will trigger onEnd, which resets state.
        // Or optimistically:
        setIsPlaying(false);
        setIsPausedState(false);
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

      // Provide more specific hints for common issues
      if (errorMessage.includes('API key not valid')) {
        userFriendlyMessage = "Failed to generate summary: Invalid API key. Please check your GOOGLE_GENAI_API_KEY in the .env file.";
      } else if (errorMessage.includes('server error') || errorMessage.includes('Failed to fetch') || errorMessage.includes('network error')) {
        userFriendlyMessage = "Failed to generate summary: Could not reach the AI server. Ensure the Genkit development server ('npm run genkit:dev') is running and there are no network issues.";
      } else if (errorMessage.includes('Invalid input')) {
         userFriendlyMessage = `Failed to generate summary: ${errorMessage}`; // Show specific validation error
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
    try {
      const result = await generateQuizQuestions({ text: selectedBook.content, numQuestions: 5 }); // Generate 5 questions
      setQuizState({ loading: false, data: result, error: null });
       toast({
         title: "Quiz Generated",
         description: "Quiz questions created successfully.",
       });
    } catch (error) {
        console.error("Error generating quiz (client-side):", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        let userFriendlyMessage = `Failed to generate quiz: ${errorMessage}`;

        // Provide more specific hints for common issues
        if (errorMessage.includes('API key not valid')) {
            userFriendlyMessage = "Failed to generate quiz: Invalid API key. Please check your GOOGLE_GENAI_API_KEY in the .env file.";
        } else if (errorMessage.includes('server error') || errorMessage.includes('Failed to fetch') || errorMessage.includes('network error')) {
            userFriendlyMessage = "Failed to generate quiz: Could not reach the AI server. Ensure the Genkit development server ('npm run genkit:dev') is running and there are no network issues.";
        } else if (errorMessage.includes('Invalid input')) {
            userFriendlyMessage = `Failed to generate quiz: ${errorMessage}`; // Show specific validation error
        } else if (errorMessage.includes('invalid quiz data')) {
             userFriendlyMessage = `Failed to generate quiz: AI returned invalid data structure. ${errorMessage}`;
        }


      setQuizState({ loading: false, data: null, error: userFriendlyMessage });
      toast({
        variant: "destructive",
        title: "Quiz Generation Failed",
        description: userFriendlyMessage,
      });
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


  // Don't render until mobile state is determined to avoid hydration issues
  if (isMobile === undefined) {
      return null; // Or a loading indicator
  }

  return (
    <>
      {/* Sidebar remains consistent */}
       <Sidebar collapsible="icon">
         <SidebarHeader className="items-center border-b border-sidebar-border">
           <div className="flex items-center gap-2">
              <Book className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold text-foreground group-data-[collapsible=icon]:hidden">AudioBook Buddy</h1>
           </div>
            {/* Only show trigger on mobile */}
           {isMobile && (
              <div className="ml-auto">
                <SidebarTrigger />
              </div>
           )}
         </SidebarHeader>
         <SidebarContent className="p-0">
             {/* Always show the library list in the sidebar */}
            <div className="p-4">
              <p className="mb-2 font-medium text-foreground group-data-[collapsible=icon]:hidden">Your Bookshelf</p>
              {books.length === 0 ? (
                 <div className="mt-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                   Upload a file to start.
                 </div>
              ) : (
                <ul className="space-y-1">
                  {books.map((book) => (
                    <li key={book.id}>
                      <Button
                        variant={selectedBook?.id === book.id && viewMode === 'reader' ? "secondary" : "ghost"} // Highlight only if selected AND in reader view
                        className={`w-full justify-start text-left h-auto py-2 px-2 ${selectedBook?.id === book.id && viewMode === 'reader' ? 'font-semibold' : ''} group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:size-10`}
                        onClick={() => handleSelectBook(book)}
                        title={book.name} // Show full name on hover
                      >
                        <Book className="h-4 w-4 mr-2 flex-shrink-0 group-data-[collapsible=icon]:mr-0" />
                        <span className="truncate flex-grow group-data-[collapsible=icon]:hidden">{book.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
         </SidebarContent>
         <SidebarFooter className="border-t border-sidebar-border p-4">
            <FileUpload onUploadSuccess={addBook} />
         </SidebarFooter>
       </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="flex flex-col">
         {/* Show header only on mobile */}
         {isMobile && (
             <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
                {/* Show back button in reader view on mobile, otherwise show sidebar trigger */}
                {viewMode === 'reader' ? (
                     <Button variant="ghost" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library">
                         <ArrowLeft className="h-5 w-5" />
                     </Button>
                 ) : (
                     <SidebarTrigger />
                 )}
                <div className="flex items-center gap-2">
                   <Book className="h-6 w-6 text-primary" />
                   <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
                </div>
             </header>
         )}
        <main className="flex flex-1 flex-col items-stretch p-6 overflow-hidden">
          {/* Conditional Rendering based on viewMode */}
          {viewMode === 'library' && (
             <div className="flex flex-1 flex-col items-center justify-center text-center">
                <Book size={48} className="text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Welcome to AudioBook Buddy</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Upload a PDF or ePUB file to start listening and get AI insights. Select a book from your bookshelf in the sidebar to begin reading.
                </p>
                 {books.length === 0 && ( // Show upload button only if library is empty in this view
                    <FileUpload buttonVariant="default" buttonSize="lg" onUploadSuccess={addBook} />
                 )}
             </div>
          )}

          {viewMode === 'reader' && selectedBook && (
            <div className="flex flex-1 flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">
               {/* Back Button (Desktop) - Only show if NOT mobile */}
                {!isMobile && (
                    <div className="absolute top-6 left-6 z-10">
                         <Button variant="outline" size="icon" onClick={handleGoBackToLibrary} aria-label="Back to Library">
                             <ArrowLeft className="h-5 w-5" />
                         </Button>
                     </div>
                 )}

              {/* Book Content Area */}
              <Card className="flex flex-col flex-1 lg:w-2/3 shadow-md relative pt-10 md:pt-0"> {/* Add padding top for mobile header or button space */}
                 <CardHeader className="border-b pt-4 pb-4 md:pt-6 md:pb-6"> {/* Adjust padding */}
                    <CardTitle className="truncate">{selectedBook.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-hidden">
                  <ScrollArea className="h-full pr-4">
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {selectedBook.content || "No content available."}
                    </p>
                  </ScrollArea>
                </CardContent>
                <CardFooter className="border-t p-4 flex items-center justify-center gap-4 bg-muted/50">
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
                <CardHeader className="border-b">
                  <CardTitle>AI Insights</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-hidden">
                  <ScrollArea className="h-full pr-4">
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
                          {quizState.error && <p className="text-sm text-destructive">{quizState.error}</p>}
                          {quizState.data && quizState.data.questions.length > 0 && (
                            <div className="space-y-4">
                              {quizState.data.questions.map((q, index) => (
                                <div key={index} className="text-sm border-b pb-2 last:border-b-0">
                                  <p className="font-medium mb-1">{index + 1}. {q.question}</p>
                                  <ul className="list-disc list-inside pl-2 space-y-0.5">
                                    {q.options.map((opt, i) => (
                                      <li key={i}>{opt} {opt === q.answer && <span className="text-green-600 font-semibold">(Correct)</span>}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
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
                           {quizState.data && !quizState.loading && (
                              <Button onClick={handleGenerateQuiz} size="sm" variant="outline" className="w-full mt-2" disabled={!selectedBook?.content}>
                                Regenerate Quiz
                              </Button>
                            )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </ScrollArea>
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
    <SidebarProvider>
      <HomeContent />
    </SidebarProvider>
  );
}
