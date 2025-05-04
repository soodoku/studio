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
  loading: boolean; // Single loading state representing overall auth readiness
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
  const [loading, setLoading] = useState(true); // Tracks initial auth check & validity
  const [authError, setAuthError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // 1. Effect to set isClient to true after mounting
  useEffect(() => {
    console.log("AuthProvider: Component mounted, setting isClient=true");
    setIsClient(true);
  }, []);

  // 2. Effect for Firebase initialization check and auth state subscription
  useEffect(() => {
    // This effect runs only on the client side after mount.
    if (!isClient) {
      console.log("AuthProvider [Auth Effect]: Skipping effect, not client yet.");
      return;
    }

    console.log("AuthProvider [Auth Effect]: Running initialization check and auth listener setup.");

    // A. Check Firebase config validity *before* trying to use `auth`
    if (!firebaseConfigValid) {
      const errorMsg = initError || "Firebase configuration is invalid (check .env.local or Firebase Studio environment). Auth features disabled.";
      console.error(`AuthProvider [Auth Effect]: ${errorMsg}`);
      setAuthError(errorMsg);
      setLoading(false); // Initialization failed, stop loading
      setUser(null); // Ensure user is null
      return; // Don't setup listener
    }

    // B. Check if `auth` instance exists (it should if config was valid, but double-check)
    if (!auth) {
      const errorMsg = initError || "Authentication service failed to initialize unexpectedly after config check.";
      console.error(`AuthProvider [Auth Effect]: ${errorMsg}`);
      setAuthError(errorMsg);
      setLoading(false); // Initialization failed, stop loading
      setUser(null); // Ensure user is null
      return; // Don't setup listener
    }

    // C. Config valid, auth instance exists -> Setup the listener.
    console.log("AuthProvider [Auth Effect]: Setting up onAuthStateChanged listener.");
    setLoading(true); // Ensure loading is true while waiting for the first auth state

    const unsubscribe = onAuthStateChanged(auth,
      (currentUser) => {
        console.log("AuthProvider [Auth Effect]: Auth state changed.", currentUser ? `User: ${currentUser.uid}` : "No user");
        setUser(currentUser);
        setAuthError(null); // Clear previous errors on successful state change
        setLoading(false); // **Crucial:** Set loading false *after* user state is known
      },
      (error) => {
        // Handle errors *during* the subscription itself (rare)
        console.error("AuthProvider [Auth Effect]: Auth state listener error:", error);
        setAuthError(`Auth listener error: ${error.message}`);
        setUser(null);
        setLoading(false); // Stop loading on listener error
      }
    );

    // Cleanup subscription on unmount
    return () => {
      console.log("AuthProvider [Auth Effect]: Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };

    // Dependencies: isClient ensures this runs only after mount
  }, [isClient]); // Rerun if isClient changes (only happens once)


  // 3. Effect for handling redirection logic AFTER loading state is resolved
  useEffect(() => {
    // Only run redirection logic on client, *after* initial loading is complete, and *if* there's no authError
    if (isClient && !loading && !authError) {
      console.log(`AuthProvider [Redirect Effect]: Checking redirection. Loading: ${loading}, AuthError: ${authError}, User: ${!!user}, Path: ${pathname}`);
      const isAuthPage = pathname === '/auth';

      if (user && isAuthPage) {
        // Logged in, but on auth page -> redirect to home
        console.log("AuthProvider [Redirect Effect]: User logged in, redirecting from /auth to /");
        router.push('/');
      } else if (!user && !isAuthPage) {
        // Not logged in, and not on auth page -> redirect to auth
        console.log("AuthProvider [Redirect Effect]: User not logged in, redirecting to /auth");
        router.push('/auth');
      } else {
          console.log("AuthProvider [Redirect Effect]: No redirection needed.");
      }
    } else {
        console.log(`AuthProvider [Redirect Effect]: Skipping redirection check. isClient: ${isClient}, loading: ${loading}, authError: ${authError}`);
    }
  }, [isClient, user, loading, authError, pathname, router]); // Dependencies for redirection logic


  // --- Render Logic ---

  // A. Render nothing or minimal loader during SSR/hydration phase
  if (!isClient) {
    console.log("AuthProvider: Rendering null (SSR/pre-hydration).");
    // Returning null is often best pre-hydration to avoid mismatches
    return null;
    // Alternatively, a non-interactive full-page loader:
    // return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }

  // B. Show full-page loading indicator *while* the initial auth check is happening.
  // This covers the time until the onAuthStateChanged listener first fires.
  if (loading) {
    console.log("AuthProvider: Rendering loading indicator.");
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Initializing authentication...</p>
      </div>
    );
  }

  // C. If not loading, but there's a critical authError (from init), show error message.
  // Prevents rendering the app if Firebase is fundamentally broken.
  if (authError) {
    console.log("AuthProvider: Rendering auth error message.");
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert variant="destructive" className="max-w-lg">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Authentication Unavailable</AlertTitle>
          <AlertDescription>
            Could not initialize or monitor the authentication service. Please ensure your Firebase configuration in{' '}
            <code>.env.local</code> (or Firebase Studio environment) is correct and try refreshing the page.
            <br />
            <span className="text-xs mt-2 block break-words">Details: {authError}</span>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // D. If not loading and no auth error, proceed to render children.
  // The redirection useEffect (3) will handle navigation if the user is
  // on the wrong page (e.g., logged out but on '/', or logged in but on '/auth').
  // This state implicitly means Firebase is initialized and we know the user's auth status.
  console.log("AuthProvider: Rendering children.");
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
    // This error should ideally not happen if the app structure is correct
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
