'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useSearchParams, useRouter } from 'next/navigation';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { PreviewPanel } from '@/components/PreviewPanel';
import { PromptPanel } from '@/components/PromptPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useConversationActions } from '@/features/builder/hooks/use-conversation-actions';
import type { ResumableGenerationState } from '@/features/builder/hooks/use-conversation-actions';
import { ResumeCard } from '@/features/prompt/resume-card';
import { useModelSelection } from '@/features/builder/hooks/use-model-selection';
import { useStreamingPersistence } from '@/features/builder/hooks/use-streaming-persistence';
import { useBlueprintModelConfig } from '@/features/settings/use-blueprint-model-config';
import { getBrowserTimeZone, getSavedTimeZone } from '@/features/builder/utils/timezone';
import { useBlueprintGeneration } from '@/hooks/useBlueprintGeneration';
import type { Blueprint } from '@/lib/blueprint/types';
import { useBuildProgress } from '@/hooks/useBuildProgress';
import { useConversations } from '@/hooks/useConversations';
import { useHtmlParser } from '@/hooks/useHtmlParser';
import { useModels } from '@/hooks/useModels';
import { ARTIFACT_COMPLETION_MESSAGE } from '@/lib/chat/sanitize-assistant-message';
import { isPersistableArtifact } from '@/lib/parser/validate-artifact';
import type { ProjectFiles } from '@/types';
import type { BuildProgressData, ToolActivityEvent } from '@/types/build-progress';

/** Split text parts of a message into preface (before first tool) and summary (after last tool).
 *  Single-pass: accumulates text into buckets, moving post-tool text into summary on each tool hit. */
function splitTextAroundTools(parts: UIMessage['parts']): { preface: string; summary: string; hasTools: boolean } {
  let preface = '';
  let postToolText = '';
  let hasTools = false;

  for (const part of parts) {
    if (typeof part !== 'object' || part === null || !('type' in part)) continue;
    const typed = part as { type: string; text?: string };
    if (typed.type.startsWith('tool-')) {
      hasTools = true;
      // Any text accumulated after a previous tool is not the final summary — discard into preface
      postToolText = '';
    } else if (typed.type === 'text') {
      if (!hasTools) {
        preface += typed.text ?? '';
      } else {
        postToolText += typed.text ?? '';
      }
    }
  }

  return { preface: preface.trim(), summary: postToolText.trim(), hasTools };
}

const chatTransport = new DefaultChatTransport({ api: '/api/chat' });

