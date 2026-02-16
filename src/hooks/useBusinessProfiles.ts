'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BusinessProfileData } from '@/lib/intake/types';

export type StoredBusinessProfile = BusinessProfileData & { id: string };

export function useBusinessProfiles() {
  const [profiles, setProfiles] = useState<StoredBusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/business-profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  return { profiles, isLoading, refetch: fetchProfiles };
}
