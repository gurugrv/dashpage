import { stepCountIs, streamText } from 'ai';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getComponentsSystemPrompt } from '@/lib/blueprint/prompts/components-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { prisma } from '@/lib/db/prisma';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  conversationId?: string;
}

export async function POST(req: Request) {
  let body: ComponentsRequestBody;
  try {
    body = await req.json() as ComponentsRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { blueprint, provider, model, conversationId } = body;

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

  const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model);
  const systemPrompt = getComponentsSystemPrompt(blueprint);
  const modelInstance = providerConfig.createModel(apiKey, model);
  const userPrompt = `Generate the shared header and footer HTML components for the "${blueprint.siteName}" website.`;
  const abortSignal = req.signal;

  // Use TransformStream so the Response is returned immediately (not buffered until start() completes)
  const { readable, writable } = new TransformStream();
  const encoder = new TextEncoder();
  const writer = writable.getWriter();

  function sendEvent(data: Record<string, unknown>) {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  }

  // Process stream in background — don't await so the Response returns immediately
  (async () => {
    sendEvent({ type: 'component-status', status: 'generating' });

    try {
      const debugSession = createDebugSession({
        scope: 'blueprint-components',
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
      const FILE_PRODUCING_TOOLS = new Set(['writeFile', 'writeFiles', 'editDOM', 'editFiles']);

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
      const responseText = debugSession.getFullResponse();
      const componentFinishReason = await result.finishReason;
      debugSession.logFullResponse(componentFinishReason);
      debugSession.logGenerationSummary?.({
        finishReason: componentFinishReason,
        hasFileOutput,
        toolCallCount: toolCallNames.size,
      });

      // Normalize filenames: models sometimes hallucinate prefixes like _footer.html
      const normalizedFiles: Record<string, string> = {};
      for (const [key, value] of Object.entries(workingFiles)) {
        const normalized = key.replace(/^_/, '').toLowerCase();
        normalizedFiles[normalized] = value;
      }
      let resolvedHeader = normalizedFiles['header.html'];
      let resolvedFooter = normalizedFiles['footer.html'];

      // Fallback: if writeFiles didn't produce output, try extracting from text response
      if ((!resolvedHeader || !resolvedFooter) && responseText.length > 0) {
        const headerMatch = responseText.match(/<header[\s>][\s\S]*?<\/header>/i);
        const footerMatch = responseText.match(/<footer[\s>][\s\S]*?<\/footer>/i);
        if (headerMatch && !resolvedHeader) {
          resolvedHeader = headerMatch[0];
          console.warn('[blueprint-components] Extracted header from text response (writeFiles fallback)');
        }
        if (footerMatch && !resolvedFooter) {
          resolvedFooter = footerMatch[0];
          console.warn('[blueprint-components] Extracted footer from text response (writeFiles fallback)');
        }
      }

      if (!resolvedHeader || !resolvedFooter) {
        console.error('Model did not produce header.html and/or footer.html via writeFiles or text. Available files:', Object.keys(workingFiles), 'Raw response:', responseText.slice(0, 2000));
        sendEvent({
          type: 'component-status',
          status: 'error',
          error: 'Failed to generate header/footer — model did not produce valid HTML',
        });
      } else {
        if (conversationId) {
          await prisma.generationState.update({
            where: { conversationId },
            data: {
              phase: 'components-complete',
              componentHtml: { headerHtml: resolvedHeader, footerHtml: resolvedFooter },
            },
          }).catch(() => {});
        }

        sendEvent({
          type: 'component-status',
          status: 'complete',
          headerHtml: resolvedHeader,
          footerHtml: resolvedFooter,
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Client disconnected — close silently
      } else {
        console.error('Components generation failed:', err);
        sendEvent({
          type: 'component-status',
          status: 'error',
          error: err instanceof Error ? err.message : 'Components generation failed',
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
