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
import { auth } from '@/lib/firebase/clientApp';
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
         case 'auth/user-not-found':
         case 'auth/wrong-password':
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
         default:
            errorMessage = `Authentication failed: ${authError.message}`; // More generic fallback
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
