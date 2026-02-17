import { getModelPricing } from './model-pricing';

// ANSI color palette for distinguishing concurrent sessions
const SESSION_COLORS = [
  '\x1b[36m',  // cyan
  '\x1b[33m',  // yellow
  '\x1b[35m',  // magenta
  '\x1b[32m',  // green
  '\x1b[34m',  // blue
  '\x1b[91m',  // bright red
  '\x1b[96m',  // bright cyan
  '\x1b[93m',  // bright yellow
  '\x1b[95m',  // bright magenta
  '\x1b[92m',  // bright green
] as const;
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

let colorIndex = 0;

function nextColor(): string {
  const color = SESSION_COLORS[colorIndex % SESSION_COLORS.length];
  colorIndex += 1;
  return color;
}

export function isDebugEnabled() {
  return process.env.DEBUG_AI_STREAM_OUTPUT === 'true';
}

/**
 * Atomically write a block of text to stdout.
 * Single write call prevents interleaving from concurrent streams.
 */
function writeAtomic(text: string) {
  process.stdout.write(text);
}

/**
 * Prefix every line of a multi-line string with a colored session tag.
 */
function prefixLines(lines: string, pfx: string | (() => string)): string {
  return lines
    .split('\n')
    .map((line) => `${typeof pfx === 'function' ? pfx() : pfx}${line}`)
    .join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Session-scoped logger ────────────────────────────────────────────────────

/** Tracks timing for a single tool call lifecycle */
interface ToolTiming {
  toolName: string;
  toolCallId: string;
  startedAt: number;
  inputReadyAt?: number;
  outputReadyAt?: number;
  inputSizeBytes?: number;
  status: 'running' | 'done' | 'error';
  error?: string;
}

export interface DebugSession {
  logPrompt(params: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    maxOutputTokens?: number;
  }): void;
  logResponse(params: {
    response?: string;
    status: 'complete' | 'aborted' | 'error';
    finishReason?: string;
  }): void;
  logDelta(delta: string): void;
  logToolStarting(params: { toolName: string; toolCallId: string }): void;
  logToolInputDelta(params: { toolCallId: string; delta: string }): void;
  logToolCall(params: { toolName: string; toolCallId: string; input?: unknown }): void;
  logToolResult(params: { toolName?: string; toolCallId: string; output?: unknown; error?: string }): void;
  finish(status?: 'complete' | 'aborted'): void;
  getFullResponse(): string;
  logFullResponse(finishReason?: string): void;
  logCacheStats?(metadata: Record<string, unknown> | undefined): void;
  /** Log generation summary with tool timeline and throughput stats */
  logGenerationSummary?(params: { finishReason?: string; hasFileOutput: boolean; toolCallCount: number; structuredOutput?: boolean; rawTextLength?: number; usage?: { inputTokens?: number; outputTokens?: number } }): void | Promise<void>;
}

/**
 * Create a session-scoped debug logger.
 * All output from this session is prefixed with a colored tag and written atomically
 * so concurrent sessions remain visually distinct in the console.
 */
