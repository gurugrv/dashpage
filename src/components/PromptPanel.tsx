'use client';

import type { UIMessage } from '@ai-sdk/react';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessage } from '@/components/ChatMessage';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';
import type { DiscoveryPhase } from '@/hooks/useDiscovery';
import type { Blueprint } from '@/lib/blueprint/types';
import type { DiscoveryQuestion, PlacesEnrichment } from '@/lib/discovery/types';
import { BlueprintCard } from '@/features/blueprint/blueprint-card';
import { PageProgress } from '@/features/blueprint/page-progress';
import { DiscoveryQuestionCard } from '@/features/discovery/discovery-question-card';
import { DiscoveryLoadingIndicator } from '@/features/discovery/discovery-loading';
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
  // Discovery props
  discoveryPhase?: DiscoveryPhase;
  discoveryAcknowledgement?: string | null;
  discoveryQuestions?: DiscoveryQuestion[];
  discoveryAnswers?: Record<string, string>;
  onDiscoveryAnswer?: (questionId: string, value: string) => void;
  onDiscoveryAddressAnswer?: (questionId: string, address: string, enrichment: PlacesEnrichment) => void;
  // Blueprint props
  isBlueprintBusy?: boolean;
  blueprintPhase?: BlueprintPhase;
  blueprint?: Blueprint | null;
  pageStatuses?: PageGenerationStatus[];
  onBlueprintApprove?: () => void;
  onBlueprintRegenerate?: () => void;
  onBlueprintCancel?: () => void;
  onBlueprintUpdate?: (blueprint: Blueprint) => void;
  blueprintError?: string | null;
  isRetryingPages?: boolean;
  componentsReady?: boolean;
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
  discoveryPhase,
  discoveryAcknowledgement,
  discoveryQuestions,
  discoveryAnswers,
  onDiscoveryAnswer,
  onDiscoveryAddressAnswer,
  isBlueprintBusy,
  blueprintPhase,
  blueprint,
  pageStatuses,
  onBlueprintApprove,
  onBlueprintRegenerate,
  onBlueprintCancel,
  onBlueprintUpdate,
  blueprintError,
  isRetryingPages,
  componentsReady,
  resumeCard,
}: PromptPanelProps) {
  const isDiscoveryActive = discoveryPhase && discoveryPhase !== 'idle' && discoveryPhase !== 'complete' && discoveryPhase !== 'skipped';
  const effectiveIsLoading = isLoading || !!isBlueprintBusy || !!isDiscoveryActive;

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
            showExamplePrompts={showExamplePrompts && !isBlueprintBusy && !isDiscoveryActive}
            onExampleSelect={onExampleSelect}
            buildProgress={buildProgress}
            blueprintLoading={blueprintPhase === 'generating-blueprint'}
          />

          {/* Discovery flow UI */}
          {discoveryPhase === 'analyzing' && (
            <DiscoveryLoadingIndicator />
          )}

          {discoveryAcknowledgement && discoveryPhase && discoveryPhase !== 'idle' && discoveryPhase !== 'analyzing' && discoveryPhase !== 'skipped' && discoveryPhase !== 'complete' && (
            <ChatMessage
              message={{
                id: 'discovery-acknowledgement',
                role: 'assistant',
                parts: [{ type: 'text', text: discoveryAcknowledgement }],
              }}
            />
          )}

          {discoveryPhase === 'evaluating' && (
            <DiscoveryLoadingIndicator />
          )}

          {discoveryPhase === 'asking' && discoveryQuestions && (
            <>
              {discoveryQuestions.map((q) => (
                <DiscoveryQuestionCard
                  key={q.id}
                  question={q}
                  answered={discoveryAnswers?.[q.id]}
                  onSubmit={(value) => onDiscoveryAnswer?.(q.id, value)}
                  onAddressSelect={(addr, enrichment) => onDiscoveryAddressAnswer?.(q.id, addr, enrichment)}
                  disabled={discoveryAnswers ? q.id in discoveryAnswers : false}
                />
              ))}
            </>
          )}

          {/* confirming phase removed — auto-proceeds after evaluation */}

          {/* Blueprint flow UI */}
          {blueprintPhase === 'awaiting-approval' && blueprint && (
            <BlueprintCard
              blueprint={blueprint}
              onApprove={onBlueprintApprove ?? (() => {})}
              onRegenerate={onBlueprintRegenerate ?? (() => {})}
              onCancel={onBlueprintCancel ?? (() => {})}
              onUpdate={onBlueprintUpdate}
            />
          )}

          {(blueprintPhase === 'generating-components' || blueprintPhase === 'generating-assets' || blueprintPhase === 'generating-pages' || blueprintPhase === 'generating-site') && (
            <PageProgress
              pageStatuses={pageStatuses ?? []}
              componentsStatus={(blueprintPhase === 'generating-components' || blueprintPhase === 'generating-site') && !componentsReady ? 'generating' : 'complete'}
              assetsStatus={blueprintPhase === 'generating-assets' ? 'generating' : blueprintPhase === 'generating-pages' ? 'complete' : undefined}
              isRetrying={isRetryingPages}
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
          <ErrorBanner error={error} onRetry={onRetry} onOpenSettings={onOpenSettings} />
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
