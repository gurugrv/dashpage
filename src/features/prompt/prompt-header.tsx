'use client';

import { LayoutGrid, Menu, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ModelSelector } from '@/components/ModelSelector';
import { cn } from '@/lib/utils';

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
  blueprintMode?: boolean;
  onBlueprintModeChange?: (enabled: boolean) => void;
  isBlueprintBusy?: boolean;
}

export function PromptHeader({
  provider,
  model,
  onProviderChange,
  onModelChange,
  availableProviders,
  onOpenSettings,
  onOpenConversations,
  blueprintMode,
  onBlueprintModeChange,
  isBlueprintBusy,
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
        {onBlueprintModeChange && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={blueprintMode ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  onClick={() => onBlueprintModeChange(!blueprintMode)}
                  disabled={isBlueprintBusy}
                  className={cn(blueprintMode && 'ring-1 ring-primary/40')}
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Multi-page Blueprint mode</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
