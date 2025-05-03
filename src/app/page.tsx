
'use client'; // Add 'use client' because we are using useState

import React, { useState } from 'react'; // Import useState
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
import { Book, List } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Define a simple type for a book
interface BookItem {
  id: string;
  name: string;
}

export default function Home() {
  const [books, setBooks] = useState<BookItem[]>([]); // State to hold uploaded books

  // Function to add a book to the list
  const addBook = (fileName: string) => {
    const newBook: BookItem = {
      id: Date.now().toString(), // Simple unique ID using timestamp
      name: fileName,
    };
    setBooks((prevBooks) => [...prevBooks, newBook]);
  };

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
          <p className="mb-2 font-medium text-foreground">Your Bookshelf</p>
          {books.length === 0 ? (
             <div className="mt-4 text-center text-sm text-muted-foreground">
               No books uploaded yet.
             </div>
          ) : (
            <ul className="space-y-2">
              {books.map((book) => (
                <li key={book.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors cursor-pointer">
                  <Book className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate">{book.name}</span>
                </li>
              ))}
            </ul>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4">
           {/* Pass the addBook function to FileUpload */}
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
        <main className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="text-center">
             <h2 className="text-2xl font-semibold mb-2">Welcome to AudioBook Buddy</h2>
             <p className="text-muted-foreground mb-6">Upload a PDF or ePUB file to get started.</p>
             {/* Pass the addBook function to FileUpload */}
             <FileUpload buttonVariant="default" buttonSize="lg" onUploadSuccess={addBook} />
             {/* Placeholder for audio player and notes */}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
