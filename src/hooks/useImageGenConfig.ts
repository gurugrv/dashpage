'use client';

import { useCallback, useState } from 'react';

export type ImageProvider = 'pexels' | 'together';

export interface ImageGenConfig {
  provider: ImageProvider;
  model: string;
}

export const IMAGE_GEN_MODELS = [
  { id: 'Rundiffusion/Juggernaut-Lightning-Flux', name: 'Juggernaut Lightning (Cheapest)', price: '~$0.002/img' },
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX Schnell (Fast)', price: '~$0.003/img' },
  { id: 'black-forest-labs/FLUX.1-dev', name: 'FLUX Dev (Balanced)', price: '~$0.025/img' },
  { id: 'black-forest-labs/FLUX.1.1-pro', name: 'FLUX 1.1 Pro (Best)', price: '~$0.04/img' },
] as const;

const STORAGE_KEY = 'ai-builder:image-gen-config';

const DEFAULT_CONFIG: ImageGenConfig = {
  provider: 'pexels',
  model: 'black-forest-labs/FLUX.1-dev',
};

function loadConfig(): ImageGenConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    if (parsed.provider !== 'pexels' && parsed.provider !== 'together') return DEFAULT_CONFIG;
    if (typeof parsed.model !== 'string') return DEFAULT_CONFIG;
    return parsed;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: ImageGenConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useImageGenConfig() {
  const [config, setConfigState] = useState<ImageGenConfig>(loadConfig);

  const setConfig = useCallback((update: Partial<ImageGenConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...update };
      saveConfig(next);
      return next;
    });
  }, []);

  return { config, setConfig };
}
