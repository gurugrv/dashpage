# Blueprint Per-Step Model Selection

## Problem

Blueprint mode uses the same provider+model for all 3 AI-powered steps (planning, components, pages). Users should be able to assign a different provider+model to each step — e.g., a cheap model for planning and a premium model for page generation.

## Design

### Steps That Support Override

| Step key | Label | What it does |
|---|---|---|
| `planning` | Planning | Generates site blueprint JSON (structure, design system) |
| `components` | Components | Generates shared header & footer HTML |
| `pages` | Pages | Generates each page's full HTML |

### Data Model

```ts
interface StepModelOverride {
  provider: string;
  model: string;
}

interface BlueprintStepModels {
  planning: StepModelOverride | null;
  components: StepModelOverride | null;
  pages: StepModelOverride | null;
}
```

When a step's override is `null`, it falls back to the main model selected in the header dropdown.

### Storage

localStorage key: `ai-builder:blueprint-step-models`. JSON-serialized `BlueprintStepModels`. No DB changes needed — API routes already accept `provider`+`model` per request.

### Hook: `useBlueprintModelConfig`

Location: `src/features/settings/use-blueprint-model-config.ts`

Responsibilities:
- Read/write `BlueprintStepModels` from localStorage
- Expose `resolveStepModel(step, mainProvider, mainModel)` — returns the override if set and its provider is still available, otherwise returns main provider+model
- Expose `setStepModel(step, override)` and `clearStepModel(step)`
- Validate overrides against `availableProviders` (clear stale overrides for removed providers)

### Settings Dialog Changes

Add a "Blueprint Models" section below the existing "API Keys" section in `SettingsDialog`. Three rows, one per step:

- Each row shows the step label + description
- When unset: muted "Using main model" text + an "Override" button
- When set: provider dropdown + model dropdown + a "Reset" button to clear
- Reuses the same `Select` component pattern from `ModelSelector`

`SettingsDialog` needs `availableProviders` threaded from Builder (new prop).

### Client Flow Changes

`useBlueprintGeneration` options change from `{ provider, model }` to accept a `resolveStepModel` function:

```
resolveStepModel: (step: 'planning' | 'components' | 'pages') => { provider: string; model: string }
```

Each of the 3 API calls (`generateBlueprint`, `generateComponents`, `generatePages`) calls `resolveStepModel` with its step key to get the provider+model for that request.

Builder.tsx wires this up by combining `useBlueprintModelConfig.resolveStepModel` with the main `effectiveSelectedProvider`/`effectiveSelectedModel` as fallback.

### API Route Changes

None. Each route already accepts independent `provider` and `model` in the request body.

### Resume Support

`resumeFromState` also needs access to `resolveStepModel` since it calls `generateComponents` and `generatePages` internally. The same function is used — no special handling needed.
