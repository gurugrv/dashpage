'use client';

import type { UIMessage } from '@ai-sdk/react';
import { ChatInput } from '@/components/ChatInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import { ErrorBanner } from '@/features/prompt/error-banner';
import { InterruptedBanner } from '@/features/prompt/interrupted-banner';
import { MessageList } from '@/features/prompt/message-list';
import { PromptHeader } from '@/features/prompt/prompt-header';

interface PromptPanelProps {
  messages: UIMessage[];
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  error: Error | undefined;
  onRetry: () => void;
  provider: string | null;
  model: string | null;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  availableProviders: Array<{
    name: string;
    models: Array<{ id: string; name: string }>;
  }>;
  buildProgress?: BuildProgressState;
  showExamplePrompts: boolean;
  onExampleSelect: (prompt: string) => void;
  onOpenSettings: () => void;
  onOpenConversations: () => void;
  hasPartialMessage?: boolean;
  onContinueGeneration?: () => void;
}

export function PromptPanel({
  messages,
  input,
  setInput,
  onSubmit,
  isLoading,
  onStop,
  error,
  onRetry,
  provider,
  model,
  onProviderChange,
  onModelChange,
  availableProviders,
  buildProgress,
  showExamplePrompts,
  onExampleSelect,
  onOpenSettings,
  onOpenConversations,
  hasPartialMessage,
  onContinueGeneration,
}: PromptPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <PromptHeader
        provider={provider}
        model={model}
        onProviderChange={onProviderChange}
        onModelChange={onModelChange}
        availableProviders={availableProviders}
        onOpenSettings={onOpenSettings}
        onOpenConversations={onOpenConversations}
      />

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            showExamplePrompts={showExamplePrompts}
            onExampleSelect={onExampleSelect}
            buildProgress={buildProgress}
          />
          <InterruptedBanner
            visible={!!hasPartialMessage}
            isLoading={isLoading}
            onContinueGeneration={onContinueGeneration}
          />
          <ErrorBanner error={error} onRetry={onRetry} />
        </div>
      </ScrollArea>

      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={onSubmit}
        isLoading={isLoading}
        onStop={onStop}
      />
    </div>
  );
}