export function createDebugSession(params: {
  scope: string;
  model?: string;
  provider?: string;
  conversationId?: string;
}): DebugSession {
  const { scope, model, provider, conversationId } = params;
  const color = nextColor();
  const shortId = conversationId?.slice(0, 8) || Math.random().toString(36).slice(2, 8);
  const label = `${scope}:${shortId}`;
  const ts = () => {
    const d = new Date();
    return `${DIM}${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}${RESET}`;
  };
  const prefix = () => `${ts()} ${color}[${label}]${RESET} `;
  const dimPrefix = () => `${ts()} ${color}${DIM}[${label}]${RESET} `;

  let hasPrintedStreamHeader = false;
  let fullResponse = '';
  let lineBuffer = '';

  // Diagnostic tracking
  const sessionStartedAt = Date.now();
  let firstDeltaAt: number | undefined;
  let deltaCount = 0;
  let totalDeltaChars = 0;
  const toolTimings = new Map<string, ToolTiming>();

  function header(title: string): string {
    const sep = '='.repeat(60);
    const parts = [
      '',
      `${color}${sep}${RESET}`,
      `${prefix()}${title}`,
    ];
    if (provider || model) {
      parts.push(`${prefix()}Provider: ${provider || '?'} | Model: ${model || '?'}`);
    }
    if (conversationId) {
      parts.push(`${prefix()}Conversation: ${conversationId}`);
    }
    parts.push(`${color}${sep}${RESET}`);
    return parts.join('\n') + '\n';
  }

  function footer(): string {
    return `${color}${'='.repeat(60)}${RESET}\n\n`;
  }

  function subHeader(title: string): string {
    return `${dimPrefix()}${DIM}${'─'.repeat(40)}${RESET}\n${prefix()}${title}\n${dimPrefix()}${DIM}${'─'.repeat(40)}${RESET}\n`;
  }

  return {
    logPrompt({ systemPrompt, messages, maxOutputTokens }) {
      const parts: string[] = [header(`PROMPT [${scope}]`)];

      if (maxOutputTokens) {
        parts.push(`${prefix()}Max Output Tokens: ${maxOutputTokens}\n`);
      }

      parts.push(subHeader('SYSTEM PROMPT'));
      parts.push(`${dimPrefix()}(${formatBytes(systemPrompt.length)} - content hidden)\n`);

      parts.push(subHeader('MESSAGES'));
      messages.forEach((msg, idx) => {
        parts.push(`${prefix()}[${idx + 1}] ${msg.role.toUpperCase()}:`);
        parts.push(prefixLines(msg.content, dimPrefix) + '\n');
      });

      parts.push(footer());
      writeAtomic(parts.join('\n'));
    },

    logResponse({ response, status, finishReason }) {
      const parts: string[] = [header(`RESPONSE [${scope}]`)];
      parts.push(`${prefix()}Status: ${status}${finishReason ? ` | Finish Reason: ${finishReason}` : ''}\n`);

      if (response) {
        parts.push(subHeader('RESPONSE CONTENT'));
        if (status === 'error') {
          // Always show error responses in full for debugging
          parts.push(prefixLines(response, dimPrefix) + '\n');
        } else {
          parts.push(`${dimPrefix()}(${formatBytes(response.length)} - content hidden)\n`);
        }
      }

      parts.push(footer());
      writeAtomic(parts.join('\n'));
    },

    logDelta(delta: string) {
      fullResponse += delta;
      deltaCount += 1;
      totalDeltaChars += delta.length;
      if (!firstDeltaAt) firstDeltaAt = Date.now();

      if (!hasPrintedStreamHeader) {
        hasPrintedStreamHeader = true;
        const ttfb = Date.now() - sessionStartedAt;
        writeAtomic(header(`STREAMING [${scope}]`));
        writeAtomic(`${prefix()}${DIM}Time to first token: ${ttfb}ms${RESET}\n`);
      }

      // Show first 500 chars of text deltas, then periodic size progress
      const TEXT_PREVIEW_LIMIT = 500;
      const TEXT_PROGRESS_INTERVAL = 4096;
      const prevChars = totalDeltaChars - delta.length;

      if (prevChars < TEXT_PREVIEW_LIMIT) {
        // Still within preview range — show actual text
        const remaining = TEXT_PREVIEW_LIMIT - prevChars;
        const toShow = delta.slice(0, remaining);
        lineBuffer += toShow;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop()!;
        if (lines.length > 0) {
          const output = lines.map((line) => `${dimPrefix()}${line}`).join('\n') + '\n';
          writeAtomic(output);
        }
        if (lineBuffer.length >= 200) {
          writeAtomic(`${dimPrefix()}${lineBuffer}\n`);
          lineBuffer = '';
        }
        // Print truncation marker when we cross the limit
        if (totalDeltaChars >= TEXT_PREVIEW_LIMIT && prevChars < TEXT_PREVIEW_LIMIT) {
          if (lineBuffer) {
            writeAtomic(`${dimPrefix()}${lineBuffer}\n`);
            lineBuffer = '';
          }
          writeAtomic(`${prefix()}${DIM}... text output truncated (showing progress every 4KB) ...${RESET}\n`);
        }
      } else {
        // Past preview limit — show periodic size progress
        const prevBucket = Math.floor(prevChars / TEXT_PROGRESS_INTERVAL);
        const currBucket = Math.floor(totalDeltaChars / TEXT_PROGRESS_INTERVAL);
        if (currBucket > prevBucket) {
          writeAtomic(`${dimPrefix()}${DIM}  ... text streaming: ${formatBytes(totalDeltaChars)}${RESET}\n`);
        }
      }
    },

    logToolStarting({ toolName, toolCallId }) {
      const now = Date.now();
      const elapsed = now - sessionStartedAt;
      toolTimings.set(toolCallId, {
        toolName,
        toolCallId,
        startedAt: now,
        status: 'running',
      });
      writeAtomic(
        `${prefix()}\x1b[33m⚡ TOOL STARTING: ${toolName}${RESET}  ${DIM}id=${toolCallId} +${elapsed}ms${RESET}\n`,
      );
    },

    logToolInputDelta({ toolCallId, delta }) {
      const timing = toolTimings.get(toolCallId);
      if (!timing) return;

      // Track total input size for all tool types
      if (!timing.inputSizeBytes) timing.inputSizeBytes = 0;
      timing.inputSizeBytes += delta.length;

      // For file-producing tools, show periodic size progress instead of full code
      if (timing.toolName === 'writeFile' || timing.toolName === 'writeFiles' || timing.toolName === 'editBlock') {
        const prevSize = timing.inputSizeBytes - delta.length;
        const PROGRESS_INTERVAL = 4096; // Log every 4KB
        const prevBucket = Math.floor(prevSize / PROGRESS_INTERVAL);
        const currBucket = Math.floor(timing.inputSizeBytes / PROGRESS_INTERVAL);
        if (currBucket > prevBucket) {
          writeAtomic(`${dimPrefix()}${DIM}  ... ${timing.toolName} streaming: ${formatBytes(timing.inputSizeBytes)}${RESET}\n`);
        }
      }
    },

    logToolCall({ toolName, toolCallId, input }) {
      const now = Date.now();
      const timing = toolTimings.get(toolCallId);
      if (timing) timing.inputReadyAt = now;

      // Calculate input size for file-producing tools
      let inputSizeInfo = '';
      if (input && typeof input === 'object') {
        const inp = input as Record<string, unknown>;
        if ('filename' in inp && 'content' in inp && typeof inp.content === 'string') {
          // writeFile (singular): flat filename + content
          const bytes = new TextEncoder().encode(inp.content).length;
          if (timing) timing.inputSizeBytes = bytes;
          inputSizeInfo = `\n${dimPrefix()}  File: ${inp.filename} (${formatBytes(bytes)})`;
        } else if ('files' in inp && typeof inp.files === 'object' && inp.files !== null) {
          // writeFiles: measure each file's content size
          const files = inp.files as Record<string, string>;
          const fileSizes: string[] = [];
          let totalBytes = 0;
          for (const [name, content] of Object.entries(files)) {
            const bytes = typeof content === 'string' ? new TextEncoder().encode(content).length : 0;
            totalBytes += bytes;
            fileSizes.push(`${name}: ${formatBytes(bytes)}`);
          }
          if (timing) timing.inputSizeBytes = totalBytes;
          inputSizeInfo = `\n${dimPrefix()}  File sizes: ${fileSizes.join(', ')} (total: ${formatBytes(totalBytes)})`;
        } else if ('html' in inp && typeof inp.html === 'string') {
          // editBlock
          const bytes = new TextEncoder().encode(inp.html).length;
          if (timing) timing.inputSizeBytes = bytes;
          inputSizeInfo = `\n${dimPrefix()}  HTML size: ${formatBytes(bytes)}`;
        }
      }

      const inputStreamDuration = timing ? `${now - timing.startedAt}ms input-stream` : '';
      const inputPreview = input ? JSON.stringify(input).slice(0, 500) : '(no input)';
      const parts = [
        `${prefix()}\x1b[33m⚡ TOOL CALL: ${toolName}${RESET}  ${DIM}id=${toolCallId} (${inputStreamDuration})${RESET}`,
        `${dimPrefix()}  Input: ${inputPreview}${inputPreview.length >= 500 ? '…' : ''}`,
      ];
      writeAtomic(parts.join('\n') + inputSizeInfo + '\n\n');
    },

    logToolResult({ toolName, toolCallId, output, error }) {
      const now = Date.now();
      const timing = toolTimings.get(toolCallId);
      if (timing) {
        timing.outputReadyAt = now;
        timing.status = error ? 'error' : 'done';
        if (error) timing.error = error;
      }

      const executionTime = timing?.inputReadyAt ? `${now - timing.inputReadyAt}ms exec` : '';
      const totalTime = timing ? `${now - timing.startedAt}ms total` : '';
      const timeInfo = [executionTime, totalTime].filter(Boolean).join(', ');

      if (error) {
        writeAtomic(`${prefix()}\x1b[31m✗ TOOL ERROR: ${toolName || toolCallId}${RESET}  ${error}  ${DIM}(${timeInfo})${RESET}\n\n`);
        return;
      }
      const outputPreview = output ? JSON.stringify(output).slice(0, 500) : '(no output)';
      const parts = [
        `${prefix()}\x1b[32m✓ TOOL RESULT: ${toolName || toolCallId}${RESET}  ${DIM}(${timeInfo})${RESET}`,
        `${dimPrefix()}  Output: ${outputPreview}${outputPreview.length >= 500 ? '…' : ''}`,
        '',
      ];
      writeAtomic(parts.join('\n'));
    },

    finish(status: 'complete' | 'aborted' = 'complete') {
      if (hasPrintedStreamHeader) {
        const parts: string[] = [];
        if (lineBuffer) {
          parts.push(`${dimPrefix()}${lineBuffer}`);
          lineBuffer = '';
        }
        parts.push(`${prefix()}Stream ${status}`);
        writeAtomic(parts.join('\n') + '\n');
      }
    },

    getFullResponse() {
      return fullResponse;
    },

    logFullResponse(finishReason?: string) {
      if (!hasPrintedStreamHeader && fullResponse) {
        // Non-streamed response — log it in full
        this.logResponse({
          response: fullResponse,
          status: fullResponse ? 'complete' : 'aborted',
          finishReason,
        });
      } else if (hasPrintedStreamHeader) {
        const parts = [
          `${prefix()}Stream complete | Finish Reason: ${finishReason || 'unknown'} | ${fullResponse.length} chars`,
          footer(),
        ];
        writeAtomic(parts.join('\n'));
      }
    },

    logCacheStats(metadata: Record<string, unknown> | undefined) {
      if (!isDebugEnabled() || !metadata) return;
      const created = metadata.cacheCreationInputTokens;
      const read = metadata.cacheReadInputTokens;
      if (created != null || read != null) {
        writeAtomic(
          `${prefix()}\x1b[36m📦 CACHE: created=${created ?? 0} read=${read ?? 0}${RESET}\n`,
        );
      }
    },

    async logGenerationSummary({ finishReason, hasFileOutput, toolCallCount, structuredOutput, rawTextLength, usage }) {
      const now = Date.now();
      const totalDuration = now - sessionStartedAt;
      const parts: string[] = [
        '',
        `${color}${'─'.repeat(60)}${RESET}`,
        `${prefix()}\x1b[1mGENERATION SUMMARY${RESET}`,
        `${color}${'─'.repeat(60)}${RESET}`,
        `${prefix()}Duration: ${formatDuration(totalDuration)} | Finish: ${finishReason || 'unknown'}`,
      ];

      // Token usage & cost
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        const input = usage.inputTokens ?? 0;
        const output = usage.outputTokens ?? 0;
        const total = input + output;
        parts.push(
          `${prefix()}Tokens: ${total.toLocaleString()} total (${input.toLocaleString()} in / ${output.toLocaleString()} out)`,
        );

        if (input > 0 || output > 0) {
          // Try real pricing from LiteLLM, fall back to hardcoded estimate
          const pricing = model ? await getModelPricing(model, provider) : null;
          if (pricing) {
            const inputCost = input * pricing.inputCostPerToken;
            const outputCost = output * pricing.outputCostPerToken;
            const totalCost = inputCost + outputCost;
            const inputPer1M = (pricing.inputCostPerToken * 1_000_000).toFixed(2);
            const outputPer1M = (pricing.outputCostPerToken * 1_000_000).toFixed(2);
            parts.push(
              `${prefix()}Cost: $${totalCost.toFixed(4)} ${DIM}(${model}: $${inputPer1M}/$${outputPer1M} per 1M)${RESET}`,
            );
          } else {
            const inputCost = (input / 1_000_000) * 3;
            const outputCost = (output / 1_000_000) * 15;
            const totalCost = inputCost + outputCost;
            parts.push(
              `${prefix()}Est. Cost: ~$${totalCost.toFixed(4)} ${DIM}(~$3/$15 per 1M tokens)${RESET}`,
            );
          }
        }
      }

      if (structuredOutput) {
        // Non-streaming structured output — show raw response size and wait time
        const textLen = rawTextLength ?? fullResponse.length;
        // For structured output, subtract any tool execution time to show pure model wait
        let toolTime = 0;
        for (const t of toolTimings.values()) {
          if (t.outputReadyAt) toolTime += t.outputReadyAt - t.startedAt;
        }
        const modelWait = totalDuration - toolTime;
        parts.push(
          `${prefix()}Output: ${formatBytes(textLen)} structured JSON | Model wait: ${formatDuration(modelWait)}` +
            (toolTime > 0 ? ` | Tool time: ${formatDuration(toolTime)}` : '') +
            (modelWait > 0 ? ` | ${Math.round(textLen / (modelWait / 1000))} chars/s` : ''),
        );
      } else {
        parts.push(
          `${prefix()}Text: ${totalDeltaChars} chars in ${deltaCount} deltas` +
            (firstDeltaAt ? ` | TTFT: ${formatDuration(firstDeltaAt - sessionStartedAt)}` : '') +
            (totalDuration > 0 ? ` | ${Math.round(totalDeltaChars / (totalDuration / 1000))} chars/s` : ''),
          `${prefix()}Tools: ${toolCallCount} call${toolCallCount !== 1 ? 's' : ''} | File output: ${hasFileOutput ? '\x1b[32mYES' : '\x1b[31mNO'}${RESET}`,
        );
      }

      // Tool timeline
      if (toolTimings.size > 0) {
        parts.push(`${prefix()}`);
        parts.push(`${prefix()}\x1b[1mTool Timeline:${RESET}`);
        const sorted = [...toolTimings.values()].sort((a, b) => a.startedAt - b.startedAt);
        for (const t of sorted) {
          const offset = t.startedAt - sessionStartedAt;
          const inputDur = t.inputReadyAt ? t.inputReadyAt - t.startedAt : undefined;
          const execDur = t.inputReadyAt && t.outputReadyAt ? t.outputReadyAt - t.inputReadyAt : undefined;
          const totalDur = t.outputReadyAt ? t.outputReadyAt - t.startedAt : undefined;

          const statusIcon = t.status === 'done' ? '\x1b[32m✓' : t.status === 'error' ? '\x1b[31m✗' : '\x1b[33m?';
          const sizeInfo = t.inputSizeBytes != null ? ` | input: ${formatBytes(t.inputSizeBytes)}` : '';
          const timeParts = [
            inputDur != null ? `input-stream: ${formatDuration(inputDur)}` : null,
            execDur != null ? `exec: ${formatDuration(execDur)}` : null,
            totalDur != null ? `total: ${formatDuration(totalDur)}` : null,
          ].filter(Boolean).join(', ');

          parts.push(
            `${prefix()}  ${statusIcon} ${t.toolName}${RESET}  ${DIM}+${formatDuration(offset)} | ${timeParts}${sizeInfo}${RESET}` +
              (t.error ? `\n${dimPrefix()}    Error: ${t.error.slice(0, 120)}` : ''),
          );
        }
      }

      // Warnings (skip tool-related warnings for structured output like blueprint generation)
      if (!structuredOutput) {
        if (!hasFileOutput && toolCallCount > 0) {
          parts.push(`${prefix()}`);
          parts.push(`${prefix()}\x1b[31m⚠ WARNING: Tools were called but no file output was produced!${RESET}`);
          parts.push(`${dimPrefix()}  This usually means the model used tools (search, etc.) but never called writeFile/writeFiles/editBlock/editFiles.`);
        }
        if (!hasFileOutput && toolCallCount === 0) {
          parts.push(`${prefix()}`);
          parts.push(`${prefix()}\x1b[31m⚠ WARNING: No tool calls at all — generation produced only text!${RESET}`);
          parts.push(`${dimPrefix()}  The model did not call any tools. Check system prompt and model compatibility.`);
        }
      }
      if (!structuredOutput && totalDuration > 60_000 && totalDeltaChars < 1000) {
        parts.push(`${prefix()}\x1b[33m⚠ SLOW: ${formatDuration(totalDuration)} elapsed but only ${totalDeltaChars} chars generated${RESET}`);
      }

      parts.push(`${color}${'─'.repeat(60)}${RESET}`, '');
      writeAtomic(parts.join('\n'));
    },
  };
}

