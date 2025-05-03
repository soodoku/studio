// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, firebaseConfigValid, initError } from '@/lib/firebase/clientApp'; // Import validation status and error
import { Loader2 } from 'lucide-react'; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error display
import { Terminal } from 'lucide-react'; // Icon for alert

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null; // Add state to hold potential auth init errors
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
  const [loading, setLoading] = useState(true); // Start loading until auth state is determined
  const [authError, setAuthError] = useState<string | null>(initError); // Initialize with error from firebaseClientApp

  useEffect(() => {
    // This effect runs only on the client side after mount.

    // If Firebase config was invalid from the start, stop loading and show error.
    if (!firebaseConfigValid) {
        setLoading(false);
        // Error is already set via useState(initError)
        console.warn("AuthContext: Firebase configuration invalid, cannot listen for auth changes.");
        return; // Don't proceed to setup listener
    }

    // Check if the Firebase Auth instance was successfully initialized (is not null)
    if (auth) {
      // Listen for authentication state changes
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setLoading(false); // Auth state resolved, stop loading
        setAuthError(null); // Clear any previous errors on successful state change
        console.log("Auth State Changed:", currentUser ? `User: ${currentUser.uid}` : "No User");
      }, (error) => {
          // Handle errors during the subscription itself (less common)
          console.error("Auth state listener error:", error);
          setAuthError(`Error listening for authentication changes: ${error.message}`);
          setUser(null);
          setLoading(false);
      });

      // Cleanup subscription on unmount
      return () => unsubscribe();
    } else {
      // Handle the case where the auth instance is null even if config seemed valid initially (unexpected)
      console.error("AuthContext: Firebase Auth instance is unexpectedly null despite config seeming valid.");
      setAuthError("Authentication service failed to initialize unexpectedly.");
      setLoading(false); // Stop loading as auth state cannot be determined
      setUser(null); // Ensure user is null
      // No cleanup function needed as no listener was attached.
      return undefined;
    }
  }, []); // Empty dependency array ensures this runs once on mount

  // Show loading indicator while determining auth state OR if auth failed init.
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Initializing authentication...</p>
      </div>
    );
  }

   // If there was an initialization error, show an error message instead of children
   if (authError) {
     return (
       <div className="flex items-center justify-center min-h-screen p-4">
         <Alert variant="destructive" className="max-w-lg">
           <Terminal className="h-4 w-4" />
           <AlertTitle>Authentication Unavailable</AlertTitle>
           <AlertDescription>
             Could not initialize the authentication service. Please ensure your Firebase configuration in{' '}
             <code>.env.local</code> is correct and try refreshing the page.
             <br />
             <span className="text-xs mt-2 block">Details: {authError}</span>
           </AlertDescription>
         </Alert>
       </div>
     );
   }

  // Once loading is false and no errors, render children with the current user state.
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
