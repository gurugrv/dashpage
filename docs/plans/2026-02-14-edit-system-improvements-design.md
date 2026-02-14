# Edit System Improvements Design

**Date:** 2026-02-14
**Status:** Approved
**Goal:** Improve edit accuracy, add DOM-aware editing, and support multi-file batch operations.

## Context

The current edit system uses search/replace (`editFile`) with exact matching + whitespace normalization fallback. When matching fails, the AI falls back to `writeFiles` (full file replacement), which wastes tokens and risks losing user customizations.

Research across bolt.diy, bolt.new, v0.dev, lovable.dev, Cursor, Aider, and kilocode informed this design. Key findings:
- **Aider/kilocode**: Multi-tier fuzzy matching chains (exact → whitespace → token → Levenshtein) reduce failures by ~9x
- **kilocode**: Partial success, rich error messages with closest match + similarity %, consecutive mistake tracking
- **v0.dev**: Adaptive strategy (auto-selects edit vs rewrite based on change scope)
- **Research papers**: DOM-aware operations achieve near-100% accuracy for attribute/text/class changes
- **Industry consensus**: Search/replace blocks outperform unified diffs for LLM generation; line-number approaches are fragile

## Tool Architecture

Five file tools (up from three):

| Tool | Purpose | Primary Use |
|------|---------|-------------|
| `editDOM` (NEW) | CSS selector-based DOM ops via Cheerio | Text, images, colors, classes, attributes |
| `editFile` (ENHANCED) | Search/replace with 4-tier matching | Structural changes, adding/rearranging sections |
| `editFiles` (NEW) | Multi-file batch (DOM + S/R combined) | Cross-page changes: nav, headers, branding |
| `writeFiles` (UNCHANGED) | Full file create/rewrite | New pages, redesigns, failed-edit fallback |
| `readFile` (UNCHANGED) | Inspect file contents | Pre-edit inspection |

## editDOM Tool

CSS selector-based DOM operations using Cheerio. Primary tool for small targeted changes.

**Input schema:**
```typescript
{
  file: string,          // "index.html"
  operations: [
    {
      selector: string,  // CSS selector: "img.hero", "#title", ".cta-button"
      action: string,    // see actions table
      attr?: string,     // for setAttribute
      value?: string,    // the new value
      oldClass?: string, // for replaceClass
      newClass?: string, // for replaceClass
      position?: string, // for insertAdjacentHTML: "beforebegin"|"afterbegin"|"beforeend"|"afterend"
    }
  ]
}
```

**Supported actions:**

| Action | Use Case | Example |
|--------|----------|---------|
| `setAttribute` | Change image src, href, alt | `{ selector: "img.hero", action: "setAttribute", attr: "src", value: "/new.jpg" }` |
| `setText` | Update heading, button text | `{ selector: "h1", action: "setText", value: "New Title" }` |
| `setHTML` | Replace inner HTML of section | `{ selector: ".pricing", action: "setHTML", value: "<h3>$99</h3>" }` |
| `addClass` | Add Tailwind class | `{ selector: ".hero", action: "addClass", value: "bg-gradient-to-r" }` |
| `removeClass` | Remove a class | `{ selector: ".banner", action: "removeClass", value: "hidden" }` |
| `replaceClass` | Swap classes | `{ selector: ".cta", action: "replaceClass", oldClass: "bg-blue-500", newClass: "bg-green-500" }` |
| `remove` | Delete element | `{ selector: "#old-banner", action: "remove" }` |
| `insertAdjacentHTML` | Add element near existing | `{ selector: "nav", action: "insertAdjacentHTML", position: "beforeend", value: "<a>Contact</a>" }` |

**Validation:**
- Selector matches 0 elements → error listing available similar elements
- Selector matches multiple (for non-bulk actions) → error suggesting more specific selector
- Partial success: applies successful ops, reports failed ones with index

**Serialization note:** Cheerio may alter minor formatting on first parse. Subsequent edits are stable.

## Enhanced editFile Tool

Four-tier matching chain + partial success + rich errors.

### Matching chain (applied sequentially per operation):

1. **Exact match** — `indexOf` (current behavior)
2. **Whitespace-tolerant regex** — collapse whitespace runs, match flexibly
3. **Token-based regex** — extract word tokens only, ignore all whitespace/indentation
4. **Fuzzy Levenshtein** — sliding window with similarity threshold (>=0.85), using `fastest-levenshtein`

