'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBannerProps {
  error?: Error;
  onRetry: () => void;
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1">{error.message || 'Something went wrong'}</span>
      <Button variant="outline" size="xs" onClick={onRetry} className="shrink-0 gap-1">
        <RotateCcw className="size-3" />
        Retry
      </Button>
    </div>
  );
}
