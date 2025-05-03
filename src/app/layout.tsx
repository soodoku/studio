import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans'; // Corrected import path for GeistSans
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster

// No need to call GeistSans as a function here, it's used directly in className
// const geistSans = GeistSans({
//   variable: '--font-geist-sans', // This variable usage is often handled differently now or implicitly by Next.js
//   subsets: ['latin'],
// });

export const metadata: Metadata = {
  title: 'AudioBook Buddy', // Updated title
  description: 'Upload PDFs/ePUBs, listen to audio, and take notes.', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Apply the font class directly to the body or html tag */}
      {/* Use the className provided by GeistSans directly */}
      <body className={`${GeistSans.className} antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}
