'use client';

import { Menu, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/ModelSelector';

interface PromptHeaderProps {
  provider: string | null;
  model: string | null;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  availableProviders: Array<{
    name: string;
    models: Array<{ id: string; name: string }>;
  }>;
  onOpenSettings: () => void;
  onOpenConversations: () => void;
}

export function PromptHeader({
  provider,
  model,
  onProviderChange,
  onModelChange,
  availableProviders,
  onOpenSettings,
  onOpenConversations,
}: PromptHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onOpenConversations} title="Conversations">
          <Menu className="size-4" />
        </Button>
        <ModelSelector
          provider={provider}
          model={model}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          availableProviders={availableProviders}
        />
        <Button variant="ghost" size="icon-xs" onClick={onOpenSettings} title="Settings">
          <Settings className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
