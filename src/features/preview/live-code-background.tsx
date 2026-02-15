'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface LiveCodeBackgroundProps {
  code: string | null;
  visible: boolean;
}

/**
 * Minimal syntax highlighter for HTML.
 * Applies 3 colors: tags (blue), attributes (green), strings (orange).
 * Returns HTML string with <span> wrappers.
 */
function highlightHtml(text: string): string {
  return text.replace(
    /(<\/?[\w-]+)|(\s[\w-]+=)|(\"[^\"]*\")|('([^']*)')/g,
    (match, tag, attr, dblStr, singleStr) => {
      if (tag) return `<span class="text-blue-400/60">${escapeHtml(tag)}</span>`;
      if (attr) return `<span class="text-emerald-400/50">${escapeHtml(attr)}</span>`;
      if (dblStr) return `<span class="text-amber-400/50">${escapeHtml(dblStr)}</span>`;
      if (singleStr) return `<span class="text-amber-400/50">${escapeHtml(singleStr)}</span>`;
      return escapeHtml(match);
    }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function LiveCodeBackground({ code, visible }: LiveCodeBackgroundProps) {
  const codeRef = useRef<HTMLPreElement>(null);
  const prevLengthRef = useRef(0);

  // Update code content via DOM manipulation (not React re-renders)
  useEffect(() => {
    if (!codeRef.current || !code) return;

    // Only process new content (delta since last update)
    const newContent = code.slice(prevLengthRef.current);
    if (!newContent) return;
    prevLengthRef.current = code.length;

    // Highlight and append the new chunk
    const highlighted = highlightHtml(newContent);
    codeRef.current.insertAdjacentHTML('beforeend', highlighted);

    // Auto-scroll to bottom
    const container = codeRef.current.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [code]);

  // Reset when code clears
  useEffect(() => {
    if (!code && codeRef.current) {
      codeRef.current.innerHTML = '';
      prevLengthRef.current = 0;
    }
  }, [code]);

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden rounded-md transition-opacity duration-500',
        visible ? 'opacity-70' : 'opacity-0 pointer-events-none',
      )}
    >
      <div className="h-full overflow-auto bg-zinc-950/60 p-4">
        <pre
          ref={codeRef}
          className="font-mono text-[10px] leading-relaxed text-zinc-400/70 whitespace-pre-wrap break-all"
        />
      </div>
    </div>
  );
}
