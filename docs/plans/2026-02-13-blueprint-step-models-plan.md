# Blueprint Per-Step Model Selection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to assign independent provider+model overrides to each blueprint generation step (planning, components, pages) via the Settings dialog, falling back to the main header model when no override is set.

**Architecture:** A new `useBlueprintModelConfig` hook manages per-step overrides in localStorage. `useBlueprintGeneration` changes from accepting a single `provider`+`model` to accepting a `resolveStepModel` function that returns the correct provider+model per step. The Settings dialog gets a new "Blueprint Models" section with 3 override rows. API routes remain unchanged.

**Tech Stack:** React hooks, localStorage, shadcn/ui Select components, existing provider registry.

---

### Task 1: Create the `useBlueprintModelConfig` hook

**Files:**
- Create: `src/features/settings/use-blueprint-model-config.ts`

**Step 1: Create the hook file**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export type BlueprintStep = 'planning' | 'components' | 'pages';

export interface StepModelOverride {
  provider: string;
  model: string;
}

export type BlueprintStepModels = Record<BlueprintStep, StepModelOverride | null>;

const STORAGE_KEY = 'ai-builder:blueprint-step-models';

const DEFAULT_CONFIG: BlueprintStepModels = {
  planning: null,
  components: null,
  pages: null,
};

function loadConfig(): BlueprintStepModels {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface ProviderInfo {
  name: string;
  models: Array<{ id: string }>;
}

export function useBlueprintModelConfig(availableProviders: ProviderInfo[]) {
  const [config, setConfig] = useState<BlueprintStepModels>(loadConfig);

  // Persist to localStorage on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore localStorage errors
    }
  }, [config]);

  const setStepModel = useCallback((step: BlueprintStep, override: StepModelOverride) => {
    setConfig((prev) => ({ ...prev, [step]: override }));
  }, []);

  const clearStepModel = useCallback((step: BlueprintStep) => {
    setConfig((prev) => ({ ...prev, [step]: null }));
  }, []);

  // Resolve a step's model: use override if valid, otherwise fall back to main model
  const resolveStepModel = useCallback(
    (step: BlueprintStep, mainProvider: string, mainModel: string) => {
      const override = config[step];
      if (!override) return { provider: mainProvider, model: mainModel };

      // Validate override provider+model still exist
      const providerData = availableProviders.find((p) => p.name === override.provider);
      if (!providerData) return { provider: mainProvider, model: mainModel };

      const modelExists = providerData.models.some((m) => m.id === override.model);
      if (!modelExists) return { provider: mainProvider, model: mainModel };

      return { provider: override.provider, model: override.model };
    },
    [config, availableProviders],
  );

  return { config, setStepModel, clearStepModel, resolveStepModel };
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `use-blueprint-model-config.ts`

**Step 3: Commit**

```bash
git add src/features/settings/use-blueprint-model-config.ts
git commit -m "feat: add useBlueprintModelConfig hook for per-step model overrides"
```

---

### Task 2: Update `useBlueprintGeneration` to accept per-step model resolution

**Files:**
- Modify: `src/hooks/useBlueprintGeneration.ts`

**Step 1: Change the options interface**

Replace the `provider` and `model` fields in `UseBlueprintGenerationOptions` with a `resolveStepModel` function:

```ts
// Old:
interface UseBlueprintGenerationOptions {
  provider: string | null;
  model: string | null;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  onFilesReady: (files: ProjectFiles) => void;
}

// New:
interface UseBlueprintGenerationOptions {
  resolveStepModel: (step: 'planning' | 'components' | 'pages') => {
    provider: string;
    model: string;
  } | null;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  onFilesReady: (files: ProjectFiles) => void;
}
```

**Step 2: Update `generateBlueprint`**

Replace the `provider`/`model` guard and body construction. Change `if (!provider || !model)` to:

```ts
const stepModel = resolveStepModel('planning');
if (!stepModel) {
  setError('No provider or model selected');
  setPhase('error');
  return;
}
```

Then in the fetch body, replace `provider, model,` with `provider: stepModel.provider, model: stepModel.model,`.

Remove `provider` and `model` from the `useCallback` dependency array, replace with `resolveStepModel`.

**Step 3: Update `generateComponents`**

Same pattern — resolve `'components'` step:

```ts
const stepModel = resolveStepModel('components');
if (!stepModel) { ... }
```

Update fetch body and useCallback deps.

**Step 4: Update `generatePages`**

Same pattern — resolve `'pages'` step:

```ts
const stepModel = resolveStepModel('pages');
if (!stepModel) { ... }
```

Remove `provider` and `model` from the destructured options. Remove them from useCallback deps on all three functions, replace with `resolveStepModel`.

**Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Errors in `Builder.tsx` (expected — it still passes old props). No errors in `useBlueprintGeneration.ts` itself.

**Step 6: Commit**

```bash
git add src/hooks/useBlueprintGeneration.ts
git commit -m "feat: useBlueprintGeneration accepts resolveStepModel function"
```

---

### Task 3: Wire `useBlueprintModelConfig` into Builder.tsx

**Files:**
- Modify: `src/components/Builder.tsx`

**Step 1: Import the new hook**

Add import:
```ts
import { useBlueprintModelConfig } from '@/features/settings/use-blueprint-model-config';
```

**Step 2: Initialize the hook**

After the `useModelSelection` call (around line 110), add:

```ts
const {
  config: blueprintModelConfig,
  setStepModel: setBlueprintStepModel,
  clearStepModel: clearBlueprintStepModel,
  resolveStepModel: resolveRawStepModel,
} = useBlueprintModelConfig(availableProviders);
```

