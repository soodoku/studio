
'use client'; // Add 'use client' because we are using useState and useEffect

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
import { Book, List, Play, Pause, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { speakText, pauseSpeech, resumeSpeech, stopSpeech, isCurrentlySpeaking, isCurrentlyPaused } from '@/services/tts'; // Import TTS functions

// Define a type for a book including its content
interface BookItem {
  id: string;
  name: string;
  content: string; // Add content field
}

export default function Home() {
  const [books, setBooks] = useState<BookItem[]>([]); // State to hold uploaded books with content
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPausedState, setIsPausedState] = useState(false); // Separate state for UI updates

  // Function to add a book (with content) to the list
  const addBook = useCallback((fileName: string, textContent: string) => {
    const newBook: BookItem = {
      id: Date.now().toString(), // Simple unique ID using timestamp
      name: fileName,
      content: textContent, // Store the extracted content
    };
    setBooks((prevBooks) => [...prevBooks, newBook]);
    // Automatically select the newly added book
    setSelectedBook(newBook);
     // Reset playback state when a new book is uploaded
    setIsPlaying(false);
    setIsPausedState(false);
    stopSpeech(); // Stop any ongoing speech
  }, []);

  const handleSelectBook = (book: BookItem) => {
    if (selectedBook?.id !== book.id) {
      stopSpeech(); // Stop speech if selecting a different book
      setSelectedBook(book);
      setIsPlaying(false);
      setIsPausedState(false);
    } else {
        // If clicking the same book, maybe toggle play/pause or do nothing
        // For now, just ensure it's selected
        setSelectedBook(book);
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

  // Effect to handle component unmount or selected book change
  useEffect(() => {
    // Cleanup function to stop speech when the component unmounts
    // or when the selected book changes (dependency array includes selectedBook)
    return () => {
      stopSpeech();
    };
  }, [selectedBook]); // Stop speech if selected book changes

   // Effect to listen for external changes in speech state (e.g., browser controls)
   // This is complex and might not be fully reliable across all browsers.
   // A simpler approach is often preferred, relying on the component's state.
   // We'll use interval polling as a basic example.
   useEffect(() => {
     const interval = setInterval(() => {
       const currentSpeaking = isCurrentlySpeaking();
       const currentPaused = isCurrentlyPaused();
       // Only update state if it differs from the polled state to avoid unnecessary re-renders
       if (isPlaying !== currentSpeaking || isPausedState !== currentPaused) {
         setIsPlaying(currentSpeaking);
         setIsPausedState(currentPaused);
       }
     }, 500); // Check every 500ms

     return () => clearInterval(interval);
   }, [isPlaying, isPausedState]); // Re-run effect if component's state changes


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="items-center border-b border-sidebar-border">
          <div className="flex items-center gap-2">
             <Book className="h-6 w-6 text-primary" />
             <h1 className="text-xl font-semibold text-foreground">AudioBook Buddy</h1>
          </div>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarContent className="p-4">
          <p className="mb-2 font-medium text-foreground">Convert to Audio</p>
          {books.length === 0 ? (
             <div className="mt-4 text-center text-sm text-muted-foreground">
               Upload a file to convert.
             </div>
          ) : (
            <ul className="space-y-1">
              {books.map((book) => (
                <li key={book.id}>
                   <Button
                     variant={selectedBook?.id === book.id ? "secondary" : "ghost"}
                     className={`w-full justify-start text-left h-auto py-2 px-2 ${selectedBook?.id === book.id ? 'font-semibold' : ''}`}
                     onClick={() => handleSelectBook(book)}
                   >
                     <Book className="h-4 w-4 mr-2 flex-shrink-0" />
                     <span className="truncate flex-grow">{book.name}</span>
                   </Button>
                </li>
              ))}
            </ul>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4">
           {/* Pass the updated addBook function to FileUpload */}
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
            <Card className="flex flex-col flex-1 w-full max-w-4xl mx-auto shadow-md">
              <CardHeader className="border-b">
                <CardTitle className="truncate">{selectedBook.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-4 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                   {/* Display the book content */}
                   <p className="text-sm text-foreground whitespace-pre-wrap">
                     {selectedBook.content || "No content available for this book."}
                   </p>
                 </ScrollArea>
              </CardContent>
              <CardFooter className="border-t p-4 flex items-center justify-center gap-4 bg-muted/50">
                 {/* Play/Pause/Stop Controls */}
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
                   disabled={!isPlaying && !isPausedState} // Disable if not playing or paused
                   aria-label="Stop"
                 >
                   <Square className="h-5 w-5" />
                 </Button>
                 {/* Optional: Add progress bar or time indicator here */}
              </CardFooter>
            </Card>
          ) : (
             <div className="flex flex-1 flex-col items-center justify-center text-center">
                <Book size={48} className="text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Welcome to AudioBook Buddy</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                    Upload a PDF or ePUB file using the button below or in the sidebar to start listening.
                </p>
                <FileUpload buttonVariant="default" buttonSize="lg" onUploadSuccess={addBook} />
             </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
