'use client';

import { Menu, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
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
        <Link href="/" className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted transition-colors">
          <div className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600">
            <Sparkles className="size-3 text-white" />
          </div>
          <span className="text-sm font-semibold hidden sm:inline">AI Builder</span>
        </Link>
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
