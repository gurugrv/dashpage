'use client'

import { User, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { UIMessage } from '@ai-sdk/react'
import { cn } from '@/lib/utils'
import { sanitizeAssistantMessage } from '@/lib/chat/sanitize-assistant-message'

interface ChatMessageProps {
  message: UIMessage
  isPartial?: boolean
}

function getTextContent(message: UIMessage): string {
  const textParts = message.parts?.filter(
    (p): p is { type: 'text'; text: string } => p.type === 'text'
  ) ?? []
  return textParts.map((p) => p.text).join('')
}

export function ChatMessage({ message, isPartial }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const rawText = getTextContent(message)
  const text = isUser ? rawText : sanitizeAssistantMessage(rawText)

  if (!text) return null

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_pre]:my-2 [&_code]:text-xs">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
        {isPartial && !isUser && (
          <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">(interrupted)</span>
        )}
      </div>
    </div>
  )
}
