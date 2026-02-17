'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface ProviderInfo {
  name: string;
  models: Array<{ id: string; maxOutputTokens: number }>;
}

const STORAGE_KEY_PROVIDER = 'ai-builder:last-provider';
const STORAGE_KEY_MODEL = 'ai-builder:last-model';

function getSavedSelection() {
  if (typeof window === 'undefined') return { provider: null, model: null };
  
  try {
    const savedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
    const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
    return { provider: savedProvider, model: savedModel };
  } catch {
    return { provider: null, model: null };
  }
}

export function useModelSelection(availableProviders: ProviderInfo[]) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(() => getSavedSelection().provider);
  const [selectedModel, setSelectedModel] = useState<string | null>(() => getSavedSelection().model);

  // Save selection to localStorage when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      if (selectedProvider) {
        localStorage.setItem(STORAGE_KEY_PROVIDER, selectedProvider);
      }
      if (selectedModel) {
        localStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [selectedProvider, selectedModel]);

  // Validate that saved selection still exists in available providers.
  // When a fallback is computed, update state/localStorage so they stay in sync.
  const effectiveSelectedProvider = useMemo(() => {
    if (availableProviders.length === 0) return selectedProvider;
    const provider = selectedProvider ?? availableProviders[0]?.name ?? null;
    if (provider && !availableProviders.find((p) => p.name === provider)) {
      return availableProviders[0]?.name ?? null;
    }
    return provider;
  }, [selectedProvider, availableProviders]);

  // Sync state when effective differs from selected (provider became unavailable)
  useEffect(() => {
    if (availableProviders.length > 0 && effectiveSelectedProvider && effectiveSelectedProvider !== selectedProvider) {
      setSelectedProvider(effectiveSelectedProvider);
    }
  }, [effectiveSelectedProvider, selectedProvider, availableProviders.length]);

  const effectiveSelectedModel = useMemo(() => {
    const provider = availableProviders.find((p) => p.name === effectiveSelectedProvider);
    const model = selectedModel ?? provider?.models[0]?.id ?? null;
    if (model && !provider?.models.find((m) => m.id === model)) {
      return provider?.models[0]?.id ?? null;
    }
    return model;
  }, [selectedModel, effectiveSelectedProvider, availableProviders]);

  // Sync state when effective differs from selected (model became unavailable)
  useEffect(() => {
    if (availableProviders.length > 0 && effectiveSelectedModel && effectiveSelectedModel !== selectedModel) {
      setSelectedModel(effectiveSelectedModel);
    }
  }, [effectiveSelectedModel, selectedModel, availableProviders.length]);

  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
    const providerData = availableProviders.find((item) => item.name === provider);
    if (providerData?.models[0]) {
      setSelectedModel(providerData.models[0].id);
    }
  }, [availableProviders]);

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
  }, []);

  const setModelForConversation = useCallback((provider: string | null, model: string | null) => {
    if (provider) {
      setSelectedProvider(provider);
    } else {
      // Reset to localStorage default
      const saved = getSavedSelection();
      setSelectedProvider(saved.provider);
    }
    if (model) {
      setSelectedModel(model);
    } else {
      const saved = getSavedSelection();
      setSelectedModel(saved.model);
    }
  }, []);

  const resolveMaxOutputTokens = useCallback(() => {
    const providerData = availableProviders.find((provider) => provider.name === effectiveSelectedProvider);
    const modelInfo = providerData?.models.find((model) => model.id === effectiveSelectedModel);
    return modelInfo?.maxOutputTokens;
  }, [availableProviders, effectiveSelectedProvider, effectiveSelectedModel]);

  return {
    selectedProvider,
    selectedModel,
    setSelectedModel: handleModelChange,
    setModelForConversation,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    handleProviderChange,
    resolveMaxOutputTokens,
  };
}
