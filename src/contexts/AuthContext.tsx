// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
// Import firebaseConfigValid and initError along with auth instance
import { auth, firebaseConfigValid, initError } from '@/lib/firebase/clientApp';
import { Loader2 } from 'lucide-react'; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error display
import { Terminal } from 'lucide-react'; // Icon for alert
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null; // Holds initialization or auth state errors
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true, // Start in loading state
  authError: null,
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start true, wait for auth check
  const [authError, setAuthError] = useState<string | null>(initError); // Use initError captured during Firebase setup
  const router = useRouter(); // Initialize router
  const pathname = usePathname(); // Get current path

  useEffect(() => {
    // This effect runs only on the client side after mount.

    // 1. Check if Firebase config was fundamentally invalid from the start
    if (!firebaseConfigValid) {
        setAuthError(prev => prev || "Firebase configuration is invalid (check .env.local)."); // Keep existing initError if present
        setLoading(false);
        console.warn("AuthProvider: Firebase config invalid, skipping auth listener.");
        return; // Don't setup listener
    }

    // 2. Check if auth instance is missing (runtime init failure after config check)
    if (!auth) {
        setAuthError(prev => prev || "Authentication service failed to initialize unexpectedly.");
        setLoading(false);
        setUser(null);
        console.error("AuthProvider: Firebase Auth instance is null despite seemingly valid config.");
        return; // Don't setup listener
    }

    // 3. Config valid, auth instance exists, setup the listener.
    console.log("AuthProvider: Setting up onAuthStateChanged listener.");
    setLoading(true); // Ensure loading is true while waiting for the first auth state

    const unsubscribe = onAuthStateChanged(auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false); // Auth state resolved
        setAuthError(null); // Clear errors on successful state change
        console.log("AuthProvider: Auth state changed.", currentUser ? `User: ${currentUser.uid}` : "No user");
      },
      (error) => {
        // Handle errors during the subscription itself
        console.error("AuthProvider: Auth state listener error:", error);
        setAuthError(`Auth listener error: ${error.message}`);
        setUser(null);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      console.log("AuthProvider: Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };

    // Run effect only once on mount
  }, []); // Empty dependency array ensures this runs once

  // --- Render Logic ---

  // 1. Show loading indicator while loading state is true.
  // This covers initial load AND waiting for the first auth state check.
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Initializing authentication...</p>
      </div>
    );
  }

  // 2. If not loading, but there's an authError (from init or listener), show error message.
  if (authError) {
     return (
       <div className="flex items-center justify-center min-h-screen p-4">
         <Alert variant="destructive" className="max-w-lg">
           <Terminal className="h-4 w-4" />
           <AlertTitle>Authentication Unavailable</AlertTitle>
           <AlertDescription>
             Could not initialize or monitor the authentication service. Please ensure your Firebase configuration in{' '}
             <code>.env.local</code> (or Firebase Studio environment) is correct and try refreshing the page.
             <br />
             <span className="text-xs mt-2 block">Details: {authError}</span>
           </AlertDescription>
         </Alert>
       </div>
     );
   }

   // 3. Auth Check and Redirect Logic (Client-side only after loading and no error)
   // This handles redirecting *away* from /auth if logged in,
   // and redirecting *to* /auth if not logged in and not already there.
   // Use useEffect for client-side navigation to avoid SSR issues
   useEffect(() => {
     if (typeof window !== 'undefined') {
         if (user && pathname === '/auth') {
             // Logged in, but on auth page -> redirect to home
             console.log("AuthProvider Effect: User logged in, redirecting from /auth to /");
             router.push('/');
         } else if (!user && pathname !== '/auth') {
             // Not logged in, and not on auth page -> redirect to auth
             console.log("AuthProvider Effect: User not logged in, redirecting to /auth");
             router.push('/auth');
         }
     }
   }, [user, pathname, router, loading, authError]); // Re-run effect when user state, pathname, or loading/error status changes


   // Intermediate check: While redirecting, show loading to prevent brief flash of wrong content
   if (typeof window !== 'undefined') {
      if ((user && pathname === '/auth') || (!user && pathname !== '/auth')) {
          return (
              <div className="flex items-center justify-center min-h-screen">
                  <Loader2 className="h-16 w-16 animate-spin text-primary" />
              </div>
          );
      }
   }


  // 4. Render children: If loading is false, no authError, and user state matches current route requirements
  // (i.e., logged in and not on /auth, OR not logged in and on /auth)
  return (
    <AuthContext.Provider value={{ user, loading, authError }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
