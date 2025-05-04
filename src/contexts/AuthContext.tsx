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
  const [loading, setLoading] = useState(true); // Start true, wait for auth check/listener
  const [authError, setAuthError] = useState<string | null>(initError); // Use initError captured during Firebase setup
  const router = useRouter(); // Hook 1
  const pathname = usePathname(); // Hook 2
  const [isClient, setIsClient] = useState(false); // Track if component has mounted

  // Effect to set isClient to true after mounting
  useEffect(() => { // Hook 3
    setIsClient(true);
  }, []);

  // Main effect for auth state and redirection
  useEffect(() => { // Hook 4
    // This effect runs only on the client side after mount.

    // 1. Check if Firebase config was fundamentally invalid from the start
    if (!firebaseConfigValid) {
        const errorMsg = initError || "Firebase configuration is invalid (check .env.local or Firebase Studio environment).";
        setAuthError(errorMsg);
        setLoading(false);
        setUser(null); // Ensure user is null
        console.warn(`AuthProvider: Firebase config invalid, skipping auth listener. Error: ${errorMsg}`);
        return; // Don't setup listener
    }

    // 2. Check if auth instance is missing (runtime init failure after config check)
    if (!auth) {
        const errorMsg = initError || "Authentication service failed to initialize unexpectedly.";
        setAuthError(errorMsg);
        setLoading(false);
        setUser(null); // Ensure user is null
        console.error(`AuthProvider: Firebase Auth instance is null despite seemingly valid config. Error: ${errorMsg}`);
        return; // Don't setup listener
    }

    // 3. Config valid, auth instance exists, setup the listener.
    console.log("AuthProvider: Setting up onAuthStateChanged listener.");
    setLoading(true); // Ensure loading is true while waiting for the first auth state

    const unsubscribe = onAuthStateChanged(auth,
      (currentUser) => {
        console.log("AuthProvider: Auth state changed.", currentUser ? `User: ${currentUser.uid}` : "No user");
        setUser(currentUser);
        setAuthError(null); // Clear errors on successful state change

        // --- Redirection Logic ---
        // Perform redirection checks *after* user state is updated
        if (currentUser && pathname === '/auth') {
            // Logged in, but on auth page -> redirect to home
            console.log("AuthProvider: User logged in, redirecting from /auth to /");
            router.push('/');
            // Keep loading true until redirect completes? Or set false and let UI handle intermediate state?
            // Setting loading false here is generally okay.
            setLoading(false);
        } else if (!currentUser && pathname !== '/auth') {
            // Not logged in, and not on auth page -> redirect to auth
            console.log("AuthProvider: User not logged in, redirecting to /auth");
            router.push('/auth');
            // Keep loading true until redirect completes?
            setLoading(false);
        } else {
            // User state matches route (logged in and not on /auth, or not logged in and on /auth)
            // Or redirection is already in progress
            console.log("AuthProvider: Auth state matches route or redirection in progress.");
            setLoading(false); // Auth state resolved, stop loading
        }
        // --- End Redirection Logic ---

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

    // Dependencies: Only run once on mount after initial checks
  }, [pathname, router]); // Added pathname and router as dependencies for redirection logic


  // --- Render Logic ---

  // Guard against rendering children server-side or before hydration
  if (!isClient) {
    // Render nothing or a minimal loader during SSR/hydration phase
    return null; // Or <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }

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

   // 3. Handle redirection state (show loader while redirecting)
   // This condition ensures we show loading if the current user state doesn't match the route,
   // preventing a flash of the wrong content before the useEffect redirect kicks in.
   if ((user && pathname === '/auth') || (!user && pathname !== '/auth')) {
       return (
           <div className="flex items-center justify-center min-h-screen">
               <Loader2 className="h-16 w-16 animate-spin text-primary" />
           </div>
       );
   }


  // 4. Render children: If not loading, no authError, and user state matches current route requirements
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
