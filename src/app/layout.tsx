import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans'; // Correct import path for GeistSans
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider

export const metadata: Metadata = {
  title: 'AudioBook Buddy',
  description: 'Convert PDFs and ePUBs to audiobooks with AI summaries and quizzes.',
  manifest: "/manifest.json", // PWA manifest link
};


// Define a type for the props if needed, although Next.js handles it automatically
// interface RootLayoutProps {
//   children: React.ReactNode;
// }

// Apply the font to the body tag or a wrapping div
const bodyClassName = GeistSans.className + ' antialiased';


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add suppressHydrationWarning to ignore browser extension attribute mismatches
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
