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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ProviderKeyRow } from '@/features/settings/provider-key-row';
import { useProviderKeys } from '@/features/settings/use-provider-keys';
import type {
  BlueprintStep,
  BlueprintStepModels,
  StepModelOverride,
} from '@/features/settings/use-blueprint-model-config';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeysChanged: () => void;
  availableProviders: Array<{
    name: string;
    models: Array<{ id: string; name: string }>;
  }>;
  blueprintModelConfig: BlueprintStepModels;
  onSetBlueprintStepModel: (step: BlueprintStep, override: StepModelOverride) => void;
  onClearBlueprintStepModel: (step: BlueprintStep) => void;
}

// ---------------------------------------------------------------------------
// Blueprint step definitions
// ---------------------------------------------------------------------------

const BLUEPRINT_STEPS: Array<{ key: BlueprintStep; label: string; description: string }> = [
  { key: 'planning', label: 'Planning', description: 'Site structure & design system' },
  { key: 'components', label: 'Components', description: 'Shared header & footer' },
  { key: 'pages', label: 'Pages', description: 'Individual page HTML' },
];

// ---------------------------------------------------------------------------
// BlueprintStepRow
// ---------------------------------------------------------------------------

interface BlueprintStepRowProps {
  step: BlueprintStep;
  label: string;
  description: string;
  override: StepModelOverride | null;
  availableProviders: Array<{ name: string; models: Array<{ id: string; name: string }> }>;
  onSet: (o: StepModelOverride) => void;
  onClear: () => void;
}

function BlueprintStepRow({
  label,
  description,
  override,
  availableProviders,
  onSet,
  onClear,
}: BlueprintStepRowProps) {
  if (!override) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            const first = availableProviders[0];
            if (!first) return;
            onSet({ provider: first.name, model: first.models[0]?.id ?? '' });
          }}
        >
          Override
        </Button>
      </div>
    );
  }

  const selectedProvider = availableProviders.find((p) => p.name === override.provider);
  const models = selectedProvider?.models ?? [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={override.provider}
          onValueChange={(value) => {
            const provider = availableProviders.find((p) => p.name === value);
            onSet({ provider: value, model: provider?.models[0]?.id ?? '' });
          }}
        >
          <SelectTrigger className="w-[140px] text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((p) => (
              <SelectItem key={p.name} value={p.name} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={override.model}
          onValueChange={(value) => {
            onSet({ provider: override.provider, model: value });
          }}
        >
          <SelectTrigger className="flex-1 text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsDialog
// ---------------------------------------------------------------------------

export function SettingsDialog({
  open,
  onOpenChange,
  onKeysChanged,
  availableProviders,
  blueprintModelConfig,
  onSetBlueprintStepModel,
  onClearBlueprintStepModel,
}: SettingsDialogProps) {
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
          <>
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

            <Separator className="my-2" />

            <div>
              <h3 className="text-sm font-medium mb-1">Blueprint Models</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Override the model used for each blueprint step. Unset steps use the main model.
              </p>
              <div className="space-y-3">
                {BLUEPRINT_STEPS.map(({ key, label, description }) => {
                  const override = blueprintModelConfig[key];
                  return (
                    <BlueprintStepRow
                      key={key}
                      step={key}
                      label={label}
                      description={description}
                      override={override}
                      availableProviders={availableProviders}
                      onSet={(o) => onSetBlueprintStepModel(key, o)}
                      onClear={() => onClearBlueprintStepModel(key)}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
