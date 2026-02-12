'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { BuildProgress } from '@/components/BuildProgress';
import { ChatMessage } from '@/components/ChatMessage';
import { ExamplePrompts } from '@/components/ExamplePrompts';
import type { BuildProgressState } from '@/hooks/useBuildProgress';

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  showExamplePrompts: boolean;
  onExampleSelect: (prompt: string) => void;
  buildProgress?: BuildProgressState;
}

export function MessageList({
  messages,
  isLoading,
  showExamplePrompts,
  onExampleSelect,
  buildProgress,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex flex-col">
      {showExamplePrompts && messages.length === 0 ? (
        <ExamplePrompts onSelect={onExampleSelect} />
      ) : (
        <div className="flex flex-col">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isPartial={'isPartial' in message && !!(message as UIMessage & { isPartial?: boolean }).isPartial}
            />
          ))}

          {isLoading && (
            buildProgress?.isActive ? (
              <BuildProgress progress={buildProgress} />
            ) : (
              <div className="flex gap-3 px-4 py-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <div className="flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
