'use client';
import { useState, useEffect, useCallback } from 'react';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  maxOutputTokens: number;
}

interface ProviderWithModels {
  name: string;
  models: ModelInfo[];
}

export function useModels() {
  const [availableProviders, setAvailableProviders] = useState<ProviderWithModels[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      setAvailableProviders(data.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return { availableProviders, isLoading, error, refetch: fetchModels };
}