**Step 3: Create a bound resolver**

Create a resolver that binds the main model as fallback, returning `null` when no model is available at all:

```ts
const resolveBlueprintStepModel = useCallback(
  (step: 'planning' | 'components' | 'pages') => {
    if (!effectiveSelectedProvider || !effectiveSelectedModel) return null;
    return resolveRawStepModel(step, effectiveSelectedProvider, effectiveSelectedModel);
  },
  [resolveRawStepModel, effectiveSelectedProvider, effectiveSelectedModel],
);
```

Add `import { useCallback } from 'react'` if not already present (it is — line 1).

**Step 4: Update `useBlueprintGeneration` call**

Change the options from `provider`/`model` to `resolveStepModel`:

```ts
// Old:
useBlueprintGeneration({
  provider: effectiveSelectedProvider,
  model: effectiveSelectedModel,
  savedTimeZone: getSavedTimeZone(),
  browserTimeZone: getBrowserTimeZone(),
  onFilesReady: setFiles,
});

// New:
useBlueprintGeneration({
  resolveStepModel: resolveBlueprintStepModel,
  savedTimeZone: getSavedTimeZone(),
  browserTimeZone: getBrowserTimeZone(),
  onFilesReady: setFiles,
});
```

**Step 5: Pass config to SettingsDialog**

Update the `SettingsDialog` usage (line 662) to pass the new props:

```tsx
<SettingsDialog
  open={settingsOpen}
  onOpenChange={setSettingsOpen}
  onKeysChanged={refetch}
  availableProviders={availableProviders}
  blueprintModelConfig={blueprintModelConfig}
  onSetBlueprintStepModel={setBlueprintStepModel}
  onClearBlueprintStepModel={clearBlueprintStepModel}
/>
```

**Step 6: Verify TypeScript**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Errors in `SettingsDialog.tsx` (expected — new props not yet accepted). No errors in `Builder.tsx`.

**Step 7: Commit**

```bash
git add src/components/Builder.tsx
git commit -m "feat: wire blueprint model config into Builder"
```

---

### Task 4: Add Blueprint Models section to SettingsDialog

**Files:**
- Modify: `src/components/SettingsDialog.tsx`

**Step 1: Update the props interface**

Add the new props to `SettingsDialogProps`:

```ts
import type { BlueprintStep, BlueprintStepModels, StepModelOverride } from '@/features/settings/use-blueprint-model-config';

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
```

**Step 2: Add the Blueprint Models section**

Below the existing API Keys provider rows `</div>` (after line 75), add a new section. Use `Separator` from shadcn and the existing `Select` components:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
```

Add after the providers list div:

```tsx
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
```

**Step 3: Define the steps constant and the row component**

Above the `SettingsDialog` component, add:

```tsx
const BLUEPRINT_STEPS: Array<{ key: BlueprintStep; label: string; description: string }> = [
  { key: 'planning', label: 'Planning', description: 'Site structure & design system' },
  { key: 'components', label: 'Components', description: 'Shared header & footer' },
  { key: 'pages', label: 'Pages', description: 'Individual page HTML' },
];

function BlueprintStepRow({
  step,
  label,
  description,
  override,
  availableProviders,
  onSet,
  onClear,
}: {
  step: BlueprintStep;
  label: string;
  description: string;
  override: StepModelOverride | null;
  availableProviders: Array<{ name: string; models: Array<{ id: string; name: string }> }>;
  onSet: (o: StepModelOverride) => void;
  onClear: () => void;
}) {
  if (!override) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const first = availableProviders[0];
            if (first?.models[0]) {
              onSet({ provider: first.name, model: first.models[0].id });
            }
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
          <p className="text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={override.provider}
          onValueChange={(v) => {
            const provider = availableProviders.find((p) => p.name === v);
            onSet({ provider: v, model: provider?.models[0]?.id ?? '' });
          }}
        >
          <SelectTrigger size="sm" className="h-7 text-xs w-[140px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((p) => (
              <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={override.model}
          onValueChange={(v) => onSet({ ...override, model: v })}
        >
          <SelectTrigger size="sm" className="h-7 text-xs flex-1">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

Add the `Button` import if not already present:
```ts
import { Button } from '@/components/ui/button';
```

**Step 4: Verify TypeScript**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean build, no errors.

**Step 5: Verify visually**

Run: `npm run dev`
Open Settings dialog. The "Blueprint Models" section should appear below API Keys with 3 rows showing "Override" buttons. Clicking Override should show provider+model dropdowns. Clicking Reset should clear back to "Using main model" state.

**Step 6: Commit**

```bash
git add src/components/SettingsDialog.tsx
git commit -m "feat: add Blueprint Models section to Settings dialog"
```

---

### Task 5: Verify end-to-end and clean up

**Files:**
- Verify: all modified files

**Step 1: Full TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: Clean build.

**Step 2: Lint check**

Run: `npm run lint`
Expected: No new errors.

**Step 3: Manual end-to-end test**

1. Open the app, select a main model (e.g., Claude Sonnet)
2. Open Settings, set blueprint Planning step to a different model (e.g., Gemini Flash)
3. Leave Components and Pages unset (should fall back to main model)
4. Enable Blueprint mode, submit a multi-page prompt
5. Verify: Planning step uses the overridden model (check network request body in DevTools)
6. Verify: Components and Pages steps use the main model
7. Close and reopen browser — verify overrides persist from localStorage

**Step 4: Test fallback behavior**

1. Set an override to a provider, then remove that provider's API key in Settings
2. Trigger blueprint generation
3. Verify: the step falls back to the main model (no error)

**Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: clean up blueprint step models implementation"
```