export function Builder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationIdFromUrl = searchParams.get('conversation');

  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasPartialMessage, setHasPartialMessage] = useState(false);
  const [resumableState, setResumableState] = useState<ResumableGenerationState | null>(null);

  // Sync active conversation with URL
  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveConversationIdState(id);
    const params = new URLSearchParams(searchParams);
    if (id) {
      params.set('conversation', id);
    } else {
      params.delete('conversation');
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Restore conversation from URL when conversations are loaded
  const { currentFiles, lastValidFiles, isGenerating, streamingCode, processMessages, setFiles } = useHtmlParser();
  const { conversations, create, rename, remove, updateModel } = useConversations();
  const { availableProviders, refetch } = useModels();
  const { progress: buildProgress, handleProgressData, handleToolActivity, resetProgress } = useBuildProgress();

  const {
    setSelectedModel,
    setModelForConversation,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    handleProviderChange,
    resolveMaxOutputTokens,
  } = useModelSelection(availableProviders);

  const {
    config: blueprintModelConfig,
    setStepModel: setBlueprintStepModel,
    clearStepModel: clearBlueprintStepModel,
    resolveStepModel: resolveRawStepModel,
  } = useBlueprintModelConfig(availableProviders);

  const resolveBlueprintStepModel = useCallback(
    (step: 'planning' | 'components' | 'pages') => {
      if (!effectiveSelectedProvider || !effectiveSelectedModel) return null;
      return resolveRawStepModel(step, effectiveSelectedProvider, effectiveSelectedModel);
    },
    [resolveRawStepModel, effectiveSelectedProvider, effectiveSelectedModel],
  );

  const {
    phase: blueprintPhase,
    blueprint,
    pageStatuses,
    error: blueprintError,
    generateBlueprint,
    approveAndGenerate,
    resumeFromState,
    updateBlueprint,
    retryAttempt,
    blueprintStreamingCode,
    cancel: cancelBlueprint,
    reset: resetBlueprint,
  } = useBlueprintGeneration({
    resolveStepModel: resolveBlueprintStepModel,
    savedTimeZone: getSavedTimeZone(),
    browserTimeZone: getBrowserTimeZone(),
    onFilesReady: setFiles,
  });

  const isBlueprintBusy = blueprintPhase !== 'idle' && blueprintPhase !== 'complete' && blueprintPhase !== 'error';

  const currentFilesRef = useRef<ProjectFiles>(currentFiles);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const partialSavedRef = useRef(false);
  const streamingTextRef = useRef('');

  const {
    messages,
    setMessages,
    sendMessage,
    stop,
    error,
    status,
    regenerate,
  } = useChat({
    transport: chatTransport,
    onData: (part) => {
      if (part.type === 'data-buildProgress') {
        handleProgressData(part.data as BuildProgressData);
      }
      if (part.type === 'data-toolActivity') {
        handleToolActivity(part.data as ToolActivityEvent);
      }
    },
    onFinish: async ({ message }) => {
      const convId = activeConversationIdRef.current;
      const files = currentFilesRef.current;

      if (partialSavedRef.current) {
        streamingTextRef.current = '';
        return;
      }

      if (convId) {
        const htmlArtifact = isPersistableArtifact(files) ? files : null;
        const { preface, summary } = splitTextAroundTools(message.parts);

        if (message.role === 'assistant' && htmlArtifact) {
          // Persist preface (explanation) without artifact
          if (preface) {
            await fetch(`/api/conversations/${convId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'assistant', content: preface, htmlArtifact: null }),
            });
          }

          // Persist summary (or default) with artifact
          const summaryText = summary || ARTIFACT_COMPLETION_MESSAGE;
          if (summaryText !== preface) {
            await fetch(`/api/conversations/${convId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'assistant', content: summaryText, htmlArtifact }),
            });
          }
        } else {
          // No artifact — persist all text
          const fullText = [preface, summary].filter(Boolean).join('\n\n').trim();
          if (fullText) {
            await fetch(`/api/conversations/${convId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: message.role, content: fullText, htmlArtifact }),
            });
          }
        }
      }

      streamingTextRef.current = '';
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const displayMessages: UIMessage[] = useMemo(() => messages.flatMap((message, index) => {
    if (message.role !== 'assistant') return [message];

    const { preface, summary, hasTools } = splitTextAroundTools(message.parts);
    const isLastMessage = index === messages.length - 1;
    const isCurrentlyStreaming = isLastMessage && isLoading;

    const output: UIMessage[] = [];

    if (preface) {
      output.push({
        ...message,
        parts: [{ type: 'text', text: preface }],
      });
    }

    if (!isCurrentlyStreaming) {
      const completionText = summary || (hasTools ? ARTIFACT_COMPLETION_MESSAGE : '');
      if (completionText && completionText !== preface) {
        output.push({
          ...message,
          id: `${message.id}-completion`,
          parts: [{ type: 'text', text: completionText }],
        });
      }
    }

    if (output.length > 0) return output;
    return [];
  }), [messages, isLoading]);

  const { savePartial } = useStreamingPersistence({
    currentFiles,
    activeConversationId,
    messages,
    isLoading,
    currentFilesRef,
    activeConversationIdRef,
    partialSavedRef,
    streamingTextRef,
  });

  const { handleCreateConversation, handleSelectConversation, handleDeleteConversation } = useConversationActions({
    service: { create, remove },
    activeConversationId,
    setActiveConversationId,
    setMessages: (nextMessages: UIMessage[]) => setMessages(nextMessages),
    setFiles,
    resetProgress,
    setHasPartialMessage,
    resetBlueprint,
    onRestoreModel: setModelForConversation,
    onRestoreGenerationState: setResumableState,
  });

  // Restore conversation from URL when conversations are loaded
  useEffect(() => {
    if (conversationIdFromUrl && conversations.length > 0 && !activeConversationId) {
      const conversationExists = conversations.some(c => c.id === conversationIdFromUrl);
      if (conversationExists) {
        handleSelectConversation(conversationIdFromUrl);
      } else {
        // Clear invalid conversation ID from URL
        const params = new URLSearchParams(searchParams);
        params.delete('conversation');
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    }
  }, [conversationIdFromUrl, conversations, activeConversationId, handleSelectConversation, searchParams, router]);

  // Handle initial prompt from landing page - using ref to avoid cascading renders
  const initialPromptProcessedRef = useRef(false);
  const pendingInitialPromptRef = useRef<string | null>(null);
  
  // Reset initial prompt flag when conversation changes so future
  // sessionStorage prompts (e.g. after page refresh) are not blocked
  useEffect(() => {
    initialPromptProcessedRef.current = false;
  }, [activeConversationId]);

  // Check for initial prompt on mount
  useEffect(() => {
    if (initialPromptProcessedRef.current) return;
    const initialPrompt = sessionStorage.getItem('initialPrompt');
    if (initialPrompt) {
      pendingInitialPromptRef.current = initialPrompt;
      sessionStorage.removeItem('initialPrompt');
    }
  }, []);

  // Submit the pending prompt when ready
  useEffect(() => {
    if (
      !initialPromptProcessedRef.current &&
      pendingInitialPromptRef.current &&
      !isLoading &&
      messages.length === 0 &&
      availableProviders.length > 0
    ) {
      initialPromptProcessedRef.current = true;
      const promptToSubmit = pendingInitialPromptRef.current;
      pendingInitialPromptRef.current = null;
      
      // Directly call the submit logic with the prompt
      const submitWithPrompt = async () => {
        const title = promptToSubmit.slice(0, 50);
        const conversation = await create(title);
        setActiveConversationId(conversation.id);

        await fetch(`/api/conversations/${conversation.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user', content: promptToSubmit }),
        });

        rename(conversation.id, title);
        if (effectiveSelectedProvider && effectiveSelectedModel) {
          updateModel(conversation.id, effectiveSelectedProvider, effectiveSelectedModel);
        }
        resetProgress();
        partialSavedRef.current = false;
        streamingTextRef.current = '';
        setHasPartialMessage(false);

        // All first-generation requests go through the blueprint pipeline
        setMessages([{
          id: `user-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: promptToSubmit }],
        }]);
        await generateBlueprint(promptToSubmit, conversation.id);
      };

      submitWithPrompt();
    }
  }, [isLoading, messages.length, availableProviders.length, create, setActiveConversationId, rename, updateModel, resetProgress, setMessages, generateBlueprint, effectiveSelectedProvider, effectiveSelectedModel]);

  useEffect(() => {
    processMessages(messages, isLoading);
  }, [messages, isLoading, processMessages]);

  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isLoading || isBlueprintBusy) return;

    let conversationId = activeConversationId;

    if (!conversationId) {
      const title = input.trim().slice(0, 50);
      const conversation = await create(title);
      conversationId = conversation.id;
      setActiveConversationId(conversationId);
    }

    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: input }),
    });

    if (messages.length === 0) {
      rename(conversationId, input.trim().slice(0, 50));
      if (effectiveSelectedProvider && effectiveSelectedModel) {
        updateModel(conversationId, effectiveSelectedProvider, effectiveSelectedModel);
      }
    }

    // All first-generation requests go through the blueprint pipeline
    const useBlueprint = messages.length === 0;
    if (useBlueprint) {
      const promptText = input;
      setInput('');
      setMessages([{
        id: `user-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: promptText }],
      }]);
      await generateBlueprint(promptText, conversationId);
      return;
    }

    resetProgress();
    partialSavedRef.current = false;
    streamingTextRef.current = '';
    setHasPartialMessage(false);

    const messageText = input;
    setInput('');

    await sendMessage(
      { text: messageText },
      {
        body: {
          currentFiles: currentFilesRef.current,
          provider: effectiveSelectedProvider,
          model: effectiveSelectedModel,
          maxOutputTokens: resolveMaxOutputTokens(),
          savedTimeZone: getSavedTimeZone(),
          browserTimeZone: getBrowserTimeZone(),
          conversationId: activeConversationIdRef.current,
        },
      },
    );
  }, [
    input,
    isLoading,
    isBlueprintBusy,
    activeConversationId,
    setActiveConversationId,
    currentFilesRef,
    create,
    messages.length,
    rename,
    updateModel,
    resetProgress,
    sendMessage,
    setMessages,
    generateBlueprint,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    resolveMaxOutputTokens,
  ]);

  const handleContinueGeneration = useCallback(async () => {
    const convId = activeConversationId;
    if (!convId || isLoading) return;

    const isMultiPage = Object.keys(currentFilesRef.current).length > 1;
    const continuePrompt = isMultiPage
      ? 'Continue from where you left off. Append the remaining content — do NOT restart files from the beginning.'
      : 'Continue from where you left off. Append the remaining HTML — do NOT restart from <!DOCTYPE html> or <head>.';

    await fetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: continuePrompt }),
    });

    setHasPartialMessage(false);
    partialSavedRef.current = false;
    streamingTextRef.current = '';

    await sendMessage(
      { text: continuePrompt },
      {
        body: {
          currentFiles: currentFilesRef.current,
          provider: effectiveSelectedProvider,
          model: effectiveSelectedModel,
          maxOutputTokens: resolveMaxOutputTokens(),
          savedTimeZone: getSavedTimeZone(),
          browserTimeZone: getBrowserTimeZone(),
          conversationId: activeConversationIdRef.current,
        },
      },
    );
  }, [
    activeConversationId,
    isLoading,
    currentFilesRef,
    sendMessage,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    resolveMaxOutputTokens,
  ]);

  const handleBlueprintApprove = useCallback(async () => {
    if (!activeConversationId || !blueprint) return;
    await approveAndGenerate(activeConversationId, blueprint);
  }, [activeConversationId, blueprint, approveAndGenerate]);

  const handleBlueprintRegenerate = useCallback(async () => {
    if (!activeConversationId) return;
    const lastUserMessage = messages.findLast((m) => m.role === 'user');
    if (lastUserMessage) {
      const text = lastUserMessage.parts?.find((p): p is { type: 'text'; text: string } => p.type === 'text')?.text;
      if (text) await generateBlueprint(text, activeConversationId);
    }
  }, [activeConversationId, messages, generateBlueprint]);

  const handleBlueprintUpdate = useCallback((updated: Blueprint) => {
    if (!activeConversationId) return;
    updateBlueprint(updated, activeConversationId);
  }, [activeConversationId, updateBlueprint]);

  const handleResumeGeneration = useCallback(async () => {
    if (!resumableState || !activeConversationId) return;

    if (resumableState.mode === 'blueprint') {
      // Fetch the blueprint data from DB
      const blueprintRes = await fetch(`/api/blueprint/${activeConversationId}`);
      if (!blueprintRes.ok) {
        setResumableState(null);
        return;
      }
      const { blueprint: blueprintData } = await blueprintRes.json();

      await resumeFromState(activeConversationId, {
        phase: resumableState.phase,
        blueprintData,
        componentHtml: resumableState.componentHtml,
        completedPages: resumableState.completedPages,
      });
    } else {
      // Chat mode — use existing continue mechanism
      await handleContinueGeneration();
    }

    setResumableState(null);
  }, [resumableState, activeConversationId, resumeFromState, handleContinueGeneration]);

  const handleDiscardResume = useCallback(async () => {
    if (!activeConversationId) return;

    await fetch(`/api/conversations/${activeConversationId}/generation-state`, {
      method: 'DELETE',
    }).catch(() => {});

    setResumableState(null);
    setHasPartialMessage(false);
  }, [activeConversationId]);

  // Persist artifact when blueprint pipeline completes
  useEffect(() => {
    if (blueprintPhase !== 'complete') return;
    const files = currentFilesRef.current;
    const convId = activeConversationIdRef.current;
    if (!convId || !isPersistableArtifact(files)) return;

    const htmlPages = Object.keys(files).filter((f) => f.endsWith('.html'));
    let content: string;

    if (blueprint) {
      const generatedPages = blueprint.pages.filter((p) => htmlPages.includes(p.filename));
      const failedPages = blueprint.pages.filter((p) => !htmlPages.includes(p.filename));
      const pageList = generatedPages
        .map((p) => `- **${p.title}** (\`${p.filename}\`) — ${p.purpose}`)
        .join('\n');
      const design = blueprint.designSystem;
      const parts = [
        `**${blueprint.siteName}** — ${blueprint.siteDescription}`,
        '',
        `Generated ${generatedPages.length} pages:`,
        pageList,
      ];
      if (failedPages.length > 0) {
        parts.push('', `Failed to generate: ${failedPages.map((p) => p.filename).join(', ')}`);
      }
      parts.push('', `Design: ${design.mood} · ${design.headingFont} / ${design.bodyFont} · ${design.primaryColor}`);
      content = parts.join('\n');
    } else {
      content = `Generated ${htmlPages.length}-page website: ${htmlPages.join(', ')}`;
    }

    // Show completion message in chat immediately
    setMessages((prev) => [
      ...prev,
      {
        id: `blueprint-complete-${Date.now()}`,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: content }],
      },
    ]);

    // Persist message then clean up generation state (awaited to prevent race on navigation)
    fetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'assistant',
        content,
        htmlArtifact: files,
      }),
    })
      .then(() =>
        fetch(`/api/conversations/${convId}/generation-state`, {
          method: 'DELETE',
        }),
      )
      .catch((err) => console.error('Failed to persist blueprint completion:', err));

    resetBlueprint();
  }, [blueprintPhase, blueprint, resetBlueprint, setMessages]);

  return (
    <>
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onRename={rename}
        onDelete={handleDeleteConversation}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex h-screen overflow-hidden">
        <PanelGroup id="builder-panels" orientation="horizontal" className="flex-1">
          <Panel id="prompt-panel" defaultSize={35} minSize={25}>
            <PromptPanel
              messages={displayMessages}
              input={input}
              setInput={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              onStop={() => { savePartial(); stop(); resetProgress(); }}
              buildProgress={buildProgress}
              error={error}
              onRetry={() => regenerate({
                body: {
                  currentFiles: currentFilesRef.current,
                  provider: effectiveSelectedProvider,
                  model: effectiveSelectedModel,
                  savedTimeZone: getSavedTimeZone(),
                  browserTimeZone: getBrowserTimeZone(),
                  conversationId: activeConversationIdRef.current,
                },
              })}
              provider={effectiveSelectedProvider}
              model={effectiveSelectedModel}
              onProviderChange={handleProviderChange}
              onModelChange={setSelectedModel}
              availableProviders={availableProviders}
              showExamplePrompts={messages.length === 0}
              onExampleSelect={setInput}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenConversations={() => setDrawerOpen(true)}
              hasPartialMessage={hasPartialMessage && !resumableState}
              onContinueGeneration={handleContinueGeneration}
              resumeCard={resumableState ? (
                <ResumeCard
                  mode={resumableState.mode}
                  phase={resumableState.phase}
                  completedPages={resumableState.completedPages ? Object.keys(resumableState.completedPages).length : 0}
                  totalPages={resumableState.pageStatuses?.length ?? 0}
                  isLoading={isLoading || isBlueprintBusy}
                  onResume={handleResumeGeneration}
                  onDiscard={handleDiscardResume}
                />
              ) : undefined}
              isBlueprintBusy={isBlueprintBusy}
              blueprintPhase={blueprintPhase}
              blueprint={blueprint}
              pageStatuses={pageStatuses}
              onBlueprintApprove={handleBlueprintApprove}
              onBlueprintRegenerate={handleBlueprintRegenerate}
              onBlueprintCancel={cancelBlueprint}
              onBlueprintUpdate={handleBlueprintUpdate}
              blueprintError={blueprintError}
              isRetryingPages={retryAttempt > 0}
            />
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-border transition-colors hover:bg-primary/20" />

          <Panel id="preview-panel" defaultSize={65} minSize={35}>
            <PreviewPanel
              files={currentFiles}
              lastValidFiles={lastValidFiles}
              isGenerating={isGenerating || isBlueprintBusy}
              buildProgress={buildProgress}
              blueprintPhase={blueprintPhase}
              pageStatuses={pageStatuses}
              streamingCode={streamingCode ?? blueprintStreamingCode}
              blueprintPalette={blueprint?.designSystem ? {
                primary: blueprint.designSystem.primaryColor,
                secondary: blueprint.designSystem.secondaryColor,
                accent: blueprint.designSystem.accentColor,
                background: blueprint.designSystem.backgroundColor,
                surface: blueprint.designSystem.surfaceColor,
                text: blueprint.designSystem.textColor,
                textMuted: blueprint.designSystem.textMutedColor,
              } : undefined}
            />
          </Panel>
        </PanelGroup>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onKeysChanged={refetch}
          availableProviders={availableProviders}
          blueprintModelConfig={blueprintModelConfig}
          onSetBlueprintStepModel={setBlueprintStepModel}
          onClearBlueprintStepModel={clearBlueprintStepModel}
        />
      </div>
    </>
  );
}
