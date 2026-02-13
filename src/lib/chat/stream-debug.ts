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
function prefixLines(lines: string, prefix: string): string {
  return lines
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

// ─── Session-scoped logger ────────────────────────────────────────────────────

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
  logToolCall(params: { toolName: string; toolCallId: string; input?: unknown }): void;
  logToolResult(params: { toolName?: string; toolCallId: string; output?: unknown; error?: string }): void;
  finish(status?: 'complete' | 'aborted'): void;
  getFullResponse(): string;
  logFullResponse(finishReason?: string): void;
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
  const prefix = `${color}[${label}]${RESET} `;
  const dimPrefix = `${color}${DIM}[${label}]${RESET} `;

  let hasPrintedStreamHeader = false;
  let fullResponse = '';
  let lineBuffer = '';

  function header(title: string): string {
    const sep = '='.repeat(60);
    const parts = [
      '',
      `${color}${sep}${RESET}`,
      `${prefix}${title}  ${DIM}${new Date().toISOString()}${RESET}`,
    ];
    if (provider || model) {
      parts.push(`${prefix}Provider: ${provider || '?'} | Model: ${model || '?'}`);
    }
    if (conversationId) {
      parts.push(`${prefix}Conversation: ${conversationId}`);
    }
    parts.push(`${color}${sep}${RESET}`);
    return parts.join('\n') + '\n';
  }

  function footer(): string {
    return `${color}${'='.repeat(60)}${RESET}\n\n`;
  }

  function subHeader(title: string): string {
    return `${dimPrefix}${DIM}${'─'.repeat(40)}${RESET}\n${prefix}${title}\n${dimPrefix}${DIM}${'─'.repeat(40)}${RESET}\n`;
  }

  return {
    logPrompt({ systemPrompt, messages, maxOutputTokens }) {
      const parts: string[] = [header(`PROMPT [${scope}]`)];

      if (maxOutputTokens) {
        parts.push(`${prefix}Max Output Tokens: ${maxOutputTokens}\n`);
      }

      parts.push(subHeader('SYSTEM PROMPT'));
      parts.push(prefixLines(systemPrompt, dimPrefix) + '\n');

      parts.push(subHeader('MESSAGES'));
      messages.forEach((msg, idx) => {
        parts.push(`${prefix}[${idx + 1}] ${msg.role.toUpperCase()}:`);
        parts.push(prefixLines(msg.content, dimPrefix) + '\n');
      });

      parts.push(footer());
      writeAtomic(parts.join('\n'));
    },

    logResponse({ response, status, finishReason }) {
      const parts: string[] = [header(`RESPONSE [${scope}]`)];
      parts.push(`${prefix}Status: ${status}${finishReason ? ` | Finish Reason: ${finishReason}` : ''}\n`);

      if (response) {
        parts.push(subHeader('RESPONSE CONTENT'));
        parts.push(prefixLines(response, dimPrefix) + '\n');
      }

      parts.push(footer());
      writeAtomic(parts.join('\n'));
    },

    logDelta(delta: string) {
      fullResponse += delta;

      if (!hasPrintedStreamHeader) {
        hasPrintedStreamHeader = true;
        writeAtomic(header(`STREAMING [${scope}]`));
      }

      // Buffer and flush complete lines with prefix
      lineBuffer += delta;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop()!;
      if (lines.length > 0) {
        const output = lines.map((line) => `${dimPrefix}${line}`).join('\n') + '\n';
        writeAtomic(output);
      }
    },

    logToolCall({ toolName, toolCallId, input }) {
      if (!isDebugEnabled()) return;
      const inputPreview = input ? JSON.stringify(input).slice(0, 500) : '(no input)';
      const parts = [
        `${prefix}\x1b[33m⚡ TOOL CALL: ${toolName}${RESET}  ${DIM}id=${toolCallId}${RESET}`,
        `${dimPrefix}  Input: ${inputPreview}${inputPreview.length >= 500 ? '…' : ''}`,
        '',
      ];
      writeAtomic(parts.join('\n'));
    },

    logToolResult({ toolName, toolCallId, output, error }) {
      if (!isDebugEnabled()) return;
      if (error) {
        writeAtomic(`${prefix}\x1b[31m✗ TOOL ERROR: ${toolName || toolCallId}${RESET}  ${error}\n\n`);
        return;
      }
      const outputPreview = output ? JSON.stringify(output).slice(0, 500) : '(no output)';
      const parts = [
        `${prefix}\x1b[32m✓ TOOL RESULT: ${toolName || toolCallId}${RESET}`,
        `${dimPrefix}  Output: ${outputPreview}${outputPreview.length >= 500 ? '…' : ''}`,
        '',
      ];
      writeAtomic(parts.join('\n'));
    },

    finish(status: 'complete' | 'aborted' = 'complete') {
      if (hasPrintedStreamHeader) {
        const parts: string[] = [];
        if (lineBuffer) {
          parts.push(`${dimPrefix}${lineBuffer}`);
          lineBuffer = '';
        }
        parts.push(`${prefix}Stream ${status}`);
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
          `${prefix}Stream complete | Finish Reason: ${finishReason || 'unknown'} | ${fullResponse.length} chars`,
          footer(),
        ];
        writeAtomic(parts.join('\n'));
      }
    },
  };
}

