import type { ReactNode } from 'react';

// Remove metadata definition as it should be inherited or defined in page.tsx
// export const metadata = { ... }

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Nested layouts should not render <html> or <body> tags.
  // They inherit these from the root layout (src/app/layout.tsx).
  // Just return the children, optionally wrapped in a fragment or div if needed for styling.
  return <>{children}</>;
}
