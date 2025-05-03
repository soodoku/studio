

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
} from '@/components/ui/sidebar';
import { Book, Play, Pause, Square, Loader2, Lightbulb, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { speakText, pauseSpeech, resumeSpeech, stopSpeech, isCurrentlySpeaking, isCurrentlyPaused } from '@/services/tts';
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

export default function Home() {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPausedState, setIsPausedState] = useState(false);
  const [summaryState, setSummaryState] = useState<SummaryState>({ loading: false, data: null, error: null });
  const [quizState, setQuizState] = useState<QuizState>({ loading: false, data: null, error: null });
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
       // Automatically select the newly added book
       setSelectedBook(newBook);
       // Reset states for the new book
       setIsPlaying(false);
       setIsPausedState(false);
       setSummaryState({ loading: false, data: null, error: null });
       setQuizState({ loading: false, data: null, error: null });
       stopSpeech(); // Stop any ongoing speech
       return updatedBooks;
     });
  }, [toast]); // Add toast as dependency


  const handleSelectBook = (book: BookItem) => {
    if (selectedBook?.id !== book.id) {
      stopSpeech();
      setSelectedBook(book);
      setIsPlaying(false);
      setIsPausedState(false);
      // Reset AI states when book changes
      setSummaryState({ loading: false, data: null, error: null });
      setQuizState({ loading: false, data: null, error: null });
    } else {
      setSelectedBook(book); // Ensure selection even if clicked again
    }
  };

  const handlePlay = () => {
    if (!selectedBook) return;

    if (isPausedState) {
      resumeSpeech();
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
        }
      );
      setIsPlaying(true);
      setIsPausedState(false);
    }
  };

  const handlePause = () => {
    if (isPlaying) {
      pauseSpeech();
      setIsPlaying(false);
      setIsPausedState(true);
    }
  };

  const handleStop = () => {
    stopSpeech();
    setIsPlaying(false);
    setIsPausedState(false);
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
      console.error("Error generating summary:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      setSummaryState({ loading: false, data: null, error: `Failed to generate summary: ${errorMessage}` });
      toast({
        variant: "destructive",
        title: "Summarization Failed",
        description: `Could not generate summary. ${errorMessage.includes('API key not valid') ? 'Please check your API key.' : 'Error reaching server.'}`,
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
      console.error("Error generating quiz:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      setQuizState({ loading: false, data: null, error: `Failed to generate quiz: ${errorMessage}` });
      toast({
        variant: "destructive",
        title: "Quiz Generation Failed",
        description: `Could not generate quiz. ${errorMessage.includes('API key not valid') ? 'Please check your API key.' : 'Error reaching server.'}`,
      });
    }
  };


  // Effect to handle component unmount or selected book change
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [selectedBook]);

   // Effect to poll speech state (basic approach)
   useEffect(() => {
     const interval = setInterval(() => {
       const currentSpeaking = isCurrentlySpeaking();
       const currentPaused = isCurrentlyPaused();
       // Update state only if it differs from the polled state
       setIsPlaying(currentSpeaking);
       setIsPausedState(currentPaused);
     }, 500); // Check every 500ms

     return () => clearInterval(interval);
   }, []); // Run only once on mount


  return (
    <SidebarProvider>
      <Sidebar collapsible="icon"> {/* Enable icon collapsing */}
        <SidebarHeader className="items-center border-b border-sidebar-border">
          <div className="flex items-center gap-2">
             <Book className="h-6 w-6 text-primary" />
             {/* Hide title when collapsed */}
             <h1 className="text-xl font-semibold text-foreground group-data-[collapsible=icon]:hidden">AudioBook Buddy</h1>
          </div>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarContent className="p-0"> {/* Remove default padding */}
           <div className="p-4"> {/* Add padding back */}
             <p className="mb-2 font-medium text-foreground group-data-[collapsible=icon]:hidden">Your Bookshelf</p> {/* Hide label when collapsed */}
             {books.length === 0 ? (
                <div className="mt-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                  Upload a file to start.
                </div>
             ) : (
               <ul className="space-y-1">
                 {books.map((book) => (
                   <li key={book.id}>
                     <Button
                       variant={selectedBook?.id === book.id ? "secondary" : "ghost"}
                       className={`w-full justify-start text-left h-auto py-2 px-2 ${selectedBook?.id === book.id ? 'font-semibold' : ''} group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:size-10`}
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
      <SidebarInset className="flex flex-col">
         <header className="flex h-14 items-center gap-4 border-b bg-card px-6 md:hidden">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
               <Book className="h-6 w-6 text-primary" />
               <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
            </div>
         </header>
        <main className="flex flex-1 flex-col items-stretch p-6 overflow-hidden">
          {selectedBook ? (
            <div className="flex flex-1 flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">
              {/* Book Content Area */}
              <Card className="flex flex-col flex-1 lg:w-2/3 shadow-md">
                <CardHeader className="border-b">
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
                    <Accordion type="single" collapsible className="w-full">
                      {/* Summary Section */}
                      <AccordionItem value="summary">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5" />
                            <span>Chapter Summary</span>
                            {summaryState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
                           <div className="flex items-center gap-2">
                            <HelpCircle className="h-5 w-5" />
                            <span>Quick Quiz</span>
                            {quizState.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
          ) : (
             <div className="flex flex-1 flex-col items-center justify-center text-center">
                <Book size={48} className="text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Welcome to AudioBook Buddy</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                    Upload a PDF or ePUB file using the button below or in the sidebar to start listening and get AI insights.
                </p>
                <FileUpload buttonVariant="default" buttonSize="lg" onUploadSuccess={addBook} />
             </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

