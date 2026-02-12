'use client';

import { useCallback, useMemo, useState } from 'react';

interface ProviderInfo {
  name: string;
  models: Array<{ id: string; maxOutputTokens: number }>;
}

export function useModelSelection(availableProviders: ProviderInfo[]) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const effectiveSelectedProvider = useMemo(
    () => selectedProvider ?? availableProviders[0]?.name ?? null,
    [selectedProvider, availableProviders],
  );

  const effectiveSelectedModel = useMemo(() => (
    selectedModel
    ?? availableProviders.find((provider) => provider.name === effectiveSelectedProvider)?.models[0]?.id
    ?? null
  ), [selectedModel, effectiveSelectedProvider, availableProviders]);

  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
    const providerData = availableProviders.find((item) => item.name === provider);
    if (providerData?.models[0]) {
      setSelectedModel(providerData.models[0].id);
    }
  }, [availableProviders]);

  const resolveMaxOutputTokens = useCallback(() => {
    const providerData = availableProviders.find((provider) => provider.name === effectiveSelectedProvider);
    const modelInfo = providerData?.models.find((model) => model.id === effectiveSelectedModel);
    return modelInfo?.maxOutputTokens;
  }, [availableProviders, effectiveSelectedProvider, effectiveSelectedModel]);

  return {
    selectedProvider,
    selectedModel,
    setSelectedModel,
    effectiveSelectedProvider,
    effectiveSelectedModel,
    handleProviderChange,
    resolveMaxOutputTokens,
  };
}
