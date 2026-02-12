# Multi-File Sites: Implementation Plan (Code-Aligned)

## Objective

Implement reliable multi-file generation and follow-up editing while preserving current single-file behavior and runtime contracts.

Must preserve:
- `ProjectFiles` as canonical artifact shape (`Record<string, string>`).
- `index.html` as required entrypoint for valid artifacts.
- Preview iframe sandbox: `allow-scripts allow-forms`.
- Parser strategy compatibility: `editOperations -> fileArtifact -> JSON files -> htmlOutput`.
- Auto-continuation full-replacement semantics (no partial merge of stale files).
- Assistant message sanitization before persistence.
- Partial resume behavior via `isPartial`.

## Current Runtime Reality (As Of 2026-02-12)

This section is the baseline for all implementation decisions.

1. Primary chat flow is `/api/chat`; it already performs server-side continuation segments when `finishReason === 'length'`.
2. Manual continue in UI sends a new user message through `/api/chat`, not `/api/chat/continue`.
3. `/api/chat/continue` and `useAutoContinue` exist but are not wired into the active Builder flow.
4. Prompt assembly currently receives only `currentHtml` (`currentFiles['index.html']`), not a full file map.
5. Parser and sanitizer currently support `<editOperations>` and `<htmlOutput>` only.
6. Attributed edit tag `<editOperations file="...">` is not supported today.
7. Partial/final persistence currently stores artifact only if `files['index.html']` exists.
8. Preview and download are currently `index.html`-only.

## Required Architectural Decisions

Decisions to lock before coding:

1. Continuation path
- Use `/api/chat` as the single continuation path (recommended).
- Keep `/api/chat/continue` only if explicitly wired and tested; otherwise remove to avoid split behavior.

2. Artifact validity gate
- Define one shared validator for parse->preview->persist.
- A "persistable artifact" must include `index.html`.
- Optional partial maps without `index.html` may be held in-memory during stream, but must not overwrite `lastValidFiles` or persisted artifact.

3. Multi-file scope (V2)
- Allowed root files only: `index.html`, `styles.css`, `app.js`.
- No nested paths in V2.
- No placeholder/compression syntax.

## Phase 1: Structured Parsing Compatibility (Ship First)

Goal: ensure display/parsing/progress do not break when new structured formats appear.

1. Add `FileArtifactExtractor`
- New file: `src/lib/parser/file-artifact-extractor.ts`.
- Streaming-safe extraction for `<fileArtifact><file path="..."></file>...</fileArtifact>`.
- Return shape: `{ files, explanation, isComplete, hasFileArtifactTag }`.
- Ignore malformed or empty paths.

2. Update parser triage in `useHtmlParser`
- File: `src/hooks/useHtmlParser.ts`.
- Order: edit ops -> fileArtifact -> JSON `{ files }` -> `<htmlOutput>`.
- During stream: update `currentFiles` when extraction yields parseable files.
- Completion: update `lastValidFiles` only when artifact passes validator.

3. Support attributed edit tags
- Files:
  - `src/lib/parser/edit-operations/types.ts`
  - `src/lib/parser/edit-operations/edit-stream-extractor.ts`
- Parse both `<editOperations>` and `<editOperations file="styles.css">`.
- Add `targetFile` to parse result, default `index.html`.

4. Update sanitization and chat display parser
- Files:
  - `src/lib/chat/sanitize-assistant-message.ts`
  - `src/lib/parser/assistant-stream-parser.ts`
- Strip and detect:
  - `<fileArtifact>...</fileArtifact>`
  - `<editOperations ...>...</editOperations>` (attribute-tolerant opener)
  - existing `<htmlOutput>` blocks.

5. Update build progress detector
- File: `src/lib/stream/build-progress-detector.ts`.
- Detect starts/ends for `<fileArtifact>` and attributed `<editOperations ...>`.
- Keep existing progress payload contract unless UI extension is required.

## Phase 2: Validation + Persistence Safety (Before Prompt Expansion)

Goal: prevent invalid partial artifacts from corrupting persisted state.

1. Add artifact validator
- New file suggested: `src/lib/parser/validate-artifact.ts`.
- Checks:
  - required `index.html` for persistable artifact,
  - allowed file names set for V2,
  - non-empty normalized paths,
  - max file count,
  - max bytes per file.

2. Apply validator across parser/persist/preview boundaries
- Files:
  - `src/hooks/useHtmlParser.ts`
  - `src/components/Builder.tsx`
  - `src/features/builder/hooks/use-streaming-persistence.ts`
- Replace ad-hoc checks with validator-backed decisions.

3. Persistence policy
- Persist final/partial `htmlArtifact` only if validator says persistable.
- Keep explanation text sanitization regardless.
- Do not overwrite `lastValidFiles` when incoming artifact is invalid.

## Phase 3: Prompt and Context Refactor for Multi-File

Goal: model can reliably emit either single-file or multi-file artifacts without token blowups.

1. Pass full file map into prompt assembly
- Files:
  - `src/app/api/chat/route.ts`
  - `src/lib/chat/resolve-chat-execution.ts`
  - `src/lib/prompts/system-prompt.ts`
- Replace `currentHtml` input with `currentFiles` map.

2. Update prompt sections to remove single-file contradiction
- Files:
  - `src/lib/prompts/sections/base-rules.ts`
  - `src/lib/prompts/sections/output-format.ts`
  - `src/lib/prompts/sections/context-blocks.ts`
