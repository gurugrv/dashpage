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

  // Validate that saved selection still exists in available providers
  const effectiveSelectedProvider = useMemo(() => {
    const provider = selectedProvider ?? availableProviders[0]?.name ?? null;
    // If the saved provider is no longer available, fall back to first available
    if (provider && !availableProviders.find((p) => p.name === provider)) {
      return availableProviders[0]?.name ?? null;
    }
    return provider;
  }, [selectedProvider, availableProviders]);

  const effectiveSelectedModel = useMemo(() => {
    const provider = availableProviders.find((p) => p.name === effectiveSelectedProvider);
    const model = selectedModel ?? provider?.models[0]?.id ?? null;
    // If the saved model is no longer available for this provider, fall back to first available
    if (model && !provider?.models.find((m) => m.id === model)) {
      return provider?.models[0]?.id ?? null;
    }
    return model;
  }, [selectedModel, effectiveSelectedProvider, availableProviders]);

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
