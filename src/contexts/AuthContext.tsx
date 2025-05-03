
// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
// Import firebaseConfigValid and initError along with auth instance
import { auth, firebaseConfigValid, initError } from '@/lib/firebase/clientApp';
import { Loader2 } from 'lucide-react'; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error display
import { Terminal } from 'lucide-react'; // Icon for alert

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
  // Initialize loading to true only if config is potentially valid
  const [loading, setLoading] = useState(firebaseConfigValid);
  // Initialize authError state with the error potentially captured during clientApp initialization
  const [authError, setAuthError] = useState<string | null>(initError);

  useEffect(() => {
    // This effect runs only on the client side after mount.

    // If Firebase config was invalid from the start (checked in clientApp.ts),
    // set loading to false and ensure the error is set. No need to proceed.
    if (!firebaseConfigValid) {
        setLoading(false);
        // The error message is already set in the initial state via initError
        console.warn("AuthContext: Firebase configuration invalid, cannot listen for auth changes.");
        return; // Don't setup listener
    }

    // At this point, config seemed valid initially. Now check if 'auth' instance is available.
    // It might be null if initialization failed *after* the initial config check.
    if (!auth) {
        // If auth is null even though config *seemed* valid, set an error.
        setAuthError(prevError => prevError || "Authentication service failed to initialize unexpectedly.");
        setLoading(false);
        setUser(null);
        console.error("AuthContext: Firebase Auth instance is unexpectedly null.");
        return; // Don't setup listener
    }

    // If config was valid AND auth instance exists, setup the listener.
    setLoading(true); // Ensure loading is true while waiting for the first auth state
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Auth state resolved, stop loading
      setAuthError(null); // Clear any previous errors on successful state change
      console.log("Auth State Changed:", currentUser ? `User: ${currentUser.uid}` : "No User");
    }, (error) => {
        // Handle errors during the subscription itself
        console.error("Auth state listener error:", error);
        setAuthError(`Error listening for authentication changes: ${error.message}`);
        setUser(null);
        setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();

    // Run effect only once on mount
  }, []);

  // --- Render Logic ---

  // 1. Show loading indicator while loading state is true.
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
             Could not initialize the authentication service. Please ensure your Firebase configuration in{' '}
             {/* Mention Firebase Studio context */}
             <code>Firebase Studio / .env.local</code> is correct and try refreshing the page.
             <br />
             <span className="text-xs mt-2 block">Details: {authError}</span>
           </AlertDescription>
         </Alert>
       </div>
     );
   }

  // 3. If not loading and no errors, render children with the current user state.
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
