'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface ProviderStatus {
  provider: string;
  name: string;
  status: 'env' | 'db' | 'not_configured';
  maskedKey: string | null;
}

export function useProviderKeys(onKeysChanged: () => void) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/keys');
      const data = await res.json();
      setProviders(data);
    } catch {
      toast.error('Failed to load API key status');
    } finally {
      setLoading(false);
    }
  }, []);

  const resetViewState = useCallback(() => {
    setInputs({});
    setVisible({});
  }, []);

  const handleSave = useCallback(async (provider: string) => {
    const key = inputs[provider]?.trim();
    if (!key) return;

    setSaving((state) => ({ ...state, [provider]: true }));
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${provider} API key saved`);
      setInputs((state) => ({ ...state, [provider]: '' }));
      await fetchStatus();
      onKeysChanged();
    } catch {
      toast.error(`Failed to save ${provider} key`);
    } finally {
      setSaving((state) => ({ ...state, [provider]: false }));
    }
  }, [fetchStatus, inputs, onKeysChanged]);

  const handleDelete = useCallback(async (provider: string) => {
    setDeleting((state) => ({ ...state, [provider]: true }));
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${provider} API key removed`);
      await fetchStatus();
      onKeysChanged();
    } catch {
      toast.error(`Failed to remove ${provider} key`);
    } finally {
      setDeleting((state) => ({ ...state, [provider]: false }));
    }
  }, [fetchStatus, onKeysChanged]);

  return {
    providers,
    loading,
    inputs,
    visible,
    saving,
    deleting,
    setInputs,
    setVisible,
    fetchStatus,
    resetViewState,
    handleSave,
    handleDelete,
  };
}
