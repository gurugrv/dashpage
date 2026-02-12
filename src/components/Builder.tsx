'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useModelSelection } from '@/features/builder/hooks/use-model-selection';
import { useStreamingPersistence } from '@/features/builder/hooks/use-streaming-persistence';
import { getBrowserTimeZone, getSavedTimeZone } from '@/features/builder/utils/timezone';
import { useBlueprintGeneration } from '@/hooks/useBlueprintGeneration';
import { detectMultiPageIntent } from '@/lib/blueprint/detect-multi-page';
import { useBuildProgress } from '@/hooks/useBuildProgress';
import { useConversations } from '@/hooks/useConversations';
import { useHtmlParser } from '@/hooks/useHtmlParser';
import { useModels } from '@/hooks/useModels';
import {
  ensureArtifactCompletionMessage,
  sanitizeAssistantMessageWithFallback,
} from '@/lib/chat/sanitize-assistant-message';
import { extractPostArtifactSummary, parseAssistantForChat } from '@/lib/parser/assistant-stream-parser';
import { isPersistableArtifact } from '@/lib/parser/validate-artifact';
import type { ProjectFiles } from '@/types';
import type { BuildProgressData } from '@/types/build-progress';

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
  const [blueprintMode, setBlueprintMode] = useState(false);

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
  const { currentFiles, lastValidFiles, isGenerating, editFailed, processMessages, setFiles, resetEditFailed } = useHtmlParser();
  const { conversations, create, rename, remove } = useConversations();
  const { availableProviders, refetch } = useModels();
  const { progress: buildProgress, handleProgressData, resetProgress } = useBuildProgress();

  const {
    setSelectedModel,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    handleProviderChange,
    resolveMaxOutputTokens,
  } = useModelSelection(availableProviders);

  const {
    phase: blueprintPhase,
    blueprint,
    pageStatuses,
    error: blueprintError,
    generateBlueprint,
    generatePages,
    cancel: cancelBlueprint,
    reset: resetBlueprint,
  } = useBlueprintGeneration({
    provider: effectiveSelectedProvider,
    model: effectiveSelectedModel,
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
        const textContent = message.parts
          ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map((part) => part.text)
          .join('') ?? '';
        const preface = parseAssistantForChat(textContent);
        const postSummary = extractPostArtifactSummary(textContent);

        if (message.role === 'assistant' && htmlArtifact) {
          const completionSummary = ensureArtifactCompletionMessage(
            postSummary || sanitizeAssistantMessageWithFallback(textContent, true),
            textContent,
            true,
          );
          const trimmedPreface = preface.trim();
          const trimmedSummary = completionSummary.trim();

          if (trimmedPreface) {
            await fetch(`/api/conversations/${convId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'assistant', content: trimmedPreface, htmlArtifact: null }),
            });
          }

          if (trimmedSummary && trimmedSummary !== trimmedPreface) {
            await fetch(`/api/conversations/${convId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'assistant', content: trimmedSummary, htmlArtifact }),
            });
          }
        } else {
          const persistedContent = message.role === 'assistant'
            ? sanitizeAssistantMessageWithFallback(textContent, Boolean(htmlArtifact))
            : textContent;

          await fetch(`/api/conversations/${convId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: message.role, content: persistedContent, htmlArtifact }),
          });
        }
      }

      streamingTextRef.current = '';

    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const displayMessages: UIMessage[] = messages.flatMap((message, index) => {
    if (message.role !== 'assistant') return [message];

    const rawText = message.parts
      ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('') ?? '';
    const preface = parseAssistantForChat(rawText);
    const isLastMessage = index === messages.length - 1;
    const isCurrentlyStreaming = isLastMessage && isLoading;
    const hasCompletedTurn = !isCurrentlyStreaming;
    const postSummary = hasCompletedTurn ? extractPostArtifactSummary(rawText) : '';
    const summary = hasCompletedTurn
      ? ensureArtifactCompletionMessage(
        postSummary || sanitizeAssistantMessageWithFallback(rawText),
        rawText,
      )
      : '';

    const output: UIMessage[] = [];
    if (preface) {
      output.push({
        ...message,
        parts: [{ type: 'text', text: preface }],
      });
    }

    if (summary && summary !== preface) {
      output.push({
        ...message,
        id: `${message.id}-completion`,
        parts: [{ type: 'text', text: summary }],
      });
    }

    if (output.length > 0) return output;

    if (hasCompletedTurn && summary) {
      return [{
        ...message,
        parts: [{ type: 'text', text: summary }],
      }];
    }

    return [];
  });

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
        resetProgress();
        partialSavedRef.current = false;
        streamingTextRef.current = '';
        setHasPartialMessage(false);

        await sendMessage(
          { text: promptToSubmit },
          {
            body: {
              currentFiles: currentFilesRef.current,
              provider: effectiveSelectedProvider,
              model: effectiveSelectedModel,
              maxOutputTokens: resolveMaxOutputTokens(),
              savedTimeZone: getSavedTimeZone(),
              browserTimeZone: getBrowserTimeZone(),
            },
          },
        );
      };
      
      submitWithPrompt();
    }
  }, [isLoading, messages.length, availableProviders.length, create, setActiveConversationId, rename, resetProgress, sendMessage, effectiveSelectedProvider, effectiveSelectedModel, resolveMaxOutputTokens]);

  useEffect(() => {
    processMessages(messages, isLoading);
  }, [messages, isLoading, processMessages]);

  useEffect(() => {
    if (!editFailed || isLoading) return;

    resetEditFailed();
    sendMessage(
      { text: 'The previous edit could not be applied. Please provide the complete updated files.' },
      {
        body: {
          currentFiles: currentFilesRef.current,
          provider: effectiveSelectedProvider,
          model: effectiveSelectedModel,
          maxOutputTokens: resolveMaxOutputTokens(),
          savedTimeZone: getSavedTimeZone(),
          browserTimeZone: getBrowserTimeZone(),
        },
      },
    );
  }, [
    editFailed,
    isLoading,
    resetEditFailed,
    sendMessage,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    resolveMaxOutputTokens,
  ]);

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
    }

    // Blueprint mode: first message triggers blueprint generation instead of chat
    // Auto-detect multi-page intent OR respect manual toggle
    const useBlueprint = messages.length === 0 && (blueprintMode || detectMultiPageIntent(input));
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
        },
      },
    );
  }, [
    input,
    isLoading,
    isBlueprintBusy,
    blueprintMode,
    activeConversationId,
    setActiveConversationId,
    currentFilesRef,
    create,
    messages.length,
    rename,
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

    const continuePrompt = 'Continue from where you left off. Output the COMPLETE website files using the same output format.';

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
    await generatePages(activeConversationId, blueprint);
  }, [activeConversationId, blueprint, generatePages]);

  const handleBlueprintRegenerate = useCallback(async () => {
    if (!activeConversationId) return;
    const lastUserMessage = messages.findLast((m) => m.role === 'user');
    if (lastUserMessage) {
      const text = lastUserMessage.parts?.find((p): p is { type: 'text'; text: string } => p.type === 'text')?.text;
      if (text) await generateBlueprint(text, activeConversationId);
    }
  }, [activeConversationId, messages, generateBlueprint]);

  // Persist artifact when blueprint pipeline completes
  useEffect(() => {
    if (blueprintPhase !== 'complete') return;
    const files = currentFilesRef.current;
    const convId = activeConversationIdRef.current;
    if (!convId || !isPersistableArtifact(files)) return;

    const htmlPages = Object.keys(files).filter((f) => f.endsWith('.html'));
    let content: string;

    if (blueprint) {
      const pageList = blueprint.pages
        .map((p) => `- **${p.title}** (\`${p.filename}\`) — ${p.purpose}`)
        .join('\n');
      const design = blueprint.designSystem;
      content = [
        `**${blueprint.siteName}** — ${blueprint.siteDescription}`,
        '',
        `Generated ${htmlPages.length} pages:`,
        pageList,
        '',
        `Design: ${design.mood} · ${design.headingFont} / ${design.bodyFont} · ${design.primaryColor}`,
      ].join('\n');
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

    fetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'assistant',
        content,
        htmlArtifact: files,
      }),
    });

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
              hasPartialMessage={hasPartialMessage}
              onContinueGeneration={handleContinueGeneration}
              blueprintMode={blueprintMode}
              onBlueprintModeChange={setBlueprintMode}
              isBlueprintBusy={isBlueprintBusy}
              blueprintPhase={blueprintPhase}
              blueprint={blueprint}
              pageStatuses={pageStatuses}
              onBlueprintApprove={handleBlueprintApprove}
              onBlueprintRegenerate={handleBlueprintRegenerate}
              onBlueprintCancel={cancelBlueprint}
              blueprintError={blueprintError}
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
            />
          </Panel>
        </PanelGroup>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onKeysChanged={refetch} />
      </div>
    </>
  );
}
