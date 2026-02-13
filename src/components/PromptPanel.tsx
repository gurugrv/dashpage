'use client';

import type { UIMessage } from '@ai-sdk/react';
import { ChatInput } from '@/components/ChatInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';
import type { Blueprint } from '@/lib/blueprint/types';
import { BlueprintCard } from '@/features/blueprint/blueprint-card';
import { PageProgress } from '@/features/blueprint/page-progress';
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
  // Blueprint props
  blueprintMode?: boolean;
  onBlueprintModeChange?: (enabled: boolean) => void;
  isBlueprintBusy?: boolean;
  blueprintPhase?: BlueprintPhase;
  blueprint?: Blueprint | null;
  pageStatuses?: PageGenerationStatus[];
  onBlueprintApprove?: () => void;
  onBlueprintRegenerate?: () => void;
  onBlueprintCancel?: () => void;
  blueprintError?: string | null;
  resumeCard?: React.ReactNode;
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
  blueprintMode,
  onBlueprintModeChange,
  isBlueprintBusy,
  blueprintPhase,
  blueprint,
  pageStatuses,
  onBlueprintApprove,
  onBlueprintRegenerate,
  onBlueprintCancel,
  blueprintError,
  resumeCard,
}: PromptPanelProps) {
  const effectiveIsLoading = isLoading || !!isBlueprintBusy;

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
        blueprintMode={blueprintMode}
        onBlueprintModeChange={onBlueprintModeChange}
        isBlueprintBusy={isBlueprintBusy}
      />

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            showExamplePrompts={showExamplePrompts && !isBlueprintBusy}
            onExampleSelect={onExampleSelect}
            buildProgress={buildProgress}
            blueprintLoading={blueprintPhase === 'generating-blueprint'}
          />

          {blueprintPhase === 'awaiting-approval' && blueprint && (
            <BlueprintCard
              blueprint={blueprint}
              onApprove={onBlueprintApprove ?? (() => {})}
              onRegenerate={onBlueprintRegenerate ?? (() => {})}
              onCancel={onBlueprintCancel ?? (() => {})}
            />
          )}

          {(blueprintPhase === 'generating-components' || blueprintPhase === 'generating-pages') && (
            <PageProgress
              pageStatuses={pageStatuses ?? []}
              componentsStatus={blueprintPhase === 'generating-components' ? 'generating' : 'complete'}
              onCancel={onBlueprintCancel}
            />
          )}

          {blueprintError && (
            <div className="mx-4 my-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {blueprintError}
            </div>
          )}

          {resumeCard}
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
        isLoading={effectiveIsLoading}
        onStop={isBlueprintBusy ? (onBlueprintCancel ?? onStop) : onStop}
      />
    </div>
  );
}
