// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/clientApp'; // Adjust path as needed
import { Loader2 } from 'lucide-react'; // For loading state

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true, // Start in loading state
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start loading until auth state is determined

  useEffect(() => {
    // Check if auth is initialized before subscribing
    if (!auth) {
      console.warn("Firebase Auth is not initialized. Cannot listen for auth state changes. Check Firebase configuration.");
      setLoading(false); // Stop loading as auth state cannot be determined
      setUser(null); // Ensure user is null
      return; // Exit effect early
    }

    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Auth state resolved, stop loading
      console.log("Auth State Changed:", currentUser ? `User: ${currentUser.uid}` : "No User");
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []); // Dependency array remains empty as we only need to run this once on mount

  // Show loading indicator while determining auth state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // If Firebase isn't configured, auth is null, show message or restrict access
  if (!auth && !loading) {
     // You might want to render a message indicating the app requires Firebase configuration
     // or simply render children but be aware that auth features won't work.
     console.warn("Rendering children, but Firebase Auth is not available.");
     // Example: Show a configuration error message instead of children
     // return (
     //   <div className="flex items-center justify-center min-h-screen text-destructive p-4">
     //     Application requires Firebase configuration. Please check environment variables.
     //   </div>
     // );
  }


  return (
    <AuthContext.Provider value={{ user, loading }}>
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