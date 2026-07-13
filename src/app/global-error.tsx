'use client';

import { useEffect } from 'react';

import * as Sentry from '@sentry/nextjs';

// Fallback of last resort: replaces the root layout, so it must render its
// own <html>/<body> and cannot rely on theme providers or global CSS.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: 'center',
          display: 'flex',
          fontFamily: 'system-ui, sans-serif',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred.</p>
          <button
            onClick={reset}
            style={{
              border: '1px solid currentColor',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              marginTop: '1rem',
              padding: '0.5rem 1rem',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
