'use client';

import { MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
}

interface ConversationItemProps {
  conversation: Conversation;
  activeId: string | null;
  editingId: string | null;
  editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (conversation: Conversation) => void;
  onEditValueChange: (value: string) => void;
  onSubmitRename: (id: string) => void;
  onRenameKeyDown: (event: React.KeyboardEvent, id: string) => void;
}

export function ConversationItem({
  conversation,
  activeId,
  editingId,
  editValue,
  inputRef,
  onSelect,
  onDelete,
  onStartEdit,
  onEditValueChange,
  onSubmitRename,
  onRenameKeyDown,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        activeId === conversation.id
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent/50',
      )}
      onClick={() => onSelect(conversation.id)}
      onDoubleClick={() => onStartEdit(conversation)}
    >
      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />

      {editingId === conversation.id ? (
        <input
          ref={inputRef}
          className="flex-1 rounded bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-ring"
          value={editValue}
          onChange={(event) => onEditValueChange(event.target.value)}
          onBlur={() => onSubmitRename(conversation.id)}
          onKeyDown={(event) => onRenameKeyDown(event, conversation.id)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span className="flex-1 break-words">{conversation.title}</span>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(conversation.id);
        }}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}
