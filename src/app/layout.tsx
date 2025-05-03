import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans'; // Correct import path
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider

export const metadata: Metadata = {
  title: 'AudioBook Buddy',
  description: 'Convert PDFs and ePUBs to audiobooks with AI summaries and quizzes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use GeistSans font class name
  const bodyClassName = GeistSans.className + ' antialiased';

  return (
    // This needs to be on the <html> tag
    <html lang="en" suppressHydrationWarning>
      <body className={bodyClassName}>
        <AuthProvider> {/* Wrap children with AuthProvider */}
          {children}
          <Toaster /> {/* Ensure Toaster is within AuthProvider if it needs auth context, otherwise it can be outside */}
        </AuthProvider>
      </body>
    </html>
  );
}
