// src/app/auth/page.tsx
import { AuthForm } from '@/components/feature/AuthForm';

export default function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <AuthForm />
    </div>
  );
}
