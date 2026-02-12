'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConversationItem } from '@/features/conversations/conversation-item';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  open,
  onClose,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingId || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [editingId]);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  function handleRenameSubmit(id: string) {
    const trimmed = editValue.trim();
    const current = conversations.find((conversation) => conversation.id === id)?.title;
    if (trimmed && trimmed !== current) {
      onRename(id, trimmed);
    }
    setEditingId(null);
  }

  function handleRenameKeyDown(event: React.KeyboardEvent, id: string) {
    if (event.key === 'Enter') {
      handleRenameSubmit(id);
    } else if (event.key === 'Escape') {
      setEditingId(null);
    }
  }

  function handleSelect(id: string) {
    onSelect(id);
    onClose();
  }

  function handleCreate() {
    onCreate();
    onClose();
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-background shadow-xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-medium">Conversations</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={handleCreate} title="New Chat">
              <Plus className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {conversations.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No conversations yet</p>
            )}

            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                activeId={activeId}
                editingId={editingId}
                editValue={editValue}
                inputRef={inputRef}
                onSelect={handleSelect}
                onDelete={onDelete}
                onStartEdit={(item) => {
                  setEditingId(item.id);
                  setEditValue(item.title);
                }}
                onEditValueChange={setEditValue}
                onSubmitRename={handleRenameSubmit}
                onRenameKeyDown={handleRenameKeyDown}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
