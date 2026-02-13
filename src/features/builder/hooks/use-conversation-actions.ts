'use client';

import { useCallback } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import type { ProjectFiles } from '@/types';
import type { StoredMessage } from '@/features/builder/types';
import {
  ensureArtifactCompletionMessage,
  sanitizeAssistantMessageWithFallback,
} from '@/lib/chat/sanitize-assistant-message';

export interface ResumableGenerationState {
  id: string;
  conversationId: string;
  mode: 'chat' | 'blueprint';
  phase: string;
  autoSegment?: number | null;
  blueprintId?: string | null;
  componentHtml?: { headerHtml: string; footerHtml: string } | null;
  sharedStyles?: { stylesCss: string; headTags: string } | null;
  completedPages?: Record<string, string> | null;
  pageStatuses?: Array<{ filename: string; status: string }> | null;
}

interface ConversationService {
  create: (title?: string) => Promise<{ id: string }>;
  remove: (id: string) => Promise<void>;
}

interface UseConversationActionsOptions {
  service: ConversationService;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: UIMessage[]) => void;
  setFiles: (files: ProjectFiles) => void;
  resetProgress: () => void;
  setHasPartialMessage: (value: boolean) => void;
  resetBlueprint?: () => void;
  onRestoreModel?: (provider: string | null, model: string | null) => void;
  onRestoreGenerationState?: (state: ResumableGenerationState | null) => void;
}

export function useConversationActions({
  service,
  activeConversationId,
  setActiveConversationId,
  setMessages,
  setFiles,
  resetProgress,
  setHasPartialMessage,
  resetBlueprint,
  onRestoreModel,
  onRestoreGenerationState,
}: UseConversationActionsOptions) {
  const handleCreateConversation = useCallback(async () => {
    const conversation = await service.create();
    setActiveConversationId(conversation.id);
    setMessages([]);
    setFiles({});
    resetProgress();
    setHasPartialMessage(false);
    resetBlueprint?.();
    onRestoreModel?.(null, null);
    onRestoreGenerationState?.(null);
  }, [service, setActiveConversationId, setMessages, setFiles, resetProgress, setHasPartialMessage, resetBlueprint, onRestoreModel, onRestoreGenerationState]);

  const handleSelectConversation = useCallback(async (id: string) => {
    if (id === activeConversationId) return;

    setActiveConversationId(id);
    setFiles({});
    resetProgress();
    resetBlueprint?.();

    // Restore model from conversation metadata
    try {
      const convResponse = await fetch(`/api/conversations/${id}`);
      if (convResponse.ok) {
        const conv = await convResponse.json();
        onRestoreModel?.(conv.provider ?? null, conv.model ?? null);
      }
    } catch {
      // Non-critical — keep current model
    }

    try {
      const response = await fetch(`/api/conversations/${id}/messages`);
      const messages = await response.json() as StoredMessage[];

      if (!Array.isArray(messages) || messages.length === 0) {
        setMessages([]);
        setFiles({});
        setHasPartialMessage(false);
        return;
      }

      const uiMessages: UIMessage[] = messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: [{
          type: 'text' as const,
          text: message.role === 'assistant'
            ? ensureArtifactCompletionMessage(
              sanitizeAssistantMessageWithFallback(message.content, Boolean(message.htmlArtifact)),
              message.content,
              Boolean(message.htmlArtifact),
            )
            : message.content,
        }],
        ...(message.isPartial ? { isPartial: true } : {}),
      }));

      setMessages(uiMessages);
      const lastMessage = messages[messages.length - 1];
      setHasPartialMessage(lastMessage.role === 'assistant' && lastMessage.isPartial === true);

      let hasArtifact = false;
      for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].htmlArtifact) {
          setFiles(messages[index].htmlArtifact as ProjectFiles);
          hasArtifact = true;
          break;
        }
      }

      if (!hasArtifact) {
        setFiles({});
      }

      // Check for interrupted generation state
      try {
        const stateRes = await fetch(`/api/conversations/${id}/generation-state`);
        if (stateRes.ok) {
          const state = await stateRes.json() as ResumableGenerationState;
          onRestoreGenerationState?.(state);
        } else {
          onRestoreGenerationState?.(null);
        }
      } catch {
        onRestoreGenerationState?.(null);
      }
    } catch {
      setMessages([]);
      setFiles({});
      setHasPartialMessage(false);
      onRestoreGenerationState?.(null);
    }
  }, [activeConversationId, resetProgress, setActiveConversationId, setFiles, setHasPartialMessage, setMessages, resetBlueprint, onRestoreModel, onRestoreGenerationState]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await service.remove(id);

    if (activeConversationId !== id) return;

    setActiveConversationId(null);
    setMessages([]);
    setFiles({});
    resetProgress();
    setHasPartialMessage(false);
    resetBlueprint?.();
    onRestoreGenerationState?.(null);
  }, [service, activeConversationId, resetProgress, setActiveConversationId, setFiles, setHasPartialMessage, setMessages, resetBlueprint, onRestoreGenerationState]);

  return {
    handleCreateConversation,
    handleSelectConversation,
    handleDeleteConversation,
  };
}
