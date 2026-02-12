'use client';
import { useState, useCallback, useRef } from 'react';
import type { UIMessage } from '@ai-sdk/react';

const MAX_ATTEMPTS = 3;

export function useAutoContinue() {
  const [isAutoContinuing, setIsAutoContinuing] = useState(false);
  const attemptRef = useRef(0);

  const triggerAutoContinue = useCallback(async (
    messages: UIMessage[],
    provider: string,
    model: string,
    savedTimeZone: string | null,
    browserTimeZone: string,
  ) => {
    attemptRef.current += 1;

    if (attemptRef.current > MAX_ATTEMPTS) {
      setIsAutoContinuing(false);
      return null;
    }

    setIsAutoContinuing(true);

    try {
      const res = await fetch('/api/chat/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          provider,
          model,
          savedTimeZone,
          browserTimeZone,
          attempt: attemptRef.current,
        }),
      });
      return res;
    } catch {
      setIsAutoContinuing(false);
      return null;
    }
  }, []);

  const resetAutoContinue = useCallback(() => {
    attemptRef.current = 0;
    setIsAutoContinuing(false);
  }, []);

  return {
    triggerAutoContinue,
    isAutoContinuing,
    resetAutoContinue,
  };
}
