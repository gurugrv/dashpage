'use client';

import { AlertCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InterruptedBannerProps {
  visible: boolean;
  isLoading: boolean;
  onContinueGeneration?: () => void;
}

export function InterruptedBanner({ visible, isLoading, onContinueGeneration }: InterruptedBannerProps) {
  if (!visible || isLoading) return null;

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1">Generation was interrupted. You can continue where it left off.</span>
      <Button variant="outline" size="xs" onClick={onContinueGeneration} className="shrink-0 gap-1">
        <Play className="size-3" />
        Continue
      </Button>
    </div>
  );
}
