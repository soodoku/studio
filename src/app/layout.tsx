import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider

export const metadata: Metadata = {
  title: 'AudioBook Buddy',
  description: 'Convert your books to audio and get AI insights.',
};

// Use GeistSans for the body font
const bodyClassName = `${GeistSans.className} antialiased`; // antialiased for better font rendering

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
