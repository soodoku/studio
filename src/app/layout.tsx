
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider

export const metadata: Metadata = {
  title: 'AudioBook Buddy',
  description: 'Convert PDFs and ePUBs to audiobooks with AI summaries and quizzes.',
  manifest: "/manifest.json", // Add link to the manifest file for PWA
  // Add theme color for PWA splash screen/title bar
  themeColor: "#0D9488", // Teal color from theme
  // Add icons for PWA (though manifest usually handles this, adding here is good practice)
   icons: {
     icon: "/icon-192x192.png", // Default icon
     apple: "/icon-192x192.png", // For Apple devices
   },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use GeistSans font class name
  const bodyClassName = GeistSans.className + ' antialiased';

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
