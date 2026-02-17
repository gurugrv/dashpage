import { stepCountIs, streamText } from 'ai';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getAssetsSystemPrompt } from '@/lib/blueprint/prompts/assets-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { prisma } from '@/lib/db/prisma';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import type { Blueprint } from '@/lib/blueprint/types';
import { createOpenRouterModel } from '@/lib/providers/configs/openrouter';

interface AssetsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  conversationId?: string;
  componentHtml?: { headerHtml: string; footerHtml: string } | null;
}

export async function POST(req: Request) {
  let body: AssetsRequestBody;
  try {
    body = await req.json() as AssetsRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { blueprint, provider, model, maxOutputTokens: clientMaxTokens, conversationId, componentHtml } = body;

  if (!blueprint || !provider || !model) {
    return new Response(JSON.stringify({ error: 'blueprint, provider, and model are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let apiKey: string | null;
  try {
    apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new ChatRequestError(`No API key for ${provider}`);
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model, clientMaxTokens);
  const systemPrompt = getAssetsSystemPrompt(blueprint, componentHtml);
  const modelInstance = provider === 'OpenRouter'
    ? createOpenRouterModel(apiKey, model, 'none')
    : providerConfig.createModel(apiKey, model);
  const userPrompt = `Generate the shared styles.css and scripts.js for the "${blueprint.siteName}" website.`;
  const abortSignal = req.signal;

  const { readable, writable } = new TransformStream();
  const encoder = new TextEncoder();
  const writer = writable.getWriter();

  function sendEvent(data: Record<string, unknown>) {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  }

  (async () => {
    sendEvent({ type: 'assets-status', status: 'generating' });

    try {
      const debugSession = createDebugSession({
        scope: 'blueprint-assets',
        model,
        provider,
        conversationId,
      });
      debugSession.logPrompt({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxOutputTokens,
      });

      const { tools, workingFiles } = createWebsiteTools({});
      const toolCallNames = new Map<string, string>();
      let hasFileOutput = false;
      const FILE_PRODUCING_TOOLS = new Set(['writeFile', 'writeFiles']);

      const result = streamText({
        model: modelInstance,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens,
        tools,
        stopWhen: stepCountIs(8),
        abortSignal,
      });

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          debugSession.logDelta(part.text);
        } else if (part.type === 'tool-input-delta') {
          debugSession.logToolInputDelta({ toolCallId: part.id, delta: part.delta });
        } else if (part.type === 'tool-input-start') {
          toolCallNames.set(part.id, part.toolName);
          debugSession.logToolStarting({ toolName: part.toolName, toolCallId: part.id });
          sendEvent({
            type: 'tool-activity',
            toolCallId: part.id,
            toolName: part.toolName,
            status: 'running',
            label: TOOL_LABELS[part.toolName] ?? part.toolName,
          });
        } else if (part.type === 'tool-call') {
          debugSession.logToolCall({ toolName: part.toolName, toolCallId: part.toolCallId, input: part.input });
          const detail = summarizeToolInput(part.toolName, part.input);
          if (detail) {
            sendEvent({
              type: 'tool-activity',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              status: 'running',
              label: TOOL_LABELS[part.toolName] ?? part.toolName,
              detail,
            });
          }
        } else if (part.type === 'tool-result') {
          debugSession.logToolResult({ toolName: part.toolName, toolCallId: part.toolCallId, output: part.output });
          if (FILE_PRODUCING_TOOLS.has(part.toolName)) {
            const out = part.output as Record<string, unknown> | undefined;
            if (out && out.success !== false) hasFileOutput = true;
          }
          sendEvent({
            type: 'tool-activity',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            status: 'done',
            label: TOOL_LABELS[part.toolName] ?? part.toolName,
            detail: summarizeToolOutput(part.toolName, part.output),
          });
        } else if (part.type === 'tool-error') {
          const rawErr = (part as { error?: unknown }).error;
          const errMsg = rawErr instanceof Error ? rawErr.message.slice(0, 100) : typeof rawErr === 'string' ? rawErr.slice(0, 100) : 'Tool error';
          debugSession.logToolResult({ toolName: part.toolName, toolCallId: part.toolCallId, error: errMsg });
          sendEvent({
            type: 'tool-activity',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            status: 'error',
            label: TOOL_LABELS[part.toolName] ?? part.toolName,
            detail: errMsg,
          });
        }
      }

      debugSession.finish('complete');
      const finishReason = await result.finishReason;
      const usage = await result.usage;
      debugSession.logFullResponse(finishReason);
      debugSession.logGenerationSummary?.({
        finishReason,
        hasFileOutput,
        toolCallCount: toolCallNames.size,
        usage,
      });

      // Normalize filenames
      const normalizedFiles: Record<string, string> = {};
      for (const [key, value] of Object.entries(workingFiles)) {
        normalizedFiles[key.toLowerCase()] = value;
      }

      const stylesCss = normalizedFiles['styles.css'];
      const scriptsJs = normalizedFiles['scripts.js'];

      if (!stylesCss || !scriptsJs) {
        console.error('Assets generation did not produce styles.css and/or scripts.js. Available files:', Object.keys(workingFiles));
        sendEvent({
          type: 'assets-status',
          status: 'error',
          error: 'Failed to generate shared assets — model did not produce both files',
        });
      } else {
        // Persist shared assets to generation state
        if (conversationId) {
          await prisma.generationState.update({
            where: { conversationId },
            data: {
              phase: 'assets-complete',
              sharedStyles: {
                headTags: '',
                stylesCss,
                scriptsJs,
              },
            },
          }).catch(() => {});
        }

        sendEvent({
          type: 'assets-status',
          status: 'complete',
          stylesCss,
          scriptsJs,
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Client disconnected
      } else {
        console.error('Assets generation failed:', err);
        sendEvent({
          type: 'assets-status',
          status: 'error',
          error: err instanceof Error ? err.message : 'Assets generation failed',
        });
      }
    }

    writer.close().catch(() => {});
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
