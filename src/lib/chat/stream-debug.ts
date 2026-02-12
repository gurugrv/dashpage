const DEBUG_STREAM_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isStreamDebugEnabled() {
  const raw = process.env.DEBUG_AI_STREAM_OUTPUT;
  if (!raw) return false;
  return DEBUG_STREAM_VALUES.has(raw.toLowerCase());
}

export function createStreamDebugLogger(scope: string) {
  const enabled = isStreamDebugEnabled();
  let hasPrinted = false;

  return {
    logDelta(delta: string) {
      if (!enabled) return;
      if (!hasPrinted) {
        hasPrinted = true;
        console.debug(`[ai-stream:${scope}] streaming output:`);
      }
      process.stdout.write(delta);
    },
    finish(status: 'complete' | 'aborted' = 'complete') {
      if (!enabled || !hasPrinted) return;
      process.stdout.write('\n');
      console.debug(`[ai-stream:${scope}] ${status}`);
    },
  };
}
