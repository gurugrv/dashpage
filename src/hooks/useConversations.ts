'use client';
import { useState, useEffect, useCallback } from 'react';

interface Conversation {
  id: string;
  title: string;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const create = useCallback(async (title?: string) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    setConversations(prev => [data.conversation, ...prev]);
    return data.conversation as Conversation;
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, title } : c))
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
  }, []);

  const updateModel = useCallback(async (id: string, provider: string, model: string) => {
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    });
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, provider, model } : c))
    );
  }, []);

  return { conversations, create, rename, remove, updateModel, isLoading, refetch: fetchConversations };
}
