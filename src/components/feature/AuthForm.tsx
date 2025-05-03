// src/components/feature/AuthForm.tsx
'use client';

import React, { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  AuthError,
} from 'firebase/auth';
import { auth, initError as firebaseInitError } from '@/lib/firebase/clientApp'; // Import auth and initError
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation'; // Use App Router's navigation

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

type FormData = z.infer<typeof formSchema>;

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    setLoading(true);
    const { email, password } = data;

    // Ensure auth is initialized (not null) before attempting login/signup
    if (!auth) {
        // Use the specific initialization error message if available
        const description = firebaseInitError
          ? `Authentication service unavailable due to initialization error: ${firebaseInitError}`
          : 'Authentication service is unavailable. Please check configuration or contact support.';

        console.error(`AuthForm: Firebase Auth is not initialized (null). ${firebaseInitError || 'Check Firebase configuration in .env.local and src/lib/firebase/clientApp.ts for critical errors.'}`);
        toast({
            variant: 'destructive',
            title: 'Initialization Error',
            description: description,
        });
        setLoading(false);
        return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        toast({ title: 'Login Successful', description: 'Welcome back!' });
        router.push('/'); // Redirect to home page after login
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        toast({ title: 'Signup Successful', description: 'Welcome!' });
        router.push('/'); // Redirect to home page after signup
      }
      reset(); // Clear form
    } catch (error) {
      console.error('Authentication error:', error);
      const authError = error as AuthError;
      let errorMessage = 'An unexpected error occurred. Please try again.';

       // Firebase specific error handling
       switch (authError.code) {
          case 'auth/api-key-not-valid':
          case 'auth/app-not-authorized': // May occur if domain isn't authorized
          case 'auth/invalid-api-key': // Explicit invalid key error
            errorMessage = 'Invalid or unauthorized Firebase configuration. Please check your setup.';
            console.error("Firebase Error: Invalid API Key or Configuration. Ensure NEXT_PUBLIC_FIREBASE_... variables in .env.local are correct and the domain is authorized.");
            break;
         case 'auth/user-not-found':
         case 'auth/invalid-credential': // General invalid credential error (covers wrong password)
         case 'auth/wrong-password': // More specific password error
           errorMessage = 'Invalid email or password.';
           break;
         case 'auth/email-already-in-use':
           errorMessage = 'This email address is already in use.';
           break;
         case 'auth/weak-password':
           errorMessage = 'Password is too weak. Please use at least 6 characters.';
           break;
         case 'auth/invalid-email':
            errorMessage = 'Invalid email address format.';
            break;
         case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection and try again.';
            break;
          case 'auth/emulator-config-failed':
             errorMessage = 'Emulator configuration failed. Check host/port settings.';
             break;
         case 'auth/operation-not-allowed':
            errorMessage = 'Email/password sign-in is not enabled for this project.';
            console.error("Firebase Error: Email/Password sign-in method needs to be enabled in the Firebase Authentication console.");
            break;
         default:
             // Check again for placeholder keys as a potential root cause, even if the reported error is different
            if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_API_KEY === "YOUR_API_KEY") {
                 errorMessage = "Configuration Error: Firebase API Key is still the placeholder. Please update .env.local.";
                 console.error("Firebase Error: API Key is still the placeholder 'YOUR_API_KEY'. Update .env.local.");
            } else {
                 errorMessage = `Authentication failed: ${authError.message || authError.code}`; // More generic fallback
            }
            break;
       }

      toast({
        variant: 'destructive',
        title: isLogin ? 'Login Failed' : 'Signup Failed',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    reset(); // Clear form on mode toggle
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle>{isLogin ? 'Login' : 'Sign Up'}</CardTitle>
        <CardDescription>
          {isLogin ? 'Enter your credentials to access your account.' : 'Create an account to get started.'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register('email')} disabled={loading} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register('password')} disabled={loading} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLogin ? 'Login' : 'Sign Up'}
          </Button>
          <Button type="button" variant="link" onClick={toggleMode} disabled={loading}>
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
