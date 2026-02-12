'use client';

import { Eye, EyeOff, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProviderStatus } from '@/features/settings/use-provider-keys';

interface ProviderKeyRowProps {
  provider: ProviderStatus;
  input: string;
  isVisible: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onInputChange: (value: string) => void;
  onToggleVisibility: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function ProviderKeyRow({
  provider,
  input,
  isVisible,
  isSaving,
  isDeleting,
  onInputChange,
  onToggleVisibility,
  onSave,
  onDelete,
}: ProviderKeyRowProps) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{provider.name}</span>
        <StatusBadge status={provider.status} />
      </div>

      {provider.maskedKey && (
        <p className="font-mono text-xs text-muted-foreground">{provider.maskedKey}</p>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={isVisible ? 'text' : 'password'}
            placeholder={provider.status === 'not_configured' ? 'Enter API key' : 'Enter new key to update'}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            className="h-8 pr-8 text-xs"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={onToggleVisibility}
          >
            {isVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>

        <Button
          size="sm"
          className="h-8 gap-1"
          disabled={!input.trim() || isSaving}
          onClick={onSave}
        >
          {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
          Save
        </Button>

        {provider.status === 'db' && (
          <Button
            size="sm"
            variant="destructive"
            className="h-8 gap-1"
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'env' | 'db' | 'not_configured' }) {
  if (status === 'env') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
        env
      </span>
    );
  }

  if (status === 'db') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
        saved
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      not configured
    </span>
  );
}
