'use client';

import { useState } from 'react';
import {
  Building2, Phone, Mail, Globe, MapPin, Clock,
  Briefcase, Sparkles, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BusinessProfileData } from '@/lib/discovery/types';

interface BusinessProfileSummaryProps {
  profile: BusinessProfileData;
  onConfirm: (profile: BusinessProfileData) => void;
  onAddMore: () => void;
}

interface EditableFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  fieldKey: string;
  editing: string | null;
  onStartEdit: (key: string) => void;
  onSave: (key: string, value: string) => void;
}

function EditableField({ icon, label, value, fieldKey, editing, onStartEdit, onSave }: EditableFieldProps) {
  const [editValue, setEditValue] = useState(value ?? '');

  if (!value && editing !== fieldKey) return null;

  if (editing === fieldKey) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
        <Input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(fieldKey, editValue);
            if (e.key === 'Escape') onSave(fieldKey, value ?? '');
          }}
          onBlur={() => onSave(fieldKey, editValue)}
          className="h-7 flex-1 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 rounded py-1 hover:bg-muted/50"
      onClick={() => onStartEdit(fieldKey)}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex-1 text-sm">{value}</span>
      <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </div>
  );
}

export function BusinessProfileSummary({ profile, onConfirm, onAddMore }: BusinessProfileSummaryProps) {
  const [editProfile, setEditProfile] = useState<BusinessProfileData>(profile);
  const [editing, setEditing] = useState<string | null>(null);

  const handleSave = (key: string, value: string) => {
    setEditProfile((prev) => ({ ...prev, [key]: value }));
    setEditing(null);
  };

  return (
    <div
      className="mx-4 my-3 rounded-lg border bg-background shadow-sm"
      style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-medium">Business Profile</span>
        <span className="text-xs text-muted-foreground">Click any field to edit</span>
      </div>
      <div className="space-y-0.5 px-4 py-3">
        <EditableField
          icon={<Building2 className="size-3.5" />}
          label="Name"
          value={editProfile.name}
          fieldKey="name"
          editing={editing}
          onStartEdit={setEditing}
          onSave={handleSave}
        />
        <EditableField
          icon={<Phone className="size-3.5" />}
          label="Phone"
          value={editProfile.phone}
          fieldKey="phone"
          editing={editing}
          onStartEdit={setEditing}
          onSave={handleSave}
        />
        <EditableField
          icon={<Mail className="size-3.5" />}
          label="Email"
          value={editProfile.email}
          fieldKey="email"
          editing={editing}
          onStartEdit={setEditing}
          onSave={handleSave}
        />
        <EditableField
          icon={<Globe className="size-3.5" />}
          label="Website"
          value={editProfile.website}
          fieldKey="website"
          editing={editing}
          onStartEdit={setEditing}
          onSave={handleSave}
        />
        <EditableField
          icon={<MapPin className="size-3.5" />}
          label="Address"
          value={editProfile.address}
          fieldKey="address"
          editing={editing}
          onStartEdit={setEditing}
          onSave={handleSave}
        />
        {editProfile.hours && Object.keys(editProfile.hours).length > 0 && (
          <div className="flex items-start gap-2 py-1">
            <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Hours</span>
            <div className="flex flex-col gap-0.5 text-sm">
              {Object.entries(editProfile.hours).map(([day, time]) => (
                <span key={day}>{day}: {time}</span>
              ))}
            </div>
          </div>
        )}
        {editProfile.services && editProfile.services.length > 0 && (
          <div className="flex items-start gap-2 py-1">
            <Briefcase className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Services</span>
            <span className="flex-1 text-sm">{editProfile.services.join(', ')}</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t px-4 py-3">
        <Button size="sm" onClick={() => onConfirm(editProfile)}>
          Looks good, generate!
        </Button>
        <Button size="sm" variant="outline" onClick={onAddMore}>
          Add more details
        </Button>
      </div>
    </div>
  );
}
