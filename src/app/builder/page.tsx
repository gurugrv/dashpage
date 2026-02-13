'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

const Builder = dynamic(() => import('@/components/Builder').then(m => m.Builder), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 animate-pulse">
          <div className="size-6 rounded-lg bg-white/20" />
        </div>
        <p className="text-sm text-muted-foreground">Loading builder...</p>
      </div>
    </div>
  ),
});

function BuilderContent() {
  const searchParams = useSearchParams();
  const promptFromUrl = searchParams.get('prompt');

  // Store the prompt in sessionStorage for the Builder to pick up
  useEffect(() => {
    if (promptFromUrl) {
      sessionStorage.setItem('initialPrompt', promptFromUrl);
      // Clean up the URL
      window.history.replaceState({}, '', '/builder');
    }
  }, [promptFromUrl]);

  return <Builder />;
}

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 animate-pulse">
            <div className="size-6 rounded-lg bg-white/20" />
          </div>
          <p className="text-sm text-muted-foreground">Loading builder...</p>
        </div>
      </div>
    }>
      <BuilderContent />
    </Suspense>
  );
}
