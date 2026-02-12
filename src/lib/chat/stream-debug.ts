export function isDebugEnabled() {
  return process.env.DEBUG_AI_STREAM_OUTPUT === 'true';
}

/**
 * Log the complete prompt being sent to the AI
 * Includes system prompt and all messages
 */
export function logAiPrompt(params: {
  scope: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  provider?: string;
  maxOutputTokens?: number;
  conversationId?: string;
}) {
  const { scope, systemPrompt, messages, model, provider, maxOutputTokens, conversationId } = params;
  const tag = [scope, model, conversationId].filter(Boolean).join(' | ');

  console.log('\n' + '='.repeat(80));
  console.log(`[AI PROMPT - ${tag}] ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  if (provider || model) {
    console.log(`Provider: ${provider || 'unknown'} | Model: ${model || 'unknown'}`);
  }
  if (conversationId) {
    console.log(`Conversation: ${conversationId}`);
  }
  if (maxOutputTokens) {
    console.log(`Max Output Tokens: ${maxOutputTokens}`);
  }
  
  console.log('\n' + '-'.repeat(40));
  console.log('SYSTEM PROMPT:');
  console.log('-'.repeat(40));
  console.log(systemPrompt);
  
  console.log('\n' + '-'.repeat(40));
  console.log('MESSAGES:');
  console.log('-'.repeat(40));
  messages.forEach((msg, idx) => {
    console.log(`\n[${idx + 1}] ${msg.role.toUpperCase()}:`);
    console.log(msg.content);
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Log the AI response (streaming or complete)
 */
export function logAiResponse(params: {
  scope: string;
  response?: string;
  status: 'streaming' | 'complete' | 'aborted' | 'error';
  finishReason?: string;
}) {
  const { scope, response, status, finishReason } = params;
  
  console.log('\n' + '='.repeat(80));
  console.log(`[AI RESPONSE - ${scope}] ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  console.log(`Status: ${status}${finishReason ? ` | Finish Reason: ${finishReason}` : ''}`);
  
  if (response) {
    console.log('\n' + '-'.repeat(40));
    console.log('RESPONSE CONTENT:');
    console.log('-'.repeat(40));
    console.log(response);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

export function createStreamDebugLogger(scope: string, context?: { model?: string; conversationId?: string }) {
  const tag = [scope, context?.model, context?.conversationId].filter(Boolean).join(' | ');
  const linePrefix = `[${context?.conversationId || scope}] `;
  let hasPrintedHeader = false;
  let fullResponse = '';
  let lineBuffer = '';

  return {
    logDelta(delta: string) {
      // Always accumulate for final logging
      fullResponse += delta;

      // Print header on first delta
      if (!hasPrintedHeader) {
        hasPrintedHeader = true;
        console.log('\n' + '='.repeat(80));
        console.log(`[AI STREAMING RESPONSE - ${tag}] ${new Date().toISOString()}`);
        console.log('='.repeat(80));
        console.log('-'.repeat(40));
        console.log('STREAMING OUTPUT:');
        console.log('-'.repeat(40));
      }

      // Buffer deltas and flush complete lines with prefix
      lineBuffer += delta;
      const lines = lineBuffer.split('\n');
      // Keep the last (possibly incomplete) segment in the buffer
      lineBuffer = lines.pop()!;
      for (const line of lines) {
        process.stdout.write(linePrefix + line + '\n');
      }
    },
    finish(status: 'complete' | 'aborted' = 'complete') {
      if (hasPrintedHeader) {
        // Flush any remaining buffered text
        if (lineBuffer) {
          process.stdout.write(linePrefix + lineBuffer + '\n');
          lineBuffer = '';
        }
        console.log(`[AI STREAM - ${tag}] ${status}`);
      }
    },
    getFullResponse() {
      return fullResponse;
    },
    logFullResponse(finishReason?: string) {
      // Only log if we haven't already streamed the output
      if (!hasPrintedHeader && fullResponse) {
        logAiResponse({
          scope: tag,
          response: fullResponse,
          status: fullResponse ? 'complete' : 'aborted',
          finishReason,
        });
      } else if (hasPrintedHeader) {
        // Just log the summary since we already streamed
        console.log('\n' + '-'.repeat(40));
        console.log(`[AI STREAM COMPLETE - ${tag}] Finish Reason: ${finishReason || 'unknown'}`);
        console.log(`Total response length: ${fullResponse.length} characters`);
        console.log('='.repeat(80) + '\n');
      }
    },
  };
}
