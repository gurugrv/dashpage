'use client';

import { AlertCircle, KeyRound, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StreamErrorPayload } from '@/lib/chat/errors';

interface StreamError extends Error {
  streamError?: StreamErrorPayload;
}

interface ErrorBannerProps {
  error?: Error;
  onRetry: () => void;
  onOpenSettings?: () => void;
}

const CATEGORY_CONFIG: Record<string, { message: string; icon?: 'settings' | 'new-chat' }> = {
  rate_limit: { message: 'Rate limited. Try again in a moment.' },
  auth_error: { message: 'Invalid API key. Check your settings.', icon: 'settings' },
  context_length: { message: 'Conversation too long for this model.', icon: 'new-chat' },
  provider_unavailable: { message: 'Provider is temporarily unavailable.' },
};

export function ErrorBanner({ error, onRetry, onOpenSettings }: ErrorBannerProps) {
  if (!error) return null;

  const streamError = (error as StreamError).streamError;
  const config = streamError ? CATEGORY_CONFIG[streamError.category] : undefined;
  const displayMessage = config?.message ?? streamError?.message ?? error.message ?? 'Something went wrong';

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1">{displayMessage}</span>
      <div className="flex shrink-0 gap-1.5">
        {config?.icon === 'settings' && onOpenSettings && (
          <Button variant="outline" size="xs" onClick={onOpenSettings} className="gap-1">
            <KeyRound className="size-3" />
            Settings
          </Button>
        )}
        {config?.icon === 'new-chat' && (
          <Button variant="outline" size="xs" onClick={() => window.location.assign('/')} className="gap-1">
            <MessageSquarePlus className="size-3" />
            New Chat
          </Button>
        )}
        {(streamError?.retryable !== false) && (
          <Button variant="outline" size="xs" onClick={onRetry} className="gap-1">
            <RotateCcw className="size-3" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
