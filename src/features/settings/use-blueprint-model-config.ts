'use client';

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlueprintStep = 'planning' | 'research' | 'components' | 'pages';

export interface StepModelOverride {
  provider: string;
  model: string;
}

export type BlueprintStepModels = Record<BlueprintStep, StepModelOverride | null>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'ai-builder:blueprint-step-models';

const DEFAULT_CONFIG: BlueprintStepModels = {
  planning: null,
  research: null,
  components: null,
  pages: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfig(): BlueprintStepModels {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;

    const parsed = JSON.parse(raw) as Partial<BlueprintStepModels>;
    return {
      planning: parsed.planning ?? null,
      research: parsed.research ?? null,
      components: parsed.components ?? null,
      pages: parsed.pages ?? null,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface ProviderInfo {
  name: string;
  models: Array<{ id: string; maxOutputTokens?: number }>;
}

export function useBlueprintModelConfig(availableProviders: ProviderInfo[]) {
  const [config, setConfig] = useState<BlueprintStepModels>(loadConfig);

  // Persist to localStorage whenever config changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore localStorage errors (quota, SSR, etc.)
    }
  }, [config]);

  const setStepModel = useCallback(
    (step: BlueprintStep, override: StepModelOverride) => {
      setConfig((prev) => ({ ...prev, [step]: override }));
    },
    [],
  );

  const clearStepModel = useCallback((step: BlueprintStep) => {
    setConfig((prev) => ({ ...prev, [step]: null }));
  }, []);

  const resolveStepModel = useCallback(
    (
      step: BlueprintStep,
      mainProvider: string,
      mainModel: string,
    ): { provider: string; model: string; maxOutputTokens?: number } => {
      const override = config[step];
      if (!override) {
        const mainProv = availableProviders.find((p) => p.name === mainProvider);
        const mainMod = mainProv?.models.find((m) => m.id === mainModel);
        return { provider: mainProvider, model: mainModel, maxOutputTokens: mainMod?.maxOutputTokens };
      }

      // Validate that the override provider and model still exist
      const provider = availableProviders.find(
        (p) => p.name === override.provider,
      );
      if (!provider) {
        const mainProv = availableProviders.find((p) => p.name === mainProvider);
        const mainMod = mainProv?.models.find((m) => m.id === mainModel);
        return { provider: mainProvider, model: mainModel, maxOutputTokens: mainMod?.maxOutputTokens };
      }

      const modelInfo = provider.models.find(
        (m) => m.id === override.model,
      );
      if (!modelInfo) {
        const mainProv = availableProviders.find((p) => p.name === mainProvider);
        const mainMod = mainProv?.models.find((m) => m.id === mainModel);
        return { provider: mainProvider, model: mainModel, maxOutputTokens: mainMod?.maxOutputTokens };
      }

      return { provider: override.provider, model: override.model, maxOutputTokens: modelInfo.maxOutputTokens };
    },
    [config, availableProviders],
  );

  return {
    config,
    setStepModel,
    clearStepModel,
    resolveStepModel,
  };
}
