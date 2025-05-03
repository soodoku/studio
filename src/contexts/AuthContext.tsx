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
    // This effect runs only on the client side after mount.
    // Check if the Firebase Auth instance was successfully initialized before subscribing.
    if (auth) {
      // Listen for authentication state changes
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setLoading(false); // Auth state resolved, stop loading
        console.log("Auth State Changed:", currentUser ? `User: ${currentUser.uid}` : "No User");
      });

      // Cleanup subscription on unmount
      return () => unsubscribe();
    } else {
      // Handle the case where the auth instance is null (e.g., config error, SSR)
      // We should stop loading and set user to null.
      console.warn("Firebase Auth instance not available in AuthContext useEffect. Cannot listen for auth changes.");
      setLoading(false);
      setUser(null);
      // No cleanup function needed as no listener was attached.
      return undefined;
    }
  }, []); // Empty dependency array ensures this runs once on mount

  // Show loading indicator while determining auth state
  // This check runs on both server and client initially.
  // On the client, it shows until the useEffect above sets loading to false.
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // Once loading is false, render children with the current user state.
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

