'use client';

import { useEffect } from 'react';
import { Loader2, Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProviderKeyRow } from '@/features/settings/provider-key-row';
import { useProviderKeys } from '@/features/settings/use-provider-keys';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeysChanged: () => void;
}

export function SettingsDialog({ open, onOpenChange, onKeysChanged }: SettingsDialogProps) {
  const {
    providers,
    loading,
    inputs,
    visible,
    saving,
    deleting,
    setInputs,
    setVisible,
    fetchStatus,
    resetViewState,
    handleSave,
    handleDelete,
  } = useProviderKeys(onKeysChanged);

  useEffect(() => {
    if (!open) return;
    fetchStatus();
    resetViewState();
  }, [open, fetchStatus, resetViewState]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            API Keys
          </DialogTitle>
          <DialogDescription>
            Configure API keys for each provider. Keys stored in .env take priority over saved keys.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {providers.map((provider) => (
              <ProviderKeyRow
                key={provider.provider}
                provider={provider}
                input={inputs[provider.provider] ?? ''}
                isVisible={!!visible[provider.provider]}
                isSaving={!!saving[provider.provider]}
                isDeleting={!!deleting[provider.provider]}
                onInputChange={(value) => setInputs((state) => ({ ...state, [provider.provider]: value }))}
                onToggleVisibility={() => setVisible((state) => ({ ...state, [provider.provider]: !state[provider.provider] }))}
                onSave={() => handleSave(provider.provider)}
                onDelete={() => handleDelete(provider.provider)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
