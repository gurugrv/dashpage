import { tool } from 'ai';
import { z } from 'zod';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
]);

const BLOCKED_IP_PREFIXES = [
  '10.',        // Private Class A
  '172.16.',    // Private Class B (172.16-31)
  '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',   // Private Class C
  '169.254.',   // Link-local / cloud metadata
  'fd',         // IPv6 private
  'fe80:',      // IPv6 link-local
];

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'text/css',
  'text/csv',
  'text/xml',
  'application/json',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
];

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE = 50_000; // 50KB text cap

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (hostname.startsWith(prefix)) return true;
  }
  return false;
}

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((allowed) => base === allowed);
}

export function createWebTools() {
  return {
    fetchUrl: tool({
      description:
        'Fetch content from a public URL. Returns { success, content, contentType, length, truncated }. Supports HTML, JSON, XML, plain text. Max 50KB (truncated if larger). 10s timeout. Cannot access localhost or private IPs.',
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe('The public URL to fetch (must be https:// or http://)'),
      }),
      execute: async ({ url }) => {
        try {
          const parsed = new URL(url);

          if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { success: false as const, error: 'Only HTTP and HTTPS URLs are supported.' };
          }

          if (isBlockedHost(parsed.hostname)) {
            return { success: false as const, error: 'Cannot fetch from private or internal URLs.' };
          }

          const response = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
              'User-Agent': 'AIBuilder/1.0',
              'Accept': 'text/html, application/json, text/plain, */*',
            },
            redirect: 'follow',
          });

          if (!response.ok) {
            return {
              success: false as const,
              error: `HTTP ${response.status}: ${response.statusText}`,
            };
          }

          const contentType = response.headers.get('content-type');
          if (!isAllowedContentType(contentType)) {
            return {
              success: false as const,
              error: `Unsupported content type: ${contentType}. Only text and JSON content is supported.`,
            };
          }

          const text = await response.text();
          const truncated = text.length > MAX_RESPONSE_SIZE;
          const content = truncated ? text.slice(0, MAX_RESPONSE_SIZE) : text;

          return {
            success: true as const,
            content,
            contentType: contentType?.split(';')[0].trim() ?? 'unknown',
            length: text.length,
            truncated,
          };
        } catch (error) {
          if (error instanceof Error && error.name === 'TimeoutError') {
            return { success: false as const, error: 'Request timed out after 10 seconds.' };
          }
          return {
            success: false as const,
            error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    }),
  };
}