### Partial success:

When operation N fails, operations 1..(N-1) are preserved:
```typescript
{
  success: "partial",
  file: "index.html",
  content: "...result after successful ops...",
  appliedCount: 2,
  failedIndex: 2,
  error: "Operation 3/5 failed: search text not found",
  bestMatch: { text: "...", similarity: 0.72, line: 42 }
}
```

### Rich error messages:

```
Edit operation 3/5 failed in "index.html":
  Searched for: <h2 class="text-xl">Our Services</h2>
  Best match (72% similar, line 42): <h2 class="text-2xl font-bold">Our Services</h2>
  Suggestion: Use readFile to get exact content, or try a shorter search string.
```

### expectedReplacements parameter:

Optional, defaults to 1. When set, replaces that many occurrences. If actual count differs, returns error with actual count.

### Consecutive mistake tracking:

Per-file failure count within a generation:
- 1st failure: normal error
- 2nd consecutive failure: error + suggestion to use writeFiles

### Updated schema:
```typescript
{
  file: string,
  operations: [
    {
      search: string,
      replace: string,
      expectedReplacements?: number  // default 1
    }
  ]
}

// Success:
{ success: true, file, content, matchTiers: ["exact", "whitespace", "exact"] }

// Partial:
{ success: "partial", file, content, appliedCount, failedIndex, error, bestMatch }

// Failure:
{ success: false, error, bestMatch }
```

## editFiles Multi-file Batch Tool

Single tool call for cross-page edits. Accepts mixed DOM + search/replace per file.

```typescript
{
  edits: [
    {
      file: "index.html",
      domOperations?: DomOperation[],     // editDOM-style
      replaceOperations?: ReplaceOperation[] // editFile-style
    },
    {
      file: "about.html",
      domOperations?: DomOperation[]
    }
  ]
}
```

**Execution order per file:** DOM operations first, then search/replace on serialized result.

**Atomicity:** Per-file, not per-batch. Failed files don't block successful ones.

```typescript
{
  success: "partial",
  results: [
    { file: "index.html", success: true, content: "..." },
    { file: "about.html", success: "partial", appliedCount: 1, failedIndex: 1, error: "..." },
    { file: "contact.html", success: true, content: "..." }
  ]
}
```

## System Prompt Tool Selection

```
<tool_selection>
File editing — choose the right tool:

1. editDOM (preferred for targeted changes):
   - Change text, images, links, colors, classes, attributes
   - Remove or hide elements
   - Add elements adjacent to existing ones
   - Use CSS selectors to target elements precisely

2. editFile (for structural/block changes):
   - Add new HTML sections or blocks of code
   - Rearrange or reorder sections
   - Complex changes spanning multiple nested elements
   - Changes where CSS selectors can't isolate the target

3. editFiles (for cross-page changes):
   - Same change needed on 2+ files (nav, header, footer, branding)
   - Combines DOM and replace operations in one call

4. writeFiles (last resort):
   - New file creation
   - Complete redesigns
   - When editFile fails twice on the same file

5. readFile (inspection):
   - Check exact content before editFile operations
   - Verify changes after edits

Fallback chain:
  editDOM fails → try editFile on same target
  editFile fails → readFile to inspect, retry with exact content
  editFile fails twice → writeFiles with complete replacement
</tool_selection>
```

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `cheerio` | HTML parsing + DOM manipulation for editDOM | ~200KB |
| `fastest-levenshtein` | Fuzzy similarity scoring for editFile tier 4 | ~3KB |

## Out of Scope (YAGNI)

- Diff preview UI
- Version history/undo beyond lastValidFiles
- Line-number-based edits (LLMs are bad at line numbers)
- Unified diff format
- Placeholder syntax with apply model (kilocode experimental)
- Per-operation user approval

## Research Sources

- bolt.diy codebase: Full file replacement via `<boltAction>` XML
- bolt.new: Same approach as bolt.diy
- v0.dev: Adaptive create/update/rewrite with specialized sub-models
- lovable.dev: Multi-file coordinated diffs
- Aider: Multi-format S/R with 4-tier fuzzy matching, benchmarked
- kilocode: 3-tier matching, Levenshtein similarity, partial success, consecutive mistake tracking, rich errors
- Cursor: Custom 70B apply model, speculative decoding
- Research: DOM-aware operations for HTML achieve near-100% accuracy for attribute/text/class changes
