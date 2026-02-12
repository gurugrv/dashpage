import type { ProjectFiles } from '@/types';

export type StoredMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  isPartial?: boolean;
  htmlArtifact?: ProjectFiles | null;
};
