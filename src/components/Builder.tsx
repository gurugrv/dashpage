'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { PreviewPanel } from '@/components/PreviewPanel';
import { PromptPanel } from '@/components/PromptPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useConversationActions } from '@/features/builder/hooks/use-conversation-actions';
import { useModelSelection } from '@/features/builder/hooks/use-model-selection';
import { useStreamingPersistence } from '@/features/builder/hooks/use-streaming-persistence';
import { getBrowserTimeZone, getSavedTimeZone } from '@/features/builder/utils/timezone';
import { useAutoContinue } from '@/hooks/useAutoContinue';
import { useBuildProgress } from '@/hooks/useBuildProgress';
import { useConversations } from '@/hooks/useConversations';
import { useHtmlParser } from '@/hooks/useHtmlParser';
import { useModels } from '@/hooks/useModels';
import type { ProjectFiles } from '@/types';
import type { BuildProgressData } from '@/types/build-progress';

const chatTransport = new DefaultChatTransport({ api: '/api/chat' });

export function Builder() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasPartialMessage, setHasPartialMessage] = useState(false);

  const { currentFiles, lastValidFiles, isGenerating, editFailed, processMessages, setFiles, resetEditFailed } = useHtmlParser();
  const { conversations, create, rename, remove } = useConversations();
  const { availableProviders, refetch } = useModels();
  const { triggerAutoContinue, resetAutoContinue } = useAutoContinue();
  const { progress: buildProgress, handleProgressData, resetProgress } = useBuildProgress();

  const {
    setSelectedModel,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    handleProviderChange,
    resolveMaxOutputTokens,
  } = useModelSelection(availableProviders);

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
    onFinish: async ({ message, finishReason }) => {
      const convId = activeConversationIdRef.current;
      const files = currentFilesRef.current;

      if (partialSavedRef.current) {
        streamingTextRef.current = '';
        return;
      }

      if (convId) {
        const htmlArtifact = files['index.html'] ? files : null;
        const textContent = message.parts
          ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map((part) => part.text)
          .join('') ?? '';

        await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: message.role, content: textContent, htmlArtifact }),
        });
      }

      streamingTextRef.current = '';

      if (finishReason === 'length' && effectiveSelectedProvider && effectiveSelectedModel) {
        triggerAutoContinue(
          messages,
          effectiveSelectedProvider,
          effectiveSelectedModel,
          getSavedTimeZone(),
          getBrowserTimeZone(),
        );
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

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
    resetAutoContinue,
    resetProgress,
    setHasPartialMessage,
  });

  useEffect(() => {
    processMessages(messages, isLoading);
  }, [messages, isLoading, processMessages]);

  useEffect(() => {
    if (!editFailed || isLoading) return;

    resetEditFailed();
    sendMessage(
      { text: 'The previous edit could not be applied. Please provide the complete updated HTML using <htmlOutput> tags.' },
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
    if (!input.trim() || isLoading) return;

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

    resetAutoContinue();
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
    activeConversationId,
    create,
    messages.length,
    rename,
    resetAutoContinue,
    resetProgress,
    sendMessage,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    resolveMaxOutputTokens,
  ]);

  const handleContinueGeneration = useCallback(async () => {
    const convId = activeConversationId;
    if (!convId || isLoading) return;

    const continuePrompt = 'Continue generating from where you left off. Output the COMPLETE HTML document.';

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
    sendMessage,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    resolveMaxOutputTokens,
  ]);

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
              messages={messages}
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
            />
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-border transition-colors hover:bg-primary/20" />

          <Panel id="preview-panel" defaultSize={65} minSize={35}>
            <PreviewPanel
              files={currentFiles}
              lastValidFiles={lastValidFiles}
              isGenerating={isGenerating}
              buildProgress={buildProgress}
            />
          </Panel>
        </PanelGroup>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onKeysChanged={refetch} />
      </div>
    </>
  );
}
