'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { Loader2 } from 'lucide-react';
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
  blueprintLoading?: boolean;
}

const BLUEPRINT_PHASES = [
  'Analyzing requirements...',
  'Evaluating design patterns...',
  'Planning page structure...',
  'Defining color palette...',
  'Selecting components...',
  'Organizing navigation flow...',
  'Mapping content layout...',
  'Choosing typography...',
  'Structuring visual hierarchy...',
  'Refining section order...',
  'Optimizing responsive layout...',
  'Finalizing blueprint...',
];

function BlueprintLoadingIndicator() {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx((prev) => (prev + 1) % BLUEPRINT_PHASES.length);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Loader2 className="size-3.5 animate-spin text-primary" />
      </div>
      <div className="flex items-center gap-2">
        <span
          key={phaseIdx}
          className="text-sm text-muted-foreground"
          style={{ animation: 'fadeSlideIn 0.35s ease-out' }}
        >
          {BLUEPRINT_PHASES[phaseIdx]}
        </span>
      </div>
    </div>
  );
}

function WaveDots() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted">
        <div className="flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-[5px] rounded-full bg-muted-foreground"
              style={{
                animation: 'dotWave 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  isLoading,
  showExamplePrompts,
  onExampleSelect,
  buildProgress,
  blueprintLoading,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (!isLoading) scrollToBottom(); }, [isLoading, scrollToBottom]);

  return (
    <div className="flex flex-col">
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

          {blueprintLoading && <BlueprintLoadingIndicator />}

          {isLoading && !blueprintLoading && (
            buildProgress?.isActive ? (
              <BuildProgress progress={buildProgress} />
            ) : (
              <WaveDots />
            )
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
