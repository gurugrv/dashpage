'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, Settings, Key, Cpu, Check, ChevronDown, Search, X, ImageIcon } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProviderKeyRow } from '@/features/settings/provider-key-row';
import { useProviderKeys } from '@/features/settings/use-provider-keys';
import type {
  BlueprintStep,
  BlueprintStepModels,
  StepModelOverride,
} from '@/features/settings/use-blueprint-model-config';
import { ImageGenSettings } from '@/features/settings/image-gen-settings';
import type { ImageGenConfig } from '@/hooks/useImageGenConfig';
import { cn } from '@/lib/utils';

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
  imageGenConfig: ImageGenConfig;
  onImageGenConfigChange: (update: Partial<ImageGenConfig>) => void;
}

// ---------------------------------------------------------------------------
// Blueprint step definitions
// ---------------------------------------------------------------------------

const BLUEPRINT_STEPS: Array<{ key: BlueprintStep; label: string; description: string }> = [
  { key: 'discovery', label: 'Discovery', description: 'Business profile questionnaire' },
  { key: 'planning', label: 'Planning', description: 'Site structure & design system' },
  { key: 'research', label: 'Research', description: 'Business facts lookup' },
  { key: 'components', label: 'Components', description: 'Shared header & footer' },
  { key: 'pages', label: 'Pages', description: 'Individual page HTML' },
];

// ---------------------------------------------------------------------------
// SearchableSelect component
// ---------------------------------------------------------------------------

interface SearchableSelectProps {
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function SearchableSelect({ value, options, onChange, placeholder = 'Select...', className }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);
  
  const filteredOptions = search
    ? options.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.id.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleToggle = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearch('');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleToggle(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative flex-1', className)}>
      <button
        type="button"
        onClick={() => handleToggle(!open)}
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-xs text-left'
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
          {selectedOption?.name || placeholder}
        </span>
        <ChevronDown className="size-3.5 opacity-50 shrink-0" />
      </button>
      
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-hidden">
          <div className="flex items-center border-b px-2 py-1.5">
            <Search className="size-3.5 mr-2 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearch('');
                }}
                className="shrink-0"
              >
                <X className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No model found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-xs outline-none hover:bg-accent hover:text-accent-foreground',
                    option.id === value && 'bg-accent text-accent-foreground'
                  )}
                >
                  <span className="truncate flex-1 text-left">{option.name}</span>
                  {option.id === value && (
                    <Check className="absolute right-2 size-3.5 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
      <div className="flex items-center justify-between py-2">
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
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onClear}>
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
          <SelectTrigger className="w-32.5 text-xs h-8">
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

        <SearchableSelect
          value={override.model}
          options={models}
          onChange={(modelId) => onSet({ provider: override.provider, model: modelId })}
          placeholder="Search models..."
          className="flex-1"
        />
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
  imageGenConfig,
  onImageGenConfigChange,
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure API keys and blueprint model overrides.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-6 pb-6">
          <Tabs defaultValue="keys" className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-3 mb-4 shrink-0">
              <TabsTrigger value="keys" className="text-xs gap-1.5">
                <Key className="size-3.5" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="models" className="text-xs gap-1.5">
                <Cpu className="size-3.5" />
                Models
              </TabsTrigger>
              <TabsTrigger value="images" className="text-xs gap-1.5">
                <ImageIcon className="size-3.5" />
                Images
              </TabsTrigger>
            </TabsList>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <TabsContent value="keys" className="mt-0 flex-1 min-h-0 overflow-auto -mx-6 px-6">
                  <div className="space-y-3">
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
                </TabsContent>

                <TabsContent value="models" className="mt-0 flex-1 min-h-0 overflow-auto -mx-6 px-6">
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Override the model used for each blueprint step. Unset steps use the main model.
                    </p>
                    <div className="divide-y">
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
                </TabsContent>

                <TabsContent value="images" className="mt-0 flex-1 min-h-0 overflow-auto -mx-6 px-6">
                  <ImageGenSettings
                    config={imageGenConfig}
                    onChange={onImageGenConfigChange}
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
