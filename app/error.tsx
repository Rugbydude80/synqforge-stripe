'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to your error reporting service here if configured
  }, [error]);
  return (
    <html>
      <body className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-zinc-500 mb-4">An unexpected error occurred. You can try again.</p>
          <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  );
}



