import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

export const metadata = {
  title: 'AudioBook Buddy',
  description: 'Upload PDFs/ePUBs, listen to audio, and take notes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Apply font className directly and consistently
  const bodyClassName = `${GeistSans.className} antialiased`;

  return (
    <html lang="en">
      <body className={bodyClassName}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
