'use client';

import type { UIMessage } from '@ai-sdk/react';
import { ChatInput } from '@/components/ChatInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';
import type { IntakePhase } from '@/hooks/useIntake';
import type { Blueprint } from '@/lib/blueprint/types';
import type { IntakeQuestion, BusinessProfileData, PlacesEnrichment } from '@/lib/intake/types';
import type { StoredBusinessProfile } from '@/hooks/useBusinessProfiles';
import { BlueprintCard } from '@/features/blueprint/blueprint-card';
import { PageProgress } from '@/features/blueprint/page-progress';
import { IntakeQuestionCard } from '@/features/intake/intake-question-card';
import { IntakeLoadingIndicator } from '@/features/intake/intake-loading';
import { BusinessProfileSummary } from '@/features/intake/business-profile-summary';
import { BusinessProfilePicker } from '@/features/intake/business-profile-picker';
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
  // Intake props
  intakePhase?: IntakePhase;
  intakeQuestions?: IntakeQuestion[];
  intakeAnswers?: Record<string, string>;
  intakeProfile?: BusinessProfileData | null;
  intakeExistingProfiles?: (BusinessProfileData & { id?: string })[];
  intakeAllAnswered?: boolean;
  onIntakeAnswer?: (questionId: string, value: string) => void;
  onIntakeAddressAnswer?: (questionId: string, address: string, enrichment: PlacesEnrichment) => void;
  onIntakeEvaluate?: () => void;
  onIntakeConfirm?: (profile: BusinessProfileData) => void;
  onIntakePickProfile?: (profile: StoredBusinessProfile) => void;
  onIntakeCreateNew?: () => void;
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
  intakePhase,
  intakeQuestions,
  intakeAnswers,
  intakeProfile,
  intakeExistingProfiles,
  intakeAllAnswered,
  onIntakeAnswer,
  onIntakeAddressAnswer,
  onIntakeEvaluate,
  onIntakeConfirm,
  onIntakePickProfile,
  onIntakeCreateNew,
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
  resumeCard,
}: PromptPanelProps) {
  const isIntakeActive = intakePhase && intakePhase !== 'idle' && intakePhase !== 'complete' && intakePhase !== 'skipped';
  const effectiveIsLoading = isLoading || !!isBlueprintBusy || !!isIntakeActive;

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
            showExamplePrompts={showExamplePrompts && !isBlueprintBusy && !isIntakeActive}
            onExampleSelect={onExampleSelect}
            buildProgress={buildProgress}
            blueprintLoading={blueprintPhase === 'generating-blueprint'}
          />

          {/* Intake flow UI */}
          {intakePhase === 'picking' && intakeExistingProfiles && intakeExistingProfiles.length > 0 && onIntakePickProfile && onIntakeCreateNew && (
            <BusinessProfilePicker
              profiles={intakeExistingProfiles as StoredBusinessProfile[]}
              onSelect={onIntakePickProfile}
              onCreateNew={onIntakeCreateNew}
            />
          )}

          {(intakePhase === 'analyzing' || intakePhase === 'evaluating') && (
            <IntakeLoadingIndicator />
          )}

          {intakePhase === 'asking' && intakeQuestions && (
            <>
              {intakeQuestions.map((q) => (
                <IntakeQuestionCard
                  key={q.id}
                  question={q}
                  answered={intakeAnswers?.[q.id]}
                  onSubmit={(value) => onIntakeAnswer?.(q.id, value)}
                  onAddressSelect={(addr, enrichment) => onIntakeAddressAnswer?.(q.id, addr, enrichment)}
                  disabled={!!intakeAnswers?.[q.id]}
                />
              ))}
              {intakeAllAnswered && (
                <div className="px-4 py-2">
                  <Button size="sm" onClick={onIntakeEvaluate}>
                    Continue
                  </Button>
                </div>
              )}
            </>
          )}

          {intakePhase === 'confirming' && intakeProfile && onIntakeConfirm && (
            <BusinessProfileSummary
              profile={intakeProfile}
              onConfirm={onIntakeConfirm}
              onAddMore={() => {/* TODO: could add more fields */}}
            />
          )}

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

          {(blueprintPhase === 'generating-components' || blueprintPhase === 'generating-pages') && (
            <PageProgress
              pageStatuses={pageStatuses ?? []}
              componentsStatus={blueprintPhase === 'generating-components' ? 'generating' : 'complete'}
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
