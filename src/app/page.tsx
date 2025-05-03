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
import { Book } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
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
          <p className="text-muted-foreground">Your Bookshelf</p>
          {/* TODO: List uploaded books here */}
          <div className="mt-4 text-center text-sm text-muted-foreground">
             No books uploaded yet.
          </div>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4">
           <FileUpload />
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
             <FileUpload buttonVariant="default" buttonSize="lg" />
             {/* Placeholder for audio player and notes */}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