- Add explicit output contract:
  - `<htmlOutput>` for single-file rewrites,
  - `<fileArtifact>` for multi-file rewrites,
  - `<editOperations file="...">` for targeted edits.

3. Add context budgeting rules
- Do not dump arbitrarily large file content.
- Include full `index.html` and bounded slices/summaries for other files when needed.
- Add deterministic truncation markers so model sees stable structure.

4. Align all continue/fallback prompts with structured output contract
- Files:
  - `src/app/api/chat/route.ts` (continuation prompt constant)
  - `src/components/Builder.tsx` (manual continue + edit-failed fallback)
  - `src/app/api/chat/continue/route.ts` only if endpoint remains active.

## Phase 4: Multi-File Preview and Download

Goal: preview and download reflect artifact map, not only `index.html`.

1. Preview combiner
- New file: `src/lib/preview/combine-files.ts`.
- Behavior:
  - empty string if no `index.html`,
  - passthrough for single-file,
  - inline local `styles.css` and `app.js` references for iframe preview,
  - preserve script order and leave unresolved refs untouched.

2. Wire PreviewPanel
- File: `src/components/PreviewPanel.tsx`.
- Use combiner output for `srcDoc`.

3. Download behavior
- Single-file: `website.html`.
- Multi-file: `website.zip` (with `jszip`) containing validated `ProjectFiles`.
- Update toolbar label to match exported format.

## Phase 5: File-Targeted Edit Apply

Goal: apply edits against selected file while preserving map integrity.

1. Apply by `targetFile`
- File: `src/hooks/useHtmlParser.ts`.
- Source text from `lastValidFiles[targetFile]`.
- Apply existing operation engine.
- Merge updated file back into full map.

2. V2 transaction scope
- Support one `<editOperations>` block per assistant response.
- Explicitly reject/ignore multi-block transactions for now.

## Phase 6: Continuation and Resume Integrity

Goal: no regressions during truncation, stop, refresh, and resume.

1. Keep full-replacement semantics
- Do not path-merge truncated artifacts by default.
- A continuation output should represent a complete final artifact for replacement.

2. Resume behavior
- On interruption, persist only valid persistable snapshot.
- On reload, hydrate latest persisted artifact exactly as saved.

3. Remove or wire dead continuation path
- If `/api/chat/continue` remains, add end-to-end usage and tests.
- Otherwise remove hook/route to reduce ambiguity.

## Phase 7: Observability, Tests, and Hardening

1. Metrics
- `artifact_parse_success_rate`
- `artifact_validation_failure_rate`
- `edit_apply_success_rate`
- `truncation_continue_rate`
- `truncation_recovery_rate`
- `fallback_rewrite_rate`
- `multi_file_generation_rate`

2. Contract tests
- Fragmented `<fileArtifact>` parse.
- Attributed edit parse and target apply.
- Sanitizer + assistant parser stripping structured blocks.
- Truncated generation recovery through active continuation path.
- Invalid artifacts do not replace `lastValidFiles`.

3. Security and prompt-injection guardrails
- Treat prior website code as data, not instruction.
- Ignore instruction-like content found inside prior HTML/CSS/JS unless user explicitly requests it.
- Keep sandbox unchanged: `allow-scripts allow-forms`.

## File Change List

New files:
- `src/lib/parser/file-artifact-extractor.ts`
- `src/lib/parser/validate-artifact.ts`
- `src/lib/preview/combine-files.ts`

Modified files:
- `src/hooks/useHtmlParser.ts`
- `src/lib/parser/edit-operations/types.ts`
- `src/lib/parser/edit-operations/edit-stream-extractor.ts`
- `src/lib/chat/sanitize-assistant-message.ts`
- `src/lib/parser/assistant-stream-parser.ts`
- `src/lib/stream/build-progress-detector.ts`
- `src/components/Builder.tsx`
- `src/features/builder/hooks/use-streaming-persistence.ts`
- `src/components/PreviewPanel.tsx`
- `src/features/preview/preview-toolbar.tsx`
- `src/app/api/chat/route.ts`
- `src/lib/chat/resolve-chat-execution.ts`
- `src/lib/prompts/system-prompt.ts`
- `src/lib/prompts/sections/base-rules.ts`
- `src/lib/prompts/sections/output-format.ts`
- `src/lib/prompts/sections/context-blocks.ts`
- `src/app/api/chat/continue/route.ts` (only if path retained)
- `src/hooks/useAutoContinue.ts` (only if path retained)

## Rollout Order

1. Phase 1 and Phase 2 together.
2. Phase 3.
3. Phase 4.
4. Phase 5.
5. Phase 6.
6. Phase 7.

Do not ship prompt-format expansion before parser/sanitizer/validation support is live.

## Verification Checklist

Required commands:
- `npm run lint`
- `npm run build`

Manual flows:
1. Generate simple site via `<htmlOutput>`; preview and persistence unchanged.
2. Generate multi-file via `<fileArtifact>`; preview renders composed output.
3. Edit `index.html` via `<editOperations>`; apply succeeds.
4. Edit `styles.css` via `<editOperations file="styles.css">`; apply succeeds.
5. Stop mid-stream; partial state persists and restores.
6. Truncate generation; continuation path recovers valid final artifact.
7. Download single-file and multi-file outputs successfully.

## External References

- OpenAI: [Introducing Structured Outputs in the API](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- OpenAI: [Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- Anthropic: [Use XML tags to structure your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- Anthropic: [Tool use overview](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
- OWASP: [Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/)
- MDN: [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
