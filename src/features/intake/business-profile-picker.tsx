'use client';

import { Building2, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoredBusinessProfile } from '@/hooks/useBusinessProfiles';

interface BusinessProfilePickerProps {
  profiles: StoredBusinessProfile[];
  onSelect: (profile: StoredBusinessProfile) => void;
  onCreateNew: () => void;
}

export function BusinessProfilePicker({ profiles, onSelect, onCreateNew }: BusinessProfilePickerProps) {
  return (
    <div
      className="mx-4 my-3 rounded-lg border bg-background shadow-sm"
      style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
    >
      <div className="border-b px-4 py-3">
        <span className="text-sm font-medium">Use an existing business profile?</span>
      </div>
      <div className="space-y-2 p-3">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile)}
            className="flex w-full items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Building2 className="size-4 text-muted-foreground" />
            </div>
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{profile.name}</span>
              {profile.address && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {profile.address}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="border-t px-4 py-3">
        <Button size="sm" variant="outline" onClick={onCreateNew}>
          <Plus className="mr-1.5 size-3.5" />
          Create new profile
        </Button>
      </div>
    </div>
  );
}
