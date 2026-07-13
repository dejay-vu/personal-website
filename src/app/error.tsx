'use client';

import { useEffect } from 'react';

import { Button } from '@heroui/react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto grid min-h-[calc(100dvh-14rem)] w-full max-w-md place-items-center text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="text-foreground/80">
          An unexpected error occurred while loading this page.
        </p>
        <Button variant="primary" onPress={reset}>
          Try again
        </Button>
      </div>
    </section>
  );
}
